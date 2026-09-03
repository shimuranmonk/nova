export const ROBOT_STOP_PACKET = Object.freeze([0x80, 1, 0, 1]);

function packRobotBall(top, bottom, height, drop, frequency, reps) {
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const buffer = new ArrayBuffer(24);
    const view = new DataView(buffer);
    view.setUint32(0, clamp(top, 400, 7500), true);
    view.setUint32(4, clamp(bottom, 400, 7500), true);
    view.setFloat32(8, (clamp(height, -50, 100) + 50) / 150 * 50 - 20, true);
    view.setFloat32(12, (clamp(drop, -10, 10) + 10) / 20 * 44 - 22, true);
    view.setFloat32(16, clamp(frequency, 0, 100) / 100 + 0.5, true);
    view.setUint32(20, reps, true);
    return new Uint8Array(buffer);
}

function calculateRPMs(speed, spin, type) {
    const baseSpeed = 970 + 630.5 * speed;
    const spinFactor = 342 * spin;
    const top = type === 'top' ? baseSpeed + spinFactor : baseSpeed - spinFactor;
    const bottom = type === 'top' ? baseSpeed - spinFactor : baseSpeed + spinFactor;
    return [Math.round(top), Math.round(bottom)];
}

function directParameters(ball) {
    const speed = Number.isFinite(ball[7])
        ? ball[7]
        : Math.round((((ball[0] + ball[1]) / 2 - 970) / 630.5) * 2) / 2;
    const spin = Number.isFinite(ball[8])
        ? ball[8]
        : Math.round((Math.abs(ball[0] - ball[1]) / 2 / 342) * 2) / 2;
    const type = ball[9] || (ball[0] >= ball[1] ? 'top' : 'back');
    return {
        speed,
        spin,
        type,
        height: ball[2],
        drop: ball[3],
        bpm: Math.round(30 + ball[4] * 0.6),
        reps: ball[5],
        scatter: ball[10] || 0
    };
}

function toRobotBall(parameters, flavor = null) {
    const value = { ...parameters, ...(flavor || {}) };
    const [top, bottom] = calculateRPMs(value.speed, value.spin, value.type);
    const frequency = (value.bpm - 30) / 0.6;
    return [
        top,
        bottom,
        value.height,
        value.drop,
        frequency,
        value.reps,
        1,
        value.speed,
        value.spin,
        value.type,
        value.scatter || 0
    ];
}

function referencedSteps(definition, flavor) {
    return (definition.data || []).map(step =>
        step
            .filter(ball => ball[6] === undefined || ball[6] === 1)
            .map(ball => toRobotBall(directParameters(ball), flavor))
    ).filter(step => step.length);
}

function inlineSteps(definition, flavor) {
    const groups = new Map();
    for (const ball of definition.balls || []) {
        if (!groups.has(ball.ball)) groups.set(ball.ball, []);
        groups.get(ball.ball).push(toRobotBall(ball, flavor));
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, alternatives]) => alternatives);
}

export function resolveMsyncExecution(parsed, active, flavorName = null) {
    if (!active) throw new Error('MSYNC has no active drill');
    const flavor = flavorName ? parsed.flavors[flavorName] : null;
    if (active.type === 'DRILL') {
        const definition = parsed.drills[active.name];
        if (!definition) throw new Error(`Drill ${active.name} is unavailable`);
        return {
            name: active.name,
            steps: referencedSteps(definition, flavor),
            random: Boolean(definition.random)
        };
    }
    const definition = parsed.inline[active.name];
    if (!definition) throw new Error(`Inline drill ${active.name} is unavailable`);
    return {
        name: active.name,
        steps: inlineSteps(definition, flavor),
        random: Boolean(definition.random)
    };
}

export function chooseMsyncBalls(execution, random = Math.random) {
    let steps = [...execution.steps];
    if (execution.random) {
        for (let index = steps.length - 1; index > 0; index--) {
            const target = Math.floor(random() * (index + 1));
            [steps[index], steps[target]] = [steps[target], steps[index]];
        }
    }
    return steps.map(alternatives => {
        const selected = [...alternatives[Math.floor(random() * alternatives.length)]];
        const scatter = selected[10] || 0;
        if (scatter > 0) {
            const stepsWide = Math.floor((scatter * 2) / 0.5);
            selected[3] = Math.max(-10, Math.min(10,
                selected[3] - scatter + Math.floor(random() * (stepsWide + 1)) * 0.5));
        }
        return selected;
    });
}

export function buildMsyncDrillPacket(balls, pack = packRobotBall) {
    if (!balls.length) throw new Error('MSYNC drill has no executable balls');
    const packed = balls.map(ball => pack(...ball));
    const buffer = new ArrayBuffer(7 + packed.length * 24);
    const view = new DataView(buffer);
    view.setUint8(0, 0x81);
    view.setUint16(1, 4 + packed.length * 24, true);
    view.setUint8(3, 1);
    view.setUint16(4, 1, true);
    view.setUint8(6, 0);
    const packet = new Uint8Array(buffer);
    let offset = 7;
    for (const ball of packed) {
        packet.set(ball, offset);
        offset += 24;
    }
    return packet;
}

export class MsyncRobotAdapter {
    constructor({ send, subscribeDone, isConnected, setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = id => clearTimeout(id), now = () => performance.now(), onDiagnostic = () => {} }) {
        this.send = send;
        this.isConnected = isConnected;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.now = now;
        this.onDiagnostic = onDiagnostic;
        this.execution = null;
        this.resting = false;
        this.paused = false;
        this.awaitingCycleDone = false;
        this.generation = 0;
        this.repeatTimer = null;
        this.queue = Promise.resolve();
        this.unsubscribeDone = subscribeDone(() => this.handleDone());
        this.cyclePauseMs = 1000;
    }

    configure(parsed) {
        this.parsed = parsed;
        this.cyclePauseMs = Math.round((parsed.session?.cyclePause ?? 1) * 1000);
    }

    handleSessionEvent(event) {
        if (event.type === 'ACTIVATE' || event.type === 'FLAVOR') {
            this.execution = resolveMsyncExecution(
                this.parsed,
                event.active,
                event.flavor
            );
            if (!this.resting && !this.paused) this.replace();
        }
        else if (event.type === 'REST_START') {
            this.resting = true;
            this.stopOnly('REST');
        }
        else if (event.type === 'REST_END') {
            this.resting = false;
            if (!this.paused && this.execution) this.replace();
        }
        else if (event.type === 'PAUSE') {
            this.paused = true;
            this.stopOnly('PAUSE');
        }
        else if (event.type === 'RESUME') {
            this.paused = false;
            if (!this.resting && this.execution) this.replace();
        }
        else if (event.type === 'COMPLETE' || event.type === 'ERROR') {
            this.stopOnly(event.type);
        }
    }

    replace() {
        const generation = ++this.generation;
        this.awaitingCycleDone = false;
        this.clearTimer(this.repeatTimer);
        this.repeatTimer = null;
        this.queue = this.queue.then(async () => {
            if (generation !== this.generation) return;
            if (!this.isConnected()) throw new Error('Robot disconnected');
            const startedAt = this.now();
            await this.send(ROBOT_STOP_PACKET);
            if (generation !== this.generation || this.resting || this.paused) return;
            const balls = chooseMsyncBalls(this.execution);
            await this.send(buildMsyncDrillPacket(balls));
            this.awaitingCycleDone = true;
            this.onDiagnostic({
                type: 'ROBOT_REPLACE_SENT',
                ballCount: balls.length,
                dispatchMs: Math.max(0, this.now() - startedAt)
            });
        }).catch(error => this.onDiagnostic({
            type: 'ROBOT_ERROR',
            message: error?.message || String(error)
        }));
        return this.queue;
    }

    stopOnly(reason) {
        ++this.generation;
        this.awaitingCycleDone = false;
        this.clearTimer(this.repeatTimer);
        this.repeatTimer = null;
        this.queue = this.queue.then(async () => {
            if (this.isConnected()) await this.send(ROBOT_STOP_PACKET);
            this.onDiagnostic({ type: 'ROBOT_STOP_SENT', reason });
        }).catch(error => this.onDiagnostic({
            type: 'ROBOT_ERROR',
            message: error?.message || String(error)
        }));
        return this.queue;
    }

    handleDone() {
        if (!this.awaitingCycleDone || !this.execution || this.resting || this.paused || !this.isConnected()) return;
        this.awaitingCycleDone = false;
        const generation = this.generation;
        this.clearTimer(this.repeatTimer);
        this.repeatTimer = this.setTimer(() => {
            if (generation === this.generation && !this.resting && !this.paused) this.replace();
        }, this.cyclePauseMs);
    }

    async destroy() {
        await this.stopOnly('DESTROY');
        this.unsubscribeDone?.();
    }
}

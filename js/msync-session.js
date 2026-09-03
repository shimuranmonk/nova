import { validateExternalMsyncFile } from './msync-import.js';

export const MSYNC_SESSION_STATE = Object.freeze({
    READY: 'READY',
    COUNTDOWN: 'COUNTDOWN',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR'
});

function warningIdentity(value) {
    return `${value.code}|${value.line ?? ''}|${value.section}`;
}

export async function revalidateMsyncAttachment(track, context = {}) {
    const attachment = track?.metadata?.msync;
    if (!attachment?.sourceText || !attachment.sourceFilename) {
        return {
            valid: false,
            parsed: null,
            errors: [{
                severity: 'ERROR',
                code: 'MSYNC_ATTACHMENT_MISSING',
                line: null,
                section: 'IMPORT',
                message: 'The selected Track has no usable MSYNC attachment.'
            }],
            warnings: [],
            newWarnings: []
        };
    }
    const result = await validateExternalMsyncFile({
        name: attachment.sourceFilename,
        text: async () => attachment.sourceText
    }, {
        ...context,
        track,
        forceTrackHash: true
    });

    if (result.sourceSha256 && attachment.sourceSha256 &&
        result.sourceSha256 !== attachment.sourceSha256) {
        const sourceError = {
            severity: 'ERROR',
            code: 'SOURCE_HASH_MISMATCH',
            line: null,
            section: 'IMPORT',
            message: 'Stored MSYNC source text does not match its source fingerprint.'
        };
        result.issues.push(sourceError);
        result.errors.push(sourceError);
        result.valid = false;
        result.parsed = null;
    }

    const accepted = new Set(
        (attachment.validation?.acceptedWarnings || []).map(warningIdentity)
    );
    result.newWarnings = result.warnings.filter(value =>
        !accepted.has(warningIdentity(value))
    );
    return result;
}

export class MsyncSessionController {
    constructor({ audio, setTimer = setTimeout, clearTimer = clearTimeout,
        pollInterval = 25, onState = () => {}, onEvent = () => {} }) {
        this.audio = audio;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.pollInterval = pollInterval;
        this.onState = onState;
        this.onEvent = onEvent;
        this.state = MSYNC_SESSION_STATE.READY;
        this.parsed = null;
        this.cueIndex = 0;
        this.active = null;
        this.flavor = null;
        this.restUntilMs = null;
        this.timer = null;
        this.countdownTimer = null;
        this.audio.onEnded = () => this.complete('AUDIO_ENDED');
        this.audio.onError = error => this.fail('AUDIO_ERROR', error);
    }

    emitState(reason = null) {
        this.onState({ state: this.state, reason });
    }

    emit(type, details = {}) {
        this.onEvent({ type, ...details });
    }

    async start(parsed) {
        if (![MSYNC_SESSION_STATE.READY, MSYNC_SESSION_STATE.COMPLETED,
            MSYNC_SESSION_STATE.ERROR].includes(this.state)) return false;
        this.cancelTimers();
        this.parsed = parsed;
        this.cueIndex = 0;
        this.active = null;
        this.flavor = null;
        this.restUntilMs = null;
        const countdown = parsed.session?.countdown ?? 4;
        if (countdown > 0) {
            this.state = MSYNC_SESSION_STATE.COUNTDOWN;
            this.emitState();
            this.emit('COUNTDOWN', { seconds: countdown });
            this.countdownTimer = this.setTimer(
                () => this.beginPlayback(),
                countdown * 1000
            );
        }
        else await this.beginPlayback();
        return true;
    }

    async beginPlayback() {
        this.countdownTimer = null;
        try {
            const started = await this.audio.play();
            if (started === false) throw new Error('Audio playback did not start');
            this.state = MSYNC_SESSION_STATE.PLAYING;
            this.emitState();
            this.processPosition(this.audio.currentTimeMs());
            this.schedulePoll();
        }
        catch (error) {
            this.fail('PLAYBACK_FAILED', error);
        }
    }

    schedulePoll() {
        this.clearTimer(this.timer);
        if (this.state !== MSYNC_SESSION_STATE.PLAYING) return;
        this.timer = this.setTimer(() => {
            this.processPosition(this.audio.currentTimeMs());
            this.schedulePoll();
        }, this.pollInterval);
    }

    processPosition(positionMs) {
        if (this.state !== MSYNC_SESSION_STATE.PLAYING || !this.parsed) return;
        if (this.restUntilMs !== null && positionMs >= this.restUntilMs) {
            this.emit('REST_END', {
                positionMs,
                active: this.active,
                flavor: this.flavor
            });
            this.restUntilMs = null;
        }
        const cues = this.parsed.cues || [];
        while (this.cueIndex < cues.length &&
            cues[this.cueIndex].timeMs <= positionMs &&
            this.state === MSYNC_SESSION_STATE.PLAYING) {
            this.applyCue(cues[this.cueIndex++]);
        }
        if (this.state === MSYNC_SESSION_STATE.PLAYING &&
            Number.isFinite(this.parsed.audio?.durationMs) &&
            positionMs >= this.parsed.audio.durationMs) {
            this.complete('AUDIO_ENDED');
        }
    }

    applyCue(cue) {
        if (cue.type === 'DRILL' || cue.type === 'INLINE') {
            this.active = { type: cue.type, name: cue.name };
            this.flavor = null;
            this.emit('ACTIVATE', { positionMs: cue.timeMs, active: this.active });
        }
        else if (cue.type === 'FLAVOR') {
            this.flavor = cue.name === 'NONE' ? null : cue.name;
            this.emit('FLAVOR', {
                positionMs: cue.timeMs,
                flavor: this.flavor,
                active: this.active
            });
        }
        else if (cue.type === 'REST') {
            this.restUntilMs = cue.timeMs + cue.durationMs;
            this.emit('REST_START', {
                positionMs: cue.timeMs,
                durationMs: cue.durationMs,
                untilMs: this.restUntilMs
            });
        }
        else if (cue.type === 'STOP') {
            this.complete('STOP_CUE');
        }
    }

    pause() {
        if (this.state !== MSYNC_SESSION_STATE.PLAYING) return false;
        this.audio.pause();
        this.clearTimer(this.timer);
        this.timer = null;
        this.state = MSYNC_SESSION_STATE.PAUSED;
        this.emitState();
        this.emit('PAUSE', { positionMs: this.audio.currentTimeMs() });
        return true;
    }

    async resume() {
        if (this.state !== MSYNC_SESSION_STATE.PAUSED) return false;
        try {
            const started = await this.audio.play();
            if (started === false) throw new Error('Audio playback did not resume');
            this.state = MSYNC_SESSION_STATE.PLAYING;
            this.emitState();
            this.emit('RESUME', { positionMs: this.audio.currentTimeMs() });
            this.schedulePoll();
            return true;
        }
        catch (error) {
            this.fail('RESUME_FAILED', error);
            return false;
        }
    }

    stop(reason = 'MANUAL_STOP') {
        if ([MSYNC_SESSION_STATE.COMPLETED, MSYNC_SESSION_STATE.ERROR].includes(this.state))
            return false;
        this.complete(reason);
        return true;
    }

    complete(reason) {
        if ([MSYNC_SESSION_STATE.COMPLETED, MSYNC_SESSION_STATE.ERROR].includes(this.state)) {
            return;
        }
        this.cancelTimers();
        this.audio.stop();
        this.active = null;
        this.flavor = null;
        this.restUntilMs = null;
        this.state = MSYNC_SESSION_STATE.COMPLETED;
        this.emit('COMPLETE', { reason });
        this.emitState(reason);
    }

    fail(code, error) {
        if ([MSYNC_SESSION_STATE.COMPLETED, MSYNC_SESSION_STATE.ERROR].includes(this.state)) {
            return;
        }
        this.cancelTimers();
        this.audio.stop();
        this.active = null;
        this.flavor = null;
        this.restUntilMs = null;
        this.state = MSYNC_SESSION_STATE.ERROR;
        this.emit('ERROR', { code, message: error?.message || String(error || code) });
        this.emitState(code);
    }

    cancelTimers() {
        this.clearTimer(this.timer);
        this.clearTimer(this.countdownTimer);
        this.timer = null;
        this.countdownTimer = null;
    }

    destroy() {
        this.cancelTimers();
        this.audio.stop();
        this.audio.destroy?.();
    }
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ROBOT_STOP_PACKET,
    MsyncRobotAdapter,
    buildMsyncDrillPacket,
    chooseMsyncBalls,
    resolveMsyncExecution
} from '../js/msync-robot.js';

function parsedFixture() {
    return {
        session: { cyclePause: 1.5 },
        drills: {
            DRL_TEST: {
                data: [[[1547, 2915, 50, -5, 10, 1, 1]]],
                random: false
            }
        },
        inline: {
            INL_TEST: {
                random: false,
                balls: [
                    { ball: 1, speed: 5, spin: 4, type: 'top', height: 20,
                        drop: -4, bpm: 45, reps: 2 },
                    { ball: 2, speed: 7, spin: 5, type: 'back', height: 45,
                        drop: 4, bpm: 55, reps: 1 }
                ]
            }
        },
        flavors: {
            FLV_FAST: { speed: 6, bpm: 60 }
        }
    };
}

test('resolves referenced and inline drills into Nova robot parameters', () => {
    const parsed = parsedFixture();
    const referenced = resolveMsyncExecution(parsed, {
        type: 'DRILL', name: 'DRL_TEST'
    });
    assert.equal(referenced.steps.length, 1);
    assert.equal(referenced.steps[0][0][2], 50);

    const inline = resolveMsyncExecution(parsed, {
        type: 'INLINE', name: 'INL_TEST'
    }, 'FLV_FAST');
    assert.equal(inline.steps.length, 2);
    assert.equal(inline.steps[0][0][7], 6);
    assert.equal(inline.steps[0][0][4], 50);
    assert.equal(inline.steps[1][0][9], 'back');
});

test('chooses one alternative per step and builds the established packet shape', () => {
    const execution = {
        random: false,
        steps: [
            [[1000, 1100, 20, 0, 25, 1], [1200, 1300, 30, 1, 30, 2]],
            [[1400, 1500, 40, 2, 35, 3]]
        ]
    };
    const balls = chooseMsyncBalls(execution, () => 0);
    const packet = buildMsyncDrillPacket(balls, () => new Uint8Array(24));

    assert.equal(balls.length, 2);
    assert.equal(balls[0][0], 1000);
    assert.equal(packet.length, 55);
    assert.equal(packet[0], 0x81);
    assert.equal(new DataView(packet.buffer).getUint16(1, true), 52);
});

test('live replacement always serializes STOP before a drill packet', async () => {
    const sent = [];
    const diagnostics = [];
    let doneListener;
    let now = 10;
    const adapter = new MsyncRobotAdapter({
        send: async packet => { sent.push([...packet]); now += 5; },
        subscribeDone: listener => { doneListener = listener; return () => {}; },
        isConnected: () => true,
        setTimer: () => 1,
        clearTimer: () => {},
        now: () => now,
        onDiagnostic: value => diagnostics.push(value)
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({
        type: 'ACTIVATE',
        active: { type: 'INLINE', name: 'INL_TEST' },
        flavor: null
    });
    await adapter.queue;

    assert.deepEqual(sent[0], ROBOT_STOP_PACKET);
    assert.equal(sent[1][0], 0x81);
    assert.equal(diagnostics[0].type, 'ROBOT_REPLACE_SENT');
    assert.equal(diagnostics[0].dispatchMs, 10);
    assert.equal(typeof doneListener, 'function');
});

test('REST, Pause, completion, and disconnection never send a replacement drill', async () => {
    const sent = [];
    let connected = true;
    const adapter = new MsyncRobotAdapter({
        send: async packet => sent.push([...packet]),
        subscribeDone: () => () => {},
        isConnected: () => connected,
        setTimer: () => 1,
        clearTimer: () => {},
        now: () => 0
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({ type: 'REST_START' });
    await adapter.queue;
    adapter.handleSessionEvent({ type: 'PAUSE' });
    await adapter.queue;
    adapter.handleSessionEvent({ type: 'COMPLETE' });
    await adapter.queue;
    connected = false;
    adapter.handleSessionEvent({ type: 'ERROR' });
    await adapter.queue;

    assert.ok(sent.length >= 3);
    assert.ok(sent.every(packet =>
        JSON.stringify(packet) === JSON.stringify(ROBOT_STOP_PACKET)));
});

test('cycle completion schedules repeat using SESSION CYCLE_PAUSE', async () => {
    let doneListener;
    const timers = [];
    const adapter = new MsyncRobotAdapter({
        send: async () => {},
        subscribeDone: listener => { doneListener = listener; return () => {}; },
        isConnected: () => true,
        setTimer: (callback, delay) => { timers.push({ callback, delay }); return 1; },
        clearTimer: () => {},
        now: () => 0
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({
        type: 'ACTIVATE',
        active: { type: 'INLINE', name: 'INL_TEST' },
        flavor: null
    });
    await adapter.queue;
    const completionTimer = timers.at(-1);
    doneListener();
    assert.ok(completionTimer.delay > 1500);
    assert.equal(timers.at(-1).delay, 1500);
});

test('missing robot DONE notification falls back to a timed persistent repeat', async () => {
    const timers = [];
    const diagnostics = [];
    const adapter = new MsyncRobotAdapter({
        send: async () => {},
        subscribeDone: () => () => {},
        isConnected: () => true,
        setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
        clearTimer: () => {},
        now: () => 0,
        onDiagnostic: value => diagnostics.push(value)
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({
        type: 'ACTIVATE',
        active: { type: 'DRILL', name: 'DRL_TEST' },
        flavor: null
    });
    await adapter.queue;

    timers.at(-1).callback();
    assert.equal(diagnostics.at(-1).type, 'ROBOT_DONE_FALLBACK');
    assert.equal(timers.at(-1).delay, 1500);
    timers.at(-1).callback();
    await adapter.queue;
    assert.equal(diagnostics.filter(value => value.type === 'ROBOT_REPLACE_SENT').length, 2);
});

test('ONCE completes one cycle and ignores later flavor changes until reactivated', async () => {
    let doneListener;
    const timers = [];
    const diagnostics = [];
    const adapter = new MsyncRobotAdapter({
        send: async () => {},
        subscribeDone: listener => { doneListener = listener; return () => {}; },
        isConnected: () => true,
        setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
        clearTimer: () => {},
        now: () => 0,
        onDiagnostic: value => diagnostics.push(value)
    });
    adapter.configure(parsedFixture());
    const active = { type: 'INLINE', name: 'INL_TEST', once: true };
    adapter.handleSessionEvent({ type: 'ACTIVATE', active, flavor: null });
    await adapter.queue;
    doneListener();
    adapter.handleSessionEvent({ type: 'FLAVOR', active, flavor: 'FLV_FAST' });
    await adapter.queue;

    assert.equal(adapter.execution, null);
    assert.equal(timers.length, 0);
    assert.equal(diagnostics.filter(value => value.type === 'ROBOT_REPLACE_SENT').length, 1);
    assert.equal(diagnostics.at(-1).type, 'ROBOT_ONCE_COMPLETE');
});

test('DONE acknowledgements after STOP cannot restart ball delivery', async () => {
    let doneListener;
    const timers = [];
    const adapter = new MsyncRobotAdapter({
        send: async () => {},
        subscribeDone: listener => { doneListener = listener; return () => {}; },
        isConnected: () => true,
        setTimer: (callback, delay) => { timers.push({ callback, delay }); return 1; },
        clearTimer: () => {},
        now: () => 0
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({
        type: 'ACTIVATE',
        active: { type: 'INLINE', name: 'INL_TEST' },
        flavor: null
    });
    await adapter.queue;
    const timerCount = timers.length;
    adapter.handleSessionEvent({ type: 'COMPLETE' });
    await adapter.queue;
    doneListener();

    assert.equal(timers.length, timerCount);
});

test('IDLE cancels the active execution and permits only a STOP packet', async () => {
    const sent = [];
    let doneListener;
    const timers = [];
    const adapter = new MsyncRobotAdapter({
        send: async packet => sent.push([...packet]),
        subscribeDone: listener => { doneListener = listener; return () => {}; },
        isConnected: () => true,
        setTimer: callback => { timers.push(callback); return timers.length; },
        clearTimer: () => {},
        now: () => 0
    });
    adapter.configure(parsedFixture());
    adapter.handleSessionEvent({
        type: 'ACTIVATE',
        active: { type: 'INLINE', name: 'INL_TEST' },
        flavor: null
    });
    await adapter.queue;
    const timerCount = timers.length;
    sent.length = 0;
    adapter.handleSessionEvent({ type: 'IDLE' });
    await adapter.queue;
    doneListener();

    assert.equal(adapter.execution, null);
    assert.deepEqual(sent, [ROBOT_STOP_PACKET]);
    assert.equal(timers.length, timerCount);
});

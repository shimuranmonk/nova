import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COMMANDS,
    COMMAND_RESULTS,
    SESSION_STATES
} from '../js/command-controller.js';
import { createMsyncVoiceController } from '../js/msync-voice-controller.js';

function makeController(initialState, target = null) {
    let state = initialState;
    const calls = [];
    const controller = createMsyncVoiceController({
        getState: () => state,
        getTarget: () => target,
        start: async (value) => {
            calls.push(['start', value]);
            state = SESSION_STATES.COUNTDOWN;
            return true;
        },
        stop: () => {
            calls.push(['stop']);
            state = target ? SESSION_STATES.ARMED : SESSION_STATES.IDLE;
        },
        pause: () => {
            calls.push(['pause']);
            state = SESSION_STATES.PAUSED;
        },
        resume: async () => {
            calls.push(['resume']);
            state = SESSION_STATES.RUNNING;
            return true;
        }
    });

    return { controller, calls, setState: (value) => { state = value; } };
}

test('MSYNC START requires and uses the explicit armed target', async () => {
    const missing = makeController(SESSION_STATES.IDLE);
    assert.equal(
        (await missing.controller.execute(COMMANDS.START)).status,
        COMMAND_RESULTS.BLOCKED
    );

    const target = { live: true, trackId: 'track-1' };
    const armed = makeController(SESSION_STATES.ARMED, target);
    const outcome = await armed.controller.execute(COMMANDS.START);

    assert.equal(outcome.status, COMMAND_RESULTS.EXECUTED);
    assert.equal(outcome.state, SESSION_STATES.COUNTDOWN);
    assert.deepEqual(armed.calls, [['start', target]]);
});

test('MSYNC STOP accepts pending, running, and paused sessions', async () => {
    for (const state of [
        SESSION_STATES.COUNTDOWN,
        SESSION_STATES.RUNNING,
        SESSION_STATES.PAUSED
    ]) {
        const fixture = makeController(state, {
            live: false,
            trackId: 'track-1'
        });
        const outcome = await fixture.controller.execute(COMMANDS.STOP);

        assert.equal(outcome.status, COMMAND_RESULTS.EXECUTED);
        assert.deepEqual(fixture.calls, [['stop']]);
    }
});

test('MSYNC PAUSE and RESUME are explicit and idempotent', async () => {
    const fixture = makeController(SESSION_STATES.RUNNING);

    assert.equal(
        (await fixture.controller.execute(COMMANDS.PAUSE)).status,
        COMMAND_RESULTS.EXECUTED
    );
    assert.equal(
        (await fixture.controller.execute(COMMANDS.PAUSE)).status,
        COMMAND_RESULTS.IGNORED
    );
    assert.equal(
        (await fixture.controller.execute(COMMANDS.RESUME)).status,
        COMMAND_RESULTS.EXECUTED
    );
    assert.equal(
        (await fixture.controller.execute(COMMANDS.RESUME)).status,
        COMMAND_RESULTS.IGNORED
    );
    assert.deepEqual(fixture.calls, [['pause'], ['resume']]);
});

test('MSYNC inactive STOP is harmless', async () => {
    for (const state of [SESSION_STATES.IDLE, SESSION_STATES.ARMED]) {
        const fixture = makeController(state);
        const outcome = await fixture.controller.execute(COMMANDS.STOP);

        assert.equal(outcome.status, COMMAND_RESULTS.IGNORED);
        assert.equal(outcome.reason, 'Nothing to stop');
        assert.deepEqual(fixture.calls, []);
    }
});

test('a failed revalidation or resume is BLOCKED', async () => {
    const startController = createMsyncVoiceController({
        getState: () => SESSION_STATES.ARMED,
        getTarget: () => ({ live: false, trackId: 'track-1' }),
        start: async () => false,
        stop: () => {},
        pause: () => {},
        resume: async () => false
    });
    assert.equal(
        (await startController.execute(COMMANDS.START)).status,
        COMMAND_RESULTS.BLOCKED
    );

    const resumeController = createMsyncVoiceController({
        getState: () => SESSION_STATES.PAUSED,
        getTarget: () => null,
        start: async () => false,
        stop: () => {},
        pause: () => {},
        resume: async () => false
    });
    assert.equal(
        (await resumeController.execute(COMMANDS.RESUME)).status,
        COMMAND_RESULTS.BLOCKED
    );
});

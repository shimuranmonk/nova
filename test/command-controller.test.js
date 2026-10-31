import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COMMANDS,
    COMMAND_RESULTS,
    SESSION_STATES,
    createCommandController
} from '../js/command-controller.js';

function makeController(initialState = SESSION_STATES.IDLE) {
    let state = initialState;
    const calls = [];

    const controller = createCommandController({
        getState: () => state,
        start: (context) => {
            calls.push(['start', context]);
            state = SESSION_STATES.COUNTDOWN;
        },
        stop: () => {
            calls.push(['stop']);
            state = SESSION_STATES.IDLE;
        },
        pause: () => {
            calls.push(['pause']);
            state = SESSION_STATES.PAUSED;
        },
        resume: () => {
            calls.push(['resume']);
            state = SESSION_STATES.RUNNING;
        }
    });

    return {
        controller,
        calls,
        setState: (nextState) => { state = nextState; }
    };
}

test('canonical START executes once and blocks duplicate active starts', () => {
    const { controller, calls } = makeController();

    const started = controller.execute(COMMANDS.START, {
        drillName: 'forehand'
    });
    const duplicate = controller.execute(COMMANDS.START, {
        drillName: 'forehand'
    });

    assert.equal(started.status, COMMAND_RESULTS.EXECUTED);
    assert.equal(started.state, SESSION_STATES.COUNTDOWN);
    assert.equal(duplicate.status, COMMAND_RESULTS.IGNORED);
    assert.equal(calls.length, 1);
});

test('canonical STOP accepts countdown, running, and paused states', () => {
    for (const state of [
        SESSION_STATES.COUNTDOWN,
        SESSION_STATES.RUNNING,
        SESSION_STATES.PAUSED
    ]) {
        const { controller, calls } = makeController(state);
        const outcome = controller.execute(COMMANDS.STOP);

        assert.equal(outcome.status, COMMAND_RESULTS.EXECUTED);
        assert.equal(outcome.state, SESSION_STATES.IDLE);
        assert.deepEqual(calls, [['stop']]);
    }
});

test('canonical STOP is harmless while idle', () => {
    const { controller, calls } = makeController();
    const outcome = controller.execute(COMMANDS.STOP);

    assert.equal(outcome.status, COMMAND_RESULTS.IGNORED);
    assert.equal(outcome.reason, 'Nothing to stop');
    assert.equal(calls.length, 0);
});

test('canonical STOP is harmless while a drill is merely armed', () => {
    const { controller, calls } = makeController(SESSION_STATES.ARMED);
    const outcome = controller.execute(COMMANDS.STOP);

    assert.equal(outcome.status, COMMAND_RESULTS.IGNORED);
    assert.equal(outcome.reason, 'Nothing to stop');
    assert.equal(calls.length, 0);
});

test('PAUSE and RESUME are explicit and idempotent', () => {
    const fixture = makeController(SESSION_STATES.RUNNING);

    const paused = fixture.controller.execute(COMMANDS.PAUSE);
    const duplicatePause = fixture.controller.execute(COMMANDS.PAUSE);
    const resumed = fixture.controller.execute(COMMANDS.RESUME);
    const duplicateResume = fixture.controller.execute(COMMANDS.RESUME);

    assert.equal(paused.status, COMMAND_RESULTS.EXECUTED);
    assert.equal(duplicatePause.status, COMMAND_RESULTS.IGNORED);
    assert.equal(resumed.status, COMMAND_RESULTS.EXECUTED);
    assert.equal(duplicateResume.status, COMMAND_RESULTS.IGNORED);
    assert.deepEqual(fixture.calls, [['pause'], ['resume']]);
});

test('a failed action is reported as blocked', () => {
    const controller = createCommandController({
        getState: () => SESSION_STATES.IDLE,
        start: () => false,
        stop: () => {},
        pause: () => {},
        resume: () => {}
    });

    const outcome = controller.execute(COMMANDS.START);

    assert.equal(outcome.status, COMMAND_RESULTS.BLOCKED);
    assert.equal(outcome.reason, 'Command requirements not met');
});

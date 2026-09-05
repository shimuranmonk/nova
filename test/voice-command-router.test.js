import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COMMANDS,
    COMMAND_RESULTS,
    SESSION_STATES
} from '../js/command-controller.js';
import { createVoiceCommandRouter } from '../js/voice-command-router.js';

function executed(command) {
    return {
        status: COMMAND_RESULTS.EXECUTED,
        command,
        state: SESSION_STATES.RUNNING,
        reason: ''
    };
}

test('routes START and operational commands in every standard mode', () => {
    for (const mode of ['reps', 'time', 'music']) {
        const calls = [];
        const router = createVoiceCommandRouter({
            getMode: () => mode,
            startStandard: () => {
                calls.push(COMMANDS.START);
                return executed(COMMANDS.START);
            },
            executeStandard: (command) => {
                calls.push(command);
                return executed(command);
            }
        });

        for (const command of Object.values(COMMANDS)) {
            assert.equal(
                router.route(command).status,
                COMMAND_RESULTS.EXECUTED
            );
        }

        assert.deepEqual(calls, Object.values(COMMANDS));
    }
});

test('Test Mode intercepts every command before operational routing', () => {
    const calls = [];
    const router = createVoiceCommandRouter({
        isTestMode: () => true,
        startStandard: () => calls.push('start'),
        executeStandard: () => calls.push('execute')
    });

    for (const command of Object.values(COMMANDS)) {
        const outcome = router.route(command);
        assert.equal(outcome.status, COMMAND_RESULTS.IGNORED);
        assert.match(outcome.reason, /Test Mode/);
    }

    assert.deepEqual(calls, []);
});

test('blocks all MSYNC commands until the Phase 7 route exists', () => {
    const router = createVoiceCommandRouter({
        getMode: () => 'msync',
        startStandard: () => executed(COMMANDS.START),
        executeStandard: (command) => executed(command)
    });

    for (const command of Object.values(COMMANDS)) {
        const outcome = router.route(command);
        assert.equal(outcome.status, COMMAND_RESULTS.BLOCKED);
        assert.match(outcome.reason, /MSYNC voice control/);
    }
});

test('rejects vocabulary outside the canonical command set', () => {
    const router = createVoiceCommandRouter();
    const outcome = router.route('LAUNCH');

    assert.equal(outcome.status, COMMAND_RESULTS.BLOCKED);
    assert.equal(outcome.reason, 'Unknown command');
});

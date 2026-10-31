import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS } from '../js/command-controller.js';
import { createVoiceTestMode } from '../js/voice-test-mode.js';

test('inactive Test Mode does not consume recognition results', () => {
    const updates = [];
    const testMode = createVoiceTestMode({
        onUpdate: (state) => updates.push(state)
    });

    assert.equal(testMode.consume({ command: COMMANDS.START }), false);
    assert.equal(testMode.getLatestResult(), null);
    assert.equal(updates.length, 0);
});

test('active Test Mode consumes command diagnostics in an isolated sink', () => {
    const updates = [];
    const testMode = createVoiceTestMode({
        onUpdate: (state) => updates.push(state)
    });

    testMode.setActive(true);
    const consumed = testMode.consume({
        transcript: 'nova start',
        phrase: 'NOVA START',
        command: COMMANDS.START,
        confidence: 0.91,
        recognitionMs: 284
    });

    assert.equal(consumed, true);
    assert.deepEqual(testMode.getLatestResult(), {
        transcript: 'nova start',
        phrase: 'NOVA START',
        command: COMMANDS.START,
        confidence: 0.91,
        recognitionMs: 284
    });
    assert.deepEqual(updates.at(-1).latestResult, testMode.getLatestResult());
});

test('Test Mode records NO MATCH data without inventing a command', () => {
    const testMode = createVoiceTestMode();

    testMode.setActive(true);
    testMode.consume({
        transcript: 'hello nova',
        phrase: 'HELLO NOVA',
        command: null,
        confidence: 0.42
    });

    assert.equal(testMode.getLatestResult().command, null);
});

test('ending Test Mode clears its diagnostic result', () => {
    const testMode = createVoiceTestMode();

    testMode.setActive(true);
    testMode.consume({ command: COMMANDS.STOP });
    testMode.setActive(false);

    assert.equal(testMode.isActive(), false);
    assert.equal(testMode.getLatestResult(), null);
});

test('the Test Mode sink has no operational command dependency', () => {
    const testMode = createVoiceTestMode();

    assert.deepEqual(
        Object.keys(testMode).sort(),
        ['consume', 'getLatestResult', 'isActive', 'setActive']
    );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRobotFeedback } from '../js/robot-feedback.js';

test('decodes state replies and rejection without treating dispatch as acceptance', () => {
    for (const [code, state] of [[2, 'STANDBY'], [3, 'STANDBY'],
        [4, 'ACTIVE'], [5, 'COMPLETE'], [6, 'PAUSED']]) {
        assert.equal(decodeRobotFeedback(Uint8Array.from([0, 2, 3, 0, code, 1, 0])).state, state);
    }
    const feedback = decodeRobotFeedback(Uint8Array.from([1, 129, 0, 0]));
    assert.equal(feedback.type, 'REJECTED');
    assert.equal(decodeRobotFeedback(Uint8Array.from([1, 128, 0, 0])).type, 'ALREADY_STOPPED');
});

test('reads progress in little endian and respects notification view boundaries', () => {
    const buffer = Uint8Array.from([99, 0, 5, 7, 0, 1, 2, 3, 0, 4, 0, 5, 99]);
    const result = decodeRobotFeedback(new DataView(buffer.buffer, 1, 11));
    assert.equal(result.totalShots, 513);
    assert.equal(result.ballIndex, 3);
    assert.equal(result.sequence, 4);
    assert.equal(result.cycle, 5);
});

test('ignores incomplete and unrecognized replies', () => {
    for (const bytes of [[], [0, 2, 3, 0], [0, 5, 7, 0, 1],
        [0, 2, 3, 0, 99, 1, 0], [1, 129, 0, 0, 99]]) {
        assert.equal(decodeRobotFeedback(Uint8Array.from(bytes)), null);
    }
});

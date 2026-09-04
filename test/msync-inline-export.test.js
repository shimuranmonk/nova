import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createMsyncInlineBlock,
    makeInlineAlias
} from '../js/msync-inline-export.js';

test('creates a legal inline alias from built-in and custom drill names', () => {
    assert.equal(makeInlineAlias('Loop (F) - Drive B'), 'INL_LOOP_F_DRIVE_B');
    assert.equal(makeInlineAlias('23 attack!'), 'INL_DRILL_23_ATTACK');
});

test('exports active sequence steps, alternatives, random, and scatter', () => {
    const output = createMsyncInlineBlock({
        name: 'Riffout',
        random: true,
        steps: [
            [
                [1000, 1200, 40, 4, 66.6667, 1, 1, 3, 2.5, 'top', 2],
                [1000, 1200, 45, -4, 50, 2, 1, 4, 2, 'back']
            ],
            [[1000, 1200, 20, 0, 10, 1, 0, 2, 1, 'top']],
            [[1000, 1200, 50, -2, 25, 3, 1, 5, 3, 'top']]
        ]
    });

    assert.equal(output, `[INLINE:INL_RIFFOUT]
NAME=Riffout
RANDOM=true
BALL=1;SPEED=3;SPIN=2.5;TYPE=top;HEIGHT=40;DROP=4;BPM=70;REPS=1;SCATTER=2
BALL=1;SPEED=4;SPIN=2;TYPE=back;HEIGHT=45;DROP=-4;BPM=60;REPS=2
BALL=2;SPEED=5;SPIN=3;TYPE=top;HEIGHT=50;DROP=-2;BPM=45;REPS=3`);
});

test('rejects a drill with no active balls', () => {
    assert.throws(() => createMsyncInlineBlock({
        name: 'Empty',
        steps: [[[1000, 1000, 0, 0, 0, 1, 0]]]
    }), /no active balls/);
});

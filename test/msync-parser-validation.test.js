import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DEFAULT_DRILLS } from '../js/constants.js';
import { parseMsync } from '../js/msync-parser.js';
import {
    validateMsyncSource,
    validateParsedMsync
} from '../js/msync-validator.js';
import {
    createMsyncAttachment,
    createMsyncTrackUpdate,
    prepareTrackForMsyncValidation,
    validateExternalMsyncFile
} from '../js/msync-import.js';

const HASH = '8fd41e9802b5c417b45a91c90a12cdb074377d4f6a9c4d1e753624cbb3892601';

function source(overrides = '') {
    return `MSYNC_VERSION=1

[AUDIO]
FILENAME=test.mp3
SHA256=${HASH}
DURATION=01:00.000

[INLINE:INL_TEST]
NAME=Test Pattern
BALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2

[CUES]
00:00.000 INLINE=INL_TEST
${overrides}`;
}

function track(overrides = {}) {
    return {
        id: 'track-1',
        filename: 'test.mp3',
        duration: 60,
        audioBlob: new Blob(['audio']),
        metadata: { sha256: HASH },
        ...overrides
    };
}

test('accepts a valid minimal MSYNC v1 source', () => {
    const result = validateMsyncSource(source(), { track: track() });

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.parsed.session.countdown, 4);
    assert.equal(result.parsed.session.cyclePause, 1);
    assert.equal(result.parsed.session.robotLead, 1.3);
    assert.equal(result.parsed.cues[0].timeMs, 0);
    assert.equal(result.parsed.inline.INL_TEST.balls[0].speed, 5);
});

test('accepts and bounds SESSION ROBOT_LEAD', () => {
    const valid = validateMsyncSource(source().replace('[AUDIO]',
        '[SESSION]\nROBOT_LEAD=1.275\n\n[AUDIO]'), { track: track() });
    assert.equal(valid.valid, true);
    assert.equal(valid.parsed.session.robotLead, 1.275);

    const invalid = validateMsyncSource(source().replace('[AUDIO]',
        '[SESSION]\nROBOT_LEAD=5.001\n\n[AUDIO]'), { track: track() });
    assert.ok(invalid.errors.some(value => value.code === 'INVALID_ROBOT_LEAD'));
});

test('accepts the canonical MSYNC v1 benchmark', async () => {
    const benchmark = await readFile(
        new URL('../MSYNC_V1_EXAMPLE.msync', import.meta.url),
        'utf8'
    );
    const result = validateMsyncSource(benchmark, {
        builtInDrills: DEFAULT_DRILLS,
        track: track({
            filename: 'eye-of-the-trainer.mp3',
            duration: 200
        })
    });

    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.deepEqual(result.summary, {
        cues: 11,
        drills: 2,
        inline: 1,
        flavors: 2,
        durationMs: 200000,
        warnings: 0
    });
});

test('rejects malformed structure without producing accepted parsed state', () => {
    const parsed = parseMsync('[AUDIO]\nFILENAME=test.mp3');
    const result = validateParsedMsync(parsed);

    assert.equal(result.valid, false);
    assert.equal(result.parsed, null);
    assert.ok(result.errors.some(value => value.code === 'VERSION_NOT_FIRST'));
    assert.ok(result.errors.some(value => value.code === 'MISSING_CUES_SECTION'));
});

test('rejects missing required audio data and unsupported versions', () => {
    const text = source()
        .replace('MSYNC_VERSION=1', 'MSYNC_VERSION=2')
        .replace(`SHA256=${HASH}\n`, '');
    const result = validateMsyncSource(text);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some(value => value.code === 'UNSUPPORTED_VERSION'));
    assert.ok(result.errors.some(value =>
        value.code === 'MISSING_FIELD' && value.expected === 'SHA256'));
});

test('rejects invalid field values, ball increments, and Speed/Spin limits', () => {
    const text = source()
        .replace('BALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2',
            'BALL=1;SPEED=8;SPIN=5;TYPE=side;HEIGHT=20.5;DROP=0;BPM=45;REPS=2');
    const result = validateMsyncSource(text);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some(value => value.code === 'INVALID_SPEED_SPIN'));
    assert.ok(result.errors.some(value => value.code === 'INVALID_BALL_TYPE'));
    assert.ok(result.errors.some(value => value.code === 'INVALID_BALL_VALUE'));
});

test('rejects invalid cue timing, order, REST bounds, and post-STOP cues', () => {
    const text = source(`00:30.000 STOP
00:30.000 REST=2
00:20.000 INLINE=INL_TEST
00:59.000 REST=2`);
    const result = validateMsyncSource(text);

    assert.equal(result.valid, false);
    for (const code of ['STOP_NOT_ALONE', 'CUE_AFTER_STOP', 'CUES_OUT_OF_ORDER',
        'REST_AFTER_DURATION']) {
        assert.ok(result.errors.some(value => value.code === code), code);
    }
});

test('resolves built-in and custom drill references strictly', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const referenced = source().replace(
        '[INLINE:INL_TEST]\nNAME=Test Pattern\nBALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2\n\n[CUES]\n00:00.000 INLINE=INL_TEST',
        `[DRILLS]\nDRL_BUILTIN=BUILTIN:push(b);LEVEL=1\nDRL_CUSTOM=CUSTOM:${uuid};LEVEL=1\n\n[CUES]\n00:00.000 DRILL=DRL_BUILTIN\n00:10.000 DRILL=DRL_CUSTOM`
    );
    const drillData = {
        custom_key: { 1: [[[1547, 2915, 50, 0, 25, 1]]] }
    };
    const valid = validateMsyncSource(referenced, {
        builtInDrills: DEFAULT_DRILLS,
        customDrills: {
            'custom-a': [{ id: uuid, key: 'custom_key', name: 'Custom' }],
            'custom-b': [],
            'custom-c': []
        },
        drillData
    });
    assert.equal(valid.valid, true, JSON.stringify(valid.errors));

    const invalid = validateMsyncSource(referenced, {
        builtInDrills: {},
        customDrills: { 'custom-a': [], 'custom-b': [], 'custom-c': [] },
        drillData: {}
    });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.filter(value => value.code === 'MISSING_DRILL').length, 2);
});

test('reports unused definitions as warnings requiring explicit acceptance', async () => {
    const text = source().replace('[CUES]', `[FLAVOR:FLV_UNUSED]
FLV_BPM=60

[CUES]`);
    const file = { name: 'test.msync', text: async () => text };
    const result = await validateExternalMsyncFile(file, { track: track() });

    assert.equal(result.valid, true);
    assert.equal(result.warnings[0].code, 'UNUSED_FLAVOR');
    assert.throws(() => createMsyncAttachment(result), /explicit acceptance/);
    const attachment = createMsyncAttachment(result, {
        acceptWarnings: true,
        now: 1000
    });
    assert.equal(attachment.sourceText, text);
    assert.equal(attachment.validation.acceptedWarnings[0].code, 'UNUSED_FLAVOR');
});

test('validates selected Track hash, filename, and duration independently of ID', () => {
    const renamed = validateMsyncSource(source(), {
        track: track({ id: 'a-different-stable-id', filename: 'renamed.mp3' })
    });
    assert.equal(renamed.valid, true);
    assert.equal(renamed.warnings[0].code, 'AUDIO_FILENAME_DIFFERENT');

    const mismatch = validateMsyncSource(source(), {
        track: track({ metadata: { sha256: '0'.repeat(64) }, duration: 61 })
    });
    assert.ok(mismatch.errors.some(value => value.code === 'AUDIO_HASH_MISMATCH'));
    assert.ok(mismatch.errors.some(value => value.code === 'AUDIO_DURATION_MISMATCH'));
});

test('backfills a legacy Track hash in a copy without mutating identity', async () => {
    const legacy = track({ metadata: {} });
    const prepared = await prepareTrackForMsyncValidation(legacy);

    assert.equal(prepared.hashBackfilled, true);
    assert.equal(prepared.track.id, legacy.id);
    assert.match(prepared.track.metadata.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(legacy.metadata, {});
});

test('unreadable and wrongly named external files fail safely', async () => {
    const wrong = await validateExternalMsyncFile({
        name: 'test.txt',
        text: async () => source()
    });
    assert.equal(wrong.errors[0].code, 'INVALID_FILE_EXTENSION');

    const unreadable = await validateExternalMsyncFile({
        name: 'test.msync',
        text: async () => { throw new Error('read failure'); }
    });
    assert.equal(unreadable.errors[0].code, 'FILE_READ_FAILED');
    assert.equal(unreadable.parsed, null);
});

test('external validation requires a selected Track and resolvable references', async () => {
    const noTrack = await validateExternalMsyncFile({
        name: 'test.msync',
        text: async () => source()
    });
    assert.equal(noTrack.errors[0].code, 'TRACK_REQUIRED');

    const referenced = source().replace(
        '[INLINE:INL_TEST]\nNAME=Test Pattern\nBALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2\n\n[CUES]\n00:00.000 INLINE=INL_TEST',
        '[DRILLS]\nDRL_TEST=BUILTIN:missing;LEVEL=1\n\n[CUES]\n00:00.000 DRILL=DRL_TEST'
    );
    const unresolved = await validateExternalMsyncFile({
        name: 'test.msync',
        text: async () => referenced
    }, { track: track() });
    assert.ok(unresolved.errors.some(value => value.code === 'MISSING_DRILL'));
});

test('STOP with a value is rejected by the grammar', () => {
    const result = validateMsyncSource(source('00:30.000 STOP=now'));
    assert.ok(result.errors.some(value => value.code === 'MALFORMED_STOP'));
});

test('accepts IDLE without a value and requires a new activation afterward', () => {
    const valid = validateMsyncSource(source(`00:10.000 IDLE
00:20.000 INLINE=INL_TEST`), { track: track() });
    assert.equal(valid.valid, true, JSON.stringify(valid.errors));
    assert.equal(valid.parsed.cues[1].type, 'IDLE');

    const malformed = validateMsyncSource(source('00:10.000 IDLE=now'),
        { track: track() });
    assert.ok(malformed.errors.some(value => value.code === 'MALFORMED_IDLE'));

    const noActiveDrill = validateMsyncSource(source(`00:10.000 IDLE
00:20.000 REST=1`), { track: track() });
    assert.ok(noActiveDrill.errors.some(value => value.code === 'REST_WITHOUT_DRILL'));

    const startsIdle = validateMsyncSource(source().replace(
        '00:00.000 INLINE=INL_TEST', '00:00.000 IDLE\n00:01.000 INLINE=INL_TEST'),
    { track: track() });
    assert.ok(startsIdle.errors.some(value => value.code === 'IDLE_WITHOUT_DRILL'));
});

test('builds one complete Track update without mutating the original', async () => {
    const original = track({ metadata: { sha256: HASH, tag: 'preserve' } });
    const result = await validateExternalMsyncFile({
        name: 'test.msync',
        text: async () => source()
    }, { track: original });
    const updated = createMsyncTrackUpdate(result, { now: 1234 });

    assert.equal(updated.id, original.id);
    assert.equal(updated.audioBlob, original.audioBlob);
    assert.equal(updated.metadata.tag, 'preserve');
    assert.equal(updated.metadata.msync.sourceText, source());
    assert.equal(updated.updatedAt, 1234);
    assert.equal(original.metadata.msync, undefined);
});

test('collects diagnostics with stable fields and caps them at 100', () => {
    const badLines = Array.from({ length: 120 }, (_, index) =>
        `${String(index).padStart(2, '0')}:00.000 MODIFY BPM=50`).join('\n');
    const result = validateMsyncSource(source().replace(
        '00:00.000 INLINE=INL_TEST\n', badLines
    ));

    assert.equal(result.issues.length, 100);
    assert.ok(result.issues.every(value =>
        value.severity && value.code && value.section && value.message));
    assert.equal(result.parsed, null);
});

test('enforces simultaneous cue ordering', () => {
    const text = source().replace(
        '00:00.000 INLINE=INL_TEST',
        `00:00.000 INLINE=INL_TEST
00:10.000 REST=1
00:10.000 FLAVOR=NONE`
    );
    const result = validateMsyncSource(text);

    assert.ok(result.errors.some(value =>
        value.code === 'INVALID_SIMULTANEOUS_ORDER'));
});

test('enforces consecutive inline BALL numbers while allowing alternatives', () => {
    const alternative = source().replace(
        'BALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2',
        `BALL=1;SPEED=5;SPIN=4;TYPE=top;HEIGHT=20;DROP=0;BPM=45;REPS=2
BALL=1;SPEED=4;SPIN=4;TYPE=back;HEIGHT=20;DROP=0;BPM=45;REPS=2`
    );
    assert.equal(validateMsyncSource(alternative).valid, true);

    const gap = alternative.replace(
        'BALL=1;SPEED=4;SPIN=4;TYPE=back',
        'BALL=3;SPEED=4;SPIN=4;TYPE=back'
    );
    assert.ok(validateMsyncSource(gap).errors.some(value =>
        value.code === 'NONCONSECUTIVE_BALLS'));
});

test('validates flavored Speed/Spin combinations against affected drill balls', () => {
    const text = source().replace('[CUES]', `[FLAVOR:FLV_ILLEGAL]
FLV_SPEED=8
FLV_SPIN=5

[CUES]`).replace(
        '00:00.000 INLINE=INL_TEST',
        `00:00.000 INLINE=INL_TEST
00:00.000 FLAVOR=FLV_ILLEGAL`
    );
    const result = validateMsyncSource(text);

    assert.ok(result.errors.some(value =>
        value.code === 'FLAVOR_INVALID_SPEED_SPIN'));
});

test('accepts exactly 0.500 seconds duration tolerance and rejects 0.501', () => {
    const accepted = validateMsyncSource(source(), {
        track: track({ duration: 60.5 })
    });
    assert.equal(accepted.valid, true);

    const rejected = validateMsyncSource(source(), {
        track: track({ duration: 60.501 })
    });
    assert.ok(rejected.errors.some(value =>
        value.code === 'AUDIO_DURATION_MISMATCH'));
});

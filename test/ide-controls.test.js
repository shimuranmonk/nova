import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_DRILLS, SPIN_LIMITS } from '../js/constants.js';
import { buildMsyncDrillPacket, resolveMsyncExecution } from '../js/msync-robot.js';
import { fromLegacy, restoreLegacy, validateControls, controlsToRpm,
    settingsFingerprint } from '../js/ide/index.js';

const ball = [3545, 2177, 50, -5, 40, 1];

test('legacy adapter preserves every built-in level, missing fields and raw RPM', () => {
    const before = structuredClone(DEFAULT_DRILLS);
    for (const [key, drill] of Object.entries(DEFAULT_DRILLS)) {
        for (const level of [1, 2, 3]) {
            for (const alternatives of drill[level]) {
                for (const value of alternatives) {
                    const snapshot = fromLegacy(value, { drillKey: key, level });
                    assert.deepEqual(restoreLegacy(snapshot), value);
                    assert.equal(validateControls(snapshot.shot).valid, true);
                    assert.equal(snapshot.shot.ui, undefined);
                    snapshot.raw[0] = -1;
                    assert.notEqual(value[0], -1);
                }
            }
        }
    }
    assert.deepEqual(DEFAULT_DRILLS, before);
});

test('adapter round trips UI fields, inactive variants, scatter and future trailing data', () => {
    for (const value of [ball, [...ball, 0], [...ball, 1, 3, 2, 'back'],
        [...ball, 1, 3, 2, 'back', 2, { future: 'retain' }]]) {
        const before = structuredClone(value);
        const snapshot = fromLegacy(value, { shotId: 'external-stable-id' });
        assert.deepEqual(restoreLegacy(snapshot), before);
        assert.equal(snapshot.shot.shotId, 'external-stable-id');
        assert.deepEqual(value, before);
    }
});

test('strict domain rejects nonfinite, fractional and out-of-domain controls without repair', () => {
    for (const [field, values] of Object.entries({
        topRpm: [NaN, Infinity, 399, 7501, 400.5],
        bottomRpm: [null, '970'], height: [-51, 101, 1.5],
        drop: [-10.5, 10.5, 0.1], frequencyPercent: [-1, 101], reps: [0, 201, 1.2]
    })) {
        for (const value of values) {
            const shot = fromLegacy(ball).shot;
            shot.controls[field] = value;
            assert.equal(validateControls(shot).valid, false, `${field}: ${value}`);
            assert.equal(Object.is(shot.controls[field], value), true);
        }
    }
    assert.equal(fromLegacy(null).shot, null);
    assert.equal(fromLegacy([1, 2]).shot, null);
});

test('strict UI domain follows every SPIN_LIMITS entry and reports saturation', () => {
    for (const [speedText, maxSpin] of Object.entries(SPIN_LIMITS)) {
        const speed = Number(speedText);
        const rpm = controlsToRpm({ speed, spin: maxSpin, type: 'top' });
        const shot = fromLegacy([rpm.topRpm, rpm.bottomRpm, 0, 0, 0, 200,
            1, speed, maxSpin, 'top']).shot;
        assert.equal(validateControls(shot).valid, true);
        shot.ui.spin = maxSpin + 0.5;
        assert.equal(validateControls(shot).valid, false);
    }
    const shot = fromLegacy([1654, 400, 0, 0, 0, 1, 1, 0, 2, 'top']).shot;
    assert.ok(validateControls(shot).issues.some(value => value.code === 'WHEEL_SATURATION'));
    shot.ui.type = 'side';
    assert.equal(validateControls(shot).valid, false);
    shot.schemaVersion = 2;
    assert.equal(validateControls(shot).valid, false);
});

test('scatter envelope and active flags are strict; no assumed BPM quantization of raw frequency', () => {
    const shot = fromLegacy(ball).shot;
    shot.controls.frequencyPercent = 1 / 0.6;
    assert.equal(validateControls(shot).valid, true);
    shot.scatter = 5;
    assert.equal(validateControls(shot).valid, true);
    shot.scatter = 5.5;
    assert.equal(validateControls(shot).valid, false);
    shot.scatter = 0;
    shot.active = 2;
    assert.equal(validateControls(shot).valid, false);
});

test('settings fingerprints distinguish metadata, scatter and nonfinite corruption', () => {
    const shot = fromLegacy(ball).shot;
    const original = settingsFingerprint(shot);
    shot.scatter = 1;
    assert.notEqual(settingsFingerprint(shot), original);
    shot.controls.topRpm = NaN;
    const nan = settingsFingerprint(shot);
    shot.controls.topRpm = null;
    assert.notEqual(nan, settingsFingerprint(shot));
});

test('all legal speed/spin/type settings match the existing MSYNC wire conversion', () => {
    for (const [speedText, maxSpin] of Object.entries(SPIN_LIMITS)) {
        for (let spin = 0; spin <= maxSpin; spin += 0.5) {
            for (const type of ['top', 'back']) {
                const speed = Number(speedText);
                const expected = controlsToRpm({ speed, spin, type });
                const execution = resolveMsyncExecution({ inline: { INL_TEST: { balls: [
                    { ball: 1, speed, spin, type, height: 17, drop: -2.5, bpm: 61, reps: 200 }
                ] } } }, { type: 'INLINE', name: 'INL_TEST' });
                const packet = buildMsyncDrillPacket(execution.steps[0]);
                const view = new DataView(packet.buffer);
                assert.equal(view.getUint32(7, true), expected.topRpm);
                assert.equal(view.getUint32(11, true), expected.bottomRpm);
            }
        }
    }
});

test('Bluetooth and MSYNC payloads retain byte parity across every built-in ball', async () => {
    // Load the existing DOM-connected module in a sandbox without replacing any
    // production imports. Its initialization only defines functions/state.
    const source = await readFile(new URL('../js/bluetooth.js', import.meta.url), 'utf8');
    const body = source.replace(/^import .*;.*$/gm, '').replace(/export /g, '');
    const context = vm.createContext({ clamp: (x, min, max) => Math.max(min, Math.min(max, x)) });
    vm.runInContext(`${body}\nthis.encode = packBall;`, context);
    for (const drill of Object.values(DEFAULT_DRILLS)) {
        for (const level of [1, 2, 3]) {
            for (const alternatives of drill[level]) {
                for (const value of alternatives) {
                    const original = structuredClone(value);
                    const restored = restoreLegacy(fromLegacy(value));
                    const packet = buildMsyncDrillPacket([restored]);
                    assert.deepEqual([...packet.slice(7)], [...context.encode(...original)]);
                    assert.deepEqual(value, original);
                }
            }
        }
    }
});

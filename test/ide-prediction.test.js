import test from 'node:test';
import assert from 'node:assert/strict';
import { fromLegacy, predictShot, validateDrill } from '../js/ide/index.js';
import { resolveMsyncExecution } from '../js/msync-robot.js';

const ball = [3545, 2177, 50, 0, 40, 1, 1];
// Synthetic fixture for contract tests only. It is NOT a Nova launch model.
const model = {
    id: 'synthetic-test-fixture', version: '1', supports: () => true,
    resolve: shot => ({ positionM: [-1, 0, 0.5], velocityMps: [4, shot.controls.drop / 10, 0] })
};

test('valid drill controls do not imply a known launch or playable landing', () => {
    const prediction = predictShot(fromLegacy(ball).shot);
    assert.equal(prediction.controlsValid, true);
    assert.equal(prediction.status, 'uncalibrated');
    assert.equal(prediction.outcome, 'unknown');
    assert.equal(prediction.firstBounce, null);
    assert.equal(prediction.secondBounce, null);
    assert.ok(prediction.issues.some(value => value.code === 'LAUNCH_MODEL_REQUIRED'));
});

test('explicit launch mapping produces versioned uncalibrated predictions', () => {
    const result = predictShot(fromLegacy(ball).shot, {}, model);
    assert.ok(result.firstBounce);
    assert.equal(result.status, 'uncalibrated');
    assert.deepEqual(result.launchModel, { id: model.id, version: model.version });
    assert.equal(result.uncertainty.kind, 'unknown');
    assert.ok(result.settingsFingerprint);
});

test('invalid controls never reach mapping; outside domain and thrown mappings remain unsupported', () => {
    let calls = 0;
    const checked = { ...model, resolve: shot => { calls++; return model.resolve(shot); } };
    const invalid = fromLegacy(ball).shot;
    invalid.controls.height = NaN;
    assert.equal(predictShot(invalid, {}, checked).status, 'unsupported');
    assert.equal(calls, 0);
    assert.equal(predictShot(fromLegacy(ball).shot, {}, { ...model, supports: () => false }).status, 'unsupported');
    assert.equal(predictShot(fromLegacy(ball).shot, {}, { ...model, resolve: () => { throw Error('bad fit'); } }).status, 'unsupported');
});

test('launch resolver receives isolated copies and cannot mutate caller settings/environment', () => {
    const shot = fromLegacy(ball).shot;
    const environment = { geometry: { lengthM: 2.74 } };
    const before = structuredClone({ shot, environment });
    const mutating = { ...model,
        supports: (value, env) => { value.controls.topRpm = 0; env.geometry.lengthM = 0; return true; },
        resolve: (value, env) => { value.controls.topRpm = 0; env.geometry.lengthM = 0; return model.resolve(value); }
    };
    assert.ok(predictShot(shot, environment, mutating).firstBounce);
    assert.deepEqual({ shot, environment }, before);
});

test('drill evaluates all alternatives and every legal scatter point without random selection', () => {
    const scatter = [...ball, undefined, undefined, undefined, 1];
    const steps = [[ball, scatter]];
    const before = structuredClone(steps);
    const report = validateDrill(steps, {}, model);
    assert.equal(report.controlsValid, true);
    assert.equal(report.shots.length, 2);
    assert.deepEqual(report.shots[1].predictions.map(value => value.drop), [-1, -0.5, 0, 0.5, 1]);
    assert.equal(report.shots[1].scatterEnvelope.kind, 'quantized-scatter-support');
    assert.equal(report.shots[1].scatterEnvelope.confidence, null);
    assert.equal(report.physicalStatus, 'uncalibrated-estimate');
    assert.deepEqual(steps, before);
    assert.equal(predictShot(fromLegacy(scatter).shot, {}, model).status, 'unsupported');
});

test('missing cases cannot produce a partial scatter confidence envelope', () => {
    const scatter = [...ball, undefined, undefined, undefined, 1];
    const report = validateDrill([[scatter]], {}, { ...model, supports: shot => shot.controls.drop <= 0 });
    assert.equal(report.shots[0].scatterEnvelope, null);
    assert.equal(report.physicalStatus, 'unknown');
});

test('inactive/empty/malformed drills and mixed legacy active flags are explicit', () => {
    const inactive = [...ball]; inactive[6] = 0;
    assert.equal(validateDrill([[inactive]], {}, model).shots.length, 0);
    assert.equal(validateDrill([[inactive]], {}, model).controlsValid, false);
    for (const steps of [null, [], [[]], [[null]], [null]]) assert.equal(validateDrill(steps).controlsValid, false);
    assert.ok(validateDrill([[ball, inactive]], {}, model).issues.some(value => value.code === 'MIXED_ACTIVE_STEP'));
});

test('prediction budget stops excessive drill expansion and remains unknown', () => {
    const report = validateDrill(Array.from({ length: 2049 }, () => [ball]));
    assert.ok(report.issues.some(value => value.code === 'PREDICTION_BUDGET_EXCEEDED'));
    assert.equal(report.physicalStatus, 'unknown');
});

test('MSYNC integration consumes resolved flavor settings without editing source definitions', () => {
    const parsed = { drills: { DRL_TEST: { data: [[ball]], random: true } }, flavors: { FLV_TEST: { height: 20, drop: 2 } } };
    const before = structuredClone(parsed);
    const execution = resolveMsyncExecution(parsed, { type: 'DRILL', name: 'DRL_TEST' }, 'FLV_TEST');
    const report = validateDrill(execution.steps, {}, model);
    assert.equal(report.controlsValid, true);
    assert.equal(report.shots[0].predictions[0].drop, 2);
    assert.deepEqual(parsed, before);
});

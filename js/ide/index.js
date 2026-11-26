import { simulateFlight, FLIGHT_MODEL_VERSION } from './flight.js';
import { COORDINATE_FRAME } from './geometry.js';
import { validateControls, issue } from './constraints.js';
import { fromLegacy, settingsFingerprint } from './legacy-adapter.js';

export { simulateFlight, FLIGHT_MODEL_VERSION } from './flight.js';
export { ITTF_GEOMETRY, COORDINATE_FRAME, onTable } from './geometry.js';
export { validateControls, controlsToRpm, CONTROL_LIMITS } from './constraints.js';
export { fromLegacy, restoreLegacy, settingsFingerprint } from './legacy-adapter.js';

// launchModel is injected, never imported from UI or a transport. It must
// explicitly accept/reject each setting in its measured/assumed domain.
// No default RPM-to-m/s or control-to-angle mapping exists in IDE-02.
export function predictShot(shot, environment = {}, launchModel = null, options = {}) {
    const validation = validateControls(shot);
    const fingerprint = settingsFingerprint(shot);
    const empty = {
        modelVersion: FLIGHT_MODEL_VERSION, coordinateFrame: COORDINATE_FRAME,
        settingsFingerprint: fingerprint, launchModel: null,
        controlsValid: validation.valid, status: 'unsupported',
        outcome: 'unknown', firstBounce: null, secondBounce: null, net: null,
        uncertainty: { kind: 'unknown', bounds: null }, issues: [...validation.issues]
    };
    if (!validation.valid) return empty;
    if (!launchModel || typeof launchModel.id !== 'string' || !launchModel.id ||
        typeof launchModel.version !== 'string' || !launchModel.version ||
        typeof launchModel.supports !== 'function' || typeof launchModel.resolve !== 'function') {
        empty.status = 'uncalibrated';
        empty.issues.push(issue('LAUNCH_MODEL_REQUIRED', 'launchModel', 'Robot settings need an explicit launch model before flight can be predicted.', 'WARNING'));
        return empty;
    }
    empty.launchModel = { id: launchModel.id, version: launchModel.version };
    if (shot.scatter > 0) {
        empty.issues.push(issue('SCATTER_REQUIRES_EXPANSION', 'scatter', 'Use validateDrill to evaluate every quantized scatter setting.'));
        return empty;
    }
    try {
        const input = structuredClone(shot);
        const context = structuredClone(environment);
        if (launchModel.supports(structuredClone(input), structuredClone(context)) !== true) {
            empty.issues.push(issue('OUTSIDE_MODEL_DOMAIN', 'launchModel', 'Launch model does not support these settings or environment.'));
            return empty;
        }
        const launch = launchModel.resolve(input, context);
        const flight = simulateFlight(launch, environment, options);
        return { ...flight, settingsFingerprint: fingerprint, launchModel: empty.launchModel,
            controlsValid: true, issues: [...validation.issues, ...flight.issues] };
    } catch {
        empty.issues.push(issue('LAUNCH_MODEL_FAILED', 'launchModel', 'Launch mapping failed; no trajectory is available.'));
        return empty;
    }
}

// Accepts a level's legacy steps OR resolveMsyncExecution(...).steps after
// flavor application. Does not import MSYNC, select random variants, or fire.
export function validateDrill(steps, environment = {}, launchModel = null, options = {}) {
    const report = { modelVersion: FLIGHT_MODEL_VERSION, coordinateFrame: COORDINATE_FRAME,
        controlsValid: true, physicalStatus: 'unknown', shots: [], issues: [] };
    if (!Array.isArray(steps) || !steps.length) {
        report.controlsValid = false;
        report.issues.push(issue('INVALID_DRILL', 'steps', 'Expected nonempty legacy steps.'));
        return report;
    }
    let cases = 0;
    let executable = 0;
    for (const [stepIndex, alternatives] of steps.entries()) {
        if (!Array.isArray(alternatives) || !alternatives.length) {
            report.controlsValid = false;
            report.issues.push({ ...issue('INVALID_STEP', 'step', 'Expected nonempty alternatives.'), step: stepIndex });
            continue;
        }
        const stepActive = alternatives[0]?.[6] !== 0;
        for (const [alternativeIndex, ball] of alternatives.entries()) {
            const snapshot = fromLegacy(ball, { step: stepIndex, alternative: alternativeIndex });
            const location = { step: stepIndex, alternative: alternativeIndex };
            report.issues.push(...snapshot.issues.map(value => ({ ...value, ...location })));
            if (snapshot.issues.some(value => value.severity === 'ERROR')) report.controlsValid = false;
            const shot = snapshot.shot;
            if (!shot) continue;
            if ((shot.active !== 0) !== stepActive) report.issues.push({
                ...issue('MIXED_ACTIVE_STEP', 'active', 'Legacy runner uses first alternative active state; MSYNC may filter alternatives individually.', 'WARNING'), ...location
            });
            if (!stepActive || shot.active === 0) continue;
            executable++;
            if (!validateControls(shot).valid) continue;
            const predictions = [];
            const spread = shot.scatter;
            for (let offset = -spread; offset <= spread + 1e-9; offset += 0.5) {
                if (++cases > 2048) {
                    report.issues.push(issue('PREDICTION_BUDGET_EXCEEDED', 'drill', 'At most 2048 variant/scatter cases per report. Remaining results are unknown.'));
                    return report;
                }
                const sample = structuredClone(shot);
                sample.controls.drop += offset;
                sample.scatter = 0;
                predictions.push({ drop: sample.controls.drop,
                    prediction: predictShot(sample, environment, launchModel, options) });
            }
            const complete = predictions.every(value => value.prediction.firstBounce && value.prediction.status !== 'unsupported');
            const positions = predictions.map(value => value.prediction.firstBounce?.positionM);
            report.shots.push({ ...location, settingsFingerprint: settingsFingerprint(shot),
                predictions, scatterEnvelope: complete ? {
                    kind: 'quantized-scatter-support', confidence: null,
                    minM: [0, 1, 2].map(i => Math.min(...positions.map(value => value[i]))),
                    maxM: [0, 1, 2].map(i => Math.max(...positions.map(value => value[i])))
                } : null });
        }
    }
    if (!executable) {
        report.controlsValid = false;
        report.issues.push(issue('NO_ACTIVE_BALLS', 'steps', 'Drill has no active balls.'));
    }
    if (report.controlsValid && report.shots.length && report.shots.every(value =>
        value.predictions.every(sample => sample.prediction.firstBounce && sample.prediction.status !== 'unsupported'))) {
        report.physicalStatus = 'uncalibrated-estimate';
    }
    return report;
}

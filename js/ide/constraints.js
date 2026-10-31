import { SPIN_LIMITS, RPM_MIN, RPM_MAX } from '../constants.js';

export const CONTROL_LIMITS = Object.freeze(Object.fromEntries(Object.entries({
    topRpm: [RPM_MIN, RPM_MAX, 1], bottomRpm: [RPM_MIN, RPM_MAX, 1],
    height: [-50, 100, 1], drop: [-10, 10, 0.5],
    frequencyPercent: [0, 100, null], reps: [1, 200, 1],
    speed: [0, 10, 0.5], spin: [0, 10, 0.5], scatter: [0, 10, 0.5]
}).map(([name, range]) => [name, Object.freeze(range)])));

export function issue(code, field, message, severity = 'ERROR') {
    return { code, field, message, severity };
}

export function validateControls(shot) {
    const issues = [];
    if (shot?.schemaVersion !== 1) issues.push(issue('UNSUPPORTED_SHOT_SCHEMA', 'schemaVersion', 'Expected ShotSpec v1.'));
    const controls = shot?.controls || {};
    const check = (name, value) => {
        const [min, max, increment] = CONTROL_LIMITS[name];
        if (!Number.isFinite(value) || value < min || value > max ||
            (increment && Math.abs(value / increment - Math.round(value / increment)) > 1e-7)) {
            issues.push(issue('INVALID_CONTROL', name, `${name} must be finite, in ${min}–${max}${increment ? ` at step ${increment}` : ''}.`));
        }
    };
    for (const name of ['topRpm', 'bottomRpm', 'height', 'drop', 'frequencyPercent', 'reps']) check(name, controls[name]);
    check('scatter', shot?.scatter ?? 0);
    if (Number.isFinite(controls.drop) && Number.isFinite(shot?.scatter) &&
        Math.abs(controls.drop) + shot.scatter > 10 + 1e-9) {
        issues.push(issue('INVALID_DROP_SCATTER', 'scatter', 'Absolute drop plus scatter must not exceed 10.'));
    }
    if (shot?.active !== undefined && shot.active !== 0 && shot.active !== 1) {
        issues.push(issue('INVALID_ACTIVE', 'active', 'Active must be 0 or 1.'));
    }
    if (shot?.ui !== undefined) {
        check('speed', shot.ui?.speed);
        check('spin', shot.ui?.spin);
        if (!['top', 'back'].includes(shot.ui?.type)) issues.push(issue('INVALID_SPIN_TYPE', 'type', 'Expected top or back.'));
        const { speed, spin, type } = shot.ui || {};
        if (spin > SPIN_LIMITS[String(speed)]) issues.push(issue('INVALID_SPEED_SPIN', 'spin', 'Spin exceeds the speed-dependent limit.'));
        if (Number.isFinite(speed) && Number.isFinite(spin) && ['top', 'back'].includes(type)) {
            const wheels = controlsToRpm({ speed, spin, type });
            if (wheels.saturated) issues.push(issue('WHEEL_SATURATION', 'ui', 'Legal controls saturate the wheel mapping.', 'WARNING'));
            if (wheels.topRpm !== controls.topRpm || wheels.bottomRpm !== controls.bottomRpm) {
                issues.push(issue('RPM_METADATA_MISMATCH', 'ui', 'Raw RPM differs from UI metadata; prediction retains raw RPM.', 'WARNING'));
            }
        }
    }
    return { valid: !issues.some(value => value.severity === 'ERROR'), issues };
}

// Characterization of existing conversion, not a physical launch model.
export function controlsToRpm({ speed, spin, type }) {
    if (!Number.isFinite(speed) || !Number.isFinite(spin) || !['top', 'back'].includes(type)) {
        throw new TypeError('Finite speed/spin and top/back type are required.');
    }
    const base = 970 + 630.5 * speed;
    const delta = 342 * spin * (type === 'top' ? 1 : -1);
    const raw = [Math.round(base + delta), Math.round(base - delta)];
    const [topRpm, bottomRpm] = raw.map(value => Math.max(RPM_MIN, Math.min(RPM_MAX, value)));
    return { topRpm, bottomRpm, saturated: raw[0] !== topRpm || raw[1] !== bottomRpm };
}

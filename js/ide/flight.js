import { ITTF_GEOMETRY, COORDINATE_FRAME, onTable } from './geometry.js';
import { issue } from './constraints.js';

export const FLIGHT_MODEL_VERSION = 'ide-flight-rk4-v1';
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function derivative(state, model, spin) {
    const relative = state.slice(3).map((v, i) => v - model.windMps[i]);
    const speed = Math.hypot(...relative);
    const lift = cross(spin, relative);
    return [...state.slice(3), ...relative.map((v, i) =>
        -model.dragPerM * speed * v + model.magnusCoefficient * lift[i] - (i === 2 ? model.gravityMps2 : 0))];
}

function advance(state, dt, model, spin) {
    const add = (delta, factor) => state.map((v, i) => v + delta[i] * dt * factor);
    const a = derivative(state, model, spin);
    const b = derivative(add(a, 0.5), model, spin);
    const c = derivative(add(b, 0.5), model, spin);
    const d = derivative(add(c, 1), model, spin);
    return state.map((v, i) => v + dt * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
}

// Root localization re-integrates from the left endpoint, rather than linearly
// interpolating a parabola. This also keeps collision order independent of dt.
function planeTime(state, dt, axis, plane, model, spin) {
    let low = 0, high = dt;
    const initialSign = Math.sign(state[axis] - plane);
    for (let i = 0; i < 36; i++) {
        const mid = (low + high) / 2;
        const value = advance(state, mid, model, spin)[axis] - plane;
        if (Math.sign(value) === initialSign) low = mid;
        else high = mid;
    }
    return (low + high) / 2;
}

export function simulateFlight(launch, environment = {}, options = {}) {
    const configurationValid = environment && typeof environment === 'object' && !Array.isArray(environment) &&
        options && typeof options === 'object' && !Array.isArray(options);
    environment = environment || {};
    options = options || {};
    const geometry = { ...ITTF_GEOMETRY, ...environment.geometry };
    const model = { gravityMps2: 9.80665, dragPerM: 0, magnusCoefficient: 0,
        windMps: [0, 0, 0], ...environment.aerodynamics };
    const bounce = environment.bounce ?? null;
    const dt = options.timeStepS ?? 0.002;
    const horizon = options.maxTimeS ?? 5;
    const spin = launch?.spinRadPerS ?? [0, 0, 0];
    const result = {
        modelVersion: FLIGHT_MODEL_VERSION, coordinateFrame: COORDINATE_FRAME,
        units: { position: 'm', time: 's', velocity: 'm/s', spin: 'rad/s' },
        status: 'uncalibrated', outcome: 'unknown', termination: null,
        firstBounce: null, secondBounce: null, tablePlaneCrossing: null,
        floorContact: null, net: null, events: [], trajectory: [],
        launch: null, simulation: null,
        uncertainty: { kind: 'unknown', bounds: null }, issues: []
    };
    const invalid = message => {
        result.status = 'unsupported';
        result.termination = 'INVALID_INPUT';
        result.issues.push(issue('INVALID_FLIGHT_INPUT', 'flight', message));
        return result;
    };
    if (!configurationValid) return invalid('Environment and options must be objects.');
    if (environment.coordinateFrame !== undefined && environment.coordinateFrame !== COORDINATE_FRAME) return invalid('Unsupported coordinate frame; transform to the documented table frame first.');
    if (!vector(launch?.positionM) || !vector(launch?.velocityMps) || !vector(spin)) return invalid('Finite 3D launch position, velocity and spin required.');
    if (!Number.isFinite(dt) || dt < 0.0001 || dt > 0.01 || !Number.isFinite(horizon) || horizon <= 0 || horizon > 10 || horizon / dt > 100000) return invalid('Time step must be 0.0001–0.01 s and horizon >0–10 s (at most 100000 steps).');
    if (Object.values(geometry).some(value => !Number.isFinite(value) || value <= 0) ||
        geometry.ballRadiusM >= geometry.netHeightM || geometry.ballRadiusM >= geometry.tableHeightM ||
        !Number.isFinite(model.gravityMps2) || model.gravityMps2 <= 0 ||
        !Number.isFinite(model.dragPerM) || model.dragPerM < 0 ||
        !Number.isFinite(model.magnusCoefficient) || model.magnusCoefficient < 0 || !vector(model.windMps)) return invalid('Invalid geometry or aerodynamic coefficients.');
    if (bounce && (!Number.isFinite(bounce.restitution) || bounce.restitution <= 0 || bounce.restitution > 1 ||
        !Number.isFinite(bounce.tangentialRetention) || bounce.tangentialRetention < 0 || bounce.tangentialRetention > 1)) return invalid('Bounce requires restitution >0–1 and tangential retention 0–1.');
    if (launch.positionM[2] <= geometry.ballRadiusM) return invalid('Launch center must start above table contact height.');
    if (Math.abs(launch.positionM[0]) <= geometry.ballRadiusM && Math.abs(launch.positionM[1]) <= geometry.widthM / 2 + geometry.netOverhangM + geometry.ballRadiusM && launch.positionM[2] - geometry.ballRadiusM <= geometry.netHeightM) return invalid('Launch overlaps the net assembly.');
    result.launch = { positionM: [...launch.positionM], velocityMps: [...launch.velocityMps], spinRadPerS: [...spin] };
    result.simulation = structuredClone({ geometry, aerodynamics: model, bounce, timeStepS: dt, maxTimeS: horizon });
    result.issues.push(issue('UNCALIBRATED_PHYSICS', 'model', 'No measured Nova flight accuracy or confidence interval is available.', 'WARNING'));
    let state = [...launch.positionM, ...launch.velocityMps];
    let time = 0;
    let steps = 0;
    let tablePlanePassed = false;
    const point = () => ({ timeS: time, positionM: state.slice(0, 3), velocityMps: state.slice(3) });
    result.trajectory.push(point());
    while (time < horizon - 1e-10 && steps++ < 100000) {
        let step = Math.min(dt, horizon - time);
        let next = advance(state, step, model, spin);
        if (!next.every(Number.isFinite) || next.some(value => Math.abs(value) > 1e6)) {
            result.status = 'unsupported'; result.termination = 'NUMERICAL_FAILURE';
            result.issues.push(issue('NUMERICAL_FAILURE', 'model', 'Integration diverged; no playability conclusion.'));
            return result;
        }
        const candidates = [];
        if ((state[0] < 0 && next[0] >= 0) || (state[0] > 0 && next[0] <= 0)) {
            candidates.push({ type: 'NET', axis: 0, plane: 0 });
        }
        if (!tablePlanePassed && state[2] >= geometry.ballRadiusM && next[2] < geometry.ballRadiusM) {
            candidates.push({ type: 'TABLE', axis: 2, plane: geometry.ballRadiusM });
        }
        const floor = -geometry.tableHeightM + geometry.ballRadiusM;
        if (state[2] >= floor && next[2] < floor) candidates.push({ type: 'FLOOR', axis: 2, plane: floor });
        const collision = candidates.map(value => ({ ...value,
            dt: planeTime(state, step, value.axis, value.plane, model, spin) }))
            .sort((a, b) => a.dt - b.dt)[0];
        if (collision) {
            step = collision.dt;
            next = advance(state, step, model, spin);
            next[collision.axis] = collision.plane;
        }
        state = next;
        time += step;
        if (collision || steps % 10 === 0) result.trajectory.push(point());
        if (!collision) continue;
        const contact = point();
        if (collision.type === 'NET') {
            const withinSpan = Math.abs(state[1]) <= geometry.widthM / 2 + geometry.netOverhangM + geometry.ballRadiusM;
            const clearanceM = state[2] - geometry.ballRadiusM - geometry.netHeightM;
            const net = { ...contact, clearanceM, withinSpan,
                classification: !withinSpan ? 'around-net' : state[2] + geometry.ballRadiusM < 0
                    ? 'below-table' : clearanceM > 0 ? 'clear' : 'net-contact' };
            result.net ??= net;
            result.events.push({ type: 'NET', ...net });
            if (withinSpan && clearanceM <= 0 && state[2] + geometry.ballRadiusM >= 0) {
                result.outcome = 'net'; result.termination = 'NET_CONTACT'; break;
            }
            // Advance infinitesimally across the plane to avoid a repeated root.
            state[0] = Math.sign(state[3] || 1) * 1e-12;
        } else if (collision.type === 'TABLE') {
            tablePlanePassed = true;
            result.tablePlaneCrossing ??= { ...contact, onTable: onTable(state, geometry) };
            if (!onTable(state, geometry)) {
                result.outcome = result.firstBounce ? result.outcome : 'out';
                result.events.push({ type: 'TABLE_PLANE_MISS', ...contact });
                continue;
            }
            result.events.push({ type: 'TABLE_BOUNCE', ...contact });
            if (!result.firstBounce) {
                result.firstBounce = contact;
                result.outcome = state[0] > 0 ? 'player-half' : 'robot-half';
            } else {
                result.secondBounce = contact;
                result.termination = 'SECOND_TABLE_BOUNCE'; break;
            }
            if (!bounce) {
                result.termination = 'BOUNCE_MODEL_REQUIRED';
                result.issues.push(issue('BOUNCE_MODEL_REQUIRED', 'bounce', 'Second bounce requires explicit bounce coefficients.', 'WARNING'));
                break;
            }
            state[3] *= bounce.tangentialRetention;
            state[4] *= bounce.tangentialRetention;
            state[5] = -state[5] * bounce.restitution;
            state[2] += 1e-10;
            tablePlanePassed = false;
        } else {
            result.floorContact = contact;
            result.events.push({ type: 'FLOOR_CONTACT', ...contact });
            result.termination = 'FLOOR_CONTACT'; break;
        }
    }
    if (!result.termination && time < horizon - 1e-10) {
        result.status = 'unsupported'; result.termination = 'STEP_LIMIT';
        result.issues.push(issue('STEP_LIMIT', 'flight', 'Event integration budget exhausted; no playability conclusion.'));
    }
    result.termination ??= 'TIME_LIMIT';
    if (result.trajectory.at(-1).timeS !== time) result.trajectory.push(point());
    if (result.termination === 'TIME_LIMIT') result.issues.push(issue('TIME_LIMIT', 'flight', 'Simulation horizon reached; missing events are unknown.', 'WARNING'));
    return result;
}

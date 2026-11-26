import { validateControls, issue } from './constraints.js';

// Lossless snapshots keep missing fields, unknown trailing values and raw RPM.
export function fromLegacy(ball, context = {}) {
    if (!Array.isArray(ball) || ball.length < 6) {
        return { shot: null, raw: structuredClone(ball), issues: [issue('INVALID_LEGACY_BALL', 'ball', 'Expected at least six legacy fields.')] };
    }
    const raw = structuredClone(ball);
    const shot = {
        schemaVersion: 1,
        shotId: context.shotId ?? null,
        controls: { topRpm: ball[0], bottomRpm: ball[1], height: ball[2],
            drop: ball[3], frequencyPercent: ball[4], reps: ball[5] },
        active: ball[6] === undefined ? 1 : ball[6],
        scatter: ball[10] === undefined ? 0 : ball[10],
        provenance: structuredClone(context)
    };
    if (ball.slice(7, 10).some(value => value !== undefined)) {
        shot.ui = { speed: ball[7], spin: ball[8], type: ball[9] };
    }
    return { shot, raw, issues: validateControls(shot).issues };
}

export function restoreLegacy(snapshot) {
    return structuredClone(snapshot.raw);
}

// Read-only identity. Full canonical text avoids hash collision and NaN→null loss.
export function settingsFingerprint(shot) {
    const encode = value => typeof value === 'number' && !Number.isFinite(value)
        ? String(value) : value === undefined ? '<undefined>' : value;
    return JSON.stringify([
        shot?.schemaVersion,
        ...['topRpm', 'bottomRpm', 'height', 'drop', 'frequencyPercent', 'reps']
            .map(name => encode(shot?.controls?.[name])),
        encode(shot?.scatter), encode(shot?.active),
        ...['speed', 'spin', 'type'].map(name => encode(shot?.ui?.[name]))
    ]);
}

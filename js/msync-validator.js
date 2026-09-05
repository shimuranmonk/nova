import { SPIN_LIMITS } from './constants.js';
import {
    MSYNC_FORMAT_VERSION,
    parseMsync
} from './msync-parser.js';
import {
    findCustomDrillById,
    isValidCustomDrillId
} from './custom-drill-identity.js';

const NAME_PATTERNS = {
    DRILL: /^DRL_[A-Z][A-Z0-9_]{0,35}$/,
    FLAVOR: /^FLV_[A-Z][A-Z0-9_]{0,35}$/,
    INLINE: /^INL_[A-Z][A-Z0-9_]{0,35}$/
};
const TIMESTAMP_PATTERN = /^(\d{2,}):([0-5]\d)\.(\d{3})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function issue(severity, code, line, section, message, extra = {}) {
    return { severity, code, line, section, message, ...extra };
}

function add(issues, value) {
    if (issues.length < 100) issues.push(value);
}

function timestampToMs(value) {
    const match = TIMESTAMP_PATTERN.exec(value);
    return match
        ? (Number(match[1]) * 60 + Number(match[2])) * 1000 + Number(match[3])
        : null;
}

function exactNumber(value, { min, max, step, decimals = null }) {
    if (!/^-?(?:\d+|\d+\.\d+)$/.test(value)) return null;
    if (decimals !== null && (value.split('.')[1]?.length || 0) > decimals) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) return null;
    const scaled = (number - min) / step;
    return Math.abs(scaled - Math.round(scaled)) < 1e-9 ? number : null;
}

function collectFields(entries, allowed, required, section, issues) {
    const result = {};
    const seen = new Set();

    for (const entry of entries) {
        if (!allowed.has(entry.key)) {
            add(issues, issue('ERROR', 'UNKNOWN_FIELD', entry.line, section,
                `${entry.key} is not allowed in [${section}].`, { found: entry.key }));
            continue;
        }
        if (seen.has(entry.key)) {
            add(issues, issue('ERROR', 'DUPLICATE_FIELD', entry.line, section,
                `${entry.key} may appear only once.`, { found: entry.key }));
            continue;
        }
        seen.add(entry.key);
        result[entry.key] = entry;
    }

    for (const key of required) {
        if (!seen.has(key)) add(issues, issue('ERROR', 'MISSING_FIELD', null, section,
            `${key} is required in [${section}].`, { expected: key }));
    }
    return result;
}

function validateInfo(entries, issues) {
    if (!entries.length) return null;
    const fields = collectFields(entries,
        new Set(['TITLE', 'AUTHOR', 'DESCRIPTION']), new Set(['TITLE']), 'INFO', issues);
    const output = {};
    for (const [key, limit] of Object.entries({ TITLE: 100, AUTHOR: 100, DESCRIPTION: 500 })) {
        const field = fields[key];
        if (!field) continue;
        if (field.value.length > limit) add(issues, issue('ERROR', 'TEXT_TOO_LONG', field.line,
            'INFO', `${key} exceeds ${limit} characters.`, { expected: `1-${limit}`, found: field.value.length }));
        output[key.toLowerCase()] = field.value;
    }
    return output;
}

function validateAudio(entries, issues) {
    const fields = collectFields(entries, new Set(['FILENAME', 'SHA256', 'DURATION']),
        new Set(['FILENAME', 'SHA256', 'DURATION']), 'AUDIO', issues);
    const filename = fields.FILENAME?.value;
    const sha256 = fields.SHA256?.value;
    const durationText = fields.DURATION?.value;
    const durationMs = durationText ? timestampToMs(durationText) : null;

    if (filename && (filename.length > 255 || /[\\/]/.test(filename) ||
        !/^[^<>:"|?*]+\.[^<>:"|?*.]+$/.test(filename))) {
        add(issues, issue('ERROR', 'INVALID_AUDIO_FILENAME', fields.FILENAME.line, 'AUDIO',
            'FILENAME must be a plain filename with an extension.', { found: filename }));
    }
    if (sha256 && !SHA256_PATTERN.test(sha256)) add(issues, issue('ERROR',
        'INVALID_AUDIO_SHA256', fields.SHA256.line, 'AUDIO',
        'SHA256 must contain exactly 64 hexadecimal characters.', { found: sha256 }));
    if (durationText && (durationMs === null || durationMs <= 0)) add(issues, issue('ERROR',
        'INVALID_AUDIO_DURATION', fields.DURATION.line, 'AUDIO',
        'DURATION must use MM:SS.mmm and be greater than zero.', { found: durationText }));

    return {
        filename: filename || null,
        sha256: sha256 ? sha256.toLowerCase() : null,
        duration: durationText || null,
        durationMs
    };
}

function validateSession(entries, issues) {
    const fields = collectFields(entries, new Set(['COUNTDOWN', 'CYCLE_PAUSE', 'ROBOT_LEAD']),
        new Set(), 'SESSION', issues);
    const output = { countdown: 4, cyclePause: 1, robotLead: 1.3 };
    if (fields.COUNTDOWN) {
        const value = exactNumber(fields.COUNTDOWN.value, { min: 0, max: 10, step: 1 });
        if (value === null) add(issues, issue('ERROR', 'INVALID_COUNTDOWN', fields.COUNTDOWN.line,
            'SESSION', 'COUNTDOWN must be a whole number from 0 through 10.'));
        else output.countdown = value;
    }
    if (fields.CYCLE_PAUSE) {
        const value = exactNumber(fields.CYCLE_PAUSE.value,
            { min: 0, max: 10, step: 0.001, decimals: 3 });
        if (value === null) add(issues, issue('ERROR', 'INVALID_CYCLE_PAUSE', fields.CYCLE_PAUSE.line,
            'SESSION', 'CYCLE_PAUSE must be 0 through 10 with at most three decimal places.'));
        else output.cyclePause = value;
    }
    if (fields.ROBOT_LEAD) {
        const value = exactNumber(fields.ROBOT_LEAD.value,
            { min: 0, max: 5, step: 0.001, decimals: 3 });
        if (value === null) add(issues, issue('ERROR', 'INVALID_ROBOT_LEAD', fields.ROBOT_LEAD.line,
            'SESSION', 'ROBOT_LEAD must be 0 through 5 with at most three decimal places.'));
        else output.robotLead = value;
    }
    return output;
}

function validateDrills(entries, issues, context) {
    const drills = {};
    for (const entry of entries) {
        if (!NAME_PATTERNS.DRILL.test(entry.key)) {
            add(issues, issue('ERROR', 'INVALID_DRILL_ALIAS', entry.line, 'DRILLS',
                'Drill aliases must use DRL_NAME in the approved uppercase form.', { found: entry.key }));
            continue;
        }
        if (Object.hasOwn(drills, entry.key)) {
            add(issues, issue('ERROR', 'DUPLICATE_DRILL_ALIAS', entry.line, 'DRILLS',
                `Drill alias ${entry.key} is duplicated.`));
            continue;
        }
        const match = /^(BUILTIN|CUSTOM):(.+);LEVEL=([123])$/.exec(entry.value);
        if (!match) {
            add(issues, issue('ERROR', 'INVALID_DRILL_REFERENCE', entry.line, 'DRILLS',
                'Expected BUILTIN:key;LEVEL=n or CUSTOM:uuid;LEVEL=n.', { found: entry.value }));
            continue;
        }
        const [, kind, reference, levelText] = match;
        if (!reference || (kind === 'CUSTOM' && !isValidCustomDrillId(reference))) {
            add(issues, issue('ERROR', 'INVALID_DRILL_REFERENCE', entry.line, 'DRILLS',
                `Reference for ${entry.key} is malformed.`, { found: reference }));
            continue;
        }
        const level = Number(levelText);
        let data = null;
        let random = false;
        if (kind === 'BUILTIN' && context.builtInDrills) {
            data = context.builtInDrills[reference]?.[level];
            random = Boolean(context.builtInDrills[reference]?.random);
        }
        if (kind === 'CUSTOM' && context.customDrills && context.drillData) {
            const custom = findCustomDrillById(context.customDrills, reference);
            data = custom ? context.drillData[custom.key]?.[level] : null;
            random = custom ? Boolean(context.drillData[custom.key]?.random) : false;
        }
        const resolutionRequired = context.requireDrillResolution ||
            (kind === 'BUILTIN'
                ? Boolean(context.builtInDrills)
                : Boolean(context.customDrills || context.drillData));
        if (resolutionRequired && !isExecutableDrillData(data)) {
            add(issues, issue('ERROR', 'MISSING_DRILL', entry.line, 'DRILLS',
                `${entry.key} cannot resolve ${kind}:${reference} at level ${level}.`,
                { found: `${kind}:${reference}` }));
        }
        drills[entry.key] = { kind, reference, level, line: entry.line, data, random };
    }
    return drills;
}

function isExecutableDrillData(data) {
    let balls = 0;
    function inspect(value) {
        if (!Array.isArray(value)) return false;
        if (value.length >= 6 && value.slice(0, 6).every(Number.isFinite)) {
            balls++;
            return true;
        }
        return value.length > 0 && value.every(inspect);
    }
    return inspect(data) && balls > 0;
}

const BALL_RULES = {
    SPEED: { min: 0, max: 10, step: 0.5 },
    SPIN: { min: 0, max: 10, step: 0.5 },
    HEIGHT: { min: -50, max: 100, step: 1 },
    DROP: { min: -10, max: 10, step: 0.5 },
    BPM: { min: 30, max: 90, step: 1 },
    REPS: { min: 1, max: 200, step: 1 }
};
const OPTIONAL_BALL_RULES = {
    SCATTER: { min: 0, max: 10, step: 0.5 }
};

function validateBall(entry, section, issues) {
    const parts = entry.value.split(';');
    const numberText = parts.shift();
    const ballNumber = /^\d+$/.test(numberText) ? Number(numberText) : null;
    const fields = {};
    if (!ballNumber || ballNumber < 1) add(issues, issue('ERROR', 'INVALID_BALL_NUMBER',
        entry.line, section, 'BALL numbers must be positive integers.', { found: numberText }));
    for (const part of parts) {
        const match = /^([A-Z]+)=(.+)$/.exec(part);
        if (!match) {
            add(issues, issue('ERROR', 'MALFORMED_BALL_FIELD', entry.line, section,
                `Malformed BALL field: ${part}.`));
            continue;
        }
        if (!Object.hasOwn(BALL_RULES, match[1]) &&
            !Object.hasOwn(OPTIONAL_BALL_RULES, match[1]) && match[1] !== 'TYPE') {
            add(issues, issue('ERROR', 'UNKNOWN_BALL_FIELD', entry.line, section,
                `${match[1]} is not an MSYNC v1 BALL field.`));
        }
        else if (Object.hasOwn(fields, match[1])) add(issues, issue('ERROR',
            'DUPLICATE_BALL_FIELD', entry.line, section, `${match[1]} is duplicated.`));
        else fields[match[1]] = match[2];
    }
    for (const key of [...Object.keys(BALL_RULES), 'TYPE']) {
        if (!Object.hasOwn(fields, key)) add(issues, issue('ERROR', 'MISSING_BALL_FIELD',
            entry.line, section, `${key} is required on every BALL line.`));
    }
    const output = { ball: ballNumber, line: entry.line };
    for (const [key, rule] of Object.entries(BALL_RULES)) {
        if (!Object.hasOwn(fields, key)) continue;
        const value = exactNumber(fields[key], rule);
        if (value === null) add(issues, issue('ERROR', 'INVALID_BALL_VALUE', entry.line, section,
            `${key} is outside its allowed range or increment.`, { found: fields[key] }));
        else output[key.toLowerCase()] = value;
    }
    for (const [key, rule] of Object.entries(OPTIONAL_BALL_RULES)) {
        if (!Object.hasOwn(fields, key)) continue;
        const value = exactNumber(fields[key], rule);
        if (value === null) add(issues, issue('ERROR', 'INVALID_BALL_VALUE', entry.line, section,
            `${key} is outside its allowed range or increment.`, { found: fields[key] }));
        else output[key.toLowerCase()] = value;
    }
    if (fields.TYPE && !['top', 'back'].includes(fields.TYPE)) add(issues, issue('ERROR',
        'INVALID_BALL_TYPE', entry.line, section, 'TYPE must be top or back.', { found: fields.TYPE }));
    else if (fields.TYPE) output.type = fields.TYPE;
    if (Number.isFinite(output.drop) && Number.isFinite(output.scatter) &&
        Math.abs(output.drop) + output.scatter > 10) add(issues, issue('ERROR',
        'INVALID_DROP_SCATTER', entry.line, section,
        'Absolute DROP plus SCATTER cannot exceed 10.'));
    if (output.speed !== undefined && output.spin !== undefined &&
        output.spin > (SPIN_LIMITS[String(output.speed)] ?? -1)) add(issues, issue('ERROR',
        'INVALID_SPEED_SPIN', entry.line, section,
        `Spin ${output.spin} is not legal at Speed ${output.speed}.`));
    return output;
}

function validateInline(definitions, issues) {
    const result = {};
    for (const [name, entries] of Object.entries(definitions)) {
        const section = `INLINE:${name}`;
        if (!NAME_PATTERNS.INLINE.test(name)) add(issues, issue('ERROR',
            'INVALID_INLINE_NAME', entries[0]?.line || null, section,
            'Inline names must use INL_NAME in the approved uppercase form.'));
        const meta = entries.filter(entry => entry.key !== 'BALL');
        const fields = collectFields(meta, new Set(['NAME', 'RANDOM']), new Set(['NAME']), section, issues);
        const balls = entries.filter(entry => entry.key === 'BALL').map(entry =>
            validateBall(entry, section, issues));
        if (!balls.length) add(issues, issue('ERROR', 'MISSING_INLINE_BALL', null, section,
            'An inline drill requires at least one BALL line.'));
        const numbers = [...new Set(balls.map(ball => ball.ball).filter(Boolean))].sort((a, b) => a - b);
        if (numbers.some((number, index) => number !== index + 1)) add(issues, issue('ERROR',
            'NONCONSECUTIVE_BALLS', balls[0]?.line || null, section,
            'BALL numbers must begin at 1 and be consecutive.'));
        let random = false;
        if (fields.RANDOM) {
            if (!['true', 'false'].includes(fields.RANDOM.value)) add(issues, issue('ERROR',
                'INVALID_RANDOM', fields.RANDOM.line, section, 'RANDOM must be true or false.'));
            else random = fields.RANDOM.value === 'true';
        }
        result[name] = { name: fields.NAME?.value || null, random, balls };
    }
    return result;
}

function validateFlavors(definitions, issues) {
    const result = {};
    const allowed = new Set(['FLV_TYPE', 'FLV_SPEED', 'FLV_SPIN', 'FLV_HEIGHT',
        'FLV_DROP', 'FLV_BPM', 'FLV_REPS']);
    for (const [name, entries] of Object.entries(definitions)) {
        const section = `FLAVOR:${name}`;
        if (!NAME_PATTERNS.FLAVOR.test(name) || name === 'FLV_NONE') add(issues, issue('ERROR',
            'INVALID_FLAVOR_NAME', entries[0]?.line || null, section,
            'Flavor names must use FLV_NAME; NONE is reserved.'));
        const fields = collectFields(entries, allowed, new Set(), section, issues);
        if (!Object.keys(fields).length) add(issues, issue('ERROR', 'EMPTY_FLAVOR', null, section,
            'A flavor must contain at least one parameter.'));
        const flavor = {};
        for (const [key, entry] of Object.entries(fields)) {
            if (key === 'FLV_TYPE') {
                if (!['top', 'back'].includes(entry.value)) add(issues, issue('ERROR',
                    'INVALID_FLAVOR_VALUE', entry.line, section, 'FLV_TYPE must be top or back.'));
                else flavor.type = entry.value;
            }
            else {
                const parameter = key.slice(4);
                const value = exactNumber(entry.value, BALL_RULES[parameter]);
                if (value === null) add(issues, issue('ERROR', 'INVALID_FLAVOR_VALUE',
                    entry.line, section, `${key} is outside its allowed range or increment.`,
                    { found: entry.value }));
                else flavor[parameter.toLowerCase()] = value;
            }
        }
        result[name] = flavor;
    }
    return result;
}

function rawBallSpeedSpin(ball) {
    if (!Array.isArray(ball)) return null;
    if (Number.isFinite(ball[7]) && Number.isFinite(ball[8])) return { speed: ball[7], spin: ball[8] };
    if (!Number.isFinite(ball[0]) || !Number.isFinite(ball[1])) return null;
    return {
        speed: Math.round((((ball[0] + ball[1]) / 2 - 970) / 630.5) * 2) / 2,
        spin: Math.round((Math.abs(ball[0] - ball[1]) / 2 / 342) * 2) / 2
    };
}

function activeBalls(active) {
    if (!active) return [];
    if (active.kind === 'INLINE') return active.definition?.balls || [];
    const balls = [];
    function inspect(value) {
        if (!Array.isArray(value)) return;
        const ball = rawBallSpeedSpin(value);
        if (ball) balls.push(ball);
        else value.forEach(inspect);
    }
    inspect(active.definition?.data || []);
    return balls;
}

function validateCues(rawCues, parsed, durationMs, issues) {
    const cues = [];
    const used = { drills: new Set(), inline: new Set(), flavors: new Set() };
    let previousTime = -1;
    let active = null;
    let stopSeen = false;
    let activationCount = 0;
    const timestampCommands = new Map();

    for (const raw of rawCues) {
        if (active?.once && raw.timestamp !== active.timestamp) active = null;
        const timeMs = timestampToMs(raw.timestamp);
        if (timeMs === null) add(issues, issue('ERROR', 'INVALID_CUE_TIMESTAMP', raw.line,
            'CUES', 'Cue timestamps must use MM:SS.mmm.', { found: raw.timestamp }));
        else {
            if (timeMs < previousTime) add(issues, issue('ERROR', 'CUES_OUT_OF_ORDER', raw.line,
                'CUES', 'Cue timestamps must be chronological.'));
            if (durationMs !== null && timeMs > durationMs) add(issues, issue('ERROR',
                'CUE_AFTER_DURATION', raw.line, 'CUES', 'Cue occurs after AUDIO DURATION.'));
            previousTime = Math.max(previousTime, timeMs);
        }
        if (stopSeen) add(issues, issue('ERROR', 'CUE_AFTER_STOP', raw.line, 'CUES',
            'No cue may appear after STOP.'));
        if (!['DRILL', 'INLINE', 'FLAVOR', 'REST', 'IDLE', 'STOP'].includes(raw.command)) {
            add(issues, issue('ERROR', 'UNKNOWN_CUE_COMMAND', raw.line, 'CUES',
                `${raw.command} is not an MSYNC v1 cue command.`));
            continue;
        }
        const same = timestampCommands.get(raw.timestamp) || [];
        const selections = same.filter(command => ['DRILL', 'INLINE'].includes(command)).length;
        if ((['DRILL', 'INLINE'].includes(raw.command) && selections) || same.includes(raw.command))
            add(issues, issue('ERROR', 'DUPLICATE_SIMULTANEOUS_COMMAND', raw.line, 'CUES',
                `Command ${raw.command} conflicts with another cue at ${raw.timestamp}.`));
        if (same.includes('STOP') || (raw.command === 'STOP' && same.length)) add(issues, issue('ERROR',
            'STOP_NOT_ALONE', raw.line, 'CUES', 'STOP must be alone at its timestamp.'));
        if (same.includes('IDLE') || (raw.command === 'IDLE' && same.length)) add(issues, issue('ERROR',
            'IDLE_NOT_ALONE', raw.line, 'CUES', 'IDLE must be alone at its timestamp.'));
        const rank = command => ['DRILL', 'INLINE'].includes(command)
            ? 0
            : command === 'FLAVOR'
                ? 1
                : command === 'REST'
                    ? 2
                    : 3;
        if (same.length && rank(raw.command) < rank(same[same.length - 1])) add(issues, issue('ERROR',
            'INVALID_SIMULTANEOUS_ORDER', raw.line, 'CUES',
            'Commands at one timestamp must be DRILL/INLINE, FLAVOR, then REST.'));
        timestampCommands.set(raw.timestamp, [...same, raw.command]);

        const cue = { timeMs, type: raw.command, line: raw.line };
        if (raw.once && !['DRILL', 'INLINE'].includes(raw.command)) add(issues, issue('ERROR',
            'ONCE_NOT_ALLOWED', raw.line, 'CUES',
            'ONCE may be used only with DRILL or INLINE cues.'));
        if (raw.command === 'DRILL') {
            if (!Object.hasOwn(parsed.drills, raw.value)) add(issues, issue('ERROR',
                'UNDEFINED_DRILL', raw.line, 'CUES', `Drill alias ${raw.value} is not defined.`));
            else { active = { kind: 'DRILL', definition: parsed.drills[raw.value],
                once: raw.once, timestamp: raw.timestamp }; used.drills.add(raw.value); }
            activationCount++;
            cue.name = raw.value;
            cue.once = raw.once;
        }
        else if (raw.command === 'INLINE') {
            if (!Object.hasOwn(parsed.inline, raw.value)) add(issues, issue('ERROR',
                'UNDEFINED_INLINE', raw.line, 'CUES', `Inline drill ${raw.value} is not defined.`));
            else { active = { kind: 'INLINE', definition: parsed.inline[raw.value],
                once: raw.once, timestamp: raw.timestamp }; used.inline.add(raw.value); }
            activationCount++;
            cue.name = raw.value;
            cue.once = raw.once;
        }
        else if (raw.command === 'FLAVOR') {
            if (!active) add(issues, issue('ERROR', 'FLAVOR_WITHOUT_DRILL', raw.line, 'CUES',
                'FLAVOR requires an active drill.'));
            if (raw.value !== 'NONE' && !Object.hasOwn(parsed.flavors, raw.value)) add(issues,
                issue('ERROR', 'UNDEFINED_FLAVOR', raw.line, 'CUES', `Flavor ${raw.value} is not defined.`));
            else if (raw.value !== 'NONE') {
                used.flavors.add(raw.value);
                const flavor = parsed.flavors[raw.value];
                for (const ball of activeBalls(active)) {
                    const speed = flavor.speed ?? ball.speed;
                    const spin = flavor.spin ?? ball.spin;
                    if (Number.isFinite(speed) && Number.isFinite(spin) &&
                        spin > (SPIN_LIMITS[String(speed)] ?? -1)) add(issues, issue('ERROR',
                        'FLAVOR_INVALID_SPEED_SPIN', raw.line, 'CUES',
                        `${raw.value} creates illegal Spin ${spin} at Speed ${speed}.`));
                }
            }
            cue.name = raw.value;
        }
        else if (raw.command === 'REST') {
            if (!active) add(issues, issue('ERROR', 'REST_WITHOUT_DRILL', raw.line, 'CUES',
                'REST requires an active drill.'));
            const seconds = exactNumber(raw.value, { min: 0.001, max: 600, step: 0.001, decimals: 3 });
            if (seconds === null) add(issues, issue('ERROR', 'INVALID_REST', raw.line, 'CUES',
                'REST must be greater than zero, at most 600, and use at most three decimals.'));
            else {
                cue.durationMs = Math.round(seconds * 1000);
                if (timeMs !== null && durationMs !== null && timeMs + cue.durationMs > durationMs)
                    add(issues, issue('ERROR', 'REST_AFTER_DURATION', raw.line, 'CUES',
                        'REST extends beyond AUDIO DURATION.'));
            }
        }
        else if (raw.command === 'IDLE') {
            if (!active) add(issues, issue('ERROR', 'IDLE_WITHOUT_DRILL', raw.line, 'CUES',
                'IDLE requires an active drill.'));
            active = null;
        }
        else if (raw.command === 'STOP') stopSeen = true;
        cues.push(cue);
    }
    if (!activationCount) add(issues, issue('ERROR', 'MISSING_ACTIVATION', null, 'CUES',
        '[CUES] requires at least one DRILL or INLINE activation.'));
    for (const [name, definition] of Object.entries(parsed.drills)) if (!used.drills.has(name))
        add(issues, issue('WARNING', 'UNUSED_DRILL', definition.line, 'DRILLS', `${name} is never used.`));
    for (const name of Object.keys(parsed.inline)) if (!used.inline.has(name)) add(issues,
        issue('WARNING', 'UNUSED_INLINE', null, `INLINE:${name}`, `${name} is never used.`));
    for (const name of Object.keys(parsed.flavors)) if (!used.flavors.has(name)) add(issues,
        issue('WARNING', 'UNUSED_FLAVOR', null, `FLAVOR:${name}`, `${name} is never used.`));
    return cues;
}

function validateTrack(audio, track, issues) {
    if (!track) return;
    const hash = track.metadata?.sha256;
    if (!hash) add(issues, issue('ERROR', 'TRACK_HASH_REQUIRED', null, 'IMPORT',
        'The selected legacy Track requires an audio hash before validation.'));
    else if (audio.sha256 && hash.toLowerCase() !== audio.sha256) add(issues, issue('ERROR',
        'AUDIO_HASH_MISMATCH', null, 'AUDIO', 'The MSYNC file targets different audio content.',
        { expected: hash.toLowerCase(), found: audio.sha256 }));
    if (hash && audio.sha256 && hash.toLowerCase() === audio.sha256 &&
        audio.filename && track.filename &&
        audio.filename.toLowerCase() !== track.filename.toLowerCase()) add(issues, issue('WARNING',
        'AUDIO_FILENAME_DIFFERENT', null, 'AUDIO',
        'The audio hash matches, but the filename is different.',
        { expected: track.filename, found: audio.filename }));
    if (audio.durationMs !== null && Number.isFinite(track.duration) &&
        Math.abs(track.duration * 1000 - audio.durationMs) > 500) add(issues, issue('ERROR',
        'AUDIO_DURATION_MISMATCH', null, 'AUDIO',
        'The declared and measured audio durations differ by more than 0.500 seconds.',
        { expected: track.duration, found: audio.durationMs / 1000 }));
}

export function validateParsedMsync(parseResult, context = {}) {
    const issues = [...parseResult.issues];
    const doc = parseResult.document;
    if (doc.formatVersion !== MSYNC_FORMAT_VERSION) add(issues, issue('ERROR',
        'UNSUPPORTED_VERSION', 1, 'ROOT', `Only MSYNC_VERSION=${MSYNC_FORMAT_VERSION} is supported.`,
        { expected: MSYNC_FORMAT_VERSION, found: doc.formatVersion }));
    const parsed = {
        info: doc.sections.INFO ? validateInfo(doc.info, issues) : null,
        audio: validateAudio(doc.audio, issues),
        session: validateSession(doc.session, issues),
        drills: validateDrills(doc.drills, issues, context),
        flavors: validateFlavors(doc.flavors, issues),
        inline: validateInline(doc.inline, issues),
        cues: []
    };
    parsed.cues = validateCues(doc.cues, parsed, parsed.audio.durationMs, issues);
    validateTrack(parsed.audio, context.track, issues);
    issues.sort((a, b) => {
        const lineA = a.line ?? Number.MAX_SAFE_INTEGER;
        const lineB = b.line ?? Number.MAX_SAFE_INTEGER;
        if (lineA !== lineB) return lineA - lineB;
        return a.severity === b.severity ? 0 : a.severity === 'ERROR' ? -1 : 1;
    });
    const limited = issues.slice(0, 100);
    const errors = limited.filter(value => value.severity === 'ERROR');
    const warnings = limited.filter(value => value.severity === 'WARNING');
    return {
        valid: errors.length === 0,
        parsed: errors.length === 0 ? parsed : null,
        candidate: parsed,
        issues: limited,
        errors,
        warnings,
        summary: {
            cues: parsed.cues.length,
            drills: Object.keys(parsed.drills).length,
            inline: Object.keys(parsed.inline).length,
            flavors: Object.keys(parsed.flavors).length,
            durationMs: parsed.audio.durationMs,
            warnings: warnings.length
        }
    };
}

export function validateMsyncSource(sourceText, context = {}) {
    return validateParsedMsync(parseMsync(sourceText), context);
}

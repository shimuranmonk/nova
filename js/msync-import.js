import { MSYNC_PARSER_VERSION } from './msync-parser.js';
import { validateMsyncSource } from './msync-validator.js';
import { attachMsyncToTrack } from './playlist.js';

async function sha256Bytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
}

export function sha256Text(sourceText) {
    return sha256Bytes(new TextEncoder().encode(sourceText));
}

export async function sha256Blob(blob) {
    if (!blob?.arrayBuffer) {
        throw new Error('Track audio is unavailable for hashing');
    }
    return sha256Bytes(await blob.arrayBuffer());
}

export async function prepareTrackForMsyncValidation(track, options = {}) {
    if (!track || typeof track !== 'object') {
        throw new Error('A selected Track is required');
    }
    if (track.metadata?.sha256 && !options.forceHash) {
        return { track, hashBackfilled: false };
    }
    const sha256 = await sha256Blob(track.audioBlob);
    return {
        track: {
            ...track,
            metadata: { ...(track.metadata || {}), sha256 }
        },
        hashBackfilled: true
    };
}

function importFailure(code, message) {
    const problem = {
        severity: 'ERROR',
        code,
        line: null,
        section: 'IMPORT',
        message
    };
    return {
        valid: false,
        parsed: null,
        candidate: null,
        issues: [problem],
        errors: [problem],
        warnings: [],
        summary: {
            cues: 0,
            drills: 0,
            inline: 0,
            flavors: 0,
            durationMs: null,
            warnings: 0
        }
    };
}

export async function validateExternalMsyncFile(file, context = {}) {
    if (!file || typeof file.text !== 'function') {
        return importFailure('UNREADABLE_FILE', 'Select a readable MSYNC .ini file.');
    }
    if (file.name && !/\.(?:ini|msync)$/i.test(file.name)) {
        return importFailure('INVALID_FILE_EXTENSION',
            'The selected file must use .ini. Legacy .msync files are also accepted.');
    }
    let sourceText;
    try {
        sourceText = await file.text();
    }
    catch (error) {
        return importFailure('FILE_READ_FAILED', 'The selected MSYNC file could not be read.');
    }
    if (!context.track) {
        return importFailure(
            'TRACK_REQUIRED',
            'Select the Track that this MSYNC file belongs to.'
        );
    }
    let preparedTrack = null;
    try {
        preparedTrack = context.track
            ? await prepareTrackForMsyncValidation(
                context.track,
                { forceHash: context.forceTrackHash === true }
            )
            : null;
    }
    catch (error) {
        return importFailure('TRACK_HASH_FAILED', error.message);
    }
    const result = validateMsyncSource(sourceText, {
        ...context,
        requireDrillResolution: true,
        track: preparedTrack?.track || context.track
    });
    return {
        ...result,
        sourceFilename: file.name || 'import.ini',
        sourceText,
        sourceSha256: await sha256Text(sourceText),
        preparedTrack: preparedTrack?.track || null,
        hashBackfilled: preparedTrack?.hashBackfilled || false
    };
}

export function createMsyncAttachment(validationResult, options = {}) {
    if (!validationResult?.valid || !validationResult.parsed) {
        throw new Error('Only a valid MSYNC source can be attached');
    }
    if (validationResult.warnings.length && options.acceptWarnings !== true) {
        throw new Error('MSYNC warnings require explicit acceptance');
    }
    if (!validationResult.sourceFilename ||
        typeof validationResult.sourceText !== 'string' ||
        !validationResult.sourceSha256) {
        throw new Error('Validated external MSYNC source details are required');
    }
    const now = options.now ?? Date.now();
    return {
        formatVersion: 1,
        sourceFilename: validationResult.sourceFilename,
        sourceText: validationResult.sourceText,
        sourceSha256: validationResult.sourceSha256,
        importedAt: now,
        parsed: validationResult.parsed,
        validation: {
            parserVersion: MSYNC_PARSER_VERSION,
            validatedAt: now,
            acceptedWarnings: validationResult.warnings.map(value => ({
                code: value.code,
                line: value.line,
                section: value.section
            }))
        }
    };
}

export function createMsyncTrackUpdate(validationResult, options = {}) {
    const track = validationResult?.preparedTrack;
    if (!track) {
        throw new Error('A prepared target Track is required');
    }
    const attachment = createMsyncAttachment(validationResult, options);
    return attachMsyncToTrack(track, attachment, options.now ?? Date.now());
}

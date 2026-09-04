export const MSYNC_FORMAT_VERSION = 1;
export const MSYNC_PARSER_VERSION = 1;

const SINGLETON_SECTIONS = new Set([
    'INFO',
    'AUDIO',
    'SESSION',
    'DRILLS',
    'CUES'
]);

function error(code, line, section, message, extra = {}) {
    return {
        severity: 'ERROR',
        code,
        line,
        section,
        message,
        ...extra
    };
}

function emptyDocument(sourceText) {
    return {
        sourceText,
        formatVersion: null,
        info: [],
        audio: [],
        session: [],
        drills: [],
        flavors: {},
        inline: {},
        cues: [],
        sections: {}
    };
}

function parseAssignment(text, line, section, issues) {
    const equals = text.indexOf('=');

    if (equals <= 0) {
        issues.push(error(
            'MALFORMED_FIELD',
            line,
            section,
            'Expected NAME=value.'
        ));
        return null;
    }

    const key = text.slice(0, equals).trim();
    const value = text.slice(equals + 1).trim();

    if (!key || !value) {
        issues.push(error(
            'EMPTY_FIELD',
            line,
            section,
            'Field names and values cannot be empty.'
        ));
        return null;
    }

    return { key, value, line };
}

function parseCue(text, line, issues) {
    const match = /^(\S+)\s+(.+)$/.exec(text);

    if (!match) {
        issues.push(error(
            'MALFORMED_CUE',
            line,
            'CUES',
            'Expected a timestamp followed by one command.'
        ));
        return null;
    }

    const timestamp = match[1];
    const commandText = match[2];

    if (commandText === 'STOP' || commandText === 'IDLE') {
        return { timestamp, command: commandText, value: null, line };
    }

    const commandMatch = /^([A-Z]+)=(\S+)$/.exec(commandText);

    if (!commandMatch) {
        issues.push(error(
            'MALFORMED_CUE_COMMAND',
            line,
            'CUES',
            'Cue commands must use the exact MSYNC v1 grammar.'
        ));
        return null;
    }

    if (commandMatch[1] === 'STOP' || commandMatch[1] === 'IDLE') {
        const command = commandMatch[1];
        issues.push(error(
            `MALFORMED_${command}`,
            line,
            'CUES',
            `${command} must not have an equals sign or value.`
        ));
        return null;
    }

    return {
        timestamp,
        command: commandMatch[1],
        value: commandMatch[2],
        line
    };
}

export function parseMsync(sourceText) {
    const text = typeof sourceText === 'string' ? sourceText : '';
    const document = emptyDocument(text);
    const issues = [];
    const sectionCounts = new Map();
    let section = null;
    let sawSignificantLine = false;

    if (typeof sourceText !== 'string') {
        issues.push(error(
            'SOURCE_NOT_TEXT',
            null,
            'IMPORT',
            'MSYNC source must be UTF-8 text.'
        ));
        return { document, issues };
    }

    const lines = sourceText.replace(/^\uFEFF/, '').split(/\r?\n/);

    lines.forEach((rawLine, index) => {
        if (issues.length >= 100) return;

        const line = index + 1;
        const trimmed = rawLine.trim();

        if (!trimmed || trimmed.startsWith('#')) return;

        if (!sawSignificantLine) {
            sawSignificantLine = true;
            const versionMatch = /^MSYNC_VERSION=(.+)$/.exec(trimmed);

            if (!versionMatch) {
                issues.push(error(
                    'VERSION_NOT_FIRST',
                    line,
                    'ROOT',
                    'MSYNC_VERSION=1 must be the first non-comment line.'
                ));
            }
            else {
                document.formatVersion = /^\d+$/.test(versionMatch[1])
                    ? Number(versionMatch[1])
                    : versionMatch[1];
                section = 'ROOT';
                return;
            }
        }

        if (/^MSYNC_VERSION=/.test(trimmed)) {
            issues.push(error(
                'DUPLICATE_VERSION',
                line,
                'ROOT',
                'MSYNC_VERSION may appear exactly once.'
            ));
            return;
        }

        const header = /^\[([^\]]+)\]$/.exec(trimmed);

        if (header) {
            const label = header[1];
            const flavor = /^FLAVOR:(.+)$/.exec(label);
            const inline = /^INLINE:(.+)$/.exec(label);

            if (flavor) {
                section = `FLAVOR:${flavor[1]}`;
                if (Object.hasOwn(document.flavors, flavor[1])) {
                    issues.push(error(
                        'DUPLICATE_FLAVOR_SECTION', line, section,
                        `Flavor ${flavor[1]} is defined more than once.`
                    ));
                }
                else document.flavors[flavor[1]] = [];
                return;
            }

            if (inline) {
                section = `INLINE:${inline[1]}`;
                if (Object.hasOwn(document.inline, inline[1])) {
                    issues.push(error(
                        'DUPLICATE_INLINE_SECTION', line, section,
                        `Inline drill ${inline[1]} is defined more than once.`
                    ));
                }
                else document.inline[inline[1]] = [];
                return;
            }

            if (!SINGLETON_SECTIONS.has(label)) {
                section = `UNKNOWN:${label}`;
                issues.push(error(
                    'UNKNOWN_SECTION', line, section,
                    `Section [${label}] is not supported by MSYNC v1.`
                ));
                return;
            }

            const count = (sectionCounts.get(label) || 0) + 1;
            sectionCounts.set(label, count);
            document.sections[label] = true;
            section = label;

            if (count > 1) {
                issues.push(error(
                    'DUPLICATE_SECTION', line, section,
                    `Section [${label}] may appear at most once.`
                ));
            }
            return;
        }

        if (!section || section === 'ROOT') {
            issues.push(error(
                'CONTENT_OUTSIDE_SECTION', line, 'ROOT',
                'Content must appear inside an MSYNC section.'
            ));
            return;
        }

        if (section.startsWith('UNKNOWN:')) return;

        if (section === 'CUES') {
            const cue = parseCue(trimmed, line, issues);
            if (cue) document.cues.push(cue);
            return;
        }

        const field = parseAssignment(trimmed, line, section, issues);
        if (!field) return;

        if (section.startsWith('FLAVOR:')) {
            document.flavors[section.slice(7)]?.push(field);
        }
        else if (section.startsWith('INLINE:')) {
            document.inline[section.slice(7)]?.push(field);
        }
        else {
            document[section.toLowerCase()].push(field);
        }
    });

    if (!sawSignificantLine || document.formatVersion === null) {
        issues.push(error(
            'MISSING_VERSION', null, 'ROOT',
            'MSYNC_VERSION=1 is required.'
        ));
    }

    for (const required of ['AUDIO', 'CUES']) {
        if (!sectionCounts.get(required)) {
            issues.push(error(
                `MISSING_${required}_SECTION`, null, required,
                `[${required}] is required.`
            ));
        }
    }

    return { document, issues: issues.slice(0, 100) };
}

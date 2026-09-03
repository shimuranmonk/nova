import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    dispatchEvent: () => {},
    querySelectorAll: () => []
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.Audio = class {
    addEventListener() {}
    removeAttribute() {}
    pause() {}
};

const { formatMsyncValidationReport } = await import('../js/msync-ui.js');

test('formats a complete copyable validation report', () => {
    const report = formatMsyncValidationReport({
        valid: false,
        errors: [{ code: 'BAD', severity: 'ERROR' }],
        warnings: [],
        summary: {
            cues: 2,
            drills: 1,
            inline: 0,
            flavors: 0,
            durationMs: 60000
        },
        issues: [{
            severity: 'ERROR',
            code: 'BAD',
            line: 7,
            section: 'CUES',
            message: 'The cue is invalid.'
        }]
    });

    assert.match(report, /MSYNC not attached/);
    assert.match(report, /Cues: 2/);
    assert.match(report, /Line 7/);
    assert.match(report, /The cue is invalid/);
});

test('ships every required MSYNC import control in the page', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    for (const id of [
        'ui-msync',
        'msync-track-select',
        'msync-file-input',
        'msync-copy-hash',
        'msync-export',
        'msync-remove',
        'msync-validation-report',
        'msync-copy-report',
        'msync-attach-confirm',
        'msync-simulation',
        'msync-session-state',
        'msync-sim-start',
        'msync-live-start',
        'msync-sim-pause',
        'msync-sim-stop',
        'msync-event-log'
    ]) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /id="playlist-manager-library-view"/);
    assert.match(html, /id="playlist-library-list"/);
});

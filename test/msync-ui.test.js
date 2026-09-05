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

const {
    formatMsyncValidationReport,
    msyncExportFilename
} = await import('../js/msync-ui.js');

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
        'msync-robot-lead',
        'msync-sim-pause',
        'msync-sim-stop',
        'msync-event-log'
    ]) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /id="playlist-manager-library-view"/);
    assert.match(html, /id="playlist-library-list"/);
    assert.match(html, /id="ui-quick-music"/);
    assert.match(html, /id="quick-stored-track-select"/);
    assert.match(html, /id="btn-use-quick-stored-track"/);
    assert.match(html, /id="quick-music-save-library"/);
    assert.match(html, /class="control-pill hidden music-control music-source-card"/);
    assert.match(html, /class="music-source-use" aria-label="Use playlist"/);
    assert.match(html, /class="music-source-use" aria-label="Use stored track"/);
    assert.match(html, /id="btn-copy-msync-inline"/);
    assert.match(html, /<title>Nova Drill Control PLUS<\/title>/);
    assert.match(html, /<h1>Nova Drill Control PLUS<\/h1>/);
    assert.match(html, /Version 3\.0\.0/);
    assert.match(html, /onclick="window\.openStatisticsDialog\(\)"/);
    assert.match(html, /id="statistics-modal"/);
    assert.match(html, /id="statistics-balls"/);
    assert.match(html, /id="statistics-drills"/);
    assert.match(html, /href="https:\/\/github\.com\/shimuranmonk\/nova"/);
});

test('uses regular text weight for Music controls while card labels remain headings', async () => {
    const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
    assert.match(css, /\.music-control \.music-file-btn,[\s\S]*?font-weight:\s*400;/);
    assert.match(css, /\.control-pill label[\s\S]*?font-weight:\s*700;/);
});

test('exports new and legacy MSYNC attachments with the official .ini extension', () => {
    assert.equal(msyncExportFilename({ sourceFilename: 'training.ini' }), 'training.ini');
    assert.equal(msyncExportFilename({ sourceFilename: 'training.msync' }), 'training.ini');
    assert.equal(msyncExportFilename({}, { filename: 'song.mp3' }), 'song.mp3.ini');
});

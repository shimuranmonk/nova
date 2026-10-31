import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('standard drill commands are wired through the canonical controller', async () => {
    const main = await readFile(
        new URL('../js/main.js', import.meta.url),
        'utf8'
    );

    assert.match(main, /createCommandController\s*\(\s*\{/);
    assert.match(main, /getState:\s*getStandardCommandState/);
    assert.match(main, /start:\s*\(\{\s*drillName\s*\}/);
    assert.match(main, /stop:\s*stopRun/);
    assert.match(main, /pause:\s*pauseRun/);
    assert.match(main, /resume:\s*resumeRun/);
    assert.match(
        main,
        /standardCommandController\.execute\s*\(\s*COMMANDS\.START/
    );
    assert.match(
        main,
        /standardCommandController\.execute\(command\)/
    );
    assert.match(
        main,
        /standardCommandController\.execute\(COMMANDS\.STOP\)/
    );
});

test('Voice Start Ready arms standard drills and starts only the armed key', async () => {
    const main = await readFile(
        new URL('../js/main.js', import.meta.url),
        'utf8'
    );
    const html = await readFile(
        new URL('../index.html', import.meta.url),
        'utf8'
    );

    assert.match(html, /id="voice-start-ready-toggle"/);
    assert.match(html, /id="voice-armed-status"/);
    assert.match(html, /id="voice-recognition-status"/);
    assert.match(html, /id="voice-test-toggle"/);
    assert.match(html, /id="voice-test-output"/);
    assert.match(main, /drillArmingController\.isEnabled\(\)/);
    assert.match(main, /drillArmingController\.arm\(key, label\)/);
    assert.match(
        main,
        /startArmedStandardDrill[\s\S]*?\{ drillName: armed\.key \}/
    );
    assert.match(
        main,
        /if \(mode === 'msync'\)[\s\S]*?drillArmingController\.clear\(\)/
    );
});

test('voice recognition routes standard commands while preserving Test Mode', async () => {
    const main = await readFile(
        new URL('../js/main.js', import.meta.url),
        'utf8'
    );

    assert.match(main, /createVoiceRecognitionEngine\s*\(\s*\{/);
    assert.match(main, /createVoiceCommandRouter\s*\(\s*\{/);
    assert.match(main, /onCommand:\s*async\s*\(\{\s*phrase,\s*command\s*\}\)\s*=>/);
    assert.match(main, /voiceCommandRouter\.route\(command\)/);
    assert.match(
        main,
        /onCommand:[\s\S]{0,150}voiceTestMode\.isActive\(\)[\s\S]{0,80}return/
    );
    assert.match(main, /startStandard:\s*startArmedStandardDrill/);
    assert.match(
        main,
        /executeStandard:[\s\S]{0,100}standardCommandController\.execute\(command\)/
    );
    assert.match(main, /executeMsync:\s*executeMsyncVoiceCommand/);
});

test('armed START keeps all standard settings live in the existing runner', async () => {
    const runner = await readFile(
        new URL('../js/runner.js', import.meta.url),
        'utf8'
    );

    assert.match(runner, /currentDrills\[drillName\]\[selectedLevel\]/);
    assert.match(runner, /getElementById\('input-reps'\)\.value/);
    assert.match(runner, /getElementById\('input-time'\)\.value/);
    assert.match(runner, /runMode === 'music' && !hasPlaylist\(\)/);
});

test('runner exposes explicit state and separate pause and resume operations', async () => {
    const runner = await readFile(
        new URL('../js/runner.js', import.meta.url),
        'utf8'
    );

    assert.match(runner, /export function getRunState\(\)/);
    assert.match(runner, /export function pauseRun\(\)/);
    assert.match(runner, /export function resumeRun\(\)/);
    assert.match(runner, /runState = SESSION_STATES\.COUNTDOWN/);
    assert.match(runner, /runState = SESSION_STATES\.RUNNING/);
    assert.match(runner, /runState = SESSION_STATES\.PAUSED/);
    assert.match(runner, /runState = SESSION_STATES\.IDLE/);
    assert.match(
        runner,
        /playMusic\(\)\.then\(\(started\) => \{[\s\S]*?runState !== SESSION_STATES\.COUNTDOWN/
    );
});

test('Reps, Time, and Music remain branches of the same standard runner', async () => {
    const runner = await readFile(
        new URL('../js/runner.js', import.meta.url),
        'utf8'
    );

    assert.match(runner, /runMode === 'reps'/);
    assert.match(runner, /runMode === 'time'/);
    assert.match(runner, /runMode === 'music'/);
    assert.equal(
        (runner.match(/export function startDrillSequence/g) || []).length,
        1
    );
});

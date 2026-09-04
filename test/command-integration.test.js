import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('standard drill commands are wired through the canonical controller', async () => {
    const main = await readFile(
        new URL('../js/main.js', import.meta.url),
        'utf8'
    );

    assert.match(main, /createCommandController\s*\(\s*\{/);
    assert.match(main, /getState:\s*getRunState/);
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

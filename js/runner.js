import { currentDrills, selectedLevel, runMode, appStats, setLastPlayed } from './state.js';
import { sendPacket, packBall, bleState } from './bluetooth.js';
import { log, showToast, clamp, toggleBodyScroll } from './utils.js';
import { updateStatsUI, updateLastPlayedHighlight } from './ui.js';
import { SESSION_STATES } from './command-controller.js';

import {
    playMusic,
    stopMusic,
    pauseMusic,
    hasPlaylist,
    onPlaylistEnded,
    onTrackChanged,
    onProgress
} from './music.js';

let isRunning = false;
let isPaused = false;
let runState = SESSION_STATES.IDLE;
let currentCount = 0;
let targetCount = 0;
let remainingTime = 0;

// Timers
let pauseTimer = null;
let countdownTimer = null;
let runTimer = null;
let startTimeout = null;

let activeDrillParams = null;
let activeDrillRandom = false;

// UI Elements
const ui = {
    overlay: document.getElementById('run-overlay'),
    display: document.getElementById('run-display'),
    label: document.getElementById('run-label'),
    progress: document.getElementById('run-progress'),
    btnPause: document.getElementById('btn-pause')
};

export function startDrillSequence(drillName) {
    if (runState !== SESSION_STATES.IDLE) {
        return false;
    }

    const rawParams = currentDrills[drillName]
        ? currentDrills[drillName][selectedLevel]
        : null;

    if (!rawParams) {
        log("Drill data not found: " + drillName);
        return false;
    }

    // Filter inactive steps
    const executableSteps = rawParams.filter(step => {
        const isActive = step[0][6];
        return isActive === undefined || isActive === 1;
    });

    if (executableSteps.length === 0) {
        showToast("no active balls to play");

        document.querySelectorAll('.btn-drill')
            .forEach(b => b.classList.remove('running'));

        return false;
    }

    // Music mode requires a valid playlist
    if (runMode === 'music' && !hasPlaylist()) {
        showToast("Select music first");

        document.querySelectorAll('.btn-drill')
            .forEach(b => b.classList.remove('running'));

        return false;
    }

    activeDrillParams = executableSteps;
    activeDrillRandom = !!currentDrills[drillName].random;
    runState = SESSION_STATES.COUNTDOWN;

    // Save last played state
    setLastPlayed(drillName);
    updateLastPlayedHighlight();

    // Prepare run overlay
    toggleBodyScroll(true);
    ui.overlay.classList.add('open');

    let count = 4;

    ui.display.textContent = count;
    ui.label.textContent = "GET READY";
    ui.btnPause.style.display = 'none';

    ui.progress.style.transition = 'none';
    ui.progress.style.strokeDashoffset = '0';

    void ui.progress.offsetWidth;

    const startCountdown = () => {
        requestAnimationFrame(() => {
            ui.progress.style.transition =
                'stroke-dashoffset 4s linear';

            ui.progress.style.strokeDashoffset = '565';
        });

        countdownTimer = setInterval(() => {
            count--;

            if (count > 0) {
                ui.display.textContent = count;
            } else {
                clearInterval(countdownTimer);

                ui.display.textContent = "GO!";

                startTimeout = setTimeout(
                    beginDrillExecution,
                    800
                );
            }
        }, 1000);
    };

    // -----------------------------------------
    // MUSIC MODE
    // -----------------------------------------
    // Start music before countdown
    if (runMode === 'music') {

        onPlaylistEnded(() => {
            stopRun();
        });

        onTrackChanged((info) => {
            updateMusicRunDisplay(info);
        });

        onProgress((info) => {
            updateMusicRunDisplay(info);
        });

        playMusic().then((started) => {
            if (runState !== SESSION_STATES.COUNTDOWN) {
                if (started) {
                    stopMusic();
                }
                return;
            }

            if (!started) {
                showToast("Unable to start music");
                stopRun();
                return;
            }

            startCountdown();
        });

        return true;
    }

    // Reps and Time start countdown normally
    startCountdown();
    return true;
}

export function beginDrillExecution() {
    if (runState !== SESSION_STATES.COUNTDOWN) {
        return false;
    }

    isRunning = true;
    isPaused = false;
    runState = SESSION_STATES.RUNNING;

    // Increment drill count once per session
    appStats.drills += 1;

    localStorage.setItem(
        'nova_stats',
        JSON.stringify(appStats)
    );

    updateStatsUI();

    ui.btnPause.style.display = 'block';
    ui.btnPause.textContent = "PAUSE";
    ui.btnPause.classList.remove('pulse-anim');

    ui.label.textContent = "REMAINING";

    ui.progress.style.transition = 'none';
    ui.progress.style.strokeDashoffset = '0';

    // -----------------------------------------
    // TIME MODE
    // -----------------------------------------
    if (runMode === 'time') {
        const tVal =
            document.getElementById('input-time').value;

        remainingTime = parseInt(tVal);

        ui.display.textContent =
            formatTime(remainingTime);

        requestAnimationFrame(() => {
            if (isRunning && !isPaused) {
                ui.progress.style.transition =
                    `stroke-dashoffset ${remainingTime}s linear`;

                ui.progress.style.strokeDashoffset = '565';
            }
        });

        runTimer = setInterval(() => {
            if (!isPaused) {
                remainingTime--;

                ui.display.textContent =
                    formatTime(remainingTime);

                if (remainingTime <= 0) {
                    stopRun();
                }
            }
        }, 1000);
    }

    // -----------------------------------------
    // MUSIC PLAYLIST MODE
    // -----------------------------------------
    else if (runMode === 'music') {
        // Live display is handled by music callbacks
    }

    // -----------------------------------------
    // REPETITION MODE
    // -----------------------------------------
    else {
        targetCount =
            parseInt(
                document.getElementById('input-reps').value
            ) || 1;

        currentCount = 0;

        ui.display.textContent = targetCount;

        ui.progress.style.transition =
            'stroke-dashoffset 0.5s ease';
    }

    runIteration();
    return true;
}

async function runIteration() {
    if (!isRunning || isPaused) return;

    if (runMode === 'reps') {
        const remaining =
            targetCount - currentCount;

        ui.display.textContent = remaining;

        const fractionCompleted =
            currentCount / targetCount;

        ui.progress.style.strokeDashoffset =
            565 * fractionCompleted;

        currentCount++;
    }

    let sequence = activeDrillParams;

    if (activeDrillRandom) {
        sequence = [...activeDrillParams];

        for (let i = sequence.length - 1; i > 0; i--) {
            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );

            [sequence[i], sequence[j]] =
                [sequence[j], sequence[i]];
        }
    }

    const balls = [];

    sequence.forEach((stepOptions, i) => {
        const chosenOption =
            stepOptions[
                Math.floor(
                    Math.random() * stepOptions.length
                )
            ];

        const tempBall = [...chosenOption];

        const scatter = tempBall[10] || 0;

        if (scatter > 0) {
            const currentDrop = tempBall[3];

            const minDrop =
                currentDrop - scatter;

            const maxDrop =
                currentDrop + scatter;

            const span =
                maxDrop - minDrop;

            const steps =
                Math.floor(span / 0.5);

            if (steps > 0) {
                const randomStep =
                    Math.floor(
                        Math.random() * (steps + 1)
                    );

                let newDrop =
                    minDrop +
                    (randomStep * 0.5);

                newDrop =
                    clamp(newDrop, -10, 10);

                tempBall[3] = newDrop;

                log(
                    `Scatter Active: Base ${currentDrop} ±${scatter} -> ${newDrop}`
                );
            }
        }

        log(
            `TX Ball ${i + 1}: ${tempBall.join(' ')}`
        );

        balls.push(
            packBall(...tempBall)
        );
    });

    // Increment balls
    appStats.balls += balls.length;

    localStorage.setItem(
        'nova_stats',
        JSON.stringify(appStats)
    );

    updateStatsUI();

    const packet = buildPacket(balls);

    await sendPacket(packet);
}

// Callback from bluetooth.js when robot finishes
export function handleDone() {
    if (!isRunning) return;

    if (
        runMode === 'reps' &&
        currentCount >= targetCount
    ) {
        stopRun();
        return;
    }

    const pauseInput =
        parseFloat(
            document.getElementById('input-pause').value
        );

    const pauseMs =
        (
            isNaN(pauseInput)
                ? 1.0
                : pauseInput
        ) * 1000;

    if (!isPaused) {
        pauseTimer = setTimeout(() => {
            if (isRunning && !isPaused) {
                runIteration();
            }
        }, pauseMs);
    }
}

export function resumeRun() {
    if (runState !== SESSION_STATES.PAUSED) {
        return false;
    }

    isPaused = false;
    runState = SESSION_STATES.RUNNING;

    ui.btnPause.textContent = "PAUSE";
    ui.btnPause.classList.remove('pulse-anim');

    if (runMode === 'time') {
        ui.progress.style.transition =
            `stroke-dashoffset ${remainingTime}s linear`;

        ui.progress.style.strokeDashoffset = '565';
    }

    if (runMode === 'music') {
        playMusic().then((started) => {
            if (!started && isRunning) {
                showToast("Unable to resume music");
                stopRun();
            }
        });
    }

    runIteration();
    return true;
}

export function pauseRun() {
    if (runState !== SESSION_STATES.RUNNING) {
        return false;
    }

    isPaused = true;
    runState = SESSION_STATES.PAUSED;

    ui.btnPause.textContent = "RESUME";
    ui.btnPause.classList.add('pulse-anim');

    clearTimeout(pauseTimer);

    if (runMode === 'music') {
        pauseMusic();
    }

    const computedStyle =
        window.getComputedStyle(ui.progress);

    const currentOffset =
        computedStyle.getPropertyValue(
            'stroke-dashoffset'
        );

    ui.progress.style.transition = 'none';

    ui.progress.style.strokeDashoffset =
        currentOffset;

    sendPacket([0x80, 1, 0, 1]);
    return true;
}

export function togglePause() {
    if (runState === SESSION_STATES.PAUSED) {
        return resumeRun();
    }

    return pauseRun();
}

export function stopRun() {
    isRunning = false;
    isPaused = false;
    runState = SESSION_STATES.IDLE;

    if (runMode === 'music') {
        stopMusic();
    }

    clearInterval(countdownTimer);
    clearInterval(runTimer);

    clearTimeout(pauseTimer);
    clearTimeout(startTimeout);

    toggleBodyScroll(false);

    ui.overlay.classList.remove('open');

    document.querySelectorAll('.btn-drill')
        .forEach(
            b => b.classList.remove('running')
        );

    sendPacket([0x80, 1, 0, 1]);

    log("Drill Stopped");
    return true;
}

export function getRunState() {
    return runState;
}

// Skip Countdown
export function skipCountdown() {
    if (runState !== SESSION_STATES.COUNTDOWN) return;

    if (!ui.overlay.classList.contains('open')) {
        return;
    }

    clearInterval(countdownTimer);
    clearTimeout(startTimeout);

    ui.display.textContent = "GO!";

    beginDrillExecution();
}

function formatTime(s) {
    return `${Math.floor(s / 60)}:${(s % 60)
        .toString()
        .padStart(2, '0')}`;
}

// Format playlist durations
function formatMusicTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const totalSeconds =
        Math.floor(seconds);

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const secs =
        totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes
            .toString()
            .padStart(2, '0')}:${secs
            .toString()
            .padStart(2, '0')}`;
    }

    return `${minutes}:${secs
        .toString()
        .padStart(2, '0')}`;
}

// Update music session overlay
function updateMusicRunDisplay(info) {
    if (!info || runMode !== 'music') {
        return;
    }

    const total =
        Number.isFinite(info.totalDuration)
            ? info.totalDuration
            : 0;

    const elapsed =
        Number.isFinite(info.elapsed)
            ? info.elapsed
            : 0;

    const remaining =
        Number.isFinite(info.remaining)
            ? info.remaining
            : 0;

    const trackName =
        info.currentTrack &&
        info.currentTrack.name
            ? info.currentTrack.name
            : "Music";

    const trackNumber =
        info.currentTrackNumber || 0;

    const trackCount =
        info.trackCount || 0;

    ui.label.textContent =
        `TRACK ${trackNumber} OF ${trackCount}`;

ui.display.innerHTML = `
    <div
        style="
            font-size:0.30em;
            line-height:1.15;
            max-width:190px;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
        "
    >
        ${trackName}
    </div>

    <div
        style="
            font-size:0.24em;
            line-height:1.25;
            margin-top:6px;
        "
    >
        ${formatMusicTime(elapsed)} elapsed<br>
        ${formatMusicTime(remaining)} remaining<br>
        ${formatMusicTime(total)} total
    </div>
`;

    const progressFraction =
        total > 0
            ? Math.min(
                1,
                Math.max(
                    0,
                    elapsed / total
                )
            )
            : 0;

    ui.progress.style.transition = 'none';

    ui.progress.style.strokeDashoffset =
        565 * progressFraction;
}

function buildPacket(balls) {
    const b =
        new ArrayBuffer(
            7 + balls.length * 24
        );

    const v =
        new DataView(b);

    v.setUint8(0, 0x81);

    v.setUint16(
        1,
        4 + balls.length * 24,
        true
    );

    v.setUint8(3, 1);

    v.setUint16(
        4,
        1,
        true
    );

    v.setUint8(6, 0);

    const u =
        new Uint8Array(b);

    let off = 7;

    balls.forEach(ba => {
        u.set(ba, off);
        off += 24;
    });

    return u;
}

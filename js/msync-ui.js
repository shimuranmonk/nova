import { currentDrills, userCustomDrills } from './state.js';
import {
    getAllTracks,
    removeMsyncFromTrack,
    saveTrack
} from './playlist.js';
import {
    createMsyncTrackUpdate,
    prepareTrackForMsyncValidation,
    validateExternalMsyncFile
} from './msync-import.js';
import { showToast } from './utils.js';
import { MsyncAudioPlayer } from './msync-audio.js';
import {
    MSYNC_SESSION_STATE,
    MsyncSessionController,
    revalidateMsyncAttachment
} from './msync-session.js';
import { MSYNC_PARSER_VERSION } from './msync-parser.js';
import {
    bleState,
    onRobotDone,
    sendPacket
} from './bluetooth.js';
import { MsyncRobotAdapter } from './msync-robot.js';

let tracks = [];
let selectedTrack = null;
let pendingValidation = null;
let sessionController = null;
let simulationEvents = [];
let robotAdapter = null;
let liveMode = false;

function element(id) {
    return document.getElementById(id);
}

function formatDuration(ms) {
    if (!Number.isFinite(ms)) return 'unknown';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.round(ms % 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function formatMsyncValidationReport(result) {
    if (!result) return '';
    const heading = result.valid
        ? `MSYNC valid — ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`
        : `MSYNC not attached — ${result.errors.length} error${result.errors.length === 1 ? '' : 's'} and ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`;
    const summary = result.summary
        ? `Cues: ${result.summary.cues} | Drills: ${result.summary.drills} | Inline: ${result.summary.inline} | Flavors: ${result.summary.flavors} | Duration: ${formatDuration(result.summary.durationMs)}`
        : '';
    const details = result.issues.map(value => {
        const location = value.line ? `Line ${value.line}` : value.section;
        return `${value.severity} ${value.code} — ${location}: ${value.message}`;
    });
    return [heading, summary, ...details].filter(Boolean).join('\n');
}

function updateTrackStatus() {
    const status = element('msync-track-status');
    const exportButton = element('msync-export');
    const removeButton = element('msync-remove');
    const fileInput = element('msync-file-input');
    const copyHash = element('msync-copy-hash');
    const simulation = element('msync-simulation');
    const robotLead = element('msync-robot-lead');

    pendingValidation = null;
    renderValidation(null);

    if (!selectedTrack) {
        status.textContent = 'Select a track from Playlist Manager.';
        exportButton.classList.add('hidden');
        removeButton.classList.add('hidden');
        fileInput.disabled = true;
        copyHash.disabled = true;
        simulation.classList.add('hidden');
        robotLead.disabled = true;
        return;
    }

    const attachment = selectedTrack.metadata?.msync;
    const hashState = selectedTrack.metadata?.sha256
        ? 'Audio hash ready'
        : 'Audio hash will be calculated when needed';
    status.textContent = attachment
        ? `${selectedTrack.displayName || selectedTrack.filename} — MSYNC attached from ${attachment.sourceFilename}. ${hashState}.`
        : `${selectedTrack.displayName || selectedTrack.filename} — No MSYNC attached. ${hashState}.`;
    exportButton.classList.toggle('hidden', !attachment);
    removeButton.classList.toggle('hidden', !attachment);
    fileInput.disabled = false;
    copyHash.disabled = false;
    simulation.classList.toggle('hidden', !attachment);
    robotLead.disabled = !attachment;
    if (attachment) {
        robotLead.value = Number(
            attachment.parsed?.session?.robotLead ?? 1.3
        ).toFixed(3);
        updateSimulationState(MSYNC_SESSION_STATE.READY);
    }
}

function updateSimulationState(state, reason = null) {
    const label = element('msync-session-state');
    const start = element('msync-sim-start');
    const liveStart = element('msync-live-start');
    const pause = element('msync-sim-pause');
    const stop = element('msync-sim-stop');
    label.textContent = `${state}${reason ? ` — ${reason}` : ''} — ${liveMode ? 'LIVE ROBOT' : 'No robot commands.'}`;
    start.disabled = ![
        MSYNC_SESSION_STATE.READY,
        MSYNC_SESSION_STATE.COMPLETED,
        MSYNC_SESSION_STATE.ERROR
    ].includes(state);
    liveStart.disabled = start.disabled || !bleState.isConnected;
    pause.disabled = ![
        MSYNC_SESSION_STATE.PLAYING,
        MSYNC_SESSION_STATE.PAUSED
    ].includes(state);
    pause.textContent = state === MSYNC_SESSION_STATE.PAUSED ? 'Resume' : 'Pause';
    stop.disabled = ![
        MSYNC_SESSION_STATE.COUNTDOWN,
        MSYNC_SESSION_STATE.PLAYING,
        MSYNC_SESSION_STATE.PAUSED
    ].includes(state);
}

function eventPosition(ms) {
    return Number.isFinite(ms) ? formatDuration(ms) : '--:--.---';
}

function recordSimulationEvent(event) {
    let detail = event.type;
    if (event.type === 'COUNTDOWN') detail = `COUNTDOWN ${event.seconds}s`;
    if (event.type === 'ACTIVATE') detail = `${event.active.type} ${event.active.name}`;
    if (event.type === 'FLAVOR') detail = `FLAVOR ${event.flavor || 'NONE'}`;
    if (event.type === 'REST_START') detail = `REST ${event.durationMs / 1000}s`;
    if (event.type === 'REST_END') detail = 'REST END';
    if (event.type === 'IDLE') detail = 'IDLE';
    if (event.type === 'COMPLETE') detail = `COMPLETE ${event.reason}`;
    if (event.type === 'ERROR') detail = `ERROR ${event.code}: ${event.message}`;
    simulationEvents.push(`${eventPosition(event.positionMs)}  ${detail}`);
    if (simulationEvents.length > 100) simulationEvents.shift();
    element('msync-event-log').textContent = simulationEvents.join('\n');
}

function recordRobotDiagnostic(event) {
    if (event.type === 'ROBOT_REPLACE_SENT') {
        simulationEvents.push(
            `${eventPosition(null)}  ROBOT SENT ${event.ballCount} ball${event.ballCount === 1 ? '' : 's'}; dispatch ${event.dispatchMs.toFixed(1)}ms`
        );
    }
    else if (event.type === 'ROBOT_STOP_SENT') {
        simulationEvents.push(`${eventPosition(null)}  ROBOT STOP ${event.reason}`);
    }
    else {
        simulationEvents.push(`${eventPosition(null)}  ROBOT ERROR ${event.message}`);
        sessionController?.fail('ROBOT_ERROR', new Error(event.message));
    }
    element('msync-event-log').textContent = simulationEvents.slice(-100).join('\n');
}

function destroySimulation() {
    sessionController?.destroy();
    sessionController = null;
    robotAdapter?.destroy();
    robotAdapter = null;
    liveMode = false;
    updateSimulationState(MSYNC_SESSION_STATE.READY);
}

function renderValidation(result) {
    const report = element('msync-validation-report');
    const confirmButton = element('msync-attach-confirm');
    const copyButton = element('msync-copy-report');
    report.className = 'msync-report hidden';
    confirmButton.classList.add('hidden');
    copyButton.classList.add('hidden');

    if (!result) {
        report.textContent = '';
        return;
    }

    report.textContent = formatMsyncValidationReport(result);
    report.classList.remove('hidden');
    report.classList.add(result.valid
        ? result.warnings.length ? 'has-warnings' : 'is-valid'
        : 'has-errors');
    copyButton.classList.remove('hidden');

    if (result.valid && result.warnings.length) {
        confirmButton.textContent = selectedTrack?.metadata?.msync
            ? 'Replace anyway'
            : 'Attach anyway';
        confirmButton.classList.remove('hidden');
    }
}

export async function refreshMsyncTracks(preferredId = null) {
    const select = element('msync-track-select');
    const currentId = preferredId || select.value;
    tracks = await getAllTracks();
    select.replaceChildren(new Option('Select a stored track', ''));
    for (const track of tracks) {
        const suffix = track.metadata?.msync ? ' — MSYNC' : '';
        select.append(new Option(
            `${track.displayName || track.filename}${suffix}`,
            track.id
        ));
    }
    if (currentId && tracks.some(track => track.id === currentId)) {
        select.value = currentId;
    }
    selectedTrack = tracks.find(track => track.id === select.value) || null;
    updateTrackStatus();
}

async function attachPending(acceptWarnings) {
    if (!pendingValidation?.valid) return;
    try {
        const updated = createMsyncTrackUpdate(pendingValidation, {
            acceptWarnings
        });
        await saveTrack(updated);
        const trackId = updated.id;
        pendingValidation = null;
        element('msync-file-input').value = '';
        await refreshMsyncTracks(trackId);
        showToast('MSYNC attached');
    }
    catch (error) {
        console.error('Unable to attach MSYNC:', error);
        showToast('MSYNC was not attached');
    }
}

async function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file || !selectedTrack) return;
    showToast('Validating MSYNC...');
    const result = await validateExternalMsyncFile(file, {
        track: selectedTrack,
        builtInDrills: currentDrills,
        customDrills: userCustomDrills,
        drillData: currentDrills
    });
    pendingValidation = result;
    renderValidation(result);

    if (!result.valid) {
        showToast('MSYNC validation failed');
        return;
    }
    if (result.warnings.length) {
        showToast('Review MSYNC warnings');
        return;
    }
    if (selectedTrack.metadata?.msync && !window.confirm(
        `Replace the MSYNC attached to "${selectedTrack.displayName || selectedTrack.filename}"?`
    )) {
        pendingValidation = null;
        event.target.value = '';
        return;
    }
    await attachPending(false);
}

async function copyAudioHash() {
    if (!selectedTrack) return;
    try {
        const prepared = await prepareTrackForMsyncValidation(selectedTrack);
        if (prepared.hashBackfilled) {
            selectedTrack = await saveTrack(prepared.track);
            await refreshMsyncTracks(selectedTrack.id);
        }
        const hash = selectedTrack.metadata.sha256;
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(hash);
            showToast('Audio hash copied');
        }
        else window.prompt('Copy audio SHA-256:', hash);
    }
    catch (error) {
        console.error('Unable to copy audio hash:', error);
        showToast('Unable to calculate audio hash');
    }
}

async function copyValidationReport() {
    if (!pendingValidation) return;
    const report = formatMsyncValidationReport(pendingValidation);
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(report);
            showToast('Validation report copied');
        }
        else window.prompt('Copy MSYNC validation report:', report);
    }
    catch (error) {
        window.prompt('Copy MSYNC validation report:', report);
    }
}

function exportAttachment() {
    const attachment = selectedTrack?.metadata?.msync;
    if (!attachment?.sourceText) return;
    const blob = new Blob([attachment.sourceText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const fallback = `${selectedTrack.displayName || selectedTrack.filename}.msync`;
    link.href = URL.createObjectURL(blob);
    link.download = attachment.sourceFilename || fallback;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function removeAttachment() {
    if (!selectedTrack?.metadata?.msync) return;
    if (!window.confirm(
        `Remove MSYNC from "${selectedTrack.displayName || selectedTrack.filename}"?\n\nThe track, audio, and playlists will remain.`
    )) return;
    try {
        const updated = removeMsyncFromTrack(selectedTrack);
        await saveTrack(updated);
        await refreshMsyncTracks(updated.id);
        showToast('MSYNC removed');
    }
    catch (error) {
        console.error('Unable to remove MSYNC:', error);
        showToast('MSYNC was not removed');
    }
}

export function initializeMsyncUI() {
    const select = element('msync-track-select');
    select.addEventListener('change', () => {
        destroySimulation();
        selectedTrack = tracks.find(track => track.id === select.value) || null;
        element('msync-file-input').value = '';
        updateTrackStatus();
    });
    element('msync-file-input').addEventListener('change', handleFileSelection);
    element('msync-copy-hash').addEventListener('click', copyAudioHash);
    element('msync-copy-report').addEventListener('click', copyValidationReport);
    element('msync-export').addEventListener('click', exportAttachment);
    element('msync-remove').addEventListener('click', removeAttachment);
    element('msync-attach-confirm').addEventListener('click', () => attachPending(true));
    element('msync-sim-start').addEventListener('click', () => startMsyncSession(false));
    element('msync-live-start').addEventListener('click', () => startMsyncSession(true));
    element('msync-sim-pause').addEventListener('click', toggleSimulationPause);
    element('msync-sim-stop').addEventListener('click', () =>
        sessionController?.stop('MANUAL_STOP'));
    element('msync-robot-lead').addEventListener('change', event => {
        const value = Number(event.target.value);
        event.target.value = Math.min(5, Math.max(0,
            Number.isFinite(value) ? value : 1.3)).toFixed(3);
    });
    document.addEventListener('connection-changed', () => {
        updateSimulationState(
            sessionController?.state || MSYNC_SESSION_STATE.READY
        );
        if (liveMode && !bleState.isConnected) {
            sessionController?.fail(
                'ROBOT_DISCONNECTED',
                new Error('Robot disconnected')
            );
        }
    });
    document.addEventListener('stored-tracks-changed', () => {
        const preferredId = selectedTrack?.id || null;
        refreshMsyncTracks(preferredId).catch(error =>
            console.error('Unable to refresh MSYNC tracks after deletion:', error));
    });
    refreshMsyncTracks().catch(error => {
        console.error('Unable to load MSYNC tracks:', error);
        showToast('Unable to load MSYNC tracks');
    });
}

export function setMsyncModeActive(active) {
    element('drill-selection-area')?.classList.toggle('hidden', active);
    element('grp-difficulty')?.classList.toggle('hidden', active);
    element('ui-pause')?.classList.toggle('hidden', active);
    if (!active) destroySimulation();
    if (active) refreshMsyncTracks().catch(error =>
        console.error('Unable to refresh MSYNC tracks:', error));
}

async function acceptNewWarnings(result) {
    if (!result.newWarnings?.length) return true;
    if (!window.confirm(
        `${result.newWarnings.length} new MSYNC warning${result.newWarnings.length === 1 ? '' : 's'} found. Start simulation anyway?`
    )) return false;
    const now = Date.now();
    const attachment = selectedTrack.metadata.msync;
    selectedTrack = await saveTrack({
        ...selectedTrack,
        metadata: {
            ...selectedTrack.metadata,
            msync: {
                ...attachment,
                parsed: result.parsed,
                validation: {
                    parserVersion: MSYNC_PARSER_VERSION,
                    validatedAt: now,
                    acceptedWarnings: result.warnings.map(value => ({
                        code: value.code,
                        line: value.line,
                        section: value.section
                    }))
                }
            }
        }
    });
    const index = tracks.findIndex(track => track.id === selectedTrack.id);
    if (index >= 0) tracks[index] = selectedTrack;
    return true;
}

async function startMsyncSession(useLiveRobot) {
    if (!selectedTrack?.metadata?.msync) return;
    if (useLiveRobot && !bleState.isConnected) {
        showToast('Connect the robot before Live mode');
        return;
    }
    try {
        showToast('Revalidating MSYNC...');
        const result = await revalidateMsyncAttachment(selectedTrack, {
            builtInDrills: currentDrills,
            customDrills: userCustomDrills,
            drillData: currentDrills
        });
        pendingValidation = result;
        renderValidation(result);
        if (!result.valid) {
            updateSimulationState(MSYNC_SESSION_STATE.ERROR, 'Revalidation failed');
            showToast('Simulation blocked by MSYNC errors');
            return;
        }
        if (!await acceptNewWarnings(result)) return;
        const robotLead = Number(element('msync-robot-lead').value);
        result.parsed = {
            ...result.parsed,
            session: {
                ...result.parsed.session,
                robotLead: Math.min(5, Math.max(0,
                    Number.isFinite(robotLead) ? robotLead : 1.3))
            }
        };
        if (useLiveRobot && !window.confirm(
            'Start LIVE MSYNC?\n\nThe connected robot will begin firing balls at the scheduled cues. Keep the table clear and remain ready to press Stop.'
        )) return;
        destroySimulation();
        liveMode = useLiveRobot;
        simulationEvents = [];
        element('msync-event-log').textContent = 'Waiting for synchronized cues...';
        const audio = new MsyncAudioPlayer();
        audio.load(selectedTrack);
        if (useLiveRobot) {
            robotAdapter = new MsyncRobotAdapter({
                send: sendPacket,
                subscribeDone: onRobotDone,
                isConnected: () => bleState.isConnected,
                onDiagnostic: recordRobotDiagnostic
            });
            robotAdapter.configure(result.parsed);
        }
        sessionController = new MsyncSessionController({
            audio,
            onState: value => updateSimulationState(value.state, value.reason),
            onEvent: value => {
                recordSimulationEvent(value);
            },
            onRobotEvent: value => robotAdapter?.handleSessionEvent(value)
        });
        await sessionController.start(result.parsed);
    }
    catch (error) {
        console.error('Unable to start MSYNC simulation:', error);
        updateSimulationState(MSYNC_SESSION_STATE.ERROR, error.message);
        showToast('Unable to start simulation');
    }
}

async function toggleSimulationPause() {
    if (!sessionController) return;
    if (sessionController.state === MSYNC_SESSION_STATE.PAUSED) {
        await sessionController.resume();
    }
    else sessionController.pause();
}

import {
    initData,
    setLevel,
    setMode,
    resetStats,
    importCustomDrills,
    exportCustomDrills,
    saveAsDefault,
    resetToDefault,
    factoryReset,
    appStats,
    userCustomDrills,
    currentDrills,
    saveDrillsToStorage,
    selectedLevel
} from './state.js';


import {
    connectDevice,
    disconnectDevice,
    bleState
} from './bluetooth.js';


import {
    openEditor,
    closeEditor,
    saveDrillChanges
} from './editor.js';


import {
    renderDrillButtons,
    updateDrillButtonStates,
    setTheme,
    toggleMenu,
    switchTab,
    updateStatsUI,
    showSessionSummary
} from './ui.js';


import {
    showToast
} from './utils.js';


import {
    startDrillSequence,
    stopRun,
    togglePause,
    skipCountdown
} from './runner.js';


import {
    loadPlaylist,
    loadStoredPlaylist
} from './music.js';


import {
    getAllPlaylists,
    getPlaylistTracks
} from './playlist.js';


import {
    openPlaylistManager,
    closePlaylistManager,
    createPlaylistFromUI,
    renamePlaylistFromUI,
    closePlaylistTracksView,
    openStoredTracksView
} from './playlist-ui.js';


import {
    downloadDrill
} from './cloud.js';

import {
    createCustomDrillId
} from './custom-drill-identity.js';

import {
    initializeMsyncUI,
    setMsyncModeActive
} from './msync-ui.js';



// --- Initialization ---

document.addEventListener(
    'DOMContentLoaded',
    () => {
        initData();

        renderDrillButtons();

        updateStatsUI();

        setupEventListeners();

        initializeMsyncUI();

        console.log(
            'Nova Drill Control: Modules Loaded'
        );
    }
);



// --- Event Listeners Setup ---

function setupEventListeners() {

    const btnConnect =
        document.getElementById('btn-connect');


    if (btnConnect) {
        btnConnect.onclick = () => {
            if (bleState.isConnected) {
                disconnectDevice();

                showSessionSummary();
            }
            else {
                connectDevice();
            }
        };
    }



    const inputPause =
        document.getElementById('input-pause');


    if (inputPause) {
        inputPause.onchange = (e) => {

            // pause is in seconds. 0 to 5, 0.1 step
            let val =
                parseFloat(e.target.value);

            if (isNaN(val)) {
                val = 1.0;
            }

            if (val < 0) {
                val = 0;
            }

            if (val > 5.0) {
                val = 5.0;
            }

            e.target.value =
                val.toFixed(1);
        };
    }



    /*
     * Quick Music
     *
     * temporary playlist gikan sa normal file picker.
     * dili ni ma-save sa IndexedDB.
     */
    const inputMusic =
        document.getElementById('input-music');


    const playlistInfo =
        document.getElementById(
            'music-playlist-info'
        );


    if (inputMusic) {
        inputMusic.onchange = async (e) => {

            const files =
                e.target.files;


            if (
                !files ||
                files.length === 0
            ) {

                if (playlistInfo) {
                    playlistInfo.textContent =
                        'No music selected';
                }

                return;
            }


            if (playlistInfo) {
                playlistInfo.textContent =
                    'Reading playlist...';
            }


            try {
                const info =
                    await loadPlaylist(files);


                if (playlistInfo) {
                    playlistInfo.textContent =
                        `${info.trackCount} track${info.trackCount === 1 ? '' : 's'} - ` +
                        `${formatPlaylistTime(info.totalDuration)}`;
                }


                /*
                 * Quick Music ang active source.
                 * clear saved playlist selector para klaro unsay gamit.
                 */
                const savedPlaylistSelect =
                    document.getElementById(
                        'saved-playlist-select'
                    );


                if (savedPlaylistSelect) {
                    savedPlaylistSelect.value = '';
                }

            }
            catch (error) {
                console.error(
                    'Playlist load error:',
                    error
                );


                if (playlistInfo) {
                    playlistInfo.textContent =
                        'Unable to load playlist';
                }


                showToast(
                    'Unable to load music'
                );
            }
        };
    }



    /*
     * Saved Playlist
     *
     * playlist list comes from IndexedDB.
     */
    const savedPlaylistSelect =
        document.getElementById(
            'saved-playlist-select'
        );


    const btnUseSavedPlaylist =
        document.getElementById(
            'btn-use-saved-playlist'
        );


    if (savedPlaylistSelect) {
        loadSavedPlaylistOptions(
            savedPlaylistSelect
        );
    }



    if (btnUseSavedPlaylist) {
        btnUseSavedPlaylist.onclick =
            async () => {

                const playlistId =
                    savedPlaylistSelect?.value;


                if (!playlistId) {
                    showToast(
                        'Select a saved playlist'
                    );

                    return;
                }


                try {
                    const playlists =
                        await getAllPlaylists();


                    const playlist =
                        playlists.find(
                            item =>
                                item.id === playlistId
                        );


                    if (!playlist) {
                        showToast(
                            'Playlist not found'
                        );

                        return;
                    }


                    const tracks =
                        await getPlaylistTracks(
                            playlist.id
                        );


                    if (!tracks.length) {
                        showToast(
                            'Playlist has no songs'
                        );

                        return;
                    }


                    /*
                     * same music.js engine gihapon.
                     * source lang is IndexedDB instead sa File picker.
                     */
                    const info =
                        loadStoredPlaylist(
                            tracks
                        );


                    if (playlistInfo) {
                        playlistInfo.textContent =
                            `${playlist.name} - ` +
                            `${info.trackCount} track${info.trackCount === 1 ? '' : 's'} - ` +
                            `${formatPlaylistTime(info.totalDuration)}`;
                    }


                    /*
                     * clear Quick Music picker.
                     * saved playlist na ang active source.
                     */
                    if (inputMusic) {
                        inputMusic.value = '';
                    }


                    showToast(
                        `Loaded ${playlist.name}`
                    );

                }
                catch (error) {
                    console.error(
                        'Unable to load saved playlist:',
                        error
                    );


                    showToast(
                        'Unable to load saved playlist'
                    );
                }
            };
    }



    // Tap run display to skip countdown
    const runDisplay =
        document.getElementById(
            'run-display'
        );


    if (runDisplay) {
        runDisplay.onclick = () => {
            skipCountdown();
        };
    }



    document.addEventListener(
        'click',
        (e) => {

            const menu =
                document.getElementById(
                    'theme-menu'
                );


            if (
                menu &&
                menu.classList.contains('open') &&
                !menu.contains(e.target) &&
                !e.target.closest('.menu-btn')
            ) {
                menu.classList.remove('open');
            }
        }
    );



    document.addEventListener(
        'drills-updated',
        () => {
            renderDrillButtons();

            updateDrillButtonStates();
        }
    );



    document.addEventListener(
        'stats-updated',
        () => {
            updateStatsUI();
        }
    );



    document.addEventListener(
        'connection-changed',
        () => {

            updateDrillButtonStates();


            const editorModal =
                document.getElementById(
                    'editor-modal'
                );


            if (
                editorModal &&
                editorModal.classList.contains('open')
            ) {

                const testBtns =
                    document.querySelectorAll(
                        '.btn-act-test'
                    );


                testBtns.forEach(
                    b =>
                        b.disabled =
                            !bleState.isConnected
                );
            }
        }
    );
}



// --- Saved Playlist Selector ---

async function loadSavedPlaylistOptions(
    selectElement
) {
    try {
        const playlists =
            await getAllPlaylists();


        /*
         * keep currently selected id if possible.
         * useful after closing Playlist Manager.
         */
        const currentValue =
            selectElement.value;


        selectElement.innerHTML =
            '<option value="">Select saved playlist</option>';


        for (const playlist of playlists) {

            const option =
                document.createElement(
                    'option'
                );


            option.value =
                playlist.id;


            option.textContent =
                playlist.name;


            selectElement.appendChild(
                option
            );
        }


        /*
         * restore selection if playlist still exists.
         */
        if (
            currentValue &&
            playlists.some(
                playlist =>
                    playlist.id === currentValue
            )
        ) {
            selectElement.value =
                currentValue;
        }

    }
    catch (error) {
        console.error(
            'Unable to load saved playlist options:',
            error
        );
    }
}



// --- Playlist Time Formatter ---

function formatPlaylistTime(seconds) {

    if (
        !Number.isFinite(seconds) ||
        seconds < 0
    ) {
        return '0:00';
    }


    const totalSeconds =
        Math.round(seconds);


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


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



// --- Window Binding for HTML Compatibility ---

window.toggleMenu =
    toggleMenu;


window.setTheme =
    setTheme;


window.switchTab =
    switchTab;



window.openPlaylistManager =
    openPlaylistManager;


/*
 * refresh saved playlist selector after manager closes.
 * rename/create/delete may have changed the list.
 */
window.closePlaylistManager =
    async () => {

        closePlaylistManager();


        const savedPlaylistSelect =
            document.getElementById(
                'saved-playlist-select'
            );


        if (savedPlaylistSelect) {
            await loadSavedPlaylistOptions(
                savedPlaylistSelect
            );
        }
    };


window.createPlaylistFromUI =
    createPlaylistFromUI;


window.renamePlaylistFromUI =
    renamePlaylistFromUI;


window.closePlaylistTracksView =
    closePlaylistTracksView;

window.openStoredTracksView =
    openStoredTracksView;



window.setLevel =
    (lvl, btn) => {

        setLevel(lvl);


        document
            .querySelectorAll('.lvl-dot')
            .forEach(
                d =>
                    d.classList.remove(
                        'active'
                    )
            );


        if (btn) {
            btn.classList.add(
                'active'
            );
        }
    };



window.setMode =
    (mode, btn) => {

        setMode(mode);


        document
            .querySelectorAll(
                '.mode-option'
            )
            .forEach(
                d =>
                    d.classList.remove(
                        'active'
                    )
            );


        if (btn) {
            btn.classList.add(
                'active'
            );
        }


        const uiReps =
            document.getElementById(
                'ui-reps'
            );


        const uiTime =
            document.getElementById(
                'ui-time'
            );


        const uiMusic =
            document.getElementById(
                'ui-music'
            );

        const uiQuickMusic =
            document.getElementById(
                'ui-quick-music'
            );

        const uiPause =
            document.getElementById(
                'ui-pause'
            );


        const uiMsync =
            document.getElementById(
                'ui-msync'
            );


        uiReps?.classList.add(
            'hidden'
        );


        uiTime?.classList.add(
            'hidden'
        );


        uiMusic?.classList.add(
            'hidden'
        );

        uiQuickMusic?.classList.add(
            'hidden'
        );


        uiMsync?.classList.add(
            'hidden'
        );


        setMsyncModeActive(mode === 'msync');

        uiPause?.classList.toggle(
            'hidden',
            mode === 'music' || mode === 'msync'
        );


        if (mode === 'reps') {
            uiReps?.classList.remove(
                'hidden'
            );
        }
        else if (mode === 'time') {
            uiTime?.classList.remove(
                'hidden'
            );
        }
        else if (mode === 'music') {
            uiMusic?.classList.remove(
                'hidden'
            );
            uiQuickMusic?.classList.remove(
                'hidden'
            );
        }
        else if (mode === 'msync') {
            uiMsync?.classList.remove(
                'hidden'
            );
        }
    };



window.resetStats =
    resetStats;


window.saveAsDefault =
    saveAsDefault;


window.resetToDefault =
    resetToDefault;


window.factoryReset =
    factoryReset;


window.exportCustomDrills =
    exportCustomDrills;



window.handleCSVUpload =
    (event) => {

        const file =
            event.target.files[0];


        if (!file) {
            return;
        }


        const reader =
            new FileReader();


        reader.onload =
            function(e) {

                const success =
                    importCustomDrills(
                        e.target.result
                    );


                if (success) {
                    renderDrillButtons();

                    toggleMenu();
                }
            };


        reader.readAsText(file);


        event.target.value = '';
    };



window.openEditor =
    openEditor;


window.closeEditor =
    closeEditor;


window.saveDrillChanges =
    saveDrillChanges;


window.togglePause =
    togglePause;


window.stopRun =
    stopRun;



window.handleDrillClick =
    (key, btn) => {

        if (!bleState.isConnected) {
            showToast(
                'Device not connected'
            );

            return;
        }


        document
            .querySelectorAll(
                '.btn-drill'
            )
            .forEach(
                b =>
                    b.classList.remove(
                        'running'
                    )
            );


        btn.classList.add(
            'running'
        );


        startDrillSequence(key);
    };



// --- DOWNLOAD MODAL LOGIC ---

let selectedDownloadCat =
    'custom-a';



// Open download modal
window.handleDownloadDialog =
    () => {

        const menu =
            document.getElementById(
                'theme-menu'
            );


        if (menu) {
            menu.classList.remove(
                'open'
            );
        }


        selectedDownloadCat =
            'custom-a';


        const codeInput =
            document.getElementById(
                'dl-code'
            );


        if (codeInput) {
            codeInput.value = '';
        }


        const switchEl =
            document.getElementById(
                'dl-cat-switch'
            );


        if (switchEl) {

            Array
                .from(
                    switchEl.children
                )
                .forEach(
                    c =>
                        c.classList.remove(
                            'active'
                        )
                );


            if (switchEl.children[0]) {
                switchEl
                    .children[0]
                    .classList.add(
                        'active'
                    );
            }
        }


        const modal =
            document.getElementById(
                'download-modal'
            );


        if (modal) {
            modal.classList.add(
                'open'
            );


            setTimeout(
                () => {
                    if (codeInput) {
                        codeInput.focus();
                    }
                },
                100
            );
        }
    };



// Close download modal
window.closeDownloadModal =
    () => {

        const modal =
            document.getElementById(
                'download-modal'
            );


        if (modal) {
            modal.classList.remove(
                'open'
            );
        }
    };



// Switch download category
window.selectDlCategory =
    (val, btn) => {

        selectedDownloadCat =
            val;


        if (
            btn &&
            btn.parentElement
        ) {

            Array
                .from(
                    btn.parentElement.children
                )
                .forEach(
                    c =>
                        c.classList.remove(
                            'active'
                        )
                );


            btn.classList.add(
                'active'
            );
        }
    };



// Perform drill download
window.performDownload =
    async () => {

        const codeInput =
            document.getElementById(
                'dl-code'
            );


        if (!codeInput) {
            return;
        }


        const code =
            codeInput.value
                .trim()
                .toUpperCase();


        if (code.length !== 6) {
            showToast(
                'Invalid code (Must be 6 chars)'
            );

            return;
        }


        // custom banks allow up to 100 drills
        if (
            userCustomDrills[
                selectedDownloadCat
            ].length >= 100
        ) {

            const catChar =
                selectedDownloadCat
                    .split('-')[1]
                    .toUpperCase();


            showToast(
                `Bank ${catChar} is full!`
            );

            return;
        }


        showToast(
            'Searching...'
        );


        try {
            const data =
                await downloadDrill(
                    code
                );


            if (!data) {
                showToast(
                    'Code not found'
                );

                return;
            }


            let name =
                data.name;


            const existingNames =
                userCustomDrills[
                    selectedDownloadCat
                ].map(
                    d => d.name
                );


            if (
                existingNames.includes(
                    name
                )
            ) {
                name =
                    `${name} (Imp)`;
            }


            const catChar =
                selectedDownloadCat
                    .split('-')[1]
                    .toUpperCase();


            const newKey =
                `cust_${catChar}_${name.replace(/\s+/g, '_')}_${Date.now()}`;


            userCustomDrills[
                selectedDownloadCat
            ].push({
                id: createCustomDrillId(),
                name: name,
                key: newKey
            });


            const newDrillObj = {
                1: [],
                2: [],
                3: [],
                random: data.random
            };


            newDrillObj[
                selectedLevel
            ] = data.params;


            currentDrills[
                newKey
            ] = newDrillObj;


            localStorage.setItem(
                'custom_data',
                JSON.stringify(
                    userCustomDrills
                )
            );


            saveDrillsToStorage();


            renderDrillButtons();


            window.closeDownloadModal();


            const tabBtn =
                document.querySelector(
                    `.tab-btn[onclick*="${selectedDownloadCat}"]`
                );


            if (tabBtn) {
                switchTab(
                    selectedDownloadCat,
                    tabBtn
                );
            }


            showToast(
                `Imported to ${catChar}`
            );


            toggleMenu();

        }
        catch (e) {
            console.error(e);

            showToast(
                'Download Error'
            );
        }
    };

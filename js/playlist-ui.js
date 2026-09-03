import {
    getAllPlaylists,
    getPlaylistTracks,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    createTrackRecord,
    saveTrack,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    moveTrackInPlaylist,
    getAllTracks,
    findTrackByHash,
    deleteTrackPermanently
} from './playlist.js';

import { showToast } from './utils.js';


let activePlaylistId = null;
let activePlaylistName = '';


/*
 * playlist manager UI stuff lives here.
 * storage logic stays sa playlist.js para dili mag sagol tanan.
 */

export async function openPlaylistManager() {
    const modal = document.getElementById('playlist-manager-modal');

    if (!modal) {
        console.error('Playlist manager modal not found');
        return;
    }

    activePlaylistId = null;
    activePlaylistName = '';

    modal.classList.add('open');

    showPlaylistListView();

    await refreshPlaylistManager();
}


export function closePlaylistManager() {
    const modal = document.getElementById('playlist-manager-modal');

    if (modal) {
        modal.classList.remove('open');
    }

    activePlaylistId = null;
    activePlaylistName = '';
}


/*
 * reload playlist list from IndexedDB.
 */
export async function refreshPlaylistManager() {
    const list = document.getElementById('playlist-manager-list');

    if (!list) return;

    list.innerHTML =
        '<div class="playlist-manager-empty">Loading playlists...</div>';

    try {
        const playlists = await getAllPlaylists();

        if (!playlists.length) {
            list.innerHTML =
                '<div class="playlist-manager-empty">No saved playlists yet</div>';
            return;
        }

        list.innerHTML = '';

        for (const playlist of playlists) {
            const tracks = await getPlaylistTracks(playlist.id);

            const totalDuration = tracks.reduce(
                (sum, track) => sum + (track.duration || 0),
                0
            );

            const row = document.createElement('div');
            row.className = 'playlist-manager-row';


            const info = document.createElement('div');

            info.className =
                'playlist-manager-row-info playlist-manager-row-clickable';


            const name = document.createElement('div');
            name.className = 'playlist-manager-row-name';
            name.textContent = playlist.name;


            const meta = document.createElement('div');
            meta.className = 'playlist-manager-row-meta';

            const trackText =
                `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;

            meta.textContent =
                `${trackText} • ${formatPlaylistDuration(totalDuration)}`;


            info.appendChild(name);
            info.appendChild(meta);


            /*
             * tap playlist info para makita ang tracks sulod.
             */
            info.addEventListener('click', async () => {
                await openPlaylistTracksView(
                    playlist.id,
                    playlist.name
                );
            });


            const actions = document.createElement('div');
            actions.className = 'playlist-manager-row-actions';


            const addSongsBtn = document.createElement('button');

            addSongsBtn.type = 'button';
            addSongsBtn.className = 'playlist-manager-action-btn';
            addSongsBtn.textContent = 'Add Songs';

            addSongsBtn.addEventListener('click', async () => {
                await addSongsToPlaylistFromUI(
                    playlist.id,
                    playlist.name
                );
            });


            const renameBtn = document.createElement('button');

            renameBtn.type = 'button';
            renameBtn.className = 'playlist-manager-action-btn';
            renameBtn.textContent = 'Rename';

            renameBtn.addEventListener('click', async () => {
                await renamePlaylistFromUI(
                    playlist.id,
                    playlist.name
                );
            });


            const deleteBtn = document.createElement('button');

            deleteBtn.type = 'button';

            deleteBtn.className =
                'playlist-manager-action-btn playlist-manager-delete-btn';

            deleteBtn.textContent = 'Delete';

            deleteBtn.addEventListener('click', async () => {
                await deletePlaylistFromUI(
                    playlist.id,
                    playlist.name
                );
            });


            actions.appendChild(addSongsBtn);
            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);

            row.appendChild(info);
            row.appendChild(actions);

            list.appendChild(row);
        }

    } catch (error) {
        console.error(
            'Unable to load playlist manager:',
            error
        );

        list.innerHTML =
            '<div class="playlist-manager-empty">Unable to load playlists</div>';
    }
}


/*
 * simple create flow lang sa karon.
 */
export async function createPlaylistFromUI() {
    const rawName = window.prompt('New playlist name');

    if (rawName === null) {
        return;
    }

    const name = rawName.trim();

    if (!name) {
        return;
    }

    try {
        await createPlaylist(name);

        await refreshPlaylistManager();

    } catch (error) {
        console.error(
            'Unable to create playlist:',
            error
        );
    }
}


/*
 * name ra ang mausab.
 * playlist id stays the same.
 */
export async function renamePlaylistFromUI(
    playlistId,
    currentName
) {
    const rawName = window.prompt(
        'Rename playlist',
        currentName
    );

    if (rawName === null) {
        return;
    }

    const newName = rawName.trim();

    if (!newName) {
        return;
    }

    try {
        await renamePlaylist(
            playlistId,
            newName
        );

        await refreshPlaylistManager();

    } catch (error) {
        console.error(
            'Unable to rename playlist:',
            error
        );
    }
}


/*
 * playlist record lang ang delete.
 * actual tracks/audio stay sa DB.
 */
export async function deletePlaylistFromUI(
    playlistId,
    playlistName
) {
    const confirmed = window.confirm(
        `Delete playlist "${playlistName}"?\n\n` +
        'The saved audio tracks will not be deleted.'
    );

    if (!confirmed) {
        return;
    }

    try {
        await deletePlaylist(playlistId);

        await refreshPlaylistManager();

    } catch (error) {
        console.error(
            'Unable to delete playlist:',
            error
        );
    }
}


/*
 * track view.
 * 8G = remove membership
 * 8H = reorder
 */
async function openPlaylistTracksView(
    playlistId,
    playlistName
) {
    activePlaylistId = playlistId;
    activePlaylistName = playlistName;

    const listView =
        document.getElementById('playlist-manager-list-view');

    const tracksView =
        document.getElementById('playlist-manager-tracks-view');

    const title =
        document.getElementById('playlist-tracks-title');

    const list =
        document.getElementById('playlist-tracks-list');


    if (!listView || !tracksView || !title || !list) {
        console.error('Playlist track view not found');
        return;
    }


    listView.classList.add('hidden');
    tracksView.classList.remove('hidden');

    title.textContent = playlistName;

    list.innerHTML =
        '<div class="playlist-manager-empty">Loading tracks...</div>';


    try {
        const tracks = await getPlaylistTracks(playlistId);

        if (!tracks.length) {
            list.innerHTML =
                '<div class="playlist-manager-empty">No songs in this playlist</div>';
            return;
        }


        list.innerHTML = '';


        tracks.forEach((track, index) => {
            const row = document.createElement('div');
            row.className = 'playlist-track-row';


            const number = document.createElement('div');
            number.className = 'playlist-track-number';
            number.textContent = String(index + 1);


            const info = document.createElement('div');
            info.className = 'playlist-track-info';


            const name = document.createElement('div');
            name.className = 'playlist-track-name';

            name.textContent =
                track.displayName ||
                track.filename ||
                'Unknown Track';


            const meta = document.createElement('div');
            meta.className = 'playlist-track-meta';

            meta.textContent =
                formatPlaylistDuration(
                    track.duration || 0
                );


            info.appendChild(name);
            info.appendChild(meta);


            /*
             * reorder controls.
             * stable track id stays untouched, order ra ang mausab.
             */
            const moveActions =
                document.createElement('div');

            moveActions.className =
                'playlist-track-move-actions';


            const upBtn =
                document.createElement('button');

            upBtn.type = 'button';

            upBtn.className =
                'playlist-manager-action-btn playlist-track-move-btn';

            upBtn.textContent = '↑';
            upBtn.title = 'Move up';

            upBtn.disabled = index === 0;

            upBtn.addEventListener('click', async () => {
                await moveTrackFromUI(
                    playlistId,
                    track.id,
                    -1
                );
            });


            const downBtn =
                document.createElement('button');

            downBtn.type = 'button';

            downBtn.className =
                'playlist-manager-action-btn playlist-track-move-btn';

            downBtn.textContent = '↓';
            downBtn.title = 'Move down';

            downBtn.disabled =
                index === tracks.length - 1;

            downBtn.addEventListener('click', async () => {
                await moveTrackFromUI(
                    playlistId,
                    track.id,
                    1
                );
            });


            moveActions.appendChild(upBtn);
            moveActions.appendChild(downBtn);


            /*
             * membership lang ang tangtangon.
             * actual track/blob stays sa tracks store.
             */
            const removeBtn =
                document.createElement('button');

            removeBtn.type = 'button';

            removeBtn.className =
                'playlist-manager-action-btn playlist-track-remove-btn';

            removeBtn.textContent = 'Remove';

            removeBtn.addEventListener('click', async () => {
                await removeTrackFromPlaylistFromUI(
                    playlistId,
                    track.id,
                    name.textContent
                );
            });


            row.appendChild(number);
            row.appendChild(info);
            row.appendChild(moveActions);
            row.appendChild(removeBtn);

            list.appendChild(row);
        });

    } catch (error) {
        console.error(
            'Unable to load playlist tracks:',
            error
        );

        list.innerHTML =
            '<div class="playlist-manager-empty">Unable to load tracks</div>';
    }
}


/*
 * move up/down then redraw.
 */
async function moveTrackFromUI(
    playlistId,
    trackId,
    direction
) {
    try {
        await moveTrackInPlaylist(
            playlistId,
            trackId,
            direction
        );

        await openPlaylistTracksView(
            playlistId,
            activePlaylistName
        );

    } catch (error) {
        console.error(
            'Unable to reorder playlist track:',
            error
        );

        showToast('Unable to move song');
    }
}


/*
 * remove from playlist only.
 * track id/blob stays untouched sa DB.
 */
async function removeTrackFromPlaylistFromUI(
    playlistId,
    trackId,
    trackName
) {
    const confirmed = window.confirm(
        `Remove "${trackName}" from this playlist?\n\n` +
        'The saved audio file will not be deleted.'
    );

    if (!confirmed) {
        return;
    }

    try {
        await removeTrackFromPlaylist(
            playlistId,
            trackId
        );

        await openPlaylistTracksView(
            playlistId,
            activePlaylistName
        );

        await refreshPlaylistManager();

        showToast('Song removed from playlist');

    } catch (error) {
        console.error(
            'Unable to remove track from playlist:',
            error
        );

        showToast('Unable to remove song');
    }
}


/*
 * balik sa main playlist list.
 */
export function closePlaylistTracksView() {
    activePlaylistId = null;
    activePlaylistName = '';

    showPlaylistListView();
}

export async function openStoredTracksView() {
    const listView = document.getElementById('playlist-manager-list-view');
    const tracksView = document.getElementById('playlist-manager-tracks-view');
    const libraryView = document.getElementById('playlist-manager-library-view');
    const list = document.getElementById('playlist-library-list');
    if (!listView || !tracksView || !libraryView || !list) return;

    listView.classList.add('hidden');
    tracksView.classList.add('hidden');
    libraryView.classList.remove('hidden');
    list.innerHTML = '<div class="playlist-manager-empty">Loading stored tracks...</div>';

    try {
        const storedTracks = await getAllTracks();
        storedTracks.sort((a, b) => String(a.displayName || a.filename || '')
            .localeCompare(String(b.displayName || b.filename || '')));
        if (!storedTracks.length) {
            list.innerHTML = '<div class="playlist-manager-empty">No stored audio tracks</div>';
            return;
        }
        list.innerHTML = '';
        for (const track of storedTracks) {
            const row = document.createElement('div');
            row.className = 'playlist-track-row';
            const info = document.createElement('div');
            info.className = 'playlist-track-info';
            const name = document.createElement('div');
            name.className = 'playlist-track-name';
            name.textContent = track.displayName || track.filename || 'Unknown Track';
            const meta = document.createElement('div');
            meta.className = 'playlist-track-meta';
            meta.textContent = `${formatPlaylistDuration(track.duration || 0)}${track.metadata?.msync ? ' • MSYNC attached' : ''}`;
            info.append(name, meta);

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'playlist-manager-action-btn playlist-manager-delete-btn';
            deleteBtn.textContent = 'Delete permanently';
            deleteBtn.addEventListener('click', () =>
                deleteStoredTrackFromUI(track.id, name.textContent));
            row.append(info, deleteBtn);
            list.appendChild(row);
        }
    }
    catch (error) {
        console.error('Unable to load stored tracks:', error);
        list.innerHTML = '<div class="playlist-manager-empty">Unable to load stored tracks</div>';
    }
}

async function deleteStoredTrackFromUI(trackId, trackName) {
    const confirmed = window.confirm(
        `Permanently delete "${trackName}"?\n\n` +
        'This removes the MP3, its MSYNC attachment, and the track from every playlist. This cannot be undone.'
    );
    if (!confirmed) return;

    try {
        const result = await deleteTrackPermanently(trackId);
        await openStoredTracksView();
        document.dispatchEvent(new CustomEvent('stored-tracks-changed'));
        showToast(`Track deleted from storage${result.affectedPlaylists ? ` and ${result.affectedPlaylists} playlist${result.affectedPlaylists === 1 ? '' : 's'}` : ''}`);
    }
    catch (error) {
        console.error('Unable to permanently delete track:', error);
        showToast('Stored track was not deleted');
    }
}


function showPlaylistListView() {
    const listView =
        document.getElementById('playlist-manager-list-view');

    const tracksView =
        document.getElementById('playlist-manager-tracks-view');

    const libraryView =
        document.getElementById('playlist-manager-library-view');

    if (listView) {
        listView.classList.remove('hidden');
    }

    if (tracksView) {
        tracksView.classList.add('hidden');
    }

    if (libraryView) {
        libraryView.classList.add('hidden');
    }
}


/*
 * select one or more real audio files.
 * new audio gets stored once, existing hash gets reused.
 */
async function addSongsToPlaylistFromUI(
    playlistId,
    playlistName
) {
    const input = document.createElement('input');

    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;

    input.addEventListener(
        'change',
        async () => {
            const files =
                Array.from(input.files || []);

            if (!files.length) {
                return;
            }

            try {
                showToast('Adding music...');

                let addedCount = 0;
                let reusedCount = 0;

                for (const file of files) {
                    const duration =
                        await getAudioDuration(file);

                    const hash =
                        await makeFileHash(file);

                    let track =
                        await findTrackByHash(hash);


                    /*
                     * old tracks from before hash support.
                     * kung match, backfill sha256.
                     */
                    if (!track) {
                        track =
                            await findLegacyTrack(
                                file,
                                duration
                            );

                        if (track) {
                            track.metadata = {
                                ...(track.metadata || {}),
                                sha256: hash
                            };

                            await saveTrack(track);
                        }
                    }


                    if (track) {
                        reusedCount++;
                    }
                    else {
                        track =
                            createTrackRecord(
                                file,
                                duration
                            );

                        track.metadata = {
                            ...(track.metadata || {}),
                            sha256: hash
                        };

                        await saveTrack(track);
                    }


                    const beforeTracks =
                        await getPlaylistTracks(
                            playlistId
                        );

                    const alreadyThere =
                        beforeTracks.some(
                            item => item.id === track.id
                        );


                    await addTrackToPlaylist(
                        playlistId,
                        track.id
                    );


                    if (!alreadyThere) {
                        addedCount++;
                    }
                }


                await refreshPlaylistManager();


                console.log(
                    `Playlist "${playlistName}" import:`,
                    {
                        selected: files.length,
                        added: addedCount,
                        reused: reusedCount
                    }
                );


                if (addedCount > 0) {
                    showToast(
                        `${addedCount} song${addedCount === 1 ? '' : 's'} added`
                    );
                }
                else {
                    showToast(
                        'Songs already in playlist'
                    );
                }

            } catch (error) {
                console.error(
                    'Unable to add songs to playlist:',
                    error
                );

                showToast(
                    'Unable to add music'
                );
            }
        },
        { once: true }
    );

    input.click();
}


/*
 * hash the actual file contents.
 */
async function makeFileHash(file) {
    const buffer =
        await file.arrayBuffer();

    const digest =
        await crypto.subtle.digest(
            'SHA-256',
            buffer
        );

    return Array
        .from(
            new Uint8Array(digest)
        )
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, '0')
        )
        .join('');
}


/*
 * fallback para old records nga wala pay hash.
 */
async function findLegacyTrack(
    file,
    duration
) {
    const tracks =
        await getAllTracks();

    return tracks.find(track => {
        if (track?.metadata?.sha256) {
            return false;
        }

        const sameFilename =
            track.filename === file.name;

        const sameSize =
            Number(track.size) ===
            Number(file.size);

        const sameType =
            !track.type ||
            !file.type ||
            track.type === file.type;

        const oldDuration =
            Number(track.duration) || 0;

        const newDuration =
            Number(duration) || 0;

        const sameDuration =
            Math.abs(
                oldDuration - newDuration
            ) < 0.5;

        return (
            sameFilename &&
            sameSize &&
            sameType &&
            sameDuration
        );
    }) || null;
}


/*
 * get actual duration from selected file.
 */
async function getAudioDuration(file) {
    const audio = new Audio();

    const url =
        URL.createObjectURL(file);

    try {
        return await new Promise(
            (resolve, reject) => {
                audio.addEventListener(
                    'loadedmetadata',
                    () => {
                        resolve(
                            Number.isFinite(
                                audio.duration
                            )
                                ? audio.duration
                                : 0
                        );
                    },
                    { once: true }
                );


                audio.addEventListener(
                    'error',
                    () => {
                        reject(
                            audio.error ||
                            new Error(
                                'Unable to read audio metadata'
                            )
                        );
                    },
                    { once: true }
                );


                audio.src = url;
                audio.load();
            }
        );

    } finally {
        audio.removeAttribute('src');
        audio.load();

        URL.revokeObjectURL(url);
    }
}


function formatPlaylistDuration(seconds) {
    if (
        !Number.isFinite(seconds) ||
        seconds <= 0
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

import {
    getAllPlaylists,
    getPlaylistTracks,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    createTrackRecord,
    saveTrack,
    addTrackToPlaylist,
    getAllTracks,
    findTrackByHash
} from './playlist.js';

import { showToast } from './utils.js';


let activePlaylistId = null;


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
        console.error('Unable to load playlist manager:', error);

        list.innerHTML =
            '<div class="playlist-manager-empty">Unable to load playlists</div>';
    }
}


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
        console.error('Unable to create playlist:', error);
    }
}


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
        console.error('Unable to rename playlist:', error);
    }
}


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
        console.error('Unable to delete playlist:', error);
    }
}


/*
 * open track list for one playlist.
 * display ra sa 8F, wala pa remove/reorder.
 */
async function openPlaylistTracksView(
    playlistId,
    playlistName
) {
    activePlaylistId = playlistId;

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
                formatPlaylistDuration(track.duration || 0);


            info.appendChild(name);
            info.appendChild(meta);

            row.appendChild(number);
            row.appendChild(info);

            list.appendChild(row);
        });

    } catch (error) {
        console.error('Unable to load playlist tracks:', error);

        list.innerHTML =
            '<div class="playlist-manager-empty">Unable to load tracks</div>';
    }
}


/*
 * balik sa main playlist list.
 */
export function closePlaylistTracksView() {
    activePlaylistId = null;

    showPlaylistListView();
}


function showPlaylistListView() {
    const listView =
        document.getElementById('playlist-manager-list-view');

    const tracksView =
        document.getElementById('playlist-manager-tracks-view');

    if (listView) {
        listView.classList.remove('hidden');
    }

    if (tracksView) {
        tracksView.classList.add('hidden');
    }
}


/*
 * select one or more real audio files, save new tracks only once,
 * then add the stable track IDs to this playlist.
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
            const files = Array.from(input.files || []);

            if (!files.length) {
                return;
            }

            try {
                showToast('Adding music...');

                let addedCount = 0;
                let reusedCount = 0;

                for (const file of files) {
                    const duration = await getAudioDuration(file);

                    const hash = await makeFileHash(file);

                    let track = await findTrackByHash(hash);


                    /*
                     * old records from before hash support.
                     */
                    if (!track) {
                        track = await findLegacyTrack(
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
                        track = createTrackRecord(
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
                        await getPlaylistTracks(playlistId);

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
                    showToast('Songs already in playlist');
                }

            } catch (error) {
                console.error(
                    'Unable to add songs to playlist:',
                    error
                );

                showToast('Unable to add music');
            }
        },
        { once: true }
    );

    input.click();
}


async function makeFileHash(file) {
    const buffer = await file.arrayBuffer();

    const digest = await crypto.subtle.digest(
        'SHA-256',
        buffer
    );

    return Array
        .from(new Uint8Array(digest))
        .map(byte =>
            byte.toString(16).padStart(2, '0')
        )
        .join('');
}


async function findLegacyTrack(
    file,
    duration
) {
    const tracks = await getAllTracks();

    return tracks.find(track => {
        if (track?.metadata?.sha256) {
            return false;
        }

        const sameFilename =
            track.filename === file.name;

        const sameSize =
            Number(track.size) === Number(file.size);

        const sameType =
            !track.type ||
            !file.type ||
            track.type === file.type;

        const oldDuration =
            Number(track.duration) || 0;

        const newDuration =
            Number(duration) || 0;

        const sameDuration =
            Math.abs(oldDuration - newDuration) < 0.5;

        return (
            sameFilename &&
            sameSize &&
            sameType &&
            sameDuration
        );
    }) || null;
}


async function getAudioDuration(file) {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    try {
        return await new Promise((resolve, reject) => {
            audio.addEventListener(
                'loadedmetadata',
                () => {
                    resolve(
                        Number.isFinite(audio.duration)
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
                        new Error('Unable to read audio metadata')
                    );
                },
                { once: true }
            );


            audio.src = url;
            audio.load();
        });

    } finally {
        audio.removeAttribute('src');
        audio.load();

        URL.revokeObjectURL(url);
    }
}


function formatPlaylistDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '0:00';
    }

    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

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

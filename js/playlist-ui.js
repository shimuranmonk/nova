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

    modal.classList.add('open');

    await refreshPlaylistManager();
}


export function closePlaylistManager() {
    const modal = document.getElementById('playlist-manager-modal');

    if (modal) {
        modal.classList.remove('open');
    }
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
            info.className = 'playlist-manager-row-info';

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


            const actions = document.createElement('div');
            actions.className = 'playlist-manager-row-actions';


            /*
             * songs button. file picker is made only when needed,
             * wala nay permanent hidden input sa index.html.
             */
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


/*
 * simple create flow lang sa 8B.
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
        console.error('Unable to create playlist:', error);
    }
}


/*
 * name changes, id stays the same.
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
        console.error('Unable to rename playlist:', error);
    }
}


/*
 * playlist record lang ang i-delete diri.
 * tracks stay sa DB kay pwede shared sa lain playlist.
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
        console.error('Unable to delete playlist:', error);
    }
}


/*
 * Step 8E.
 *
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
                    /*
                     * duration first because old stored tracks from the
                     * earlier tests may not have a hash yet.
                     */
                    const duration = await getAudioDuration(file);

                    const hash = await makeFileHash(file);

                    let track = await findTrackByHash(hash);


                    /*
                     * old tracks, like our Step 7D Beat It record,
                     * were created before SHA-256 was added.
                     *
                     * try a careful legacy match first so dili ta mag
                     * store another copy just because old record has no hash.
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


                    /*
                     * addTrackToPlaylist already prevents the same
                     * track ID from appearing twice in one playlist.
                     */
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


/*
 * hash the actual file contents.
 * filename can change, hash stays tied to the audio file itself.
 */
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


/*
 * old records from before hash support need a fallback match.
 *
 * filename + size + type + duration is strong enough for migration
 * purposes, then we backfill the real SHA-256 into metadata.
 */
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


/*
 * duration helper. object URL is temporary lang,
 * revoke afterwards para walay blob URL nga magsige ug bilin.
 */
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

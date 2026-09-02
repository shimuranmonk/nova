import {
    getAllPlaylists,
    getPlaylistTracks,
    createPlaylist,
    renamePlaylist,
    deletePlaylist
} from './playlist.js';


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
 * prompt sa karon, proper editor later kung kinahanglan.
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
 * rename lang.
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

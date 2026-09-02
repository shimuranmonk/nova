import {
    getAllPlaylists,
    getPlaylistTracks
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
 * for now display ra gyud ni, wala pa edit/delete etc.
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

            row.appendChild(info);
            list.appendChild(row);
        }

    } catch (error) {
        console.error('Unable to load playlist manager:', error);

        list.innerHTML =
            '<div class="playlist-manager-empty">Unable to load playlists</div>';
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

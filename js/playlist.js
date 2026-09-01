const DB_NAME = 'nova_music';
const DB_VERSION = 1;

const TRACK_STORE = 'tracks';
const PLAYLIST_STORE = 'playlists';

// Keep one database connection promise.
// Para hindi tayo paulit-ulit mag-open ng IndexedDB every call.
let dbPromise = null;


/*
 * Opens the Nova music database.
 *
 * First run will also create the required stores.
 * Sa susunod na reload, bubuksan na lang yung existing DB.
 */
export function openPlaylistDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        /*
         * Runs only when the database is first created
         * or DB_VERSION is increased later.
         *
         * Mao ni ang place para mag-add ug new stores
         * kung naa tay future upgrade.
         */
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store the actual audio track records here.
            if (!db.objectStoreNames.contains(TRACK_STORE)) {
                db.createObjectStore(TRACK_STORE, {
                    keyPath: 'id'
                });
            }

            // Playlist records only keep playlist info and track IDs.
            if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
                db.createObjectStore(PLAYLIST_STORE, {
                    keyPath: 'id'
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            console.error(
                'Unable to open playlist database:',
                request.error
            );

            reject(request.error);
        };
    });

    return dbPromise;
}


/*
 * Save or update a track.
 *
 * store.put() works for both:
 * - new track
 * - existing track with same ID
 *
 * Audio Blob will eventually be stored inside this record.
 */
export async function saveTrack(track) {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            TRACK_STORE,
            'readwrite'
        );

        const store = transaction.objectStore(TRACK_STORE);

        const request = store.put(track);

        request.onsuccess = () => {
            resolve(track);
        };

        request.onerror = () => {
            console.error(
                'Unable to save track:',
                request.error
            );

            reject(request.error);
        };
    });
}


/*
 * Load one track using its ID.
 *
 * Returns null kung wala makita.
 */
export async function getTrack(id) {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            TRACK_STORE,
            'readonly'
        );

        const store = transaction.objectStore(TRACK_STORE);

        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            console.error(
                'Unable to load track:',
                request.error
            );

            reject(request.error);
        };
    });
}


/*
 * Save or update a playlist.
 *
 * Playlist should only reference track IDs.
 * Ayaw magbutang ug duplicate audio data diri.
 */
export async function savePlaylist(playlist) {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            PLAYLIST_STORE,
            'readwrite'
        );

        const store = transaction.objectStore(PLAYLIST_STORE);

        const request = store.put(playlist);

        request.onsuccess = () => {
            resolve(playlist);
        };

        request.onerror = () => {
            console.error(
                'Unable to save playlist:',
                request.error
            );

            reject(request.error);
        };
    });
}


/*
 * Load one playlist using its ID.
 *
 * Returns null kung wala pa / deleted na.
 */
export async function getPlaylist(id) {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            PLAYLIST_STORE,
            'readonly'
        );

        const store = transaction.objectStore(PLAYLIST_STORE);

        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            console.error(
                'Unable to load playlist:',
                request.error
            );

            reject(request.error);
        };
    });
}

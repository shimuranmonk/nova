const DB_NAME = 'nova_music';
const DB_VERSION = 1;
const TRACK_SCHEMA_VERSION = 1;
const PLAYLIST_SCHEMA_VERSION = 1;

const TRACK_STORE = 'tracks';
const PLAYLIST_STORE = 'playlists';

function isRecordObject(value) {
    return value &&
        typeof value === 'object' &&
        !Array.isArray(value);
}

export function normalizeTrackRecord(track, now = Date.now()) {
    if (!isRecordObject(track)) {
        throw new Error('Track record is invalid');
    }

    if (
        Number.isInteger(track.schemaVersion) &&
        track.schemaVersion > TRACK_SCHEMA_VERSION
    ) {
        throw new Error('Track record requires a newer Nova version');
    }

    return {
        ...track,
        schemaVersion: TRACK_SCHEMA_VERSION,
        metadata: isRecordObject(track.metadata)
            ? track.metadata
            : {},
        updatedAt:
            Number.isFinite(track.updatedAt)
                ? track.updatedAt
                : Number.isFinite(track.createdAt)
                    ? track.createdAt
                    : now
    };
}

export function normalizePlaylistRecord(
    playlist,
    now = Date.now()
) {
    if (!isRecordObject(playlist)) {
        throw new Error('Playlist record is invalid');
    }

    if (
        Number.isInteger(playlist.schemaVersion) &&
        playlist.schemaVersion > PLAYLIST_SCHEMA_VERSION
    ) {
        throw new Error('Playlist record requires a newer Nova version');
    }

    return {
        ...playlist,
        schemaVersion: PLAYLIST_SCHEMA_VERSION,
        trackIds: Array.isArray(playlist.trackIds)
            ? [...playlist.trackIds]
            : [],
        metadata: isRecordObject(playlist.metadata)
            ? playlist.metadata
            : {},
        updatedAt:
            Number.isFinite(playlist.updatedAt)
                ? playlist.updatedAt
                : Number.isFinite(playlist.createdAt)
                    ? playlist.createdAt
                    : now
    };
}

export function attachMsyncToTrack(
    track,
    msync,
    now = Date.now()
) {
    if (!isRecordObject(msync)) {
        throw new Error('Validated MSYNC attachment is required');
    }

    const normalized = normalizeTrackRecord(track, now);

    return {
        ...normalized,
        metadata: {
            ...normalized.metadata,
            msync
        },
        updatedAt: now
    };
}

export function removeMsyncFromTrack(track, now = Date.now()) {
    const normalized = normalizeTrackRecord(track, now);
    const metadata = {
        ...normalized.metadata
    };

    delete metadata.msync;

    return {
        ...normalized,
        metadata,
        updatedAt: now
    };
}

// Keep one DB connection promise.
// Para dili sige ug open sa IndexedDB kada function call.
let dbPromise = null;


/*
 * Generate an internal ID for playlists/tracks.
 *
 * IMPORTANT:
 * IDs are not based on filename, playlist name, or order.
 * Once assigned, mao na gyud na ang identity sa record.
 */
function makeId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback lang for older Chromium builds.
    // Our normal Android browsers should support randomUUID().
    return (
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2)
    );
}


/*
 * Opens the Nova music database.
 *
 * First run creates the stores.
 * Existing DB just opens normally.
 */
export function openPlaylistDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        /*
         * Runs on first creation or when DB_VERSION
         * gets increased later.
         */
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Actual stored audio tracks live here.
            if (!db.objectStoreNames.contains(TRACK_STORE)) {
                db.createObjectStore(TRACK_STORE, {
                    keyPath: 'id'
                });
            }

            // Playlist records only keep playlist info + track IDs.
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
 * Build a new track record.
 *
 * This does NOT save anything yet.
 *
 * Stable ID is assigned here and should never change,
 * even if the filename/display name changes later.
 *
 * metadata is intentionally present from day one.
 * MSYNC, BPM analysis, tags, etc. can attach data here later
 * without changing playlist identity/storage logic.
 */
export function createTrackRecord(file, duration = 0) {
    if (!file) {
        throw new Error('Audio file is required');
    }

    const now = Date.now();

    return {
        id: makeId(),
        schemaVersion: TRACK_SCHEMA_VERSION,

        filename: file.name,
        displayName: file.name,

        type: file.type || 'audio/*',
        duration: Number.isFinite(duration) ? duration : 0,
        size: file.size || 0,

        audioBlob: file,

        createdAt: now,
        updatedAt: now,

        // Reserved extension area.
        // Ayaw tanggalon. Future MSYNC lives around here.
        metadata: {}
    };
}


/*
 * Save or update a track.
 *
 * store.put() handles both new and existing records.
 *
 * Updating filename/displayName must NOT generate a new ID.
 */
export async function saveTrack(track) {
    if (!track || !track.id) {
        throw new Error('Track must have a stable ID');
    }

    const db = await openPlaylistDatabase();

    /*
     * Track v1 contract:
     * - keep the stable ID supplied by the caller
     * - preserve all known and future fields
     * - normalize the extension area for legacy records
     * - mark every stored update
     */
    const record = {
        ...normalizeTrackRecord(track),
        updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            TRACK_STORE,
            'readwrite'
        );

        const store = transaction.objectStore(TRACK_STORE);
        const request = store.put(record);

        transaction.oncomplete = () => {
            resolve(record);
        };

        transaction.onerror = () => {
            console.error(
                'Unable to save track:',
                transaction.error || request.error
            );

            reject(transaction.error || request.error);
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Track save transaction was aborted')
            );
        };
    });
}


/*
 * Load one track by its permanent internal ID.
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
            try {
                resolve(
                    request.result
                        ? normalizeTrackRecord(request.result)
                        : null
                );
            }
            catch (error) {
                reject(error);
            }
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
 * Create a new empty playlist and save it immediately.
 *
 * Playlist order is stored in trackIds[].
 * Track identity itself stays inside the tracks store.
 */
export async function createPlaylist(name) {
    const cleanName = String(name || '').trim();

    if (!cleanName) {
        throw new Error('Playlist name is required');
    }

    const now = Date.now();

    const playlist = {
        id: makeId(),
        schemaVersion: PLAYLIST_SCHEMA_VERSION,
        name: cleanName,

        // Order matters here.
        // Moving a song only changes this array,
        // never the song's own ID.
        trackIds: [],

        createdAt: now,
        updatedAt: now,

        // Reserved playlist/session extension area.
        // Track synchronization cues do not live here.
        metadata: {}
    };

    await savePlaylist(playlist);

    return playlist;
}


/*
 * Save or update a playlist.
 *
 * Existing playlist keeps the same ID.
 */
export async function savePlaylist(playlist) {
    if (!playlist || !playlist.id) {
        throw new Error('Playlist must have an ID');
    }

    const db = await openPlaylistDatabase();

    // Make sure old/future records don't end up
    // without the basic fields we depend on.
    const record = {
        ...normalizePlaylistRecord(playlist),
        updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            PLAYLIST_STORE,
            'readwrite'
        );

        const store = transaction.objectStore(PLAYLIST_STORE);
        const request = store.put(record);

        transaction.oncomplete = () => {
            resolve(record);
        };

        transaction.onerror = () => {
            console.error(
                'Unable to save playlist:',
                transaction.error || request.error
            );

            reject(transaction.error || request.error);
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Playlist save transaction was aborted')
            );
        };
    });
}


/*
 * Load one playlist by ID.
 *
 * Returns null kung deleted or wala pa.
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
            try {
                resolve(
                    request.result
                        ? normalizePlaylistRecord(request.result)
                        : null
                );
            }
            catch (error) {
                reject(error);
            }
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


/*
 * Return all saved playlists.
 *
 * Sort alphabetically for now.
 * Display order can be changed later if needed.
 */
export async function getAllPlaylists() {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            PLAYLIST_STORE,
            'readonly'
        );

        const store = transaction.objectStore(PLAYLIST_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            let playlists;

            try {
                playlists = (request.result || []).map(
                    playlist => normalizePlaylistRecord(playlist)
                );
            }
            catch (error) {
                reject(error);
                return;
            }

            playlists.sort((a, b) =>
                String(a.name || '').localeCompare(
                    String(b.name || '')
                )
            );

            resolve(playlists);
        };

        request.onerror = () => {
            console.error(
                'Unable to list playlists:',
                request.error
            );

            reject(request.error);
        };
    });
}


/*
 * Rename a playlist.
 *
 * Only the name changes.
 * Playlist ID and every track ID remain untouched.
 */
export async function renamePlaylist(id, newName) {
    const cleanName = String(newName || '').trim();

    if (!cleanName) {
        throw new Error('Playlist name is required');
    }

    const playlist = await getPlaylist(id);

    if (!playlist) {
        throw new Error('Playlist not found');
    }

    playlist.name = cleanName;
    playlist.updatedAt = Date.now();

    return savePlaylist(playlist);
}


/*
 * Delete only the playlist record.
 *
 * IMPORTANT:
 * Tracks are intentionally NOT deleted here.
 *
 * Basin gigamit pa ang same track sa lain playlist.
 * We'll handle unused/orphan track cleanup separately later.
 */
export async function deletePlaylist(id) {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            PLAYLIST_STORE,
            'readwrite'
        );

        const store = transaction.objectStore(PLAYLIST_STORE);
        const request = store.delete(id);

        request.onsuccess = () => {
            resolve(true);
        };

        request.onerror = () => {
            console.error(
                'Unable to delete playlist:',
                request.error
            );

            reject(request.error);
        };
    });
}

/*
 * Permanently delete one stored audio track and remove its stable ID from
 * every playlist. The audio Blob and all track metadata (including MSYNC)
 * are part of the track record and are deleted with it.
 */
export async function deleteTrackPermanently(trackId) {
    if (!trackId) {
        throw new Error('Track ID is required');
    }

    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            [TRACK_STORE, PLAYLIST_STORE],
            'readwrite'
        );
        const trackStore = transaction.objectStore(TRACK_STORE);
        const playlistStore = transaction.objectStore(PLAYLIST_STORE);
        const playlistsRequest = playlistStore.getAll();
        let affectedPlaylists = 0;

        playlistsRequest.onsuccess = () => {
            for (const rawPlaylist of playlistsRequest.result || []) {
                const playlist = normalizePlaylistRecord(rawPlaylist);
                const trackIds = playlist.trackIds.filter(id => id !== trackId);
                if (trackIds.length !== playlist.trackIds.length) {
                    affectedPlaylists++;
                    playlistStore.put({
                        ...playlist,
                        trackIds,
                        updatedAt: Date.now()
                    });
                }
            }
            trackStore.delete(trackId);
        };

        playlistsRequest.onerror = () => {
            transaction.abort();
        };
        transaction.oncomplete = () => resolve({ trackId, affectedPlaylists });
        transaction.onerror = () => reject(
            transaction.error || playlistsRequest.error ||
            new Error('Unable to delete stored track')
        );
        transaction.onabort = () => reject(
            transaction.error || playlistsRequest.error ||
            new Error('Track deletion was aborted')
        );
    });
}

/*
 * Add one track ID to a playlist.
 *
 * Track order is simply the order inside trackIds[].
 * Track identity stays separate from playlist position.
 */
export async function addTrackToPlaylist(playlistId, trackId) {
    const playlist = await getPlaylist(playlistId);

    if (!playlist) {
        throw new Error('Playlist not found');
    }

    if (!trackId) {
        throw new Error('Track ID is required');
    }

    // Prevent accidental duplicate references for now.
    // We can allow duplicates later if we ever need that behavior.
    if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
    }

    playlist.updatedAt = Date.now();

    return savePlaylist(playlist);
}


/*
 * Remove one track reference from a playlist.
 *
 * Important:
 * This does NOT delete the actual track/audio from IndexedDB.
 */
export async function removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = await getPlaylist(playlistId);

    if (!playlist) {
        throw new Error('Playlist not found');
    }

    playlist.trackIds = playlist.trackIds.filter(
        id => id !== trackId
    );

    playlist.updatedAt = Date.now();

    return savePlaylist(playlist);
}


/*
 * Load all track records for a playlist in playlist order.
 *
 * Missing/deleted track records are skipped.
 * This keeps one bad reference from breaking the whole playlist.
 */
export async function getPlaylistTracks(playlistId) {
    const playlist = await getPlaylist(playlistId);

    if (!playlist) {
        throw new Error('Playlist not found');
    }

    const tracks = [];

    for (const trackId of playlist.trackIds) {
        const track = await getTrack(trackId);

        if (track) {
            tracks.push(track);
        }
    }

    return tracks;
}

/*
 * get all stored tracks.
 *
 * gamit ni sa playlist manager para ma-check nato
 * kung naa na daan ang song before mag save ug another copy.
 */
export async function getAllTracks() {
    const db = await openPlaylistDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(
            'tracks',
            'readonly'
        );

        const store = tx.objectStore('tracks');
        const request = store.getAll();

        request.onsuccess = () => {
            try {
                resolve(
                    (request.result || []).map(
                        track => normalizeTrackRecord(track)
                    )
                );
            }
            catch (error) {
                reject(error);
            }
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


/*
 * lookup pinaagi sa audio fingerprint.
 *
 * hash goes inside metadata so wala ta kinahanglan DB migration.
 * old tracks without hash are still valid, dili sila ma break.
 */
export async function findTrackByHash(hash) {
    if (!hash) {
        return null;
    }

    const tracks = await getAllTracks();

    return tracks.find(track =>
        track?.metadata?.sha256 === hash
    ) || null;
}

export async function saveAudioFileToLibrary(file, duration, sha256) {
    if (!file || !sha256) throw new Error('Audio file and SHA-256 are required');
    let track = await findTrackByHash(sha256);
    if (!track) {
        const tracks = await getAllTracks();
        track = tracks.find(item =>
            !item.metadata?.sha256 &&
            item.filename === file.name &&
            Number(item.size) === Number(file.size) &&
            (!item.type || !file.type || item.type === file.type) &&
            Math.abs((Number(item.duration) || 0) - duration) < 0.5
        ) || null;
    }
    if (track) {
        if (!track.metadata?.sha256) {
            track = await saveTrack({
                ...track,
                metadata: { ...track.metadata, sha256 }
            });
        }
        return { track, created: false };
    }
    track = createTrackRecord(file, duration);
    track.metadata.sha256 = sha256;
    return { track: await saveTrack(track), created: true };
}

/*
 * move one track inside a playlist.
 *
 * track id stays the same. order lang ang mausab.
 * direction should be -1 for up, +1 for down.
 */
export async function moveTrackInPlaylist(
    playlistId,
    trackId,
    direction
) {
    const playlist = await getPlaylist(playlistId);

    if (!playlist) {
        throw new Error('Playlist not found');
    }

    const currentIndex =
        playlist.trackIds.indexOf(trackId);

    if (currentIndex < 0) {
        throw new Error('Track not found in playlist');
    }

    const newIndex =
        currentIndex + direction;

    /*
     * already at top/bottom, wala nay buhaton.
     */
    if (
        newIndex < 0 ||
        newIndex >= playlist.trackIds.length
    ) {
        return playlist;
    }

    const reordered = [...playlist.trackIds];

    const temp = reordered[currentIndex];

    reordered[currentIndex] =
        reordered[newIndex];

    reordered[newIndex] = temp;

    playlist.trackIds = reordered;
    playlist.updatedAt = Date.now();

    return savePlaylist(playlist);
}

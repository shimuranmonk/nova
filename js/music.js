let playlist = [];
let currentTrackIndex = 0;

const audio = new Audio();

let trackObjectUrl = null;
let loadedTrackIndex = -1;

let playlistEndedCallback = null;
let trackChangedCallback = null;
let progressCallback = null;

let progressTimer = null;

// Changed this from metadata.
// We want the first track ready before the drill starts.
audio.preload = 'auto';


function revokeCurrentUrl() {
    if (trackObjectUrl) {
        URL.revokeObjectURL(trackObjectUrl);
        trackObjectUrl = null;
    }

    loadedTrackIndex = -1;
}


function getAudioDuration(file) {
    return new Promise((resolve) => {
        const tempAudio = new Audio();
        const url = URL.createObjectURL(file);

        tempAudio.preload = 'metadata';

        tempAudio.addEventListener(
            'loadedmetadata',
            () => {
                const duration =
                    Number.isFinite(tempAudio.duration)
                        ? tempAudio.duration
                        : 0;

                URL.revokeObjectURL(url);

                resolve(duration);
            },
            { once: true }
        );

        tempAudio.addEventListener(
            'error',
            () => {
                URL.revokeObjectURL(url);

                resolve(0);
            },
            { once: true }
        );

        tempAudio.src = url;
    });
}


export async function loadPlaylist(fileList) {
    audio.pause();

    stopProgressUpdates();

    // New playlist, so the old object URL is no longer needed.
    revokeCurrentUrl();

    audio.removeAttribute('src');

    const files =
        Array.from(fileList || []);

    playlist = [];

    for (const file of files) {
        const duration =
            await getAudioDuration(file);

        playlist.push({
            file,
            name: file.name,
            duration,
            playable: duration > 0
        });
    }

    currentTrackIndex = 0;

    // Added this after testing on the phone.
    // Load the first track now instead of waiting until START.
    const firstPlayableIndex =
        playlist.findIndex(
            track => track.playable
        );

    if (firstPlayableIndex >= 0) {
        currentTrackIndex =
            firstPlayableIndex;

        loadCurrentTrack();
    }

    return getPlaylistInfo();
}


function loadCurrentTrack() {
    if (!playlist.length) {
        return false;
    }

    const track =
        playlist[currentTrackIndex];

    if (!track || !track.playable) {
        return false;
    }

    // Don't recreate the Blob URL if this track is already loaded.
    if (
        loadedTrackIndex === currentTrackIndex &&
        trackObjectUrl &&
        audio.src
    ) {
        return true;
    }

    revokeCurrentUrl();

    trackObjectUrl =
        URL.createObjectURL(track.file);

    loadedTrackIndex =
        currentTrackIndex;

    audio.src =
        trackObjectUrl;

    // Explicit load seems to behave better with local files on mobile.
    audio.load();

    if (trackChangedCallback) {
        trackChangedCallback(
            getPlaylistInfo()
        );
    }

    return true;
}


function startProgressUpdates() {
    stopProgressUpdates();

    progressTimer =
        setInterval(() => {
            if (progressCallback) {
                progressCallback(
                    getPlaylistInfo()
                );
            }
        }, 500);
}


function stopProgressUpdates() {
    if (progressTimer) {
        clearInterval(progressTimer);

        progressTimer = null;
    }
}


async function advanceToNextPlayableTrack() {
    while (
        currentTrackIndex <
        playlist.length - 1
    ) {
        currentTrackIndex++;

        const nextTrack =
            playlist[currentTrackIndex];

        if (
            !nextTrack ||
            !nextTrack.playable
        ) {
            continue;
        }

        if (!loadCurrentTrack()) {
            continue;
        }

        try {
            await audio.play();

            startProgressUpdates();

            if (progressCallback) {
                progressCallback(
                    getPlaylistInfo()
                );
            }

            return true;

        } catch (error) {
            console.error(
                'Unable to play track:',
                nextTrack.name,
                error
            );

            // Skip this one for the current playlist.
            nextTrack.playable = false;
        }
    }

    stopProgressUpdates();

    if (playlistEndedCallback) {
        playlistEndedCallback();
    }

    return false;
}


export async function playMusic() {
    if (!hasPlaylist()) {
        return false;
    }

    let track =
        playlist[currentTrackIndex];

    // Find something usable if the current entry cannot be played.
    if (!track || !track.playable) {
        const firstPlayableIndex =
            playlist.findIndex(
                item => item.playable
            );

        if (firstPlayableIndex < 0) {
            return false;
        }

        currentTrackIndex =
            firstPlayableIndex;

        track =
            playlist[currentTrackIndex];
    }

    if (!loadCurrentTrack()) {
        return false;
    }

    // A completed playlist should start over on the next drill.
    if (
        audio.ended ||
        (
            Number.isFinite(audio.duration) &&
            audio.duration > 0 &&
            audio.currentTime >= audio.duration
        )
    ) {
        try {
            audio.currentTime = 0;
        } catch (e) {}
    }

    try {
        await audio.play();

        startProgressUpdates();

        if (progressCallback) {
            progressCallback(
                getPlaylistInfo()
            );
        }

        return true;

    } catch (error) {
        console.error(
            'Unable to play music:',
            error
        );

        return false;
    }
}


export function pauseMusic() {
    audio.pause();

    stopProgressUpdates();

    if (progressCallback) {
        progressCallback(
            getPlaylistInfo()
        );
    }
}


// Stop the session but keep the selected files.
// This lets another drill reuse the same playlist.
export function stopMusic() {
    audio.pause();

    stopProgressUpdates();

    currentTrackIndex = 0;

    // If Track 1 is already loaded, just rewind it.
    // No point destroying the source and rebuilding it every run.
    if (loadedTrackIndex === 0) {
        try {
            audio.currentTime = 0;
        } catch (e) {}
    } else {
        // Playlist may have ended on another track.
        // Prepare Track 1 again for the next drill.
        const firstPlayableIndex =
            playlist.findIndex(
                track => track.playable
            );

        if (firstPlayableIndex >= 0) {
            currentTrackIndex =
                firstPlayableIndex;

            loadCurrentTrack();

            try {
                audio.currentTime = 0;
            } catch (e) {}
        }
    }

    if (progressCallback) {
        progressCallback(
            getPlaylistInfo()
        );
    }
}


export function hasPlaylist() {
    return playlist.some(
        track => track.playable
    );
}


export function getPlaylistInfo() {
    const totalDuration =
        playlist.reduce(
            (sum, track) =>
                sum +
                (track.duration || 0),
            0
        );

    const completedDuration =
        playlist
            .slice(
                0,
                currentTrackIndex
            )
            .reduce(
                (sum, track) =>
                    sum +
                    (track.duration || 0),
                0
            );

    const currentTrack =
        playlist[currentTrackIndex]
        || null;

    const currentTime =
        loadedTrackIndex ===
            currentTrackIndex &&
        Number.isFinite(audio.currentTime)
            ? audio.currentTime
            : 0;

    const elapsed =
        Math.min(
            totalDuration,
            completedDuration +
            currentTime
        );

    const remaining =
        Math.max(
            0,
            totalDuration -
            elapsed
        );

    return {
        trackCount:
            playlist.length,

        playableTrackCount:
            playlist.filter(
                track => track.playable
            ).length,

        currentTrackIndex,

        currentTrackNumber:
            playlist.length
                ? currentTrackIndex + 1
                : 0,

        currentTrack,

        currentTrackTime:
            currentTime,

        currentTrackDuration:
            currentTrack
                ? currentTrack.duration || 0
                : 0,

        totalDuration,
        elapsed,
        remaining,

        isPlaying:
            !audio.paused &&
            !audio.ended
    };
}


export function onPlaylistEnded(callback) {
    playlistEndedCallback =
        callback;
}


export function onTrackChanged(callback) {
    trackChangedCallback =
        callback;
}


export function onProgress(callback) {
    progressCallback =
        callback;
}


// Move to the next file when the current one finishes.
audio.addEventListener(
    'ended',
    async () => {
        await advanceToNextPlayableTrack();
    }
);


// Keep this mostly for debugging.
// Do not permanently invalidate the file because of one media error.
audio.addEventListener(
    'error',
    () => {
        console.error(
            'Audio playback error:',
            audio.error
        );
    }
);

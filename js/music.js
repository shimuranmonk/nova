let playlist = [];
let currentTrackIndex = 0;

const audio = new Audio();

let trackObjectUrl = null;
let loadedTrackIndex = -1;

let playlistEndedCallback = null;
let trackChangedCallback = null;
let progressCallback = null;

let progressTimer = null;

audio.preload = 'metadata';


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

    revokeCurrentUrl();

    audio.removeAttribute('src');

    const files = Array.from(fileList || []);

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

    // If this exact track is already loaded,
    // keep using the same audio source.
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

    audio.src = trackObjectUrl;

    // Explicitly load the newly assigned local audio file.
    // Important for reliable Blob URL playback on mobile browsers.
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

            return true;

        } catch (error) {
            console.error(
                'Unable to play track:',
                nextTrack.name,
                error
            );

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

    // A completed track can be replayed
    // from the beginning without replacing src.
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


// Stop the current session but preserve
// the selected playlist for the next drill.
export function stopMusic() {
    audio.pause();

    stopProgressUpdates();

    currentTrackIndex = 0;

    // Do not destroy the audio source here.
    // If Track 1 is still loaded, simply rewind it.
    if (loadedTrackIndex === 0) {
        try {
            audio.currentTime = 0;
        } catch (e) {}
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
        loadedTrackIndex === currentTrackIndex &&
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
    playlistEndedCallback = callback;
}


export function onTrackChanged(callback) {
    trackChangedCallback = callback;
}


export function onProgress(callback) {
    progressCallback = callback;
}


audio.addEventListener(
    'ended',
    async () => {
        await advanceToNextPlayableTrack();
    }
);


audio.addEventListener(
    'error',
    () => {
        // Runtime playback errors are logged,
        // but we do not permanently invalidate
        // the user's selected local file.
        console.error(
            'Audio playback error:',
            audio.error
        );
    }
);

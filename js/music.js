let playlist = [];
let currentTrackIndex = 0;

const audio = new Audio();

let trackObjectUrl = null;
let loadedTrackIndex = -1;

let playlistEndedCallback = null;
let trackChangedCallback = null;
let progressCallback = null;

let progressTimer = null;
let intentionalReset = false;

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

        const cleanup = () => {
            URL.revokeObjectURL(url);

            tempAudio.removeAttribute('src');

            try {
                tempAudio.load();
            } catch (e) {}
        };

        tempAudio.addEventListener(
            'loadedmetadata',
            () => {
                const duration =
                    Number.isFinite(tempAudio.duration)
                        ? tempAudio.duration
                        : 0;

                cleanup();
                resolve(duration);
            },
            { once: true }
        );

        tempAudio.addEventListener(
            'error',
            () => {
                cleanup();
                resolve(0);
            },
            { once: true }
        );

        tempAudio.src = url;
    });
}


export async function loadPlaylist(fileList) {
    resetAudioSource();

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

    // Already loaded
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

    // If the previous session finished,
    // start again from Track 1.
    if (
        currentTrackIndex >= playlist.length
    ) {
        currentTrackIndex = 0;
    }

    let track =
        playlist[currentTrackIndex];

    // Find first playable track if needed
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

    // If track already finished,
    // rewind before playing again.
    if (
        audio.ended ||
        (
            Number.isFinite(audio.duration) &&
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

        track.playable = false;

        return advanceToNextPlayableTrack();
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


// Used when a drill/session ends.
// Playlist remains selected and reusable.
export function stopMusic() {

    intentionalReset = true;

    audio.pause();

    stopProgressUpdates();

    // Return playlist to beginning
    currentTrackIndex = 0;

    // Force Track 1 to be loaded fresh
    // when the next drill starts.
    revokeCurrentUrl();

    audio.removeAttribute('src');

    try {
        audio.load();
    } catch (e) {}

    intentionalReset = false;

    if (progressCallback) {
        progressCallback(
            getPlaylistInfo()
        );
    }
}


// Used when loading a completely
// different playlist.
function resetAudioSource() {

    intentionalReset = true;

    audio.pause();

    stopProgressUpdates();

    currentTrackIndex = 0;

    revokeCurrentUrl();

    audio.removeAttribute('src');

    try {
        audio.load();
    } catch (e) {}

    intentionalReset = false;
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
        Number.isFinite(
            audio.currentTime
        )
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
                track =>
                    track.playable
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


export function onPlaylistEnded(
    callback
) {
    playlistEndedCallback =
        callback;
}


export function onTrackChanged(
    callback
) {
    trackChangedCallback =
        callback;
}


export function onProgress(
    callback
) {
    progressCallback =
        callback;
}


audio.addEventListener(
    'ended',
    async () => {

        if (intentionalReset) {
            return;
        }

        await advanceToNextPlayableTrack();
    }
);


audio.addEventListener(
    'error',
    async () => {

        // Ignore errors generated while
        // intentionally resetting src.
        if (intentionalReset) {
            return;
        }

        const failedTrack =
            playlist[
                currentTrackIndex
            ];

        if (failedTrack) {
            failedTrack.playable =
                false;

            console.error(
                'Skipping unplayable track:',
                failedTrack.name
            );
        }

        stopProgressUpdates();

        await advanceToNextPlayableTrack();
    }
);

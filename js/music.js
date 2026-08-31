let playlist = [];
let currentTrackIndex = 0;

const audio = new Audio();

let trackObjectUrl = null;
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
}

function getAudioDuration(file) {
    return new Promise((resolve) => {
        const tempAudio = new Audio();
        const url = URL.createObjectURL(file);

        tempAudio.preload = 'metadata';

        const cleanup = () => {
            URL.revokeObjectURL(url);
            tempAudio.removeAttribute('src');
            tempAudio.load();
        };

        tempAudio.addEventListener('loadedmetadata', () => {
            const duration = Number.isFinite(tempAudio.duration)
                ? tempAudio.duration
                : 0;

            cleanup();
            resolve(duration);
        }, { once: true });

        tempAudio.addEventListener('error', () => {
            cleanup();
            resolve(0);
        }, { once: true });

        tempAudio.src = url;
    });
}

export async function loadPlaylist(fileList) {
    stopMusic();

    const files = Array.from(fileList || []);

    playlist = [];

    for (const file of files) {
        const duration = await getAudioDuration(file);

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

    revokeCurrentUrl();

    const track = playlist[currentTrackIndex];

    if (!track) {
        return false;
    }

    trackObjectUrl = URL.createObjectURL(track.file);

    audio.src = trackObjectUrl;
    audio.load();

    if (trackChangedCallback) {
        trackChangedCallback(getPlaylistInfo());
    }

    return true;
}

function startProgressUpdates() {
    stopProgressUpdates();

    progressTimer = setInterval(() => {
        if (progressCallback) {
            progressCallback(getPlaylistInfo());
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
    while (currentTrackIndex < playlist.length - 1) {
        currentTrackIndex++;

        const nextTrack = playlist[currentTrackIndex];

        if (!nextTrack || !nextTrack.playable) {
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
        }
    }

    stopProgressUpdates();

    if (playlistEndedCallback) {
        playlistEndedCallback();
    }

    return false;
}

export async function playMusic() {
    if (!playlist.length) {
        return false;
    }

    let track = playlist[currentTrackIndex];

    if (!track || !track.playable) {
        return advanceToNextPlayableTrack();
    }

    if (!audio.src) {
        if (!loadCurrentTrack()) {
            return false;
        }
    }

    try {
        await audio.play();
        startProgressUpdates();

        if (progressCallback) {
            progressCallback(getPlaylistInfo());
        }

        return true;
    } catch (error) {
        console.error(
            'Unable to play music:',
            error
        );

        return advanceToNextPlayableTrack();
    }
}

export function pauseMusic() {
    audio.pause();
    stopProgressUpdates();

    if (progressCallback) {
        progressCallback(getPlaylistInfo());
    }
}

export function stopMusic() {
    audio.pause();

    stopProgressUpdates();

    try {
        audio.currentTime = 0;
    } catch (e) {}

    revokeCurrentUrl();

    audio.removeAttribute('src');
    audio.load();

    currentTrackIndex = 0;

    if (progressCallback) {
        progressCallback(getPlaylistInfo());
    }
}

export function hasPlaylist() {
    return playlist.some(track => track.playable);
}

export function getPlaylistInfo() {
    const totalDuration = playlist.reduce(
        (sum, track) => sum + (track.duration || 0),
        0
    );

    const completedDuration = playlist
        .slice(0, currentTrackIndex)
        .reduce(
            (sum, track) => sum + (track.duration || 0),
            0
        );

    const currentTrack =
        playlist[currentTrackIndex] || null;

    const currentTime =
        Number.isFinite(audio.currentTime)
            ? audio.currentTime
            : 0;

    const elapsed =
        Math.min(
            totalDuration,
            completedDuration + currentTime
        );

    const remaining =
        Math.max(
            0,
            totalDuration - elapsed
        );

    return {
        trackCount: playlist.length,
        playableTrackCount:
            playlist.filter(track => track.playable).length,

        currentTrackIndex,

        currentTrackNumber:
            playlist.length
                ? currentTrackIndex + 1
                : 0,

        currentTrack,

        currentTrackTime: currentTime,

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

audio.addEventListener('ended', async () => {
    stopProgressUpdates();

    await advanceToNextPlayableTrack();
});

audio.addEventListener('error', async () => {
    const failedTrack =
        playlist[currentTrackIndex];

    if (failedTrack) {
        failedTrack.playable = false;

        console.error(
            'Skipping unplayable track:',
            failedTrack.name
        );
    }

    stopProgressUpdates();

    await advanceToNextPlayableTrack();
});

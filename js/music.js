let playlist = [];
let currentTrackIndex = 0;
let audio = new Audio();

let trackObjectUrl = null;
let playlistEndedCallback = null;
let trackChangedCallback = null;

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

        tempAudio.addEventListener('loadedmetadata', () => {
            const duration = Number.isFinite(tempAudio.duration)
                ? tempAudio.duration
                : 0;

            URL.revokeObjectURL(url);
            resolve(duration);
        }, { once: true });

        tempAudio.addEventListener('error', () => {
            URL.revokeObjectURL(url);
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
            duration
        });
    }

    currentTrackIndex = 0;

    return getPlaylistInfo();
}

function loadCurrentTrack() {
    if (!playlist.length) return false;

    revokeCurrentUrl();

    const track = playlist[currentTrackIndex];

    trackObjectUrl = URL.createObjectURL(track.file);
    audio.src = trackObjectUrl;
    audio.load();

    if (trackChangedCallback) {
        trackChangedCallback(getPlaylistInfo());
    }

    return true;
}

export async function playMusic() {
    if (!playlist.length) return false;

    if (!audio.src) {
        if (!loadCurrentTrack()) return false;
    }

    try {
        await audio.play();
        return true;
    } catch (error) {
        console.error('Unable to play music:', error);
        return false;
    }
}

export function pauseMusic() {
    audio.pause();
}

export function stopMusic() {
    audio.pause();

    try {
        audio.currentTime = 0;
    } catch (e) {}

    revokeCurrentUrl();

    audio.removeAttribute('src');
    audio.load();

    currentTrackIndex = 0;
}

export function hasPlaylist() {
    return playlist.length > 0;
}

export function getPlaylistInfo() {
    const totalDuration = playlist.reduce(
        (sum, track) => sum + track.duration,
        0
    );

    const completedDuration = playlist
        .slice(0, currentTrackIndex)
        .reduce((sum, track) => sum + track.duration, 0);

    const currentTrack = playlist[currentTrackIndex] || null;

    return {
        trackCount: playlist.length,
        currentTrackIndex,
        currentTrackNumber: playlist.length
            ? currentTrackIndex + 1
            : 0,
        currentTrack,
        totalDuration,
        elapsed: completedDuration + (audio.currentTime || 0),
        remaining: Math.max(
            0,
            totalDuration - completedDuration - (audio.currentTime || 0)
        )
    };
}

export function onPlaylistEnded(callback) {
    playlistEndedCallback = callback;
}

export function onTrackChanged(callback) {
    trackChangedCallback = callback;
}

audio.addEventListener('ended', async () => {
    if (currentTrackIndex < playlist.length - 1) {
        currentTrackIndex++;

        loadCurrentTrack();

        try {
            await audio.play();
        } catch (error) {
            console.error('Unable to play next track:', error);
        }

        return;
    }

    if (playlistEndedCallback) {
        playlistEndedCallback();
    }
});

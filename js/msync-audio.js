export class MsyncAudioPlayer {
    constructor(audio = new Audio()) {
        this.audio = audio;
        this.objectUrl = null;
        this.onEnded = null;
        this.onError = null;
        this.audio.preload = 'auto';
        this.audio.addEventListener('ended', () => this.onEnded?.());
        this.audio.addEventListener('error', () =>
            this.onError?.(this.audio.error || new Error('Audio playback error')));
    }

    load(track) {
        if (!track?.audioBlob) throw new Error('Selected Track audio is unavailable');
        this.stop();
        this.revokeUrl();
        this.objectUrl = URL.createObjectURL(track.audioBlob);
        this.audio.src = this.objectUrl;
        this.audio.load();
    }

    async play() {
        await this.audio.play();
        return true;
    }

    pause() {
        this.audio.pause();
    }

    stop() {
        this.audio.pause();
        try { this.audio.currentTime = 0; } catch (error) {}
    }

    currentTimeMs() {
        return Number.isFinite(this.audio.currentTime)
            ? Math.round(this.audio.currentTime * 1000)
            : 0;
    }

    revokeUrl() {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
    }

    destroy() {
        this.stop();
        this.audio.removeAttribute('src');
        this.revokeUrl();
    }
}

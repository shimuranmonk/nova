export function createVoiceTestMode({
    onUpdate = () => {}
} = {}) {
    let active = false;
    let latestResult = null;

    function publish() {
        onUpdate({
            active,
            latestResult: latestResult
                ? { ...latestResult }
                : null
        });
    }

    return {
        isActive() {
            return active;
        },

        setActive(nextActive) {
            active = nextActive === true;

            if (!active) {
                latestResult = null;
            }

            publish();
            return active;
        },

        consume(detail) {
            if (!active) {
                return false;
            }

            latestResult = {
                transcript: String(detail?.transcript || ''),
                phrase: String(detail?.phrase || ''),
                command: detail?.command || null,
                confidence: Number.isFinite(detail?.confidence)
                    ? detail.confidence
                    : null,
                recognitionMs: Number.isFinite(detail?.recognitionMs)
                    ? detail.recognitionMs
                    : null
            };

            publish();
            return true;
        },

        getLatestResult() {
            return latestResult
                ? { ...latestResult }
                : null;
        }
    };
}

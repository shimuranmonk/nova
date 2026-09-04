import { COMMANDS } from './command-controller.js';

export const VOICE_PHRASES = Object.freeze({
    'NOVA START': COMMANDS.START,
    'NOVA STOP': COMMANDS.STOP,
    'NOVA PAUSE': COMMANDS.PAUSE,
    'NOVA RESUME': COMMANDS.RESUME
});

export const VOICE_RECOGNITION_STATES = Object.freeze({
    OFF: 'OFF',
    PREPARING: 'PREPARING',
    LISTENING: 'LISTENING',
    RESTARTING: 'RESTARTING',
    ERROR: 'ERROR',
    UNSUPPORTED: 'UNSUPPORTED'
});

export function normalizeVoicePhrase(transcript) {
    return String(transcript || '')
        .trim()
        .toUpperCase()
        .replace(/[.,!?]+$/g, '')
        .replace(/\s+/g, ' ');
}

export function matchVoiceCommand(transcript) {
    const phrase = normalizeVoicePhrase(transcript);
    const command = VOICE_PHRASES[phrase] || null;

    return { phrase, command };
}

export function getSpeechRecognitionConstructor(scope = globalThis) {
    return scope?.SpeechRecognition ||
        scope?.webkitSpeechRecognition ||
        null;
}

export function createVoiceRecognitionEngine({
    scope = globalThis,
    language = 'en-US',
    allowOnlineFallback = true,
    restartDelayMs = 250,
    duplicateWindowMs = 750,
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    onCommand = () => {},
    onTranscript = () => {},
    onStatus = () => {}
} = {}) {
    const Recognition = getSpeechRecognitionConstructor(scope);
    let enabled = false;
    let recognition = null;
    let restartTimer = null;
    let generation = 0;
    let recognitionMode = 'unavailable';
    let localModeRejected = false;
    let lastCommand = null;
    let lastCommandAt = -Infinity;
    let speechStartedAt = null;

    function report(state, message, extra = {}) {
        onStatus({
            state,
            message,
            mode: recognitionMode,
            enabled,
            ...extra
        });
    }

    function clearRestart() {
        if (restartTimer !== null) {
            clearTimer(restartTimer);
            restartTimer = null;
        }
    }

    function scheduleRestart() {
        if (!enabled || restartTimer !== null) {
            return;
        }

        report(
            VOICE_RECOGNITION_STATES.RESTARTING,
            'Voice recognition restarting'
        );

        restartTimer = setTimer(() => {
            restartTimer = null;
            startRecognitionSession();
        }, restartDelayMs);
    }

    function handleResult(event) {
        const results = event?.results || [];
        const startIndex = Number.isInteger(event?.resultIndex)
            ? event.resultIndex
            : 0;

        for (let index = startIndex; index < results.length; index++) {
            const result = results[index];

            if (!result?.isFinal || !result[0]) {
                continue;
            }

            const transcript = String(result[0].transcript || '');
            const confidence = Number.isFinite(result[0].confidence)
                ? result[0].confidence
                : null;
            const match = matchVoiceCommand(transcript);
            const recognizedAt = now();
            const detail = {
                ...match,
                transcript,
                confidence,
                recognitionMs: speechStartedAt === null
                    ? null
                    : Math.max(0, recognizedAt - speechStartedAt)
            };

            onTranscript(detail);

            if (!match.command) {
                continue;
            }

            if (
                match.command === lastCommand &&
                recognizedAt - lastCommandAt < duplicateWindowMs
            ) {
                continue;
            }

            lastCommand = match.command;
            lastCommandAt = recognizedAt;
            onCommand(detail);
        }
    }

    function handleError(event) {
        const error = event?.error || 'unknown';

        if (!enabled && error === 'aborted') {
            return;
        }

        if (
            error === 'language-not-supported' &&
            recognitionMode === 'local' &&
            allowOnlineFallback
        ) {
            localModeRejected = true;
            recognitionMode = 'online-possible';
            report(
                VOICE_RECOGNITION_STATES.RESTARTING,
                'On-device language unavailable — online recognition may be used',
                { error }
            );
            return;
        }

        if ([
            'not-allowed',
            'service-not-allowed',
            'audio-capture'
        ].includes(error)) {
            enabled = false;
            clearRestart();
            report(
                VOICE_RECOGNITION_STATES.ERROR,
                error === 'audio-capture'
                    ? 'Microphone unavailable'
                    : 'Microphone permission denied',
                { error }
            );
            return;
        }

        report(
            VOICE_RECOGNITION_STATES.ERROR,
            error === 'no-speech'
                ? 'No speech heard — still listening'
                : `Voice recognition error: ${error}`,
            { error }
        );
    }

    function startRecognitionSession() {
        if (!enabled || !Recognition) {
            return false;
        }

        recognition = new Recognition();
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if ('processLocally' in recognition) {
            recognition.processLocally = recognitionMode === 'local';
        }

        recognition.onstart = () => {
            if (!enabled) return;

            report(
                VOICE_RECOGNITION_STATES.LISTENING,
                recognitionMode === 'local'
                    ? 'Listening — on-device recognition'
                    : 'Listening — online recognition may be used'
            );
        };
        recognition.onspeechstart = () => {
            speechStartedAt = now();
        };
        recognition.onresult = handleResult;
        recognition.onerror = handleError;
        recognition.onend = () => {
            recognition = null;
            scheduleRestart();
        };

        try {
            recognition.start();
            return true;
        }
        catch (error) {
            report(
                VOICE_RECOGNITION_STATES.ERROR,
                'Unable to start voice recognition',
                { error: error?.name || 'start-failed' }
            );
            scheduleRestart();
            return false;
        }
    }

    async function selectRecognitionMode(expectedGeneration) {
        const probe = new Recognition();
        const supportsLocal =
            'processLocally' in probe &&
            typeof Recognition.available === 'function' &&
            !localModeRejected;

        if (supportsLocal) {
            try {
                const availability = await Recognition.available({
                    langs: [language],
                    processLocally: true
                });

                if (!enabled || generation !== expectedGeneration) {
                    return false;
                }

                if (availability === 'available') {
                    recognitionMode = 'local';
                    return true;
                }
            }
            catch {
                // The experimental availability API may be blocked or absent.
            }
        }

        if (!allowOnlineFallback) {
            recognitionMode = 'unavailable';
            enabled = false;
            report(
                VOICE_RECOGNITION_STATES.ERROR,
                'On-device recognition unavailable'
            );
            return false;
        }

        recognitionMode = 'online-possible';
        return true;
    }

    return {
        isSupported() {
            return Boolean(Recognition);
        },

        isEnabled() {
            return enabled;
        },

        getMode() {
            return recognitionMode;
        },

        async start() {
            if (enabled) {
                return true;
            }

            if (!Recognition) {
                report(
                    VOICE_RECOGNITION_STATES.UNSUPPORTED,
                    'Voice recognition is not supported by this browser'
                );
                return false;
            }

            enabled = true;
            const expectedGeneration = ++generation;
            report(
                VOICE_RECOGNITION_STATES.PREPARING,
                'Preparing voice recognition'
            );

            const ready = await selectRecognitionMode(expectedGeneration);

            if (!ready || !enabled || generation !== expectedGeneration) {
                return false;
            }

            return startRecognitionSession();
        },

        stop() {
            enabled = false;
            generation++;
            clearRestart();

            const activeRecognition = recognition;
            recognition = null;

            if (activeRecognition) {
                activeRecognition.onend = null;
                activeRecognition.onerror = null;

                try {
                    activeRecognition.abort();
                }
                catch {
                    // The browser may already have ended the session.
                }
            }

            report(
                VOICE_RECOGNITION_STATES.OFF,
                'Voice recognition off'
            );
        }
    };
}

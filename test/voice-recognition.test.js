import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS } from '../js/command-controller.js';
import {
    VOICE_RECOGNITION_STATES,
    createVoiceRecognitionEngine,
    getSpeechRecognitionConstructor,
    matchVoiceCommand,
    normalizeVoicePhrase
} from '../js/voice-recognition.js';

function makeRecognitionClass({
    availability = 'available',
    supportsLocal = true
} = {}) {
    class MockRecognition {
        static instances = [];

        static async available() {
            return availability;
        }

        constructor() {
            if (supportsLocal) {
                this.processLocally = false;
            }

            this.started = false;
            this.aborted = false;
            MockRecognition.instances.push(this);
        }

        start() {
            this.started = true;
            this.onstart?.();
        }

        abort() {
            this.aborted = true;
        }
    }

    if (!supportsLocal) {
        delete MockRecognition.available;
    }

    return MockRecognition;
}

test('normalizes only the four exact approved command phrases', () => {
    assert.equal(normalizeVoicePhrase('  nova   start. '), 'NOVA START');
    assert.equal(matchVoiceCommand('nova start').command, COMMANDS.START);
    assert.equal(matchVoiceCommand('NOVA STOP!').command, COMMANDS.STOP);
    assert.equal(matchVoiceCommand('nova pause').command, COMMANDS.PAUSE);
    assert.equal(matchVoiceCommand('nova resume').command, COMMANDS.RESUME);
    assert.equal(matchVoiceCommand('start').command, null);
    assert.equal(matchVoiceCommand('nova start now').command, null);
});

test('detects standard, prefixed, and unsupported browser APIs', () => {
    class Standard {}
    class Prefixed {}

    assert.equal(
        getSpeechRecognitionConstructor({ SpeechRecognition: Standard }),
        Standard
    );
    assert.equal(
        getSpeechRecognitionConstructor({ webkitSpeechRecognition: Prefixed }),
        Prefixed
    );
    assert.equal(getSpeechRecognitionConstructor({}), null);
});

test('reports unsupported browsers without enabling recognition', async () => {
    const statuses = [];
    const engine = createVoiceRecognitionEngine({
        scope: {},
        onStatus: (status) => statuses.push(status)
    });

    assert.equal(await engine.start(), false);
    assert.equal(engine.isEnabled(), false);
    assert.equal(statuses.at(-1).state, VOICE_RECOGNITION_STATES.UNSUPPORTED);
});

test('prefers an installed on-device language pack', async () => {
    const Recognition = makeRecognitionClass();
    const statuses = [];
    const engine = createVoiceRecognitionEngine({
        scope: { SpeechRecognition: Recognition },
        onStatus: (status) => statuses.push(status)
    });

    assert.equal(await engine.start(), true);

    const active = Recognition.instances.at(-1);
    assert.equal(engine.getMode(), 'local');
    assert.equal(active.processLocally, true);
    assert.equal(active.lang, 'en-US');
    assert.equal(active.continuous, true);
    assert.equal(active.interimResults, false);
    assert.equal(active.maxAlternatives, 1);
    assert.equal(statuses.at(-1).state, VOICE_RECOGNITION_STATES.LISTENING);
});

test('discloses online fallback when local recognition is not ready', async () => {
    const Recognition = makeRecognitionClass({
        availability: 'downloadable'
    });
    const statuses = [];
    const engine = createVoiceRecognitionEngine({
        scope: { SpeechRecognition: Recognition },
        onStatus: (status) => statuses.push(status)
    });

    assert.equal(await engine.start(), true);
    assert.equal(engine.getMode(), 'online-possible');
    assert.equal(Recognition.instances.at(-1).processLocally, false);
    assert.match(statuses.at(-1).message, /online recognition may be used/i);
});

test('ignores interim and unknown speech and deduplicates final commands', async () => {
    const Recognition = makeRecognitionClass();
    const commands = [];
    const transcripts = [];
    let clock = 1000;
    const engine = createVoiceRecognitionEngine({
        scope: { SpeechRecognition: Recognition },
        now: () => clock,
        onCommand: (detail) => commands.push(detail),
        onTranscript: (detail) => transcripts.push(detail)
    });

    await engine.start();
    const active = Recognition.instances.at(-1);

    active.onresult({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: 'nova start' } }]
    });
    active.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'hello nova' } }]
    });
    active.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'nova start', confidence: 0.9 } }]
    });
    active.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'nova start', confidence: 0.8 } }]
    });
    clock += 751;
    active.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'nova start' } }]
    });

    assert.equal(transcripts.length, 4);
    assert.equal(commands.length, 2);
    assert.equal(commands[0].command, COMMANDS.START);
    assert.equal(commands[0].confidence, 0.9);
});

test('restarts after browser end only while enabled', async () => {
    const Recognition = makeRecognitionClass();
    let scheduled = null;
    const engine = createVoiceRecognitionEngine({
        scope: { SpeechRecognition: Recognition },
        setTimer: (callback) => {
            scheduled = callback;
            return 7;
        },
        clearTimer: () => { scheduled = null; }
    });

    await engine.start();
    Recognition.instances.at(-1).onend();
    assert.equal(typeof scheduled, 'function');

    const restart = scheduled;
    scheduled = null;
    restart();
    assert.equal(Recognition.instances.length, 3);

    const active = Recognition.instances.at(-1);
    engine.stop();
    assert.equal(active.aborted, true);
    assert.equal(scheduled, null);
});

test('permission and microphone errors disable recognition safely', async () => {
    for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture']) {
        const Recognition = makeRecognitionClass();
        const statuses = [];
        const engine = createVoiceRecognitionEngine({
            scope: { SpeechRecognition: Recognition },
            onStatus: (status) => statuses.push(status)
        });

        await engine.start();
        Recognition.instances.at(-1).onerror({ error });

        assert.equal(engine.isEnabled(), false);
        assert.equal(statuses.at(-1).state, VOICE_RECOGNITION_STATES.ERROR);
    }
});

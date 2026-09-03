import test from 'node:test';
import assert from 'node:assert/strict';

class FakeRequest {
    constructor(run) {
        queueMicrotask(() => {
            try {
                this.result = run();
                this.onsuccess?.();
            }
            catch (error) {
                this.error = error;
                this.onerror?.();
            }
        });
    }
}

class FakeStore {
    constructor(records, transaction = null) {
        this.records = records;
        this.transaction = transaction;
    }

    put(record) {
        const request = new FakeRequest(() => {
            this.records.set(record.id, structuredClone(record));
            return record.id;
        });

        queueMicrotask(() => {
            queueMicrotask(() => {
                this.transaction?.oncomplete?.();
            });
        });

        return request;
    }

    get(id) {
        return new FakeRequest(() => {
            const record = this.records.get(id);
            return record ? structuredClone(record) : undefined;
        });
    }

    getAll() {
        return new FakeRequest(() =>
            [...this.records.values()].map(record =>
                structuredClone(record)
            )
        );
    }

    delete(id) {
        return new FakeRequest(() => this.records.delete(id));
    }
}

class FakeDatabase {
    constructor() {
        this.stores = new Map();
        this.objectStoreNames = {
            contains: name => this.stores.has(name)
        };
    }

    createObjectStore(name) {
        this.stores.set(name, new Map());
        return new FakeStore(this.stores.get(name));
    }

    transaction(name) {
        if (!this.stores.has(name)) {
            throw new Error(`Missing object store ${name}`);
        }

        const transaction = {};
        transaction.objectStore = () => new FakeStore(
            this.stores.get(name),
            transaction
        );

        return transaction;
    }
}

class FakeIndexedDB {
    constructor() {
        this.database = new FakeDatabase();
        this.opened = false;
    }

    open() {
        const request = {};

        queueMicrotask(() => {
            request.result = this.database;

            if (!this.opened) {
                this.opened = true;
                request.onupgradeneeded?.({
                    target: {
                        result: this.database
                    }
                });
            }

            request.onsuccess?.();
        });

        return request;
    }
}

globalThis.indexedDB = new FakeIndexedDB();

const playlistModule = await import('../js/playlist.js');

test('persists and reloads normalized Track metadata and audio', async () => {
    const audioBlob = new Blob(['audio'], {
        type: 'audio/mpeg'
    });
    Object.defineProperty(audioBlob, 'name', {
        value: 'song.mp3'
    });

    const track = playlistModule.createTrackRecord(audioBlob, 12.5);
    track.metadata.sha256 = 'audio-hash';

    await playlistModule.saveTrack(track);
    const loaded = await playlistModule.getTrack(track.id);

    assert.equal(loaded.id, track.id);
    assert.equal(loaded.schemaVersion, 1);
    assert.equal(loaded.metadata.sha256, 'audio-hash');
    assert.equal(loaded.duration, 12.5);
    assert.equal(loaded.audioBlob.size, audioBlob.size);
});

test('persists MSYNC attachment without losing Track metadata', async () => {
    const tracks = await playlistModule.getAllTracks();
    const original = tracks[0];
    const attachment = {
        formatVersion: 1,
        sourceFilename: 'song.msync',
        sourceText: 'MSYNC_VERSION=1',
        sourceSha256: 'source-hash',
        importedAt: 500,
        parsed: {},
        validation: {
            parserVersion: 1,
            validatedAt: 500,
            acceptedWarnings: []
        }
    };

    await playlistModule.saveTrack(
        playlistModule.attachMsyncToTrack(
            original,
            attachment,
            500
        )
    );

    const loaded = await playlistModule.getTrack(original.id);

    assert.equal(loaded.metadata.sha256, 'audio-hash');
    assert.deepEqual(loaded.metadata.msync, attachment);
});

test('persists playlist membership and ordering by stable Track ID', async () => {
    const tracks = await playlistModule.getAllTracks();
    const firstTrack = tracks[0];
    const secondTrack = {
        ...firstTrack,
        id: 'track-two',
        filename: 'second.mp3',
        displayName: 'second.mp3'
    };

    await playlistModule.saveTrack(secondTrack);

    const playlist = await playlistModule.createPlaylist('Training');
    await playlistModule.addTrackToPlaylist(playlist.id, firstTrack.id);
    await playlistModule.addTrackToPlaylist(playlist.id, secondTrack.id);
    await playlistModule.moveTrackInPlaylist(
        playlist.id,
        secondTrack.id,
        -1
    );

    const loaded = await playlistModule.getPlaylist(playlist.id);
    const orderedTracks = await playlistModule.getPlaylistTracks(playlist.id);

    assert.deepEqual(loaded.trackIds, [secondTrack.id, firstTrack.id]);
    assert.deepEqual(
        orderedTracks.map(track => track.id),
        [secondTrack.id, firstTrack.id]
    );
});

test('removing MSYNC persists without deleting Track audio or hash', async () => {
    const tracks = await playlistModule.getAllTracks();
    const track = tracks.find(item => item.id !== 'track-two');

    await playlistModule.saveTrack(
        playlistModule.removeMsyncFromTrack(track, 700)
    );

    const loaded = await playlistModule.getTrack(track.id);

    assert.equal(loaded.metadata.msync, undefined);
    assert.equal(loaded.metadata.sha256, 'audio-hash');
    assert.ok(loaded.audioBlob);
});

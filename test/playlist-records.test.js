import test from 'node:test';
import assert from 'node:assert/strict';

import {
    attachMsyncToTrack,
    normalizePlaylistRecord,
    normalizeTrackRecord,
    removeMsyncFromTrack
} from '../js/playlist.js';

test('normalizes a legacy Track without changing identity or metadata', () => {
    const track = {
        id: 'track-1',
        filename: 'song.mp3',
        createdAt: 100,
        metadata: {
            sha256: 'audio-hash',
            future: true
        }
    };

    const normalized = normalizeTrackRecord(track, 999);

    assert.equal(normalized.id, 'track-1');
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.updatedAt, 100);
    assert.deepEqual(normalized.metadata, track.metadata);
});

test('normalizes a legacy Playlist and clones ordered Track IDs', () => {
    const playlist = {
        id: 'playlist-1',
        name: 'Training',
        trackIds: ['track-2', 'track-1'],
        createdAt: 200
    };

    const normalized = normalizePlaylistRecord(playlist, 999);

    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.updatedAt, 200);
    assert.deepEqual(normalized.trackIds, ['track-2', 'track-1']);
    assert.notEqual(normalized.trackIds, playlist.trackIds);
    assert.deepEqual(normalized.metadata, {});
});

test('future record schema versions are not normalized for overwrite', () => {
    assert.throws(
        () => normalizeTrackRecord({ schemaVersion: 2 }),
        /newer Nova version/
    );
    assert.throws(
        () => normalizePlaylistRecord({ schemaVersion: 2 }),
        /newer Nova version/
    );
});

test('attaches MSYNC without losing other metadata or mutating input', () => {
    const track = {
        id: 'track-1',
        createdAt: 100,
        metadata: {
            sha256: 'audio-hash',
            tags: ['practice']
        }
    };
    const msync = {
        formatVersion: 1,
        sourceFilename: 'song.msync'
    };

    const attached = attachMsyncToTrack(track, msync, 500);

    assert.equal(attached.metadata.sha256, 'audio-hash');
    assert.deepEqual(attached.metadata.tags, ['practice']);
    assert.equal(attached.metadata.msync, msync);
    assert.equal(attached.updatedAt, 500);
    assert.equal(track.metadata.msync, undefined);
});

test('removes only MSYNC metadata', () => {
    const track = {
        id: 'track-1',
        createdAt: 100,
        metadata: {
            sha256: 'audio-hash',
            msync: {
                formatVersion: 1
            }
        }
    };

    const removed = removeMsyncFromTrack(track, 600);

    assert.equal(removed.metadata.msync, undefined);
    assert.equal(removed.metadata.sha256, 'audio-hash');
    assert.equal(removed.updatedAt, 600);
    assert.notEqual(removed.metadata, track.metadata);
});

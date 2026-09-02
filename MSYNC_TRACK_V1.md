# MSYNC Phase 1 — Track Record v1

Status: approved and frozen for MSYNC Phase 1.

## Record shape

```text
Track
├── id             stable internal UUID; immutable
├── filename       original imported filename
├── displayName    user-visible name; editable
├── type           audio MIME type
├── duration       seconds
├── size           bytes
├── audioBlob      persistent playable audio
├── createdAt      creation timestamp in Unix milliseconds
├── updatedAt      last stored update in Unix milliseconds
├── schemaVersion  track-record schema version; currently 1
└── metadata       extensible metadata object
    ├── sha256     audio-content fingerprint
    └── msync      reserved for versioned MSYNC data
```

## Frozen rules

1. `id` is assigned when the track is created and never changes.
2. Renaming a track changes `displayName`, not `id` or `filename`.
3. Playlist membership and playlist order do not belong in a Track record.
4. `audioBlob` contains the persistent playable audio.
5. `metadata.sha256` supports content deduplication but does not replace `id`.
6. `duration` is stored in seconds.
7. Optional and future track features belong under `metadata`.
8. MSYNC owns `metadata.msync`; its versioned internal shape is defined separately.
9. Unknown metadata fields must be preserved whenever a Track is saved.
10. `schemaVersion` is `1` for this record shape.
11. `updatedAt` changes whenever the Track record or its metadata is saved.

## Legacy compatibility

Playlist Manager v1 records created before this contract may not contain
`schemaVersion` or `updatedAt`. `saveTrack()` adds the Track v1 schema version,
normalizes a missing metadata object, and supplies a new update timestamp the
next time such a record is saved. This does not require an IndexedDB version
upgrade and does not change the record's stable `id`.

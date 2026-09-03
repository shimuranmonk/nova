# MSYNC Phase 1 — Playlist Record v1

Status: approved and frozen for MSYNC Phase 1.

## Record shape

```text
Playlist
├── id             stable internal UUID; immutable
├── schemaVersion  playlist-record schema version; currently 1
├── name           user-visible playlist name; editable
├── trackIds       ordered array of stable Track IDs
├── createdAt      creation timestamp in Unix milliseconds
├── updatedAt      last stored update in Unix milliseconds
└── metadata       extensible playlist/session metadata object
```

## Frozen rules

1. `id` is assigned when the Playlist is created and never changes.
2. Renaming a Playlist changes only `name` and `updatedAt`.
3. `trackIds` stores both membership and playback order.
4. Each entry in `trackIds` refers to a stable Track record ID.
5. Reordering tracks changes only the order of `trackIds`.
6. A Playlist does not contain or duplicate audio blobs.
7. Removing a Track ID from a Playlist does not delete the Track record.
8. Deleting a Playlist does not delete its Track records.
9. Optional and future playlist/session features belong under `metadata`.
10. Unknown metadata fields must be preserved whenever a Playlist is saved.
11. Track synchronization cues do not live in Playlist metadata.
12. `schemaVersion` is `1` for this record shape.
13. `updatedAt` changes whenever the Playlist record or its metadata is saved.

## Legacy compatibility

Playlist Manager v1 records created before this contract may not contain
`schemaVersion` or `metadata`. `savePlaylist()` adds the Playlist v1 schema
version, normalizes a missing metadata object, and supplies a new update
timestamp the next time such a record is saved. This does not require an
IndexedDB version upgrade and does not change the Playlist's stable `id` or
its ordered Track IDs.

Note: Drafted in Alapaap.net - Open Mind Open Skies. Sure beats designing on paper.

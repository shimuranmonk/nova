# MSYNC Phase 1 — Closure Record

Status: complete and verified on 2026-09-03.

## Baseline and working branch

The protected working baseline is `feature/music-playlist-manager-v1` at
commit `923cf19`. MSYNC Phase 1 was developed independently on
`feature/msync-phase-1-foundation`.

## Approved architecture

Phase 1 freezes the following contracts:

- `MSYNC_TRACK_V1.md` — stable Track identity and extensible metadata.
- `MSYNC_PLAYLIST_V1.md` — playlists store ordered Track IDs only.
- `MSYNC_OWNERSHIP_V1.md` — optional MSYNC data belongs exclusively to
  `Track.metadata.msync` and is ignored by Music mode.
- `MSYNC_FORMAT_V1.md` — external MSYNC v1 grammar and runtime semantics.
- `MSYNC_VALIDATION_V1.md` — validation, replacement, and error behavior.
- `MSYNC_MIGRATION_V1.md` — lazy record normalization and recoverable custom
  drill UUID migration.
- `MSYNC_V1_EXAMPLE.msync` — canonical external authoring benchmark.

## Implemented foundation

The Phase 1 implementation provides:

1. Track and Playlist record normalization at record schema version 1 while
   keeping IndexedDB `nova_music` at database version 1.
2. Preservation of stable IDs, audio Blobs, ordered playlist relationships,
   unknown record fields, and unknown metadata fields.
3. Pure attachment and removal helpers for `Track.metadata.msync`; removal
   leaves Track audio, identity, other metadata, and playlist references intact.
4. Transaction-completion-based Track and Playlist saves.
5. Immutable UUIDs for saved Custom A/B/C drills.
6. UUID preservation across edit, rename, and bank movement, with new UUIDs for
   new, Save As, CSV-imported, and downloaded custom drills.
7. Recoverable and idempotent migration of legacy custom drills using a verified
   pending value, a retained valid backup, and a completion marker.
8. A copyable failure report if custom-drill UUID migration cannot complete.
9. A visible `Copy MSYNC Reference` action that emits `CUSTOM:<uuid>` for a
   saved custom drill.

## Verification

Automated checks cover legacy normalization, future-schema overwrite blocking,
metadata preservation, IndexedDB persistence, stable Track/Playlist identity,
playlist order, MSYNC attachment/removal, custom UUID migration and rollback,
backup handling, lookup, and diagnostic reporting.

Chrome verification confirmed that the application initializes, existing
controls remain interactive, Music and Playlist Manager behavior remains intact,
custom UUID migration completes without a pending value, and the
`Copy MSYNC Reference` action is present and functional.

## Explicitly deferred to implementation phases

Phase 1 defines but does not yet implement the MSYNC tab, external-file import
UI, parser, validator, audio fingerprint workflow, controller, cue scheduler,
flavor execution, inline drill execution, `REST`, or synchronized playback.
Those components must implement the frozen Phase 1 contracts and must not alter
ordinary Music-tab behavior merely because a Track has MSYNC metadata.

## Conclusion

All prerequisites for beginning the MSYNC parser and import implementation are
present. Phase 1 is formally closed. The next implementation phase may begin
without changing the approved Track, Playlist, ownership, format, validation,
or migration contracts.

Note: Drafted in Alapaap.net - Open Mind Open Skies. Sure beats designing on paper.

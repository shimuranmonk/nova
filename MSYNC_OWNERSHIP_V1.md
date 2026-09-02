# MSYNC Phase 1 — Ownership and Mode Boundary

Status: approved and frozen for MSYNC Phase 1.

## Permanent ownership

Optional song synchronization data is stored at:

```text
Track.metadata.msync
```

The Track owns the stored MSYNC definition because synchronization belongs to
the song rather than to a playlist. A Track may have zero or one active MSYNC
definition.

## Mode boundary

Storing MSYNC on a Track does not activate it. Storage ownership and runtime
behavior are separate concerns.

```text
Music tab
├── plays selected tracks and playlists
├── uses ordinary Track information, including duration
├── ignores Track.metadata.msync completely
└── runs drills without MSYNC scheduling

MSYNC tab
├── loads synchronized tracks and definitions
├── reads and validates Track.metadata.msync
├── executes timed drill cues
└── owns the MSYNC controller and scheduler
```

## Frozen rules

1. `Track.metadata.msync` is the sole permanent home of synchronization data
   attached to a stored Track.
2. A Track without synchronization has no `metadata.msync` property.
3. Every playlist referencing a Track sees the same stored MSYNC definition,
   but playlist playback does not activate it.
4. Playlist renaming, deletion, membership changes, and reordering do not alter
   a Track's MSYNC definition.
5. Track renaming does not alter its MSYNC definition or stable Track ID.
6. Importing an `.msync` file in MSYNC mode attaches it to a selected stable
   Track ID.
7. Exporting produces an `.msync` file from `Track.metadata.msync`.
8. Removing synchronization deletes only `metadata.msync`; it does not delete
   the Track, audio, or playlist references.
9. The Music tab must not inspect, parse, validate, or execute
   `Track.metadata.msync`.
10. A missing or malformed MSYNC definition must not prevent ordinary Music-tab
    playback.
11. Only the MSYNC tab may activate the MSYNC parser, controller, or scheduler.
12. Track duration is ordinary Track information and may be used independently
    by both Music and MSYNC modes.
13. Runtime parsing may create temporary objects, but these are not a second
    permanent source of truth.
14. Every stored MSYNC definition carries its own format version.
15. Unknown future MSYNC fields must be preserved when the Track is saved.

## Implementation boundary

The existing Music-tab playback path must remain unchanged in behavior. Future
MSYNC modules may reuse the low-level audio player, but MSYNC activation must be
explicitly gated by MSYNC mode and must never be inferred merely from the
presence of `metadata.msync`.

# MSYNC Phase 1 — Database and Migration Contract

Status: in progress. Approved migration decisions are recorded here as the
contract is completed step by step.

## IndexedDB version policy

MSYNC Phase 1 keeps the `nova_music` IndexedDB database at `DB_VERSION=1`.
Track and Playlist additions are fields inside existing records and do not
change the `tracks` or `playlists` object-store structures.

The independent versions are:

```text
IndexedDB DB_VERSION    1
Track schemaVersion     1
Playlist schemaVersion  1
MSYNC formatVersion     1
MSYNC parserVersion     1
```

These versions serve different purposes and do not advance together. A future
IndexedDB version increase is reserved for structural changes such as adding or
removing an object store or index or changing a key path. Record fields alone
use their record-level schema versions.

## Legacy Track and Playlist normalization

Nova normalizes legacy Track and Playlist records lazily and non-destructively
rather than rewriting the database during application startup.

On read, a missing record `schemaVersion` becomes 1 in memory and a missing or
invalid `metadata` value becomes an empty object. A Track without `updatedAt`
temporarily uses `createdAt`; if both timestamps are absent, it uses the current
time in memory. Reading alone does not write these defaults back.

The first legitimate save persists the normalized record. MSYNC import or
removal is a Track save; Playlist rename, membership change, or reorder is a
Playlist save. Saves preserve stable IDs, audio Blobs, filenames, relationships,
unknown record fields, and unknown metadata.

Nova reports rather than guesses missing required identity. It does not delete
a Track merely because audio is missing or unplayable. A record declaring a
future unsupported `schemaVersion` is not overwritten; safely understood fields
may remain available for playback while editing is blocked with an upgrade
compatibility message. No bulk record rewrite occurs at startup.

## Immutable custom-drill UUID migration

MSYNC v1 supports built-in drills, saved Custom A/B/C drills, and portable
inline drills. Custom references require a stable identity independent of the
existing editable name and internal key.

On custom-drill load, Nova builds a normalized copy of the complete custom list
in memory. It preserves every name and key and assigns `crypto.randomUUID()` to
each genuine legacy entry without an ID, checking generated values for
uniqueness. It then stores the complete normalized list with one
`localStorage.setItem()` operation. Existing valid UUIDs are preserved and
normalized to lowercase; drill levels and ball data remain under their current
keys and are not moved or renamed.

New custom drills receive an ID at creation. Editing, renaming, and category
moves preserve it. Save As and duplication create a new ID. Deletion removes
the association, and recreating a deleted drill produces a new identity.

A malformed existing ID is reported rather than replaced because MSYNC may
already reference it. Duplicate existing IDs are corruption and block custom
MSYNC resolution. A generated collision is regenerated before storage. If
storage fails, the prior list remains authoritative; built-in and inline MSYNC
remain available while custom references are disabled.

The custom-drill interface provides `Copy MSYNC Reference`, yielding
`CUSTOM:<uuid>` for use in external files. Current CSV export does not preserve
UUIDs, so custom references are installation-local. Deleting and reimporting a
custom drill creates a new identity. `INLINE` remains the portable choice.

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

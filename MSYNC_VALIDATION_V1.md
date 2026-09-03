# MSYNC Phase 1 — Validation and Error Contract

Status: in progress. Approved validation decisions are recorded here as the
contract is completed step by step.

## Validation result levels

MSYNC v1 uses two validation result levels:

```text
ERROR     blocks attachment and execution
WARNING   permits attachment after informing the user
```

Errors include unsupported versions, malformed syntax or sections, missing
required audio identity, audio hash mismatch, duration mismatch beyond the
approved tolerance, missing or malformed drills, invalid flavor values,
undefined names, cues outside the declared duration, and invalid cue order.

Warnings include a filename difference when the audio hash matches and unused
drill, flavor, or inline definitions. Omitted `STOP`, `[INFO]`, and `[SESSION]`
are allowed and may be reported informationally without blocking attachment.

Nova never silently repairs an error or warning. Successful validation reports
the cue, drill, inline-drill, and flavor counts, session duration, and warning
count. A file containing warnings but no errors is valid.

## Atomic import and replacement

Nova validates the selected Track and external MSYNC source completely in
memory before changing IndexedDB. Validation covers the source structure,
syntax, fields, definitions, cues, references, value combinations, source-text
SHA-256, Track audio SHA-256, filename, and duration. The complete parsed
representation is also built in memory.

Until all errors are cleared, IndexedDB remains unchanged. If the Track already
has an attachment, Nova presents the valid new summary and asks for replacement
confirmation. Cancelling leaves the prior attachment intact.

On confirmation, Nova writes one complete updated Track record with a single
IndexedDB `put()` transaction. It includes any required legacy audio-hash
backfill, the complete new `metadata.msync` envelope, and a new Track
`updatedAt`. Success is reported only after the transaction completes. A
transaction failure leaves the previously stored Track and attachment intact.

An import never creates partial parsed data, partially replaces an attachment,
or deletes the previous attachment before the replacement succeeds. It never
modifies or deletes the selected source file, audio, playlists, drills, or
Music-tab behavior.

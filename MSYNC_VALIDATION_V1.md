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

## Validation issue format

Each issue contains a severity, stable code, one-based source line when
applicable, section, and plain-language message. `expected` and `found` values
are included when useful. Section errors point to the section header;
cross-reference errors point to the broken reference; audio comparison errors
point to the relevant `[AUDIO]` field. Import-level problems without a source
line use section `IMPORT` and no line number.

The main UI begins with a summary such as `MSYNC file not attached — 3 errors
and 1 warning were found`, followed by issues in source-line order. Errors sort
before warnings on the same line. Stable codes support tests and diagnostics
but plain language remains primary.

Nova collects independent issues rather than stopping at the first error. It
stops after 100 reported issues and asks the author to correct and validate
again. Users can copy the complete validation report for their external editor.
Raw exceptions and stack traces remain diagnostic logs rather than primary UI,
and reports never expose the stored audio Blob.

## Warning confirmation

A file with warnings but no errors is valid but is not attached automatically.
Nova displays every warning and requires one explicit `Attach anyway` action.
Errors never offer this action.

If the Track already has an attachment, a single combined confirmation states
that the valid file has warnings and will replace the existing attachment. The
action is labeled `Replace anyway`. Cancelling leaves the old attachment
unchanged.

One confirmation covers the complete warning set from that validation run. A
change to the source file or selected Track invalidates the confirmation and
requires revalidation. Warning acceptance is not written into the external
source. Warnings are recalculated later; unchanged accepted warnings do not
prompt on every Start, while newly discovered warnings are shown before Start.
Errors discovered during revalidation always block Start. The Music tab never
displays MSYNC warnings.

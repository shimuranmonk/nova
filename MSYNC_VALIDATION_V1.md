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

# MSYNC Phase 1 — Format v1 Decisions

Status: in progress. This document records approved format decisions as the
MSYNC v1 structure is frozen step by step.

## Top-level file structure

An MSYNC v1 file uses these top-level elements:

```text
MSYNC_VERSION=1

[INFO]
[AUDIO]
[SESSION]
[DRILLS]
[FLAVOR:name]
[INLINE:name]
[CUES]
```

Requirements:

```text
MSYNC_VERSION=1   required; exactly once and before all sections
[INFO]            optional; at most once
[AUDIO]           required; exactly once
[SESSION]         optional; at most once
[DRILLS]          optional; at most once
[FLAVOR:name]     optional; repeatable with a unique name
[INLINE:name]     optional; repeatable with a unique name
[CUES]            required; exactly once
```

`[DRILLS]` assigns readable aliases to drills that already exist in Nova.
`[INLINE:name]` defines a complete, portable drill inside the MSYNC file.
MSYNC v1 supports both forms. Unknown sections, duplicate singleton sections,
and duplicate flavor or inline names are validation errors.

## Stored MSYNC envelope

A validated external file is attached to a Track at `Track.metadata.msync` in
this form:

```text
Track.metadata.msync
├── formatVersion
├── sourceFilename
├── sourceText
├── sourceSha256
├── importedAt
└── parsed
    ├── info
    ├── audio
    ├── session
    ├── drills
    ├── flavors
    ├── inline
    └── cues
```

Rules:

1. Only successfully validated MSYNC files are stored.
2. `sourceText` is the exact imported file and remains authoritative.
3. `parsed` is a validated execution cache derived from `sourceText`.
4. Nova does not silently edit `sourceText`.
5. Nova may rebuild `parsed` from `sourceText` when the parser changes.
6. `sourceSha256` fingerprints the MSYNC source text and confirms which source
   produced the parsed cache.
7. The audio fingerprint is separate from `sourceSha256` and belongs inside
   `parsed.audio`.
8. The external file does not contain Nova's local Track ID. The user chooses
   the target Track during import.
9. Replacing an attachment replaces the complete `metadata.msync` object only
   after the new file validates successfully.

## Authoring boundary

MSYNC files are authored outside Nova and imported from the phone's file
storage. Nova v1 consumes, validates, attaches, and executes `.msync` files; it
does not create or edit them.

## Flavor parameter names

Flavor variables use Nova's published ball-parameter vocabulary and direct Nova
values:

```text
FLV_TYPE     top or back
FLV_SPEED    0 to 10; step 0.5
FLV_SPIN     0 to 10; step 0.5
FLV_HEIGHT   -50 to 100; step 1
FLV_DROP     -10 (right) to 10 (left); step 0.5
FLV_BPM      30 to 90; step 1
FLV_REPS     1 to 200; step 1
```

An omitted flavor variable leaves the original drill parameter unchanged.
Flavor values are absolute Nova values, not percentages or multipliers.

## Active drill behavior

A `DRILL` or `INLINE` cue selects the active drill. The active drill repeats
until another `DRILL`, another `INLINE`, or `STOP` is reached. `FLV_REPS`
controls repetitions within each drill cycle; it does not limit the number of
cycles.

## REST command

Syntax:

```text
REST=<seconds>
```

Examples:

```text
00:45.000 REST=2
01:30.000 REST=2.5
```

Frozen behavior:

1. `REST` temporarily stops the robot from firing balls.
2. Music continues playing during the rest.
3. The MSYNC timeline and cue processing continue during the rest.
4. The duration is expressed in seconds and must be greater than zero.
5. When the rest ends, the currently selected drill resumes automatically.
6. A `DRILL` or `INLINE` cue received during a rest updates the selected drill,
   but firing waits until the rest ends.
7. `STOP` received during a rest ends the session and cancels the pending
   resumption.

Command meanings remain distinct:

```text
REST    stop robot balls temporarily; music and timeline continue
PAUSE   pause the complete MSYNC session, including music and timeline
STOP    end the MSYNC session
```

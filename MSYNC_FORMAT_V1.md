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
[FLAVOR:FLV_NAME]
[INLINE:INL_NAME]
[CUES]
```

Requirements:

```text
MSYNC_VERSION=1   required; exactly once and before all sections
[INFO]            optional; at most once
[AUDIO]           required; exactly once
[SESSION]         optional; at most once
[DRILLS]          optional; at most once
[FLAVOR:FLV_NAME] optional; repeatable with a unique name
[INLINE:INL_NAME] optional; repeatable with a unique name
[CUES]            required; exactly once
```

`[DRILLS]` assigns readable aliases to drills that already exist in Nova.
`[INLINE:INL_NAME]` defines a complete, portable drill inside the MSYNC file.
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

## Portable audio identification

The external file identifies its intended audio in the `[AUDIO]` section:

```text
[AUDIO]
FILENAME=eye-of-the-trainer.mp3
SHA256=8fd41e9802b5c417b45a91c90a12cdb074377d4f6a9c4d1e753624cbb3892601
DURATION=03:20.000
```

The external file never contains Nova's local Track UUID. During import, the
user explicitly selects the target Track and Nova compares its stored audio
information with `[AUDIO]`.

Identification roles:

```text
SHA256       primary portable audio-content identity
FILENAME     human-readable label
DURATION     additional compatibility check
Track.id     local attachment target selected by the user
```

A matching audio SHA-256 identifies the same audio content even when the file
or Track has been renamed. A filename difference is therefore a warning rather
than a rejection when the hashes match. A hash difference means the audio
contents differ. Renaming a Track after attachment does not affect its MSYNC
data.

## Mandatory audio fingerprint

`SHA256` is required in every MSYNC v1 `[AUDIO]` section.

Rules:

1. `SHA256` contains exactly 64 hexadecimal characters.
2. Uppercase and lowercase hexadecimal are equivalent.
3. Nova compares it with `Track.metadata.sha256` during import.
4. A matching hash permits attachment, subject to all other validation.
5. A mismatch blocks attachment and reports that the MSYNC file targets a
   different audio version.
6. Nova does not provide a silent hash-mismatch override.
7. When a legacy Track has no stored hash, Nova computes the audio hash,
   updates the Track metadata, and then performs the comparison.
8. The MSYNC tab provides a way to view or copy a selected Track's audio hash
   for external authoring.
9. This value fingerprints the audio bytes. It is distinct from
   `Track.metadata.msync.sourceSha256`, which fingerprints the MSYNC source
   text.

## Mandatory audio duration

`DURATION` is required in every MSYNC v1 `[AUDIO]` section.

Syntax:

```text
DURATION=MM:SS.mmm
```

Rules:

1. Minutes contain at least two digits and may exceed 59.
2. Seconds range from `00` through `59`.
3. Milliseconds contain exactly three digits.
4. The duration must be greater than zero.
5. Nova compares it with the selected Track's measured duration.
6. A difference of at most 0.500 seconds is accepted to accommodate browser
   and encoder timing differences.
7. A larger difference blocks attachment and reports both durations.
8. Every cue timestamp must fall between zero and the declared duration.
9. A `REST` period cannot cause robot activity beyond the audio duration.
10. The Track's measured duration is the runtime authority for the actual end
    of playback.
11. The declared duration is the authoring and cue-validation boundary.

## Existing drill references

MSYNC v1 may reference both built-in and custom Nova drills.

```text
[DRILLS]
DRL_WARMUP=BUILTIN:push(b);LEVEL=1
DRL_ATTACK=BUILTIN:loop(f)-drive(b);LEVEL=2
DRL_MY_SERVE=CUSTOM:550e8400-e29b-41d4-a716-446655440000;LEVEL=1
```

The name on the left is a unique, readable alias used by cues. `BUILTIN:` is
followed by an exact Nova built-in drill key. `CUSTOM:` is followed by an
immutable custom-drill UUID. `LEVEL` is required and accepts 1, 2, or 3; the
Drill tab's current level does not affect MSYNC.

Nova's current custom-drill keys contain editable names and may change during
rename, so they cannot serve as MSYNC identity. Every custom drill receives a
separate immutable UUID. Existing custom drills without one are assigned a UUID
once and saved. Renaming changes the display name and current internal key but
never this ID.

A custom reference is local unless the same custom drill and UUID are imported
on another installation. Fully portable downloaded files should use
`[INLINE:INL_NAME]`. Missing, deleted, malformed, or empty drill-level references
fail the existing strict validation rules.

Drill aliases use `DRL_` followed by a name beginning with an uppercase letter
and containing only uppercase letters, digits, and underscores. Total length is
at most 40 characters. `DRL_` alone is invalid. Built-in references use the
exact form `DRL_NAME=BUILTIN:key;LEVEL=n`; custom references use
`DRL_NAME=CUSTOM:uuid;LEVEL=n`. `LEVEL` is required and is 1, 2, or 3.
Aliases are case-sensitive and unique within `[DRILLS]`. Undefined cue aliases
are errors; unused definitions produce warnings.

## Inline drill syntax

An inline drill defines a complete portable drill using Nova's published ball
parameters:

```text
[INLINE:INL_SHORT_BACKSPIN]
NAME=Short Backspin Pattern
RANDOM=false

BALL=1;SPEED=5;SPIN=6;TYPE=back;HEIGHT=20;DROP=-4;BPM=45;REPS=2
BALL=2;SPEED=7;SPIN=4;TYPE=top;HEIGHT=45;DROP=4;BPM=55;REPS=1
```

Rules:

1. The section name is the unique alias used by `INLINE` cues.
2. `NAME` is required and human-readable.
3. `RANDOM` is optional and defaults to `false`.
4. At least one `BALL` line is required.
5. Every `BALL` line contains a ball number plus `SPEED`, `SPIN`, `TYPE`,
   `HEIGHT`, `DROP`, `BPM`, and `REPS`.
6. Parameter names, values, ranges, and increments match Nova's published
   technical parameters.
7. Named fields after the ball number may appear in any order.
8. Unknown fields and fields repeated on the same line are validation errors.
9. Ball numbers begin at 1, are consecutive, and execute in ascending order.
10. Repeating a Ball number defines alternative balls for that numbered step;
    Nova randomly selects one alternative whenever it executes that step.
11. `RANDOM=true` shuffles the numbered step order. This is independent of
    alternative balls that share a number.
12. An activated inline drill repeats until replaced or stopped, like a
    referenced built-in drill.
13. A flavor may override the active inline drill.
14. `SCATTER` and `ACTIVE` are excluded from MSYNC v1 inline drills because
    they are not part of the selected published parameter set.

## Flavor application and scope

A flavor applies uniformly to every ball and every alternative in the
currently active drill. Present flavor variables replace their corresponding
parameters with direct Nova values; omitted variables preserve each ball's
original value.

Flavor scope is limited to one drill activation:

1. `DRILL` or `INLINE` activates a fresh, unmodified execution copy.
2. `FLAVOR` applies to that currently active execution copy.
3. The flavor remains effective while that drill repeats.
4. The next `DRILL` or `INLINE` cue clears the current flavor.
5. A flavor does not automatically carry into the next drill.
6. `REST` does not clear the flavor because the same drill resumes afterward.
7. The original built-in or inline definition is never modified.
8. When `DRILL` or `INLINE` and `FLAVOR` share a timestamp, cues are processed
   in file order; the drill-selection cue must appear first.

Example:

```text
00:15.000 DRILL=DRL_WARMUP
00:15.000 FLAVOR=FLV_FASTER
00:45.000 DRILL=DRL_ATTACK
```

`FLV_FASTER` affects `DRL_WARMUP` only. `DRL_ATTACK` begins with its original parameters
unless another `FLAVOR` cue follows its activation.

## INFO section

`[INFO]` is optional and purely descriptive:

```text
[INFO]
TITLE=Eye of the Trainer
AUTHOR=Captain
DESCRIPTION=Warmup, attack, recovery, and finishing sequence.
```

Fields:

```text
TITLE         required when [INFO] exists; maximum 100 characters
AUTHOR        optional; maximum 100 characters
DESCRIPTION   optional; maximum 500 characters
```

Rules:

1. If `[INFO]` is absent, Nova displays the selected Track's `displayName`.
2. Omitted optional fields produce no placeholder author or description.
3. Each value occupies one line and is stored and displayed as UTF-8 text.
4. Surrounding whitespace is removed and empty values are invalid.
5. Duplicate and unknown `[INFO]` fields are validation errors.
6. Only the first `=` separates the field name from its value, so later `=`
   characters belong to the value.
7. These fields never affect robot, audio, or scheduler behavior.

## SESSION section

`[SESSION]` is optional and supports two MVP controls:

```text
[SESSION]
COUNTDOWN=4
CYCLE_PAUSE=1
```

`COUNTDOWN` is the number of whole seconds before music and the cue timeline
start together. It ranges from 0 through 10 and defaults to 4. The countdown
occurs before timeline position `00:00.000`; zero starts immediately.

`CYCLE_PAUSE` is the delay in seconds after one complete drill cycle before the
active drill repeats. It ranges from 0 through 10, accepts up to three decimal
places, and defaults to 1. It does not insert delays between individual balls.

Rules:

1. A cue selecting a new drill changes the active drill at its scheduled time
   rather than waiting for `CYCLE_PAUSE`.
2. `REST` remains timeline-controlled and independently suspends robot firing.
3. Both fields affect MSYNC mode only.
4. Duplicate, unknown, out-of-range, or incorrectly formatted fields are
   validation errors.
5. Audio completion, missing drills, playback failure, and disconnection retain
   their fixed safety behavior and are not configurable in v1.

## AUDIO section

`[AUDIO]` is required and contains exactly three required fields:

```text
[AUDIO]
FILENAME=eye-of-the-trainer.mp3
SHA256=8fd41e9802b5c417b45a91c90a12cdb074377d4f6a9c4d1e753624cbb3892601
DURATION=03:20.000
```

`FILENAME` is the human-readable intended audio filename, `SHA256` is the exact
audio-content identity, and `DURATION` is the authored timeline duration.

Filename rules:

1. The value is a filename with an extension, not a folder path.
2. Its maximum length is 255 characters.
3. Surrounding whitespace is removed and an empty value is invalid.
4. Windows, Unix, and relative folder paths are invalid.
5. Filename comparison is case-insensitive.
6. When SHA-256 matches but the selected Track filename differs, Nova allows
   attachment with a warning because audio files may be renamed.
7. A hash mismatch rejects attachment regardless of the filename.

The existing mandatory SHA-256 and duration rules apply. Fields may appear in
any order. Duplicate and unknown `[AUDIO]` fields are validation errors.

## No ball-specific flavors in v1

MSYNC v1 flavors do not support ball-specific overrides. Every supplied
`FLV_` value applies uniformly to every ball and alternative in the current
drill. When individual balls require different values, the author defines an
`INLINE` drill containing the complete pattern.

This preserves the distinction:

```text
FLAVOR   uniform direct-value overrides for the current drill
INLINE   ball-specific parameters and complete choreography
```

## Completed ball-specific flavor review

The end-of-list review reconfirmed that MSYNC v1 excludes ball-specific flavor
overrides. Uniform flavors plus inline drills cover the intended MVP sessions.
A flavor remains effective across ordinary cues such as `REST`, but the next
`DRILL` or `INLINE` activation clears it. The newly activated drill never
inherits the previous drill's flavor.

## Simultaneous cue ordering

Cues with the same timestamp execute from top to bottom in file order.

Rules for one timestamp:

1. At most one drill-selection command (`DRILL` or `INLINE`) is allowed.
2. At most one `FLAVOR` command is allowed.
3. At most one `REST` command is allowed.
4. A drill-selection command must appear before the `FLAVOR` intended for it.
5. `STOP` must be the only command at its timestamp.
6. Duplicate and contradictory commands are validation errors.
7. When combined, commands use this order:

```text
DRILL or INLINE
FLAVOR
REST
```

Example:

```text
01:30.000 INLINE=INL_SHORT_BACKSPIN
01:30.000 FLAVOR=FLV_INTENSE
01:30.000 REST=2
```

Nova prepares the flavored inline drill, keeps robot firing suspended for two
seconds while music and cue processing continue, and then starts that drill.

## Optional STOP cue

`STOP` is optional. If it is absent, the actual end of audio terminates the
MSYNC session.

Rules:

1. `STOP` may occur before the declared audio duration to end a session early.
2. `STOP` immediately stops robot firing and music playback.
3. `STOP` cancels pending rests, drill resumptions, and future cues.
4. No cue may appear after `STOP`.
5. `STOP` is alone at its timestamp.
6. At most one `STOP` is allowed in a file.
7. The actual end of audio always stops robot activity, with or without a
   `STOP` cue.
8. A playback error also safely stops the robot and ends the session.
9. Manual Stop in the MSYNC tab has the same terminal behavior.
10. `STOP` terminates the entire synchronized session; it does not merely stop
    the current drill.

## Natural audio completion

When audio reaches its actual end without an explicit `STOP`, Nova:

1. Sends the robot's normal stop command immediately.
2. Stops the cue scheduler.
3. Prevents another drill cycle from starting.
4. Cancels pending rests and drill resumptions.
5. Discards future cues.
6. Clears the active drill and flavor runtime state.
7. Marks the session as completed rather than failed.
8. Returns the MSYNC tab to its ready state.
9. Retains the imported MSYNC attachment on the Track.
10. Starts any future replay from timestamp zero with no retained runtime
    state.
11. Reports a missing robot stop acknowledgement as a connection problem while
    still closing the local MSYNC session.

Explicit `STOP`, manual Stop, playback failure, and Bluetooth disconnection use
the same safety cleanup. Only the displayed completion reason differs.

## Missing built-in drill behavior

Nova strictly validates every `[DRILLS]` reference before attachment and again
before starting a session.

Rules:

1. Every referenced value must match an installed built-in drill key.
2. The resolved drill must contain valid executable ball data.
3. A missing or malformed drill blocks attachment during import.
4. Nova reports the source line, readable alias, and missing drill key.
5. Nova does not skip, substitute, or resolve a drill by a similar display
   name.
6. A stored attachment is revalidated before every session in case the
   installed drill library has changed.
7. If a required drill is unavailable at Start, Start is blocked.
8. If a drill becomes unavailable unexpectedly during an active session, Nova
   stops the robot and music and ends the session with an error.
9. Inline drills validate from their contained definitions and do not depend
   on the installed built-in drill library.

## Comments and blank lines

MSYNC v1 supports full-line `#` comments.

Rules:

1. A comment begins when the first non-space character on a line is `#`.
2. The complete comment line is ignored by the parser.
3. Indented comments and blank lines are allowed.
4. Inline comments are not allowed; content after a value is not silently
   discarded.
5. Semicolons are field separators in inline `BALL` definitions and are not
   comment markers.
6. Comments remain unchanged in `sourceText` and are absent from parsed
   execution data.
7. Comments may appear before the version declaration, between sections, and
   inside sections.
8. `MSYNC_VERSION=1` is the first non-comment, nonblank line.

## Cue timestamp format

Every cue timestamp uses exactly:

```text
MM:SS.mmm
```

Rules:

1. Minutes contain at least two digits and may exceed 59.
2. Seconds contain exactly two digits from `00` through `59`.
3. Milliseconds contain exactly three digits.
4. `00:00.000` is valid.
5. Raw seconds and abbreviated timestamps are invalid.
6. A cue timestamp cannot exceed `[AUDIO].DURATION`.
7. Cue lines are ordered chronologically.
8. Equal timestamps are allowed and follow the approved top-to-bottom ordering
   rules.
9. Nova converts timestamps to integer milliseconds for comparison and
   scheduling.
10. The MSYNC tab displays positions using the same notation.
11. `REST` values remain durations in seconds and may include a fractional
    part, for example `01:05.250 REST=2.5`.

## CUES command grammar

`[CUES]` supports exactly five file commands:

```text
DRILL=DRL_NAME
INLINE=INL_NAME
FLAVOR=FLV_NAME
FLAVOR=NONE
REST=seconds
STOP
```

Each line begins with an approved cue timestamp followed by one or more spaces
and exactly one uppercase, case-sensitive command. Cue lines are valid only in
`[CUES]`, are chronological, and contain no trailing content. The section must
contain at least one `DRILL` or `INLINE` activation.

`DRILL` resolves a defined `DRL_` alias and `INLINE` resolves a defined `INL_`
name. Either activates a fresh unflavored execution copy and clears the prior
drill and flavor.

`FLAVOR` resolves a defined `FLV_` name and requires an active drill from an
earlier cue or an earlier line at the same timestamp. It rebuilds from the
original active drill and applies the selected flavor. `FLAVOR=NONE` restores
the active drill's original parameters; `NONE` is reserved and cannot be a
flavor name.

`REST` accepts a duration greater than zero and no greater than 600 seconds,
with at most three decimal places. Its end cannot exceed `[AUDIO].DURATION`.
Music and cue processing continue while robot firing is suspended, after which
the then-current drill and flavor resume.

`STOP` has no `=` or value, occurs at most once and alone at its timestamp, and
has no following cues. It terminates music, robot activity, scheduler, and
session under the approved cleanup rules.

`PAUSE` is an MSYNC-tab user control rather than a scheduled file command.
`MODIFY` is excluded from v1; parameter changes use named flavors. Unknown
commands, undefined names, malformed values, and misplaced commands are
validation errors. Unused definitions produce warnings.

## Initial session behavior

An MSYNC session begins with no active drill, flavor, or rest and with the robot
stopped. The first `DRILL` or `INLINE` cue may occur at `00:00.000` or later.

Before the first activation cue, music and the timeline run normally while the
robot remains idle. This permits intentional musical introductions without
robot activity. Nova never selects an implicit or default drill.

A `FLAVOR` cue before the first activation is invalid. A `REST` cue before the
first activation is also invalid because the robot is already idle. `[CUES]`
still contains at least one valid activation. The configured countdown occurs
before timestamp zero and consumes none of the audio. Cues at `00:00.000` are
processed as synchronized playback begins.

## Cue-time drill transitions

MSYNC uses hard transitions. At a `DRILL` or `INLINE` cue, Nova cancels pending
repeat work, sends the robot stop command, discards the remainder of the active
cycle, clears the prior flavor, prepares the new unflavored drill, and sends it
as soon as the robot is ready. Music and the timeline continue throughout.

`FLAVOR` and `FLAVOR=NONE` also interrupt the current execution, rebuild the
original active drill with the selected flavor or original parameters, and
restart it. `REST` interrupts immediately and keeps the robot stopped for its
timeline duration.

Cue timing remains anchored to the audio clock, so transition delay never
accumulates. Nova stops before sending replacement drill data. If another
activation becomes due while an older transition is pending, the newest
scheduled state wins and stale sends are cancelled. Failure to stop or replace
safely terminates the complete session with an error.

Actual robot and Bluetooth stop/start latency must be measured before timing
compensation is implemented. Until then, a cue timestamp means begin the
transition at that audio time; it does not claim that the first physical ball
exits at that exact millisecond.

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

Flavor sections use names beginning with `FLV_`:

```text
[FLAVOR:FLV_INTENSE]
FLV_TYPE=top
FLV_SPEED=8
FLV_SPIN=6
FLV_HEIGHT=45
FLV_DROP=2
FLV_BPM=74
FLV_REPS=2
```

After `FLV_`, the name begins with an uppercase letter and contains only
uppercase letters, digits, and underscores. Total length is at most 40
characters. `FLV_` alone is invalid, and names are case-sensitive and unique.

Every parameter is optional, but a flavor contains at least one. Each may
appear at most once, and order does not matter. Numeric values must follow the
documented ranges and increments exactly; Nova neither rounds nor clamps them.
`FLV_TYPE` is lowercase `top` or `back`. Unknown and duplicate variables are
validation errors.

Nova validates the resulting Speed/Spin combination for every affected ball
because maximum legal Spin depends on Speed. If a flavor would make any ball
invalid, validation reports the flavor, drill, level, and ball rather than
silently reducing Spin. Undefined cue references are errors; unused flavors
produce warnings.

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

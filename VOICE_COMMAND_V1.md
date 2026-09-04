# Nova Drill Controller PLUS — Voice Command V1 Contract

Status: Approved and frozen  
Scope: Voice Command V1 behavior contract  
Branch: `feature/voice-command-control`

## 1. Voice Start Ready

Nova provides one global `Voice Start Ready` switch.

- It is off by default after every page load.
- Turning it on starts voice-command listening and changes a drill tap from immediate start to selection.
- Turning it off stops voice-command listening, clears the armed drill or MSYNC target, and restores the existing immediate-start behavior.
- Existing touch controls remain available at all times.
- Voice control never sends commands directly to Bluetooth, music, or MSYNC subsystems. Recognized commands must use the same controller actions as touch controls.

## 2. Selecting and arming a standard drill

This behavior applies to built-in and custom drills in Reps, Time, and Music modes.

When `Voice Start Ready` is off:

- Tapping a drill keeps the existing behavior and starts it immediately.

When `Voice Start Ready` is on:

- Tapping a drill selects and arms it without starting it.
- Only one drill can be armed at a time.
- Tapping another drill replaces the armed drill.
- The armed drill has a clear visual highlight and an `ARMED` indication.
- Arming remembers the drill identity, including whether it is built-in or custom. It does not make a hidden snapshot of the other settings.

## 3. Changing settings after arming

The armed drill remains selected when the operator changes difficulty, mode, repetition count, time, pause settings, playlist, or Quick Music.

`NOVA START` uses the settings currently visible at the moment the command is accepted. This avoids stale hidden settings and eliminates the need to re-arm after every adjustment.

Changing to Music mode does not clear the armed drill. Start is blocked until a saved playlist or Quick Music selection is ready.

The armed drill is cleared when:

- `Voice Start Ready` is turned off;
- the page is reloaded;
- the armed custom drill is deleted or becomes unavailable; or
- the application loses the data required to resolve that drill.

A completed or stopped session does not clear the armed drill. The operator may say `NOVA START` again to repeat it with the current settings.

## 4. NOVA START

For Reps, Time, and Music:

- START is accepted only when Voice Start Ready is on, a drill is armed, no session is active, Bluetooth is connected, and the current mode settings are valid.
- It starts the armed drill through the canonical Nova controller and retains the existing countdown.
- Reps uses the currently displayed repetition count.
- Time uses the currently displayed duration.
- Music uses the currently selected saved playlist or Quick Music.
- START during countdown, running, or paused state is ignored and cannot start a duplicate session.
- START with no armed drill is blocked with a visible reason.
- START with invalid or incomplete settings is blocked with a visible reason.

## 5. NOVA STOP

- STOP has the highest command priority.
- It stops a session during countdown, running, or paused state through the same stop path as the touch Stop control.
- It stops the robot activity and any mode-owned audio according to the existing controller behavior.
- It clears pending countdown and drill timers.
- It does not clear the armed drill, allowing a deliberate restart.
- When no session is active, STOP is a harmless no-op and reports `Nothing to stop`.
- Voice STOP is a convenience control, not a replacement for the visible touch Stop control or physical safety precautions.

## 6. NOVA PAUSE

- PAUSE is accepted only while a session is running.
- It uses an explicit pause operation, never a pause/resume toggle.
- Repeating PAUSE while already paused is a harmless no-op.
- PAUSE during idle or countdown is ignored with a visible reason.
- Mode-specific audio follows the existing pause behavior.

## 7. NOVA RESUME

- RESUME is accepted only while a session is paused.
- It uses an explicit resume operation, never a pause/resume toggle.
- Repeating RESUME while already running is a harmless no-op.
- RESUME during idle or countdown is ignored with a visible reason.
- The session continues through the same controller path used by touch controls.

## 8. Invalid commands and unavailable states

The V1 vocabulary is exact and limited to:

```text
NOVA START
NOVA STOP
NOVA PAUSE
NOVA RESUME
```

- Only final recognition results can request an action.
- Unrecognized speech performs no action.
- Duplicate recognition of the same phrase cannot duplicate an action.
- Every recognized request returns one of: `EXECUTED`, `IGNORED`, or `BLOCKED`, with a short reason where appropriate.
- A recognition, permission, network, or microphone failure cannot disable or change touch controls.
- Loss of Bluetooth while a session is active follows the controller's disconnection handling and prevents further START requests until reconnected.

## 9. MSYNC behavior

MSYNC keeps its own validated session and safety requirements, but uses the same four voice phrases.

To keep V1 simple and prevent voice from choosing between Simulation and Live Robot implicitly:

- Entering the MSYNC tab clears any standard-drill armed selection.
- With Voice Start Ready on, the existing `Start Simulation` and `Start Live Robot` controls become explicit arming controls for their respective targets instead of starting immediately.
- Their labels change to `Arm Simulation` and `Arm Live Robot` while Voice Start Ready is on.
- Arming Live Robot performs the existing live confirmation and readiness checks. Voice cannot bypass them.
- Only one MSYNC target can be armed at a time.
- `NOVA START` starts that armed target only if the attached MSYNC file remains valid and all target requirements remain satisfied.
- `NOVA PAUSE`, `NOVA RESUME`, and `NOVA STOP` call the MSYNC session controller's corresponding operations.
- Leaving the MSYNC tab or turning Voice Start Ready off clears the MSYNC armed target.
- With Voice Start Ready off, both MSYNC start buttons retain their current immediate-start behavior.

## 10. Approved V1 boundaries

Voice Command V1 deliberately excludes:

- free-form speech or aliases;
- spoken drill names, repetition counts, time values, playlist names, or MSYNC names;
- direct Bluetooth or robot-packet control;
- a bundled speech-recognition model;
- music ducking or volume control;
- voice-only confirmation dialogs;
- persistent voice enablement or armed state across reloads; and
- removal or replacement of existing touch controls.

Recognition will be local-first when the browser supports installed on-device recognition. If it does not, Nova may use the browser's normal recognition service and must display that online recognition may be used. Unsupported or denied recognition leaves all non-voice operation unchanged.

## Phase 1 completion gate

Phase 1 is complete only when this behavior contract is approved. Implementation begins in Phase 2 and must preserve these rules unless a later contract revision is explicitly approved.

Note: Drafted in Alapaap.net - Open Mind Open Skies. Sure beats designing on paper.

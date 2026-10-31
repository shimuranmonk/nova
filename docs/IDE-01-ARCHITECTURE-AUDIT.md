# IDE-01: Architecture and baseline audit

## Baseline update for IDE-02 — 2026-10-31

IDE-02 starts from consolidated main `124add3cb21349d958b4d749651b896ee3e969ce`.
This merge has both former main and voice heads as parents and preserves main's
Pages workflow. The voice branch is retained; permanent-track-deletion was
removed after backup. Pre-merge main is preserved remotely at
`backup/main-before-voice-merge-2026-10-31` (937c36d). The combined suite passed
117 tests. Robot feedback and command routing described below as voice-only
now exist on main. Branch reconciliation is complete; physical launch
calibration and transport/session ownership risks remain outstanding.

The original audit below is retained as a historical snapshot. Its branch
inventory and main-versus-voice distinctions describe the pre-merge state.
The IDE-02 implementation and current limitations are in [IDE-02.md](IDE-02.md).

## Original IDE-01 snapshot

Audit date: 2026-10-31 (Asia/Manila). Scope: Module 12 Intelligent Drill
Engineering first; Module 11 MSYNC Authoring remains a separate later consumer.
This is an architecture deliverable, not an implementation of IDE-02–07.

## Verified repository baseline

Remote: https://github.com/shimuranmonk/nova.git. Refreshed with `fetch origin
--prune`; `ls-remote --heads` returned exactly the following three branches.

| Branch | Verified head | Meaning for IDE |
| --- | --- | --- |
| main | `937c36d0d7f147cf10f669b30f818bded2611b66` | Production-source baseline; latest commit 2026-09-14, stop acknowledgement between MSYNC cues |
| feature/voice-command-control | `c12a8cfe09b2f294ccd6309976f60159a0107819` | Latest commit 2026-09-22; voice routing, arming, statistics and MSYNC robot feedback |
| feature/permanent-track-deletion | `c8da4b1c9900f5f35b19b2f62627000542984fa2` | Older alternative baseline; endpoint diff against main lacks later MSYNC changes |

Main and voice have diverged: 14 commits unique to main, 26 unique to voice;
merge base `62ef687c5ca84c33420db1452807f5f5da4de671`. Some fixes have separate
commit identities; counts alone do not establish missing behavior. Endpoint
diff: 28 files, 2,854 insertions / 141 deletions. Voice adds 17 Bluetooth lines
and six MSYNC robot lines, but also removes main's Pages workflow. Do not merge
the entire branch merely to acquire IDE integration hooks. Permanent-deletion
endpoint diff: nine files, 32 insertions / 255 deletions, including removal of
later robot tests and workflow. Track deletion itself exists on main.

The existing `nova-review` checkout was clean on the voice branch. Audit work
uses a separate checkout, `nova-ide-01`, branch
`feature/ide-01-architecture-audit`, created from the verified main head.
Only documentation is changed. No application changes, deployment, merge,
cloud uploads, or robot commands were performed. Synced `sources/` files were
left untouched. Deployment health and open PR state were not verified.

## Executed verification

Node v20.19.2, repository script `node --test`, no dependency installation:

| Baseline | Tests | Result |
| --- | ---: | --- |
| main at 937c36d | 73 | 73 pass, 0 fail, 0 skipped |
| voice at c12a8cf | 117 | 117 pass, 0 fail, 0 skipped |

Initial restricted runs could not read the parent directory (EPERM); reruns
with normal file access passed. Those initial failures were environment
failures, not product regressions. Full output is delivered separately as
`outputs/ide-01-main-tests.txt` and `outputs/ide-01-voice-tests.txt` in the project
workspace. Tests establish software behavior only. Browser rendering, actual
IndexedDB implementation, Bluetooth transport, physical timing, landing
accuracy, and the deployed site were not exercised.

## Current architecture and reusable boundaries

Paths below refer to main unless explicitly marked voice. Function names are
included so findings remain traceable as line numbers change.

| Area | Source / entry points | Observed behavior and reuse boundary |
| --- | --- | --- |
| App composition | `index.html`, `js/main.js` | Static browser ES modules; no build dependencies. Main wires globals and DOM events. Keep new domain code independent of both. `1.3/` is a separate historical application, not the active root app. |
| Drill definitions | `js/constants.js`, `js/state.js:initData` | Built-ins plus user overrides, levels 1–3, per-step alternatives and drill random flag. Keep existing serialized shape behind an adapter. |
| Editor | `js/editor.js:openEditor`, `saveDrillChanges` | Deep-copied draft, global event handlers, speed/spin conversion, variants, shuffle, active state, scatter; direct Bluetooth test-shot paths. Reuse draft/commit lifecycle, avoid importing this DOM module into prediction. |
| Bluetooth | `js/bluetooth.js:connectDevice`, `sendPacket`, `packBall`, `onRobotDone` | GATT discovery, MD5 challenge handshake, serialized writes, six-field binary packing, completion callback. Preserve wire encoding; inject transport into future trial execution. |
| Ordinary runner | `js/runner.js:runIteration`, `handleDone`, `buildPacket` | Filters inactive steps, shuffles, chooses alternatives, samples scatter, packs one cycle; completion/pause drive repeats. Separate from MSYNC scheduling. |
| MSYNC scheduling | `js/msync-session.js:MsyncSessionController` | Audio-position clock, 25 ms poll, separate robot lead dispatch and visible cue positions, countdown, REST, IDLE, pause/resume, STOP. Keep as timing owner. |
| MSYNC robot | `js/msync-robot.js:resolveMsyncExecution`, `chooseMsyncBalls`, `MsyncRobotAdapter` | Flavor overlays on copies, random selection/scatter, 100-cycle persistent batches or one cycle with ONCE, replacement queue and generation cancellation, completion fallback. Reuse resolved execution as validation input. |
| MSYNC ingestion | `js/msync-parser.js`, `msync-validator.js`, `msync-import.js`, `msync-session.js:revalidateMsyncAttachment` | Syntax, exact parameter checks, references, hashes, audio identity, warning receipts, pre-start revalidation. Physical playability should be an additional result, never a replacement for format validation. |
| Drill persistence | `js/state.js`, `js/custom-drill-identity.js` | localStorage: `custom_drills`, `custom_data`, `user_defaults`, `drill_order`, statistics/preferences. Custom UUID migration supports stable `CUSTOM:<uuid>` references across rename. |
| Audio persistence | `js/playlist.js` | IndexedDB `nova_music`, DB version 1, tracks and playlists; `metadata.msync` attachment on Track. Preserve identity, audio Blob and atomic Track updates. |
| Portability | `js/state.js:importCustomDrills`, `exportCustomDrills`; `js/msync-inline-export.js`; `js/cloud.js` | CSV ten-column direct settings; inline preserves alternatives/random/scatter and omits disabled balls; cloud shares params/level/random. None is a calibration container. |
| Voice integration | voice: `command-controller.js`, `drill-arming.js`, `voice-command-router.js`, `msync-voice-controller.js` | Session-state gating and command routing. Future trials need explicit ownership through the command layer; prediction itself must never trigger start/fire. |
| Robot telemetry | voice: `robot-feedback.js`, Bluetooth `onRobotFeedback` | Rejection, state and progress notifications; progress contains totalShots, ballIndex, sequence, cycle. Diagnostic observations do not prove physical launch or landing. Not present on main. |

### Legacy drill model

`currentDrills[key] = {1: steps, 2: steps, 3: steps, random?: boolean}`;
`steps = Array<Array<ball>>` (ordered steps containing alternative balls).

| Index | Field | Compatibility requirement |
| ---: | --- | --- |
| 0, 1 | top and bottom wheel RPM | Raw presets may lack later UI fields; preserve their RPM exactly on read-only prediction |
| 2 | height control | Device control value, not a measured launch angle |
| 3 | drop/placement control | Device control value; format documents negative right / positive left; coordinate viewpoint must be explicit |
| 4 | frequency percent | BPM = 30 + 0.6 × percent |
| 5 | repetitions | Per-ball repetition count, distinct from packet cycle count |
| 6 | active | Missing means active; ordinary runner tests the first alternative to include a step |
| 7, 8, 9 | speed, spin, type | Optional derived UI metadata; top/back only, not measured ball velocity or spin rate |
| 10 | scatter | Optional, defaults to zero; placement spread, not prediction uncertainty |

Built-ins include six-field balls as well as seven-field balls. Preserve
unknown trailing fields, original active/alternative structure and raw values
in adapter round trips. Assign IDE sidecar IDs without changing legacy custom
UUIDs. Reordering/duplication must explicitly move/renew sidecar step/variant
identities; array indexes alone are not stable shot identifiers.

## Verified parameter constraints

| Parameter | Current contract | Caveat |
| --- | --- | --- |
| speed | 0–10, step 0.5 | Dimensionless UI scale |
| spin | 0–10, step 0.5 | Also restricted by `SPIN_LIMITS[speed]` |
| type | `top` or `back` | No sidespin control in this model |
| height | -50–100, step 1 | Packet maps linearly to -20–30; physical units unverified |
| drop | -10–10, step 0.5 | Packet maps to -22–22; physical angle/placement needs measurement |
| BPM | 30–90, step 1 | Converted to percent, then packet frequency 0.5–1.5; do not assume this wire value is seconds per ball |
| reps | 1–200, integer in save/MSYNC | Editor input declares max 100; inconsistency to resolve in a separate tested change |
| active | 0 or 1, missing active | Not transmitted in ball payload |
| scatter | 0–10, step 0.5 | abs(drop) + scatter ≤ 10; not a wire field |
| wheel RPM | 400–7500 | Packers clamp wheels; not proof of achieved RPM |

For speed 0, 0.5, …, 10, max spin respectively is:
`2,3,4,5,6,7,8,9,10,10,9,8,8,7,6,5,4,3,2,1,0`.

Conversion: base = 970 + 630.5 × speed; delta = 342 × spin;
top type uses (base + delta, base - delta), back swaps them. Editor/state
round and clamp RPM. MSYNC conversion rounds first and its packer clamps.
Reverse calculation rounds speed/spin to half steps and is lossy. Example:
speed 0 / spin 2 passes the table but asks for bottom RPM 286 before clamping
to 400. Thus legal UI values can still saturate the wheel mapping.

MSYNC validates exact increments and rejects illegal combinations; editor and
CSV paths clamp or coerce some values instead. HTML constraints are not a
complete data validator, and `packBall` is not finite-value validation.

### Bluetooth packet boundary

Ball payload is 24 bytes, little endian: uint32 top at 0, uint32 bottom at 4,
float32 mapped height at 8, float32 mapped drop at 12, float32 mapped frequency
at 16, uint32 reps at 20. Drill packet is 7 + 24N bytes: opcode 0x81,
uint16 payload length 4 + 24N, byte 1 at offset 3, uint16 cycles at 4,
byte 0 at 6. STOP is `[0x80,1,0,1]`. Service selection uses 0xfeff,
service UUID ending fe00, notify ff02, write ff01 (see constants).

No confirmed hardware maximum balls/packet or fragmentation policy was found
in the packers. The uint16 length field alone bounds representable N to 2730;
this is NOT a supported device capacity. Discover the lower hardware/browser
limit before large generated drills or calibration batches are enabled.

## Findings and risks

| Priority | Finding and evidence | Proposed treatment |
| --- | --- | --- |
| High | No flight integrator, measured launch mapping, calibration store, or inverse target solver found in active JS. RPM mapping is labeled physics in editor. | IDE-02 initially returns explicitly uncalibrated estimates/unknowns; never label legal settings as physically validated. |
| High | Raw RPM → UI → RPM is lossy; editor save recomputes wheel settings from derived fields. CSV lacks active, random, scatter, custom UUIDs and calibration metadata. | Pure read-only adapter, exact raw preservation, separate versioned IDE export; never rewrite drills during prediction. Characterize existing save/export behavior before extraction. |
| High | `sendPacket` catches write rejection and logs it, fulfilling the chain. Caller success can mean failed GATT write. | Transport outcome contract must distinguish queued/written/acknowledged/measured. Fix error propagation separately with queue-recovery tests. |
| High | `createStopAcknowledgementWaiter` logs timeout after 1800 ms but continues replacement; UI calls timeout nonfatal. Completion matching has no command ID. | Preserve baseline in this audit. IDE trial service requires conservative stop confirmation or a blocked/inconclusive trial; test stale DONE, late ACK and disconnect. Do not silently redefine existing MSYNC behavior. |
| High | Editor test-ball/combo sends directly, outside ordinary/MSYNC session ownership. | Before calibration firing, add one execution owner, explicit trial action, cancellation and stop priority; preview stays pure. |
| High | Robot feedback is observational and voice-only; random variants/scatter are selected before a multi-cycle packet. | Record actual selected settings and packet/cycle/repetition provenance; label launch attribution uncertain. Batch repetitions reuse packet choices. No automatic Net/Out attribution from state packets. |
| Medium | Duplicated RPM conversion and packing across editor/state/MSYNC/Bluetooth/export/validator. | Extract under byte-for-byte characterization tests, with separate strict validation and legacy coercion policies. |
| Medium | CSV import deletes existing custom entries from memory before full parse completes, skips some malformed rows, and creates new custom IDs. | IDE storage/import must stage and validate before commit; avoid routing calibration through CSV or assuming references survive reimport. |
| Medium | Legacy localStorage is not transactional across keys; factory reset calls `localStorage.clear()`. Audio DB is separate. | Dedicated versioned IDE IndexedDB database with explicit reset/backup semantics; do not attach measurements to Track records. |
| Medium | Main/voice divergence includes deployment removal; README warning is not evidence of live deployment state. | Base work on main, port required hooks individually with review; preserve Pages workflow. |
| Medium | Existing tests focus on parser, identity, storage abstractions, MSYNC sequencing; no dedicated flight/editor/packet parity suite. | Add domain and browser coverage in the phases below. Passing 73/117 does not establish hardware correctness. |

Physical unknowns include launch point/height, robot pose, wheel-to-ball
velocity/spin transfer, yaw/pitch transfer, wheel slip/aging, ball properties,
drag/Magnus terms, table/net geometry, bounce friction/restitution and actual
launch latency. The provided synced measurement/manual files were inventoried
but not interpreted in this code-baseline audit; no coefficients or physical
claims are derived from their filenames. Their units, conditions and robot
identity must be reviewed before importing any observations in IDE-03.

## Proposed modular interfaces (design, not existing APIs)

Keep browser ES modules and the current deployment model. Suggested folder
`js/ide/`; dependencies point from UI/adapters to pure domain modules. Domain
modules import no DOM, Bluetooth, localStorage, audio or MSYNC scheduler.

```text
legacy drill -> legacy-adapter -> immutable ShotSpec -> constraints
                                                -> prediction <- calibration profile
target + locks + profile -> inverse solver -> ranked candidates
editor view -> explicit draft patch -> existing save lifecycle
trial UI -> execution ownership -> existing transport -> observation recorder
Module 11 -> IDE facade -> validation report (no firing or audio ownership)
```

Suggested contracts:

```ts
// Illustrative types; implementation remains JavaScript.
type ShotSpec = {
  schemaVersion: 1; shotId: string;
  controls: { topRpm: number; bottomRpm: number; height: number;
    drop: number; frequencyPercent: number; reps: number };
  ui?: { speed: number; spin: number; type: 'top' | 'back' };
  provenance: { drillKey: string; customId?: string; level: number;
    step: number; alternative: number; sourceFingerprint: string };
};
fromLegacy(ball, context): { shot: ShotSpec; issues: Issue[]; raw: unknown };
toLegacyPatch(original, explicitChanges): { ball: unknown; issues: Issue[] };
validateControls(shot): { valid: boolean; issues: Issue[] };
predictShot(shot, environment, profile, options): Prediction;
solveTarget(target, seedShot, locks, environment, profile): Candidate[];
validateDrill(snapshot, environment, profile, policy): ValidationReport;
fitCalibration(observations, previousProfile, options): CalibrationCandidate;
nextCalibrationTrial(profile, observations, legalDomain): TrialProposal;
recommendCorrection(observation, prediction, locks): Candidate[];
```

All results carry model/profile versions, settings fingerprint, units,
coordinate-frame version, issue codes and applicability domain. Prediction
status is `uncalibrated`, `estimated`, `calibrated` or `unsupported`; valid
syntax is a separate boolean. Return net clearance, first/second bounce
coordinates/times when calculable, uncertainty bounds and reasons for missing
events. Include event definitions (table contact versus floor contact) so
second bounce cannot silently change meaning. No placeholder zero landing
point when the model is unavailable.

Coordinate proposal: meters, origin at table center on tabletop; +x toward
player, +y toward player's left viewed from player end toward robot, +z up.
Record robot pose explicitly; UI↔world transformation is one tested adapter.
Treat this as a new declared frame, not an inferred device angle convention.

Inverse solver enumerates legal quantized settings, honors locked controls,
and ranks primarily by target error/uncertainty, then height-only adjustment
and minimal setting change. Speed/spin changes require the allowed policy;
return no solution when unreachable. For scatter, report the sampled support
or conservative envelope, not only a mean landing point. Validate every
alternative and the post-flavor effective settings.

Calibration persistence proposal: dedicated `nova_ide` DB version 1, stores
profiles, observations and trial records. A profile includes robot identity,
pose/environment, model version, fit version, coverage, residual distribution,
timestamp and activation status. Measurements are append-only observations;
reject unsupported future schemas without modifying prior records. Fit a
candidate separately, then explicitly activate it after held-out validation.
Deleting/replacing a drill cannot delete calibration evidence.

Observation includes unique trial ID, commanded settings and packed snapshot,
session/cycle/repetition/variant IDs, predicted result/profile version,
measured points/units, Net/Out classification, measurement source and error,
notification timestamps, physical-launch timestamp only when measured, and
confidence in attribution. Keep Net/Out training outcome separate from model
measurement; a net event does not establish a landing coordinate.

Trial service proposal: `prepareTrial`, `runTrial`, `cancelTrial`,
`recordObservation`. Requires explicit user action, session ownership,
connection, legal settings and one-shot/limited execution. Persistence and
pure prediction must never send robot commands. Stop/disconnect invalidate
pending proposals; stale results cannot fire later.

Module 11 consumes `validateDrill` and `predictShot` through a versioned facade
and immutable snapshots. It retains its own audio analysis, cue authoring and
serialization. Preserve MSYNC v1 grammar, Track identity/hash checks, warning
acceptance and source authority; put physical findings in a separate report
until a reviewed policy defines which findings block authoring/live use.

## Phased implementation and acceptance gates

| Phase | Concrete deliverable | Verification / exit gate |
| --- | --- | --- |
| IDE-02 Ball-flight prediction | Pure constraints, legacy adapter, documented coordinates, forward engine with first bounce/net/second bounce and applicability/uncertainty. Characterize duplicated encoders before extracting. | All legacy fixtures untouched; same packed bytes; invalid/nonfinite input rejected; deterministic analytic no-drag cases, net crossings, bounce boundaries, timestep convergence, unsupported cases. Predictions explicitly uncalibrated until measured. |
| IDE-03 Calibration framework | Robot/pose profiles, manual measurement capture, versioned storage and backup, fit/held-out evaluation. Review supplied measurements before reuse. | Synthetic known-parameter recovery, noisy/outlier data, insufficient coverage, wrong robot/pose rejection, failed transaction and schema round trips. Physical test series records actual setup, repeated shots and measurement error. |
| IDE-04 Visual landing editor | Table overlay, uncertainty display, drag target, constrained candidate list, explicit apply/cancel to draft. | Coordinate transforms/resize/touch checks; legal quantized candidates, locked speed/spin, unreachable targets; cancel/save/reopen and original drill equality. Browser smoke for existing editor, variants, shuffle, scatter. |
| IDE-05 Guided adaptive calibration | Reference-shot plan, uncertainty/error-driven next-shot selection, execution ownership and cancellation, candidate profile activation. | Deterministic trial selection, domain limits, exhausted budget, stop priority, concurrent runner/MSYNC rejection, stale promise/late ACK/disconnect tests. Supervised single-shot trials before larger batches. |
| IDE-06 Training feedback | Net/Out/manual landing capture linked to exact trial/shot, conservative correction proposals and history. | Missing/ambiguous telemetry cannot fabricate association; repeat/variant identity checks, duplicate feedback handling, profile drift, recommendations never auto-apply or fire. Physical confirmatory shots compare recommendations with unchanged seed settings. |
| IDE-07 Integration and validation | Versioned IDE facade, effective MSYNC flavor/scatter validation, regression report, release/rollback notes. Module 11 remains subsequent independent work. | Main suite and applicable voice suite pass; browser+hardware matrix below; accepted numerical accuracy envelope and measured timing evidence. No deployment until review. |

Dependency sequence: 02 → 03 → 04 → 05 → 06 → 07. Contract scaffolding and
characterization belong at the start of 02; they do not justify implementing
Module 11 first. Each phase uses a focused branch/PR. Rebase deliberately on
the reviewed baseline and carry only necessary voice integration changes.

## Test and release strategy

1. **Compatibility fixtures:** all built-in levels, six/seven/ten/eleven-field
   balls, custom UUIDs/rename, inactive alternatives, shuffle/scatter, saved
   defaults, CSV and inline examples. Check exact read-only preservation;
   explicitly characterize existing lossy export instead of asserting it is
   lossless. Golden packet bytes across Bluetooth and MSYNC packing.
2. **Numerical/model tests:** SI units/frame invariants, integrator convergence,
   deterministic drag-free reference, net-before-bounce ordering, table edges,
   absent/outside-table bounce events, bounded uncertainty, saturation and
   interpolation/extrapolation. No NaN/Infinity accepted as a playable result.
3. **Persistence tests:** atomic fit activation, failed writes, backup/restore,
   unknown version, original drill/audio untouched, isolation from reset and
   Track deletion; use real browser IndexedDB in addition to unit stubs.
4. **Scheduler/transport tests:** fake clocks and injected random source;
   100-cycle versus ONCE, REST/IDLE/STOP/pause/resume, simultaneous flavor,
   stop timeout/late DONE, write failure recovery, disconnect and ownership.
   Ensure uncertainty and physics never alter the audio clock or robot lead.
5. **Browser regressions:** connect UI, editor save-as/rename/cancel, all run
   modes, playlists/permanent deletion, MSYNC import/warning replacement and
   simulation, and voice dispatch/arming on a baseline containing those hooks.
   Test supported desktop/mobile Chromium with touch target dragging.
6. **Physical validation:** log robot/firmware/pose, ball batch, environment,
   camera/ruler measurement method, warm-up, RPM/control coverage, repeated
   samples and held-out combinations. Measure first/second bounce and net
   clearance plus launch/stop latency separately. Report median and 95th
   percentile landing error and empirical coverage of prediction intervals.
   Net/Out classification precision/recall needs measured ground truth.

Physical accuracy thresholds are not yet approved or supported by data. Set
them after IDE-03 pilot measurements and before promoting calibrated target
editing or claiming playable limits. Release requires meeting the agreed
held-out error budget, no legacy regression and supervised stop/ownership
checks. Otherwise retain the previous active profile and feature flag off.

Rollback is additive: disable IDE UI/facade consumers, keep legacy drill
settings and MSYNC attachments intact, retain observations for recovery and
restore the prior profile. No automatic conversion of saved drills and no
calibration coefficients embedded in old CSV or MSYNC v1 files.

## IDE-01 conclusion

The repository supports a modular IDE addition through pure adapters,
prediction/calibration services, an explicit editor draft boundary and a
separate trial executor. It does not yet support physically validated landing
claims. IDE-02 can proceed against main with characterization and pure
prediction contracts; IDE-03 measurements are the gate for accuracy claims.
Main/voice reconciliation and trial transport ownership must be resolved
before live guided calibration. This audit changes documentation only.

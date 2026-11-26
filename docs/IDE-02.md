# IDE-02 — Ball-flight prediction foundation

Module 12 first, Module 11 later. Based on main
`124add3cb21349d958b4d749651b896ee3e969ce`. Delivered as additive browser ES
modules under `js/ide/`; no changes to existing editor, runner, Bluetooth,
voice, playlists, storage, deployment or MSYNC v1 behavior. This phase is an
engine/API foundation; the visual editor is IDE-04. Nothing here fires a ball.

## Verified geometry and source provenance

| Quantity | SI value | ITTF law |
| --- | ---: | --- |
| Table length | 2.74 m | 2.1.1 |
| Table width | 1.525 m | 2.1.1 |
| Tabletop above floor | 0.76 m | 2.1.1 |
| Net top above tabletop | 0.1525 m | 2.2.3 |
| Net post outer limit beyond side line | 0.1525 m | 2.2.2 |
| Ball diameter / nominal mass | 0.04 m / 0.0027 kg | 2.3.1–2 |

Source checked 2026-10-31: [ITTF Statutes 2025, page 38, Chapter 2](https://db.ittf.com/sites/default/files/public/2025-02/ITTF_Statutes_2025_tracked_changes_version.pdf).
The [official 2026 catalog entry](https://db.ittf.com/document/389) was also
checked, but its linked PDF timed out. The implemented values are supported
by the accessible primary 2025 document; this is not a claim to have verified
the complete 2026 text. Geometry overrides allow nonstandard practice tables.
Net overhang is a rectangular approximation using the post outer limit; post
shape and net sag are not modeled. Ball mass is recorded for future models;
the current acceleration coefficients already incorporate mass dependence.

Frame `table-center-player-left-v1`: origin at table center on the tabletop,
+x toward player, +y player's left when looking toward robot, +z upward.
Positions are **ball-center** coordinates in metres, velocities m/s, angular
velocity rad/s, time seconds. Floor is z = -0.76. A tabletop contact occurs
when the descending center reaches z = ball radius. Horizontal coordinates
must be on the inclusive top surface. Side-edge collisions are not modeled;
near-edge predictions remain approximate. A center outside the top surface is
a miss, not an invented tabletop bounce.

## Public API

Import from `js/ide/index.js` (no DOM, storage or transport imports):

| Function | Contract |
| --- | --- |
| `fromLegacy(ball, context)` | `{shot, raw, issues}`; invalid structural input returns `shot:null`. Does not normalize RPM, synthesize UI settings, or assign stable identities from indexes. Caller supplies `context.shotId` when available. |
| `restoreLegacy(snapshot)` | Independent clone of exact raw snapshot, including missing/unknown fields. Editing/patching legacy drills is deferred to IDE-04. |
| `validateControls(shot)` | Strict v1 shape, finite/range/increment checks, speed-spin limits, scatter envelope. Errors are separate from warnings for saturation/RPM metadata mismatch. No repairs. |
| `controlsToRpm({speed,spin,type})` | Existing UI-to-wheel conversion with rounding/clamping and saturation flag; **not** an RPM-to-flight model. Validate controls before use. |
| `settingsFingerprint(shot)` | Canonical settings tuple for result attribution; not a cryptographic identity or durable shot ID. |
| `simulateFlight(launch, environment?, options?)` | Deterministic 3D forward trajectory for explicitly supplied physical launch state. |
| `predictShot(shot, environment?, launchModel?, options?)` | Validates controls, checks injected mapping domain, then predicts. Missing launch model returns uncalibrated/unknown with null coordinates. |
| `validateDrill(steps, environment?, launchModel?, options?)` | Evaluates all enabled alternatives and every quantized scatter drop; does not randomly pick a variant. Accepts a level's steps or effective post-flavor MSYNC steps. |

`ShotSpec` v1 keeps raw controls `topRpm,bottomRpm,height,drop,frequencyPercent,
reps`, optional `ui:{speed,spin,type}`, plus active/scatter and provenance.
Frequency percent can be fractional because converting integer BPM to the
legacy percentage is fractional. Reps validates through 200, matching save
and MSYNC contracts; the existing editor's max-100 HTML discrepancy is not
changed. Malformed values are not clamped by the new validator. Unknown
legacy trailing fields are preserved outside the domain snapshot.

## Launch mapping: the boundary for IDE-03

Standard table dimensions do not determine how this robot launches a ball.
There is deliberately **no built-in conversion of RPM to ball m/s**, control
height to physical pitch, or placement control to measured yaw. IDE-02 can
simulate measured/supplied launch states now; actual drill-setting predictions
need an explicitly injected model:

```js
const launchModel = {
    id: 'your-robot-and-pose-model',
    version: '1',
    supports(shot, environment) {
        // Check robot/pose, fit coverage and legal domain here.
        return /* explicitly supported */ false;
    },
    resolve(shot, environment) {
        // Derive these from reviewed measurements or an explicit assumption.
        return { positionM: [/* x,y,z */], velocityMps: [/* vx,vy,vz */],
            spinRadPerS: [/* wx,wy,wz */] };
    }
};
```

Both callbacks are synchronous and get isolated input copies. Failures or
unsupported settings produce explicit issues and no fabricated trajectory.
All IDE-02 results remain `uncalibrated`; passing a callback does not certify
physical accuracy. Model identity/version, launch state, coordinate frame,
settings fingerprint and normalized simulation settings accompany results.
Calibration fitting/storage and verified uncertainty intervals are IDE-03.

## Physics and events

Fourth-order Runge–Kutta advances `[x,y,z,vx,vy,vz]`:

```text
relative velocity u = velocity - wind
acceleration = (0,0,-g) - dragPerM × |u| × u
               + magnusCoefficient × (spin × u)
```

Default g = 9.80665 m/s² (conventional standard gravity), drag and Magnus
coefficients = zero, wind/spin = zero. This is an explicit gravity-only
reference idealization, not a realistic calibrated table-tennis model.
`dragPerM` has units 1/m; `magnusCoefficient` is an empirical dimensionless
factor in this formulation. Aerodynamic spin is constant between events.
Changing coefficients is an explicit caller assumption; none is fitted here.

Options: timeStepS default 0.002, permitted 0.0001–0.01; maxTimeS default 5,
permitted >0–10; maximum 100000 integration steps. Invalid values fail; they
are not silently corrected. RK4 substeps plus bisection locate the earliest
net/table/floor event before continuing, independent of display sampling.
Numerical failure or budget exhaustion returns unsupported/unknown status.

- Net clearance = center z minus radius minus net height at x = 0. Net is
  approximated by a plane with radius-expanded lateral extent. Nonpositive
  clearance in the net span terminates as net contact; no post-net landing
  is fabricated. Around-net and below-table crossings are separate classes.
  This is not a full swept-sphere/post/cord contact simulation.
- `firstBounce` / `secondBounce` mean first and second **tabletop contacts**,
  even when first bounce is on robot half (e.g. serve). They never mean floor
  contacts or a hypothetical continuation through the net.
- Continuing after first bounce requires explicit
  `environment.bounce:{restitution,tangentialRetention}`. Vertical velocity is
  reversed/scaled; horizontal velocity is scaled. No spin/friction coupling
  or spin decay is claimed. Coefficients must be >0–1 for restitution and 0–1
  for tangential retention. Without them first bounce is returned and second
  bounce stays null with `BOUNCE_MODEL_REQUIRED`.
- A first table-plane miss is `out`; floor contact is separate and terminal.
  Missing events at the horizon are unknown. `player-half`, `robot-half`,
  `out`, `net` and `unknown` are geometric outcomes, not legal serve/rally or
  physical playability certification.
- Uncertainty is explicitly `{kind:'unknown',bounds:null}`. Scatter output is
  the complete half-step control support, not a confidence interval. An
  incomplete/unsupported sample set gets no partial landing envelope.

For nonzero scatter use `validateDrill`; `predictShot` rejects an unresolved
spread. Drill validation enumerates variants/scatter deterministically, capped
at 2048 prediction cases. This bounds work per call; large reports should run
off the UI thread in future integration. Original steps and random flags are
never modified. Mixed-active alternatives are diagnosed because the ordinary
runner and MSYNC have different legacy filtering behavior. Use the actual
resolved MSYNC execution to reflect its flavor and active filtering.

## Examples and validation

Run `node examples/ide-02-prediction.mjs` for a synthetic gravity/bounce example
and an honest missing-launch-model drill result. It sends no commands and
creates no saved settings. Run `node --test` for the complete regression suite.

Verified 2026-10-31 with Node v20.19.2: **151 passed, 0 failed, 0 skipped**,
including all 117 baseline controller tests and 34 new IDE tests. The example
also executed successfully. This validates the engine and compatibility
contracts; it does not validate physical Nova launch accuracy.

New tests cover analytic projectile landing and ball-radius net clearance,
second-table versus floor contact, robot-side first bounce, net termination,
event ordering, table edges, coordinate symmetry, drag/Magnus direction and
timestep convergence, finite-input rejection, deterministic immutable results,
all built-in levels, unknown legacy fields, every legal speed/spin/type wheel
mapping, Bluetooth/MSYNC byte parity, saturation, domain failures, post-flavor
validation, all scatter cases and work budgets. Synthetic fixtures are not
robot calibration data. Existing tests continue exercising all controller modes.

There is no visual feature or live robot firing in this phase, so browser
rendering and hardware accuracy are not claimed by the automated tests.
Before IDE-04 is presented as a target editor, IDE-03 must gather robot pose,
launch-state/landing measurements and held-out validation data. The known
transport error/stop-acknowledgement and execution-ownership risks remain
separate prerequisites before guided live calibration in IDE-05.

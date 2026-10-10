# BVOM DEV Regression Suite v15.2 — v2.8.3 maintenance verification

## Current maintenance status — F44

The current suite extends the v15.2 maintenance baseline with **F44-ACTIVE-WORKOUT-CLOUD-RESTORE-GUARD**.

F44 was added after the project-reference cold review exposed a production-safety gap: Cloud Restore could replace local data while an unfinished workout was active. The contract was first proven red against the unfixed v2.8.3 source, then the smallest production guard was added to `bvomCloudRestore()`.

Current gate after F44:

- Static: **23/23 pass**
- Behaviour: **78/78 pass** = 21 CONTROL + 8 NEGATIVE + 49 DEFECT
- Sequence/invariants: **14/14 pass**
- Mutation: **62/62 killed**
- v2.8.0 reference: **47/47 applicable DEFECT contracts fail**; F23/F25 remain explicit later-regression provenance N/A
- Verdict: **GO**

The protected GitHub job name remains `v15.2 full regression gate`; that exact status context is required by `main` branch protection.

## v15 pre-fix additions (F40–F43)

A ninth blind cold audit of the exact v2.8.2 candidate (SHA-256 `b6663cfcd9eb78f1e188fd0e8d9208e24c7674caa0af934ef1b29241cc4f93f3`) found four state-integrity defects. v15 adds these contracts **before any production fix**:

- **F40-HLM-CROSS-LIFT-CORRECTION-ISOLATION** — correcting one processed HLM Heavy lift must not restore whole-program maps and erase another lift's independently earned `nextHeavy`.
- **F41-BB-ACTUAL-LOAD-ROUNDTRIP-EXACT** — a no-training kg→lb→kg round-trip must restore an off-grid actual load entered through the real Bodybuilding and On-Ramp set-entry UI exactly.
- **F42-HLM-THIRD-FAILURE-DECISION-PERSISTS** — the unresolved third-failure decision must survive reload instead of resetting the threshold silently.
- **F43-LP-CLOSE-MISS-DECISION-PERSISTS** — the unresolved LP/RPT close-miss decision must be recoverable after reload.

The sequence tier also adds three structural invariants: lift-scoped rollback, exact recorded-actual round-trip, and persisted unresolved progression decisions.

Against the exact audited candidate, all 73 prior behaviours remain green and F40–F43 all fail; 11 prior invariants remain green and the 3 new invariants fail. Static remains 19/19 and all 56 existing mutations are killed. Untouched v2.8.0 fails all 46 applicable DEFECT contracts (F23/F25 remain explicit later-regression provenance N/A). This is the required v15 pre-fix state.

v13 starts from the fully-green v12 gate and adds four scenario contracts from the seventh blind cold audit of the exact v2.8.2 candidate (SHA-256 `adf5507855a174c71bee238add8633805be52676056054b01fb89bf2063de1ad`). The four findings resolve to one architectural invariant: once work has been recorded, later Settings changes may define future training but must not rewrite the current workout's prescription, completion obligations, or progression basis. The FINAL suite includes the production fix and focused mutations for that boundary.

| Tier | File | Role |
|---|---|---|
| Static / packaging | `regression_guard.js` | Syntax/loadability, release files, SW cache list, manifest, build identifiers, browser-title/version agreement, contractual EN/JA wording. Textual by design; protects **no** live behaviour. |
| Behavioural (authoritative) | `behaviour_guard.js` | Boots the build's **real** inline application script in a Node `vm` (`lib/bvom_harness.js`) and drives live user-level functions (`tapSet`, `saveLiftSettings`, the real Bodybuilding/On-Ramp set dialogs, `bvomBbCommitSetup`, `finishWorkout`, `changeUnits`, `renderWorkout`, `renderWarm`, `bvomCloudInit`…). Asserts stored state **and** rendered output. |
| Sequence / invariants | `sequence_guard.js` | Exercises cross-feature state-machine properties: no-op neutrality, rollback-state unit coherence, no-training round-trip reversibility, correction recomputation, and non-destructive recorded-work lifecycle. |
| Test validation | `mutation_check.js` | Applies known-bad mutations to **throwaway temp copies** of the candidate and requires the targeted behavioural tests to fail. The v2.8.0 reference is used only for historically applicable contracts; later-regression provenance exceptions are explicit. |

`gate.js` runs all four tiers and prints GO / NO-GO.

## Running

Extract builds first (the tools read folders, never ZIPs, and never write to them).

    node gate.js <candidate-build-dir> <v2.8.0-build-dir>

Individually:

    node regression_guard.js <build-dir>
    node behaviour_guard.js  <build-dir>            # --only=ID,ID  --json
    node sequence_guard.js   <build-dir>            # --json
    node mutation_check.js   <build-dir> --known-bad <v2.8.0-build-dir>

Requires Node ≥ 18. No npm dependencies. Runtime on the reference machine: ≈ 6 s for the full gate.

## What the harness simulates (and does not)

Simulated: a minimal DOM shell (`#app` and `#authgate` start hidden, as in index.html), local/session storage, timers, `Date.now` (GPP tests), and a Supabase-js-shaped client whose network can be switched off. Scripted: the *answers* to BVOM's rep-count / choice / note / incomplete-confirm dialogs. Everything else is the build's own code. Bodybuilding and On-Ramp set entry drive BVOM's real dialog (inputs filled, RECORD pressed).

Not simulated: real browser layout, service-worker/HTTP caching, iOS PWA lifecycle, real Supabase/Stripe servers. Those stay in `MANUAL_REGRESSION_MATRIX.md`.

## Test kinds

- **CONTROL** — established behaviour that must keep working (includes the live LP/RPT rescue control).
- **NEGATIVE** — access that must remain blocked (F12 negative controls).
- **DEFECT** — the F1–F44 defect contracts accumulated across production audits. Most fail on untouched v2.8.0; F23 and F25 are later-regression contracts introduced by subsequent hardening and are therefore explicitly N/A for the v2.8.0 provenance check. Do not weaken a real contract merely to force an older reference build red.

## Historical v13 FINAL baseline

Against the final v13-hardened v2.8.2 working tree and again against a fresh extraction of the packaged candidate:

- Static: **19/19 pass**
- Behaviour: **71/71 pass** = 21 CONTROL + 8 NEGATIVE + 42 DEFECT
- Sequence/invariants: **10/10 pass**
- Mutation: **51/51 mutations killed**
- v2.8.0 reference: **40/40 applicable DEFECT contracts fail**; F23/F25 remain explicit later-regression provenance N/A
- Gate verdict: **GO**

The v13 additions are F34–F37 plus `INV-ACTIVE-WORKOUT-PRESCRIPTION-IMMUTABLE`. They cover partial LP/RPT Settings edits, completed-lift Settings edits followed by correction (including after unit conversion), HLM/4-Day Optional Heavy Singles toggled mid-exposure, and HLM settings labelled “next workout” remaining staged until the next applicable workout.

## Maintaining mutations

Each mutation is a small textual patch anchored inside a named function/region. If a future build legitimately rewrites that code, `mutation_check.js` reports `STALE` and fails: update the anchor so the same known-bad behaviour is still injected. A mutation reported `N/A` means its target test is already failing on the candidate. `SURVIVED` means a test passed known-bad code — the test must be strengthened before release.

F1–F22 are green on the final v10 candidate. Focused F20, F21 and F22 mutations remove the corresponding protections and must make their contracts fail.

## Policy-dependent assertions (documented choices)

- **F3**: user-visible = any BVOM modal/alert raised during finish, or rendered Workout/History text, mentioning the exercise and a drop phrase (`performance drop`, `dropped`, `well below`, `lower than usual/last`, `30%`). A normal session must show no such text. Pin to the exact wording once the UX is chosen.
- **F5**: Bodybuilding uses BVOM's practical target-unit conversion grid on a one-way unit change: lb increments are chosen from 1 / 2.5 / 5 / 10 and kg increments from 0.5 / 1 / 1.5 / 2 / 2.5 / 5. Converted loads, reference loads and subsequent prescriptions must land on that converted increment's loadable grid; reference keys must equal `bvomBbComparableKey(id, ref.load)`. If no training/edit occurs between kg→lb→kg, reversible origin metadata must restore the original legitimate user-entered load/increment exactly, including values outside the target-unit policy grid.
- **F7**: after three above-range "About right" exposures the load must have increased above 100.
- **F12**: "usable" = `#app` visible and `#authgate` hidden after `bvomCloudInit`. Offline modes: A) session present, entitlement RPC unavailable; B) token refresh impossible (`getSession` returns no session); C) Supabase client not loaded. Explicit sign-out (including while already offline), SIGNED_OUT auth events, owner mismatch, stale (>7 day) verification, never-authenticated, never-verified and expired access must remain blocked. Local-only offline access must not assess or enable cloud sync until a real Supabase session exists.

## Carried forward from v6 hardening

- Added F12 negative controls for explicit sign-out, offline sign-out, SIGNED_OUT auth events, owner mismatch and grace expiry.
- Added `F12-OFFLINE-NO-CLOUD-WITHOUT-SESSION` so local-only offline access cannot create/assess cloud state before a real session returns.
- Tightened both F5 contracts to BVOM's existing practical increment policy rather than accepting any 0.25-unit value.
- Mutation tier currently contains 51 executable known-bad mutations, including focused F20–F27 failures plus the explicit-sign-out, SIGNED_OUT-event, offline-cloud, owner and grace boundary failures.


## v7 cold-audit additions (F13–F16)

A fresh cold audit of the packaged v2.8.1 build found four new defect groups. v7 adds six live behavioural contracts before any production fix:

- **F13-BB-UNIT-CHANGE-ATOMIC** — active Bodybuilding unit changes must keep rendered prescription, logged set and progression on the same converted load/grid.
- **F13-ONRAMP-UNIT-CHANGE-ATOMIC** — On-Ramp must rerender converted loads instead of relabelling stale numbers.
- **F14-INCREMENT-ROUNDTRIP** — a no-training kg→lb→kg round trip must preserve valid 1.5 kg and 2 kg progression increments.
- **F15-NONBARBELL-ACCESSORY-INCREMENTS** — dumbbell/machine accessories must progress by the selected increment rather than a barbell plate grid.
- **F16-GPP-STOP-PERSISTS** — Stop must persist stopped status and elapsed time before any result-entry modal is completed.
- **F16-GPP-RESULT-RECOVERY** — after reload of a stopped activity with unsaved extra metrics, the user must have a route to complete result entry.

Against the shipped v2.8.1 package the existing 44 tests remain green and these six new contracts all fail. Against untouched v2.8.0 all 21 DEFECT contracts fail. This is the required pre-fix state.


## v8 second cold-audit additions (F17–F19)

A second blind cold audit of the exact fully-green v7 candidate found three new reproducible data/progression defects. v8 adds these contracts **before any new production fix**:

- **F17-POSTCOMPLETE-SETTINGS-SURVIVE-CORRECTION** — an explicit Advanced Lift Settings save after a completed lift must remain authoritative if an earlier set is corrected; covers LP/RPT, HLM Heavy and a 4-Day driver.
- **F18-ACTIVE-ACCESSORY-EDIT-PRESERVES-SESSION** — editing an accessory during an active workout must preserve recorded sets and the processed guard; covers partial and completed LP/RPT accessory work plus Bodybuilding accessory work.
- **F19-POSTCOMPLETE-WEIGHT-EDIT-CORRECTION-ATOMIC** — changing a completed lift's working weight and then correcting a set must not create a mixed old/new-load session or a second automatic progression.

Against the exact audited candidate SHA `4819ad06e17e4bd013f19b0dc99418505297aaf1cff3bd8b566c7e6bd6b8612c`, all existing 50 behavioural tests remain green and these three new contracts fail, giving **50 PASS / 3 FAIL**. Against untouched v2.8.0, controls remain 21/21, negatives 8/8 and all **24/24 DEFECT contracts fail**. This is the required v8 pre-fix state.

## Changes from v5

- `regression_guard.js` rewritten as a static/packaging-only tier (see audit report for every removed check).
- New `behaviour_guard.js`, `mutation_check.js`, `gate.js`, `lib/bvom_harness.js`.
- `MANUAL_REGRESSION_MATRIX.md`: removed the item that endorsed F4; automated items removed from manual; added F12 airplane-mode installed-PWA test and real-service checks.


## v9 third cold-audit addition (F20)

A third blind cold audit of the exact v2.8.2 candidate found one reproducible data-loss defect:

- **F20-STARTING-SETUP-ACTIVE-WORKOUT-GUARD** — choosing Run Starting Setup Again during an unfinished workout must not erase live session data or leave a ghost active workout. The contract accepts either a guard that prevents setup entry until the workout is finished/exited, or a setup path that genuinely preserves the active workout without data loss.

Against the exact audited candidate SHA `948b5f2a91f59731d7ff97c3df5f5592e37a4ca4ffad7242eb94bbff6bf008be`, all existing 53 behavioural tests remain green and F20 fails. This is the required v9 pre-fix state.


## v10 fourth cold-audit additions (F21–F22)

A fourth blind cold audit of the exact fully-green v9 candidate found two reproducible progression/state defects. v10 adds these contracts **before any production fix**:

- **F21-ONRAMP-FAILED-HANDOFF-VALIDATION-NONDESTRUCTIVE** — after Skip On-Ramp opens manual Bodybuilding setup, a failed required-load/increment validation must not persistently hand off/terminate the active On-Ramp. The existing On-Ramp status, session count and calibration state must survive reload unchanged until a valid setup commit succeeds.
- **F22-OPTIONAL-DEADLIFT-SKIP-CORRECTION-ATOMIC** — skipping the optional Deadlift single on HLM Light or 4-Day Workout 4 must snapshot/mark the completed lift as processed so later set correction cannot progress 100→105→110 or retain the 105 progression when the original 100×5 is corrected to a miss.

Against the exact audited candidate SHA `772e3374558dfefc47645f647138c8c602e1761997fff13f87dc5e1789d9d138`, all existing 54 behavioural tests remain green and F21/F22 both fail, giving **54 PASS / 2 FAIL**. Static remains 18/18 and all existing 31 executable mutations are killed. Against untouched v2.8.0, all **27/27 DEFECT contracts fail**. This is the required v10 pre-fix state.


### v10 final post-fix state

F21 was fixed by making the On-Ramp handoff conditional on a successful manual Bodybuilding setup commit. Failed validation now leaves the active On-Ramp transaction unchanged.

F22 was fixed by treating **SKIP OPTIONAL SINGLE** as the completion transaction it already functionally represents: before Deadlift progression is applied, BVOM snapshots the pre-progression state and marks the lift processed. A later correction therefore rolls progression back first, then recalculates from the corrected performance. The F22 miss branch completes BVOM's normal rescue work before asserting the final failure state.

Final v10 gate on the packaged post-F22 v2.8.2 candidate:
- Static: **18/18 PASS**
- Behaviour: **56/56 PASS** (21 CONTROL, 8 NEGATIVE, 27 DEFECT)
- Mutations: **33/33 killed**
- Untouched v2.8.0 known-bad: **27/27 DEFECT contracts fail**
- Verdict: **GO**


## v11 fifth cold-audit additions (F23–F27)

The fifth blind cold audit of the exact fully-green v10 candidate found five reproducible state-machine defects. All five were independently reproduced before any production change:

- **F23-NOOP-POSTCOMPLETE-SETTINGS-PRESERVE-ROLLBACK** — saving unchanged Advanced Lift Settings after a processed lift must not replace the original pre-result rollback point and enable double progression.
- **F24-INTERMEDIATE-SNAPSHOT-UNIT-CONVERSION-ATOMIC** — HLM/4-Day processed snapshots must convert nested driver/nextHeavy state with the active unit so later correction cannot restore kg numbers as lb.
- **F25-ONRAMP-UNIT-ROUNDTRIP-HANDOFF-REVERSIBLE** — an On-Ramp kg→lb→kg round trip without training must preserve practical load/increment values and hand them off unchanged.
- **F26-ACCESSORY-CORRECTION-RECOMPUTES-PROGRESSION** — correcting a completed accessory must roll back and recompute progression rather than leaving a stale processed success.
- **F27-RECORDED-OPTIONAL-WORK-REMOVAL-PRESERVES-LIVE-DATA** — removing accessory/GPP templates during a non-Custom active workout must not delete already-recorded live work before History exists.

The new `sequence_guard.js` protects the broader invariants exposed by these defects, rather than only their exact reproductions. This is the deliberate testing-strategy change after repeated cold audits found interactions between otherwise-correct subsystems.


### v11 post-F26 working state

F23–F26 are fixed and green. F26 now snapshots accessory progression before first processing; correcting an already-processed accessory restores that pre-result state, removes dependent later sets, and recomputes the result exactly once. The strengthened contract covers both a corrected miss (20 kg, one failed attempt after rescue) and a corrected success (exactly one progression back to 22.5 kg). F27 remains intentionally red.

Current working gate: Static 18/18 PASS; Behaviour 60 PASS / 1 FAIL (F27 only); Sequence/invariants 4 PASS / 1 FAIL (recorded-work removal only); Mutations 39/39 killed; v2.8.0 30/30 applicable DEFECT contracts fail. Verdict remains NO-GO until F27 is fixed.


### v11 final post-F27 + release-title state

F27 is fixed by blocking removal of an accessory/GPP template once that specific item has recorded live work; idle templates remain removable. The browser document title is also now required by the static tier to match `BVOM_BUILD`, fixing the presentation-only `v2.4` label without changing training logic.

Final v11 gate on the packaged v2.8.2 candidate:
- Static: **19/19 PASS**
- Behaviour: **61/61 PASS** (21 CONTROL, 8 NEGATIVE, 32 DEFECT)
- Sequence/invariants: **5/5 PASS**
- Mutations: **41/41 killed**
- Untouched v2.8.0 known-bad: **30/30 applicable DEFECT contracts fail**; F23/F25 remain explicit provenance N/A
- Verdict: **GO**


## v12 after F28

F28 is fixed in the current working candidate. The fix preserves the original pre-result rollback snapshot for non-intermediate post-result settings-only edits and re-applies the saved future core configuration after correction/reprocessing. F17 and F23 remain green.

Current gate:
- Static: **19/19 pass**
- Behaviour: **62 pass / 5 fail** (F29-F33 remain red)
- Sequence/invariants: **5 pass / 4 fail**
- Mutation: **42/42 mutations killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**; F23/F25 provenance N/A
- Verdict: **NO-GO**

## v12 after F29

F29 is fixed in the current working candidate. Accessory processed snapshots now retain the original progression increment. When a processed accessory receives an increment-only edit, the new increment is retained as future configuration while any later correction replays/recomputes the already-earned result with the original pre-result increment, then reapplies the saved future increment. F18 and F26 remain green.

Current gate:
- Static: **19/19 pass**
- Behaviour: **63 pass / 4 fail** (F30-F33 remain red)
- Sequence/invariants: **5 pass / 4 fail**
- Mutation: **43/43 mutations killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**; F23/F25 provenance N/A
- Verdict: **NO-GO**

## v12 after F30

F30 is fixed in the current working candidate. HLM/4-Day Advanced Lift Settings now preserve an already-earned `nextHeavy` target when the Heavy/progression driver itself is unchanged; an actual driver-weight edit still invalidates `nextHeavy`. The strengthened contract covers both sides. F17 and F24 remain green.

Current gate:
- Static: **19/19 pass**
- Behaviour: **64 pass / 3 fail** (F31-F33 remain red)
- Sequence/invariants: **6 pass / 3 fail**
- Mutation: **44/44 mutations killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**; F23/F25 provenance N/A
- Verdict: **NO-GO**


## Post-F31 working state

F31 adds confirmation-provenance tracking to the On-Ramp set that actually establishes `CONFIRMED`. Correcting that exact evidence out of range revokes calibration; correcting it to another valid in-range result retains calibration; later-session set corrections do not erase historical calibration.

Current gate shape after F31 (F32/F33 intentionally still red):
- Static: **19/19 pass**
- Behaviour: **65 PASS / 2 FAIL** (`F32`, `F33`)
- Sequence/invariants: **7 PASS / 2 FAIL** (failed-validation atomicity and broad no-training round-trip)
- Mutation: **45/45 killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**

## v12 after F32

F32 is fixed in the current working candidate. Numeric On-Ramp set entry now validates both the actual load and smallest practical increment before mutating the live exercise object. Rejected input therefore leaves both in-memory state and persisted local storage unchanged, and cannot leak into a later unrelated save/reload. The strengthened F32 contract checks both memory atomicity and byte-for-byte storage atomicity at rejection.

Current gate:
- Static: **19/19 pass**
- Behaviour: **66 pass / 1 fail** (F33 remains red)
- Sequence/invariants: **8 pass / 1 fail**
- Mutation: **46/46 mutations killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**; F23/F25 provenance N/A
- Verdict: **NO-GO** until F33 is fixed


## v12 final after F33

F33 is fixed in the final candidate. Unit conversion now keeps BVOM's existing one-way practical target-unit rounding, while persisting reversible origin metadata for legitimate loads/increments that may later be restored. If the converted value is unchanged, kg→lb→kg restores the exact original physical/user-entered value; if the converted value changes, normal conversion takes over. The coverage includes core weights and live sets, accessories and accessory progression, GPP planned/recorded loads, Custom Training plan/live sets, processed rollback state, Bodybuilding progression/reference loads, and On-Ramp equipment state. The metadata survives reload between unit changes.

The older F5 round-trip assertion was strengthened/clarified to match this invariant: **one-way** Bodybuilding conversion must still land on the practical target-unit grid, but a no-training **round trip** must restore the original legitimate load/increment exactly, including arbitrary user-entered equipment increments. `F5-LB-PRACTICAL` remains unchanged and protects the one-way policy.

Final v12 gate on a fresh extraction of the packaged v2.8.2 candidate:
- Static: **19/19 pass**
- Behaviour: **67/67 pass** (21 CONTROL, 8 NEGATIVE, 38 DEFECT)
- Sequence/invariants: **9/9 pass**
- Mutation: **48/48 mutations killed**
- v2.8.0 reference: **36/36 applicable DEFECT contracts fail**; F23/F25 remain explicit provenance N/A
- Verdict: **GO**


## v13 final — active-workout prescription immutability (F34–F37)

The seventh blind cold audit showed that several apparently separate bugs shared one boundary failure: Settings could change the meaning of an already-started workout. v13 makes the live prescription immutable once that lift has recorded work, while still allowing Settings to stage future configuration.

- **F34** — partial LP/RPT work cannot be reinterpreted under a newly selected mode or weight. The recorded workout completes against the original prescription; the new Settings values become the future prescription.
- **F35** — a working-weight edit made through Advanced Settings after a lift already progressed survives later correction without replacing the original rollback point or earning progression again. The same contract is exercised after kg→lb conversion.
- **F36** — Optional Heavy Singles toggled during live HLM Light / 4-Day W4 Deadlift work apply only to future workouts. They cannot introduce a second progression obligation or remove a pending one.
- **F37** — HLM Light/Medium settings described as “next workout” do not alter a partially completed current prescription.
- **INV-ACTIVE-WORKOUT-PRESCRIPTION-IMMUTABLE** — umbrella state-machine invariant covering the same rule across core and intermediate settings.

Implementation notes: live core work may hold a `livePrescriptionLock` in its original processed snapshot; future Settings are staged via `postEditWeight`/`postEditCfg`. HLM workout-level settings are snapshotted for the active workout and remain local-only/transient for cloud comparison/payload purposes. Unit conversion converts both the live rollback state and staged future state. The dedicated in-workout weight-edit path remains the explicit route for intentionally changing today’s working weight.

Final v13 gate: Static 19/19, Behaviour 71/71, Sequence 10/10, Mutations 51/51 killed, and untouched v2.8.0 fails 40/40 applicable DEFECT contracts. Verdict: **GO**.

## v14 eighth cold-audit additions (F38–F39)

The next blind audit of the exact v13 candidate (SHA-256 `31dfb071f0c98f7e1ffac6ed0bd07b006a7f4a503b98a2aa42846ad13f5dff5d`) found two transaction defects after post-result edits. v14 adds these contracts before any production fix:

- **F38** — after a result has been earned and future lift settings are edited, correction must recompute the old workout result from the immutable original prescription. A corrected failure must revoke stale LP progression / HLM or 4-Day `nextHeavy`, while the explicit future settings remain saved.
- **F39** — after an accessory result has been earned and the future accessory template weight is explicitly edited, correction of the old workout must not overwrite that persisted future template value.
- **INV-CORRECTION-RECOMPUTES-EARNED-THEN-MERGES-EXPLICIT-FUTURE-OVERRIDES** — umbrella rule: correction recomputes earned state first, then merges only explicit future overrides.

Against the exact audited v13 candidate, all existing 71 behavioural tests remain green, F38/F39 both fail, 10 existing invariants remain green and the new umbrella invariant fails. Static remains 19/19, existing 51 mutations remain killed, and untouched v2.8.0 fails all 42 applicable DEFECT contracts. This is the required v14 pre-fix state.

## v14 FINAL baseline

After the F38/F39 transaction fix, the final v14 candidate passes:

- Static: **19/19**
- Behaviour: **73/73** = 21 CONTROL + 8 NEGATIVE + 44 DEFECT
- Sequence/invariants: **11/11**
- Mutation: **56/56 killed**
- v2.8.0 reference: **42/42 applicable DEFECT contracts fail**; F23/F25 remain explicit later-regression provenance N/A
- Verdict: **GO**

F38 now revokes stale earned LP / HLM / 4-Day progression before correction recomputation while preserving explicit future settings. F39 records explicit future accessory weight overrides, recomputes the old workout against the original accessory prescription, merges the future override afterward, and also preserves that override when an incomplete correction is resolved by Finish.

## v15 after F40

F40 is fixed in the current working candidate. Intermediate rollback now restores only the corrected lift's `driver`, `nextHeavy`, `rep`, and `failCount` entries rather than replacing the whole HLM maps from the older snapshot. Independently completed lifts therefore retain their earned progression when another Heavy lift is corrected.

Current working gate:
- Static: **19/19 pass**
- Behaviour: **74 pass / 3 fail** (F41-F43 remain red)
- Sequence/invariants: **12 pass / 2 fail**
- Mutation: **57/57 mutations killed**
- v2.8.0 reference: **46/46 applicable DEFECT contracts fail**; F23/F25 provenance N/A
- Verdict: **NO-GO** until F41-F43 are fixed


## v15 after F41

F41 is fixed in the current working candidate. The final Bodybuilding/On-Ramp active-session unit-conversion wrapper now recognizes when the general round-trip layer has restored an exact recorded actual load and does not re-round that restored value a second time. On the forward conversion, if the BB equipment grid changes the generic converted set load, the set's round-trip metadata is updated to the final grid value so the reverse conversion can restore the exact original actual load.

Current gate shape: Behaviour 75 PASS / 2 FAIL (F42/F43 only); sequence/invariants 13 PASS / 1 FAIL (pending-decision persistence only); Static 19/19 PASS; mutation tier includes a focused F41 known-bad mutation. Verdict remains NO-GO until F42/F43 are fixed.

## v15 after F42

F42 is fixed in the current working candidate. The HLM third-failure threshold is now a persisted progression decision rather than transient modal-only state. Reaching the threshold stores `hlm.pendingRepChoice` and leaves `failCount` at the threshold until the user explicitly chooses a branch. `renderAll()` re-presents the pending choice after reload. Choosing a branch clears the pending state and resets the failure count exactly once. The strengthened regression models a real browser reload by preserving the same session-tab ID, then proves the chosen DROP branch survives a second reload without reopening.

Current gate shape: Static 19/19 PASS; Behaviour 76 PASS / 1 FAIL (F43 only); Sequence/invariants 13 PASS / 1 FAIL (the combined unresolved-decision invariant remains red solely because F43 is not fixed yet); Mutations 60/60 killed; v2.8.0 reference 46/46 applicable DEFECT contracts fail, with F23/F25 provenance N/A. Verdict remains NO-GO until F43 is fixed.


## v15 FINAL after F43

F43 is fixed in the final v15 candidate. LP/RPT close-miss decisions are now persisted rather than existing only in the transient modal. Reaching a close miss stores `pendingCloseMissChoice` with the exact already-calculated PROGRESS ANYWAY load. `renderAll()` re-presents the unresolved REPEAT / PROGRESS ANYWAY choice after reload. Choosing REPEAT increments attempts exactly once and preserves the current weight; choosing PROGRESS ANYWAY applies the stored next weight exactly once and resets attempts. Both branches clear the pending state and a second reload does not reopen the decision.

The F43 regression was strengthened before acceptance to execute both branches after a real-style reload using the same session-tab ID, verify persisted state, and verify a second reload. Two focused mutations cover missing persisted state and missing reload re-presentation.

Final v15 gate on the working tree:
- Static: **19/19 pass**
- Behaviour: **77/77 pass** (21 CONTROL, 8 NEGATIVE, 48 DEFECT)
- Sequence/invariants: **14/14 pass**
- Mutation: **62/62 mutations killed**
- v2.8.0 reference: **46/46 applicable DEFECT contracts fail**; F23/F25 remain explicit later-regression provenance N/A
- Verdict: **GO**

## Monkey 007 phase-1 ownership contracts (not release-ready)

F50–F57 cover secondary pending answers, later warm-up leakage, acquisition ordering, exceptional pending commits, representative program entry/Finish, shared HLM/4-Day decisions, scheduled ownership changes, and record dialogs answered after permission changes. Each is red against pinned v2.9.0 `b551f07c5c68e127239de4963c82a8a53bd7a3eb`; they are explicit historical-provenance N/A against v2.8.0, which is not this ownership baseline. Existing mutation/known-bad contracts remain mandatory.

`boot(build,{ls,ss})` accepts pre-populated localStorage and sessionStorage separately. A same-tab reload preserves its session identity **before** application initialization; a distinct tab uses a separate store. Never infer identity from the shared owner marker or inject it only after boot. Correction/reload controls now preserve native identity and must still detect their original mutations.

These tests model sequential/scheduled interleavings, not linearizable concurrency, duplicate-tab identity, real authentication, installed PWA lifecycle or safe owner takeover. A GO gate does not authorize release: owner recovery policy and Android evidence remain separate prerequisites.

## Monkey 009 corrective contracts (draft review only)

F58–F64 in `monkey009_contracts.js` run through the authoritative behaviour tier. They cover delayed backup/cloud confirmation, History and Custom accessory/GPP apply callbacks, intermediate/setup continuation, committed-blob owner-key failures, pending creation failure followed by same-tab reload, storage ordering/nested attempts, and assigned timer-sound handling. All seven are red against exact pre-009 PR head `e6631e478a80b68df6cff80615382430348238ee`. Their explicit v2.8.0 provenance exclusion does not replace that red proof.

The platform/services are artificial; dialogs and progression are real application functions. New mutants remove whole responsible protections where a second commit/rollback check also prevents the defect. F20 retains its original assertions and now removes both setup-time active-workout checks. The gate and historical reference expectations are unchanged. Pending reload retry covers only required LP close-miss and HLM/4-Day third-failure decisions; it does not provide abandoned-owner recovery or claim atomic cross-tab writes.

## Monkey 011 corrective contracts

F65–F69 are pinned-pre-011 (`f75202f9fb94d3ab69e1de15b5c5876d6e8d8a97`) red→green contracts, historically N/A on v2.8.0. F65 checks resolve/reject sign-out with changed saved training, owner/account, memory, auth events and storage-read failure. F66 invokes actual Cancel while sign-out is pending and checks repeated confirmation, no local erase/reload and truthful status. F67 checks exact History identity across overlapping confirmations, normal note-edit callback, reorder, replacement, duplicates, stale bytes and owner changes. F68/F69 controls protect legitimate offline/signed-in erase, expected mocked auth-listener delivery, fresh RESET and preconfirmation Cancel. All use artificial storage/services and real application callbacks; no native browser or installed-device claim.

Four new mutants remove erase snapshot revalidation, cancellation invalidation History identity validation and auth-event tracking. The documented 13-file staging and unchanged full gate remain required. Captured Node spawnSync EPERM is a local launcher NO-GO; separate Python subprocess mutation replay is tier evidence, not local full GO. Required GitHub CI must independently pass. Release remains NO GO pending recovery and device proof.


## Draft PR #39 — exclusive recovery and inactivity

`recovery_contracts.js` adds F70–F76 for meaningful activity, atomic incomplete expiry across programs, pending/GPP holds, lock/account fencing, failed-write rollback, timestamp grace and ambiguous old-version ownership. The VM platform uses explicit synthetic locks/document identities to keep previous callback contracts intact; those stubs are not liveness evidence.

`recovery_browser.cjs` serves the real BVOM app on isolated loopback HTTP, uses native Chromium Web Locks and storage, drives the effective rep dialog and blocks external requests/services. The separate Actions job **BVOM real application recovery checks** executes close/reopen, duplicated sessionStorage, live/background/frozen ownership, simultaneous boots, expiry and safeguards. The existing browser primitive smoke job is preserved. F70–F76 are replayed RED against exact pre-recovery `42710195f3aef3e9d8959a8592ad92b00c88f722`; their v2.8.0 provenance is N/A because recovery is a later feature. Six new fault injections complement the earlier mutations. Stronger save fencing requires the existing ownership-boundary mutations to remove both permission checks to reproduce their original fault; their behavioural targets and assertions remain unchanged.

Browser clocks, accounts, entitlement caches and workouts are synthetic. This is not Android installed-PWA/Safari evidence. Unknown older-version workout ownership fails closed rather than being automatically upgraded. See the manual matrix for isolated dummy-workout phone checks. No preview or production deployment is created by tests.

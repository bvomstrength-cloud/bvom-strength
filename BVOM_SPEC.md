# BVOM Strength Behavioural Specification

This document describes the intended user-visible and state-transition behaviour of BVOM Strength.

It is the behavioural companion to `ARCHITECTURE.md`.

- `AGENTS.md` defines how development should be carried out.
- `ARCHITECTURE.md` explains where the major systems live and how they interact.
- `TESTING.md` will describe how behaviour is verified.
- This file describes what BVOM is supposed to preserve.

When this document and executable regression coverage disagree, investigate the discrepancy rather than assuming either one is automatically correct.

## 1. Product principle

BVOM is a deterministic training application.

Its structured programs decide training prescriptions and progression from explicit rules. User-recorded work, persisted state, and program rules are the authority.

AI or conversational features may explain or assist in the future, but they must not silently replace or improvise the underlying progression engine.

The core rule is:

**BVOM may help decide the next training step, but it must never lose, rewrite, or reinterpret work the user already recorded without an explicit user action that requires it.**

## 2. Global state rules

These rules apply across programs unless a program explicitly defines otherwise.

### 2.1 Recorded work is authoritative for the current workout

Once a lift or activity has recorded live work, later Settings changes may define future training but must not silently rewrite:

- today's prescription
- today's completion obligations
- today's progression basis
- the actual load already recorded
- another lift's independently earned state

The current workout and future program configuration are separate concerns.

### 2.2 A completed result is applied once

A lift or accessory result that has already been processed must not be progressed a second time merely because:

- Settings were opened and saved
- the same values were saved again
- another lift was corrected
- units were changed
- the completed set was reopened without a meaningful result change

A no-op must remain a no-op.

### 2.3 Correction means rollback, recompute, then merge future settings

When recorded work is corrected after its result has already been applied, BVOM must:

1. restore the relevant pre-result state,
2. recompute the earned result from the corrected work,
3. preserve unrelated lifts and unrelated program state,
4. then restore only explicit future-setting overrides that the user intentionally saved.

A stale processed flag must never preserve progression that the corrected performance no longer earned.

### 2.4 Correction is scoped to the thing corrected

Correcting one HLM/4-Day driver lift must not restore whole-program maps and erase progression earned independently by another lift.

The same principle applies generally: rollback must be as narrow as the original transaction.

### 2.5 Failed validation is atomic

If a user action is rejected because required input is missing or invalid, BVOM must leave both:

- the live in-memory model
- persisted local state

unchanged by that rejected transaction.

Rejected values must not leak into a later unrelated save.

### 2.6 Unresolved decisions survive reload

Any progression decision that requires an explicit user choice must be persisted before the modal/UI is shown.

The DOM must never be the only record of an unresolved decision.

Examples currently protected include:

- LP/RPT close-miss: **REPEAT** vs **PROGRESS ANYWAY**
- HLM third-failure decision

After reload, the decision must be re-presented and whichever branch the user chooses must be applied exactly once.

### 2.7 Recorded optional work is non-destructive

If an accessory, GPP activity, Custom Training item, or other optional item already has live recorded work, changing/removing its future template must not erase that live record before Finish/History.

Where BVOM permits removal during an active session, today's recorded work remains part of the session and the removal applies to the future template.

## 3. Units and load identity

BVOM supports kilograms and pounds.

Changing units is a state conversion, not a label change.

### 3.1 One-way conversion

On a one-way unit change, prescribed/planned loads and increments must land on the relevant practical target-unit grid.

Current practical progression increment choices include:

- lb: 1, 2.5, 5, 10
- kg: 0.5, 1, 1.5, 2, 2.5, 5

Exercise/equipment-specific loadability rules may further constrain the result.

### 3.2 Per-lift loadability settings govern progression

Per-lift plate/loadability settings are behavioural inputs, not display preferences.

If a lift is configured to use microplates, its progression must use the resulting smaller practical increment. The protected regression example is:

`Press 40 kg -> 41 kg -> 42 kg`

with a 1 kg practical progression increment.

A Settings save must preserve the selected per-lift loadability mode and subsequent progression must continue to honour it.

### 3.3 No-training round trips are reversible

If a legitimate value is changed only by:

`kg -> lb -> kg`

or the reverse, with no intervening training/edit that changes the value semantically, BVOM must restore the original legitimate value where the protected round-trip contract applies.

This includes arbitrary legitimate values that are not naturally on the target-unit policy grid.

Protected state includes:

- core working loads
- progression increments
- active recorded set loads
- accessories
- GPP loads
- Custom Training
- rollback snapshots
- Bodybuilding progression/reference values
- Bodybuilding On-Ramp load/increment state

### 3.4 Actual recorded loads remain actual

A load the user actually records is not merely a display suggestion.

A unit round trip must not alter the physical value of an already-recorded actual load.

For Bodybuilding, an off-grid actual load entered through the real set-entry UI must round-trip exactly when no intervening training/edit invalidates the origin.

### 3.5 Completed-set displays remain historical

Once a set has been completed, its displayed load must continue to represent the load actually performed.

Progressing the lift may change the future prescription, but it must not relabel the completed set as though the new future weight had been lifted.

The protected LP/RPT regression example completes work at the old load while the next prescription becomes 102.5; the completed-set labels must continue showing the load actually lifted.

## 4. LP / RPT

LP / RPT is the beginner/novice structured strength program.

The user-facing guidance describes it as the starting program for lifters new to structured strength training and as using workout-to-workout progression.

### 4.1 Base A/B structure

The base exercise rotation is:

**Workout A**

- Squat
- Bench Press
- Row / Prone Row

**Workout B**

- Squat
- Press / Overhead Press
- Deadlift

For straight-set mode, the final runtime prescription is normally:

- Squat: 3 × 5
- Bench Press: 3 × 5
- Prone Row: 3 × 5
- Overhead Press: 5 × 5
- Deadlift: 1 × 5

Per-lift Advanced Settings may select straight sets or RPT behaviour.

### 4.2 RPT rep structures

The three-set RPT rep ladders are:

- 5 / 6 / 8
- 4 / 5 / 7
- 3 / 4 / 6
- 2 / 3 / 5
- 1 / 2 / 4

The five-set Press-style RPT ladders are:

- 5 / 5 / 5 / 6 / 8
- 4 / 4 / 4 / 5 / 7
- 3 / 3 / 3 / 4 / 6
- 2 / 2 / 2 / 3 / 5
- 1 / 1 / 1 / 2 / 4

Deadlift RPT uses its own top/back-off structure.

RPT loads are derived from the current working/top weight, the configured drop percentage, and the loadable exercise grid.

### 4.3 Progression applies to performed work

A successful workout progresses only the lift(s) actually performed and processed.

Switching days or abandoning an unsaved workout must not orphan already-applied progression. Where necessary, BVOM rolls processed results back before clearing the live session.

### 4.4 Rescue behaviour

LP/RPT contains a live rescue path for failed work.

The regression suite protects the established rescue pattern, including the canonical example:

`100 × 3 -> 90 × 4 -> 80 × 6+`

and the related early first-set miss cases.

Rescue behaviour must use the current workout's real prescription and cannot be based on an obsolete pre-edit load.

### 4.5 Close misses

An RPT close miss is not automatically equivalent to a full failure.

When BVOM requires the user to choose between:

- **REPEAT**
- **PROGRESS ANYWAY**

the decision is persisted before presentation and survives reload.

Choosing REPEAT must increase the relevant attempt state exactly once and keep the weight.

Choosing PROGRESS ANYWAY must apply the already-calculated next weight exactly once and reset the relevant attempt state.

### 4.6 Manual edits

If a working weight has been manually changed, later reduction/progression must be based on that current authoritative weight, not an obsolete earlier value.

Advanced Settings saved after a completed result may define future training, but they may not retroactively change what the completed workout earned.

## 5. HLM RPT

HLM RPT is an intermediate structured program.

The user-facing guidance describes it as Heavy / Light / Medium RPT for lifters who can no longer progress reliably workout to workout.

### 5.1 Weekly/day structure

**Heavy (H)**

- Squat
- Bench Press
- Prone Row

**Light (L)**

- Squat
- Deadlift
- Overhead Press

**Medium (M)**

- Squat
- Bench Press
- Supine Row

### 5.2 Driver lifts

Squat and Bench Press use HLM driver state.

Heavy exposures are the progression-driving exposures.

A successful Heavy driver exposure sets a future `nextHeavy` target based on the driver's configured increment.

Light and Medium exposures do not independently count as Heavy failures and must not erase/block an already-earned next Heavy target.

### 5.3 HLM Heavy prescription

The HLM rep stages are:

- 5
- 4
- 3
- 2

The Heavy five-set RPT targets are:

- 5 / 5 / 5 / 6 / 8
- 4 / 4 / 4 / 5 / 7
- 3 / 3 / 3 / 4 / 6
- 2 / 2 / 2 / 3 / 5

The Heavy driver/top exposure is the middle/top set; preceding and following sets are derived from it using the current HLM prescription and practical load rounding.

### 5.4 Light and Medium

Default HLM settings include:

- Light Squat reduction: 20%
- Medium Squat increase: 10%
- Medium Bench increase: 5%

These are user-configurable.

When an HLM workout has already begun, later edits to settings described as applying to the next workout must not change the partially completed current prescription.

### 5.5 Three unsuccessful Heavy attempts

For Squat and Bench driver exposures, unsuccessful Heavy attempts accumulate failure state.

At three unsuccessful attempts, BVOM persists and presents a choice.

For rep stages above doubles, the user can:

- battle on at the current rep target
- drop the lift to the next lower rep stage while keeping the weight

At doubles, BVOM presents the block-completion/next-step choice rather than silently lowering reps below the supported ladder.

That pending decision must survive reload and commit once.

### 5.6 Cross-lift isolation

Squat and Bench driver/nextHeavy state are independently earned.

Correcting one completed Heavy lift must not wipe or restore stale state for the other lift.

## 6. 4-Day Split

The 4-Day Split is an intermediate upper/lower alternative built on the HLM-style driver model.

The program rotates:

**Workout 1**

- Bench Press
- Prone Row

**Workout 2**

- Squat

**Workout 3**

- Bench Press
- Overhead Press

**Workout 4**

- Squat
- Deadlift

The progression-driving exposures are:

- Workout 1 Bench Press
- Workout 2 Squat

The corresponding derived/Medium exposures are:

- Workout 3 Bench Press
- Workout 4 Squat

The day sequence rotates:

`1 -> 2 -> 3 -> 4 -> 1`

The same correction, future-settings, optional-single, unit-conversion, and driver-isolation invariants that protect HLM also protect the 4-Day Split.

## 7. Optional heavy singles in intermediate programs

Optional Heavy Singles may be enabled for the relevant HLM/4-Day work.

The configured single percentages are guidance/settings that feed the prescription.

Changing the Optional Heavy Singles setting after live work on that exposure has begun applies to future workouts only.

It must not:

- add a second completion/progression obligation to work already underway
- remove a pending obligation from the current workout
- allow double progression

Skipping an optional Deadlift single where the program treats that skip as the completion transaction must snapshot/process the lift correctly so a later correction can roll back and recompute without retaining stale progression.

## 8. Custom Training

Custom Training is intentionally different from the structured progression programs.

Its user-facing principle is:

**Record -> remember -> you decide.**

BVOM records the session and presents previous performance, but does not automatically mutate the structured-program progression state.

### 8.1 Days

Custom Training supports between 1 and 7 saved Day templates.

At least one Day always remains.

A Day cannot be switched, added, or deleted while an active workout needs to be resolved.

Deleting a Day keeps completed History.

### 8.2 Available compound lifts

The current Custom Training compound list is:

- Squat
- Bench Press
- Deadlift
- Overhead Press
- Prone Row

A lift appears at most once in a Day template.

### 8.3 Set styles

A Custom Training compound can use:

- Straight Sets
- 3-Set RPT
- 5-Set RPT

Straight Sets use user-selected sets and reps.

3-Set RPT uses the standard three-set RPT ladders.

5-Set RPT uses the five-set Press-style ladders.

RPT drop percentage is user-configurable.

### 8.4 Optional singles

Optional singles are available for:

- Squat
- Bench Press
- Deadlift

They are derived from the planned top/working set and are not offered when the plan is already at a rep target where the single rule does not apply.

### 8.5 Actual performance

For each recorded set, Custom Training stores the actual:

- load
- reps
- RPE

The user may add extra sets beyond the plan.

The current Day plan becomes locked/staged appropriately once live work exists so changes to the future template do not rewrite already-recorded performance.

### 8.6 No structured-program leakage

Recording Custom Training work must not alter LP/RPT, HLM, 4-Day, or Bodybuilding progression state.

Custom Training may update general history/PB records where explicitly designed, but it must not behave as an automatic structured progression engine.

## 9. Bodybuilding block

Bodybuilding is a separate structured program with its own exercise-selection and progression model.

### 9.1 Block length

The main block is:

- 8 weeks
- 24 completed sessions
- alternating A/B sessions

An incomplete Bodybuilding workout may be saved to History, but it does **not** consume one of the 24 completed sessions.

After 24 completed sessions, the block is complete and the completion state/screen is shown.

### 9.2 Effort model

The intended Bodybuilding model is approximately RPE 8 / about two good reps in reserve.

It is not designed around:

- training to failure
- AMRAP progression
- a programmed deload mechanism

### 9.3 Primary loading methods

The current engine includes three main progression families:

- Stable Primary
- Demanding Primary
- Double Progression

Bodyweight/assistance exercises use directional difficulty progression rather than pretending a precise external load always exists.

### 9.4 Stable / Demanding primary rule

For the primary top set, the working range is 6–8 reps.

Decision precedence is:

- fewer than 6 reps -> reduce
- marked harder than intended -> hold
- 8 or more reps -> increase by the exercise's practical increment
- 6–7 reps -> hold

The top set drives this decision.

Back-off sets do not independently earn primary progression.

### 9.5 Double Progression

Double Progression uses the exercise's configured rep range and gating sets.

Broadly:

- first gating set below the bottom of the working range -> reduce/easier resistance
- harder than intended -> hold
- first gating set reaches the top of the range **and** the remaining gating sets meet their minimum -> increase/harder resistance
- otherwise -> hold and build reps

For numeric equipment, an earned increase requires a valid practical increment.

For band/bodyweight-style work, progression is directional rather than an invented kilogram value.

### 9.6 Actual load governs actual performance

When a user records an actual load different from the prescription, the progression/reference logic must remain coherent with the load actually performed.

The protected example is:

- prescribed 60
- actual 55 × 8
- next progression 57.5

BVOM must not calculate the next result as though 60 was actually lifted.

### 9.7 Performance-reference safeguard

A large comparable-load drop (the protected threshold is at least 30%) must be surfaced to the user where the safeguard applies.

The safeguard itself must not silently change the otherwise-correct progression decision.

After an intentional/recovery reduction, the first exposure at the reduced load may establish a fresh reference without producing a false large-drop warning against the obsolete reference.

### 9.8 Accessories inside Bodybuilding

Bodybuilding accessory work can be recorded with the workout.

The regression contract protects Bodybuilding accessory recording as progression-neutral: recording those accessory sets must not apply Bodybuilding or accessory auto-progression.

Bodybuilding history/share output must remain identified as Bodybuilding.

## 10. Bodybuilding On-Ramp

The optional On-Ramp is a low-stress starting-load calibration process for the Bodybuilding block.

### 10.1 Duration and sequence

The On-Ramp can run for up to 6 alternating A/B sessions.

Each exercise's calibration state is:

`UNSET -> PROVISIONAL -> CONFIRMED`

The first exposure finds the neighbourhood.

A later valid exposure confirms it.

Once the selected exercises are adequately confirmed, the user may hand off early to the main 8-week block. At the six-session limit, the normal hand-off path is also available.

### 10.2 Calibration target

For Stable/Demanding primary work, the On-Ramp target is 6–8 reps with about two good reps remaining.

Other exercises use their exercise-specific working range.

The On-Ramp is not a max test.

### 10.3 Above/below-range response

A clearly too-heavy/below-range exposure must move the calibration in the easier direction.

An above-range exposure that is still about right / too easy must not remain unchanged indefinitely; the calibration should move in the harder direction by the practical equipment step.

### 10.4 Confirmation provenance

Confirmation belongs to the exposure that actually established it.

If that exact confirming evidence is later corrected out of the valid range, the stale confirmation must be revoked/re-evaluated.

If the corrected evidence remains valid, confirmation remains.

Correcting a later unrelated session must not erase valid historical calibration.

### 10.5 On-Ramp must not write normal performance references

The On-Ramp calibrates starting loads.

It does not write the normal performance-reference records used by the main Bodybuilding block.

Existing legitimate performance references must be preserved through On-Ramp use/handoff.

### 10.6 Hand-off is atomic

A failed hand-off/manual-setup validation must not:

- terminate the On-Ramp
- increment/clear its session state incorrectly
- partially replace calibrated exercise state
- become permanent after reload

Only a valid successful hand-off changes On-Ramp status to handed off and activates the main block.

### 10.7 Set-entry validation is atomic

A rejected On-Ramp set entry must leave the exercise object's live and persisted state unchanged.

This includes load and practical increment.

## 11. Accessories

Accessories are optional training items integrated with structured and Custom Training sessions.

They can use different equipment types and set styles.

### 11.1 Equipment increments

A dumbbell or machine accessory progresses using its selected practical increment.

It must not be forced onto the barbell plate grid.

### 11.2 Correction

If an accessory has already earned progression and an earlier set is corrected:

- restore the accessory's pre-result state
- recompute the result from the corrected work
- apply progression at most once

A corrected miss can revoke earned progression.

A corrected success can re-earn it once.

### 11.3 Future template edits

If the user explicitly changes an accessory's future template after the old workout result was earned, later correction of that old workout must recompute the old result but preserve the explicit future template override.

Changing only the future increment must not retroactively recalculate a previously earned next load when the old performance itself is unchanged.

## 12. GPP / conditioning

GPP activities may have timers and additional result metrics.

### 12.1 Pause / resume

Pausing a timed GPP activity freezes elapsed time.

Resuming continues from the saved elapsed time.

Paused state survives reload.

### 12.2 Stop is a persisted transition

Pressing Stop must persist the stopped status and elapsed time before any additional result-entry modal is completed.

If the app reloads before those extra metrics are saved, the user must still have a route to complete the stopped result.

### 12.3 Finish while timer is running

Finish is refused while a timed GPP activity is still:

- running
- paused

The timer/session must remain intact.

The user must Stop the activity first, then Finish.

A properly stopped activity is included in History when the workout is finished.

## 13. Warm-ups

Warm-ups are preparation/guidance only.

Completing a warm-up must not:

- progress a lift
- alter the working prescription
- calibrate an On-Ramp exercise
- count as a work set

### 13.1 Structured-program warm-ups

LP/RPT, HLM, 4-Day, and Custom Training use the general warm-up generation path based on the current working/top load, units, bar, and selected plates.

Warm-up display may include plate maths and loadability guidance.

### 13.2 Bodybuilding warm-up classes

Bodybuilding classifies exercise slots as:

- Full
- Feeder
- None

For ordinary numeric barbell-style primary work, the full warm-up is approximately:

- 50% × 5
- 70% × 3
- 85% × 1–2

A Feeder slot uses a lighter single feeder set rather than the full sequence.

Equipment-specific plans may use different percentages/representations.

A barbell warm-up must never prescribe a load below the actual bar floor.

## 14. History

Finishing a workout records a History entry with the applicable program/session context.

History may include:

- date
- units
- program/day
- actual session data
- GPP results
- accessory names
- notes
- duration
- volume where meaningful
- program-specific metadata

### 14.1 Incomplete structured workouts

Where a structured program permits saving an incomplete workout, History must identify it as incomplete and the program must not falsely treat omitted obligations as completed.

Bodybuilding specifically does not consume one of the 24 sessions when saved incomplete.

### 14.2 Deleting History

Deleting a completed History record removes that record only.

It must not change current working weights or current progression state.

## 15. Local persistence and multi-tab safety

Training data is local-first.

### 15.1 Save failure

If local storage rejects a save, BVOM must not continue as though the data was safely persisted.

It presents a blocking save-failure state and requires recovery/reload rather than silently continuing.

### 15.2 Stale tabs/windows

If another BVOM tab/window has newer local data, the stale copy must not overwrite it.

The stale window is blocked and the user is told to reload.

### 15.3 Active-workout ownership

While one tab owns an active workout, another tab must not casually write competing local training state.

## 16. Account and entitlement

Normal online access passes through the BVOM account and entitlement layer.

Supported eligible states include the current server-defined forms for:

- complimentary access
- active subscriber access
- active trial
- trial not yet started where the live server confirms eligibility

Known expired/unconfirmed access is blocked as defined by the current entitlement logic.

### 16.1 Verified offline access

Previously verified eligible users may train offline on their local device under the protected offline-access rules.

Current regression coverage protects a finite cached verification grace period of 7 days.

Offline access must **not** be granted when:

- the device/user was never authenticated
- entitlement was never verified
- entitlement is known expired
- the cached entitlement belongs to a different local data owner
- the verification grace has expired
- the user explicitly signed out

Explicit sign-out, including sign-out while offline, revokes cached offline eligibility without deleting the user's local training data.

Offline-local access must not activate cloud sync until a real Supabase session exists again.

## 17. Cloud backup / restore

Cloud is a backup/sync layer around local training data.

It is not the authority for an unfinished live workout.

### 17.1 Live workout exclusion

The cloud payload deliberately excludes transient/live workout state such as:

- active set sessions
- active GPP session state
- session overrides
- processed flags
- rollback snapshots
- warm-up completion/plans
- timers / workout start time
- active HLM workout settings
- Custom Training live session/draft state

### 17.2 Do not upload over unknown remote changes

Before automatic upload, BVOM compares the known remote fingerprint with the current remote copy.

If the remote changed independently, automatic upload stops and the state becomes a conflict rather than blindly overwriting the remote data.

### 17.3 Active workouts pause cloud work

Cloud assessment/upload/restore actions are restricted while an unfinished workout is active or while account-switch protection is in force.

### 17.4 Restore protection

Cloud restore validates the cloud object before replacing local data and stores a one-step pre-cloud local copy before replacement.

### 17.5 Known implementation discrepancy — active-workout cloud restore

The intended rule in §17.3 is stricter than the current v2.8.3 implementation.

Current production behaviour already blocks cloud assessment and manual/automatic upload while an unfinished workout is active, but `bvomCloudRestore()` does not currently perform the same active-workout guard before offering/replacing local data from the cloud.

This is a known production-safety defect, not an intended exception to §17.3.

Before this documentation branch is merged, BVOM should:

1. add an executable regression contract proving cloud restore is refused while an unfinished workout is active,
2. make the smallest production change that applies the existing active-workout safety rule to cloud restore,
3. run the focused contract and the full BVOM Lab gate.

## 18. Account switching

Local data is tagged to its owning BVOM account.

A different signed-in account must not automatically open or upload data owned by another account.

If an account change is detected while an active workout belongs to the current local owner, BVOM preserves the workout and defers the account switch/cloud action until the workout is resolved and the app is reloaded safely.

## 19. Subscription / checkout

BVOM subscription checkout is initiated through the backend.

The frontend accepts only a valid HTTPS Stripe Checkout URL returned by the backend function.

Returning from Stripe with a success marker does not itself grant authoritative entitlement.

The BVOM backend/account entitlement path remains the authority for whether access is active.

## 20. Administration

The administration page can request complimentary access for a BVOM account email.

The browser UI must not be treated as the security boundary.

Server-side authorization for the `bvom-admin` function is authoritative.

The current intended business rule presented by the admin UI is that an active paid subscriber is not silently converted to complimentary access; the paid period should be allowed to remain authoritative until the backend permits the complimentary transition.

## 21. Language

BVOM supports English and Japanese.

Behavioural changes that introduce or change user-visible contractual text must account for both languages where the product currently localises that surface.

A change must not pass simply because the English path works while the Japanese contractual path is broken.

## 22. Program switching / starting setup

Starting Setup and program changes are potentially destructive because they can replace prescription state.

Therefore an unfinished active workout must not be silently erased or orphaned by:

- Run Starting Setup Again
- switching into Bodybuilding
- switching out of Bodybuilding
- other program-switch paths protected by the active-workout guard

When no workout is active, setup/program selection remains available normally.

## 23. Behavioural invariants

The following invariants are intentionally treated as first-class product rules and are represented in the executable sequence regression tier:

1. **No-op is neutral** — a no-op Settings save cannot rewrite the rollback point.
2. **Restorable state is unit-coherent** — anything that can later be restored must convert together.
3. **No-training unit round trips are reversible**.
4. **Correction recomputes the result** rather than trusting stale processed state.
5. **Recorded work is non-destructive** before Finish/History.
6. **Post-result config cannot re-price an earned result**.
7. **Correction invalidates superseded calibration evidence**.
8. **Failed validation is atomic** in memory and persistence.
9. **Recorded arbitrary loads/increments survive no-training round trips**.
10. **Active-workout prescription is immutable after work is recorded**.
11. **Correction recomputes earned state, then merges explicit future overrides**.
12. **Intermediate rollback is lift-scoped**.
13. **Recorded actual loads round-trip exactly** where protected.
14. **Unresolved progression decisions survive reload**.

These are not implementation trivia. They are part of BVOM's expected behaviour.

## 24. Change discipline

A future feature or repair should not casually change this specification as a side effect.

If the intended behaviour genuinely changes:

1. agree on the new behaviour,
2. update the relevant executable tests/contracts,
3. update this specification,
4. make the smallest production change,
5. run the focused tests and full BVOM Lab gate,
6. review the resulting behaviour as one coherent change.

The desired outcome is simple:

**The user should be able to trust that what BVOM shows, records, progresses, corrects, converts, restores, and syncs all refer to the same training reality.**

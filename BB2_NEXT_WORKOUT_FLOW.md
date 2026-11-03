# BB2 next workout and inline decisions — v3.0.0

The idle Workout tab now previews the next counted session through the same renderer used for active BB2 workouts. Completed credits drive Upper A → Lower A → Upper B → Lower B. Incomplete normal work repeats its day; recovery does not advance the counted rotation. Full 32-credit blocks require the existing explicit next-block review. Optional recovery prescriptions remain explicit; no harder/easier bodyweight plan is invented.

Previewing only reads canonical data. Start Workout checks the exact opening/journal/setup/unit/selected-day preview snapshot before committing a Start. No session or elapsed/rest clock is created by rendering. Returning from History refreshes a stale preview while preserving unchanged first-use inputs. Prescribed working loads reuse the shared progression resolver, including compatible cross-day exercises and independent incompatible prescriptions. Unknown first-use loads remain editable inputs; known prescriptions use the existing Edit Weight dialog. Previous exercise records remain available in History and existing programme options, without repeating reference labels on every Workout card. Idle BB2 previews hide the inactive Finish/rest bar.

## Shared interface integration

`bvomWorkoutDayChoices()` extracts the exact existing 4-Day Split / HLM / LP selector markup. Workout and Warm-up retain the same classes, selected state, click handlers and lock rules. BB2 uses that helper with 1–4 for Upper A, Lower A, Upper B and Lower B. BB1/BB2 continue to use `bvomWorkoutExerciseHeader`, `bvomWorkoutSetMarkup` and the existing Edit Weight presentation.

Selecting a BB2 day changes only a document-local preview selection, never the saved document, ledger, credits or progression. The stale-preview token includes that selection. A terminal session event or block/owner change invalidates it, returning to the existing next-session selector. Reload recovers an active Start exactly; an idle preview defaults to the canonical next day. Active sessions lock all four choices. Existing per-day quota, recovery and explicit extra-workout rules are unchanged.

The full-width top Start and preview explanation panel are removed. A compact secondary Start beside the workout header preserves the explicit durable session boundary. The ordinary fixed Finish/rest toolbar remains unchanged during training. Existing service-worker notifications retain pending updates during training and return after Finish; neither a stale button nor an activation race can reload an active workout.

## Which decisions need input?

Ordinary on-plan barbell/dumbbell results use the unchanged automatic progression rules and increments. There is no extra confirmation for those results. A genuinely off-plan loaded result retains the existing explicit actual-versus-planned choice before Start, directly on its Workout card. Bodyweight top-of-range results retain the existing explicit difficulty choice; HOLD is always explicit, and assistance, variation and added weight are never selected automatically.

Bodyweight decisions appear on the affected Workout card. HOLD is immediately accessible; Change difficulty expands the existing responsive fields. Other exercises can be trained first. Recording, warm-up locking and prescription edits for the deferred exercise remain blocked until the choice is resolved. The old programme options remain available for exercise swaps, optional work and recovery, without being required for the normal next-workout flow.

## Ledger and compatibility

New normal UI Starts opt in with `inlineDecisions: 1`. Historical Starts retain their original pending-decision rules. An `EXERCISE_READY` event references the exact explicit `CHOICE_RESOLVED` event for a deferred bodyweight exercise. Choice and readiness commit atomically. Readiness changes only that session's effective bodyweight plan, not its immutable Start, exercise identity, sets, rep range, credits or progression formula.

The fold rejects missing/foreign/stale/duplicate readiness, recording or locking before readiness, and edits that could silently decide the question. Shared aliases use the same source-offer proof. Readiness events are session-local on Discard; the explicit global progression choice survives. Internal prefix replay receives proof only from an already-validated Discard in the complete journal, so retained global choices can replay while top-level unlinked tombstones still fail closed.

Readiness is evaluated from the original Start prefix. Retrospective corrections retain later recorded actual sets and invoke the existing invalidated-choice consent rules. Pending choices carry through the existing sealed-opening proof. Old clients reject the new closed event/metadata shape rather than appending silently under old rules.

No database, RLS, ownership, revision CAS or stale-device policy changes. No new bodyweight storage. Catalogue, Log Push Press, BB1, LP/RPT, HLM, Custom and 4-Day Split algorithms are untouched.

## Focused evidence

- `bb2_next_flow_contracts.mjs`: pure preview, updated loads, stale preview rejection, incomplete-with-note/recovery rotation, 32-credit review and fresh opening.
- `bb2_inline_decisions_contracts.mjs`: HOLD and difficulty acceptance, direct recording/lock rejection, forged/duplicate readiness, exact replay, discard, correction consent, and a bounded 32-credit carry seam (`--seal`).
- `bb2_next_flow_browser.cjs`: real 360px/390px UI; completed four-day fixture → Upper A; explicit Start; manual weight/increment edit; automatic weighted increase; other sets before Nordic choice; both explicit choices; interrupted reload; actual file export/import; shared numbered selector, read-only day switching, out-of-order selected Start/credit/next day, no mobile overflow, compact Start, deferred update notification and active-reload race protection.
- Authenticated cloud browser proof trains a bodyweight offer on one device, resolves it inline on the second, and compares the exact canonical journal with the stored server row.
- Full existing regression, browser, cloud-isolation and packaging checks remain required. No additional 220-session endurance run.

Owner approved PR #73 at `de34b476c38b9874ce65fb4cf880f12754282539` for v3.0.0 production preparation. The integration was merged as `1bd75e2f219ffe9ca19901112a8178dcb87c309c`. Deployment is manual by the owner; live hosting remains v2.9.21 until upload.

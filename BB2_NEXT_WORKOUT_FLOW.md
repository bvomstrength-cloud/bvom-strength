# BB2 next workout and inline decisions — HOLD

The idle Workout tab now previews the next counted session through the same renderer used for active BB2 workouts. Completed credits drive Upper A → Lower A → Upper B → Lower B. Incomplete normal work repeats its day; recovery does not advance the counted rotation. Full 32-credit blocks require the existing explicit next-block review. Optional recovery prescriptions remain explicit; no harder/easier bodyweight plan is invented.

Previewing only reads canonical data. Start Workout checks the exact opening/journal/setup/unit preview snapshot before committing a Start. No session or elapsed/rest clock is created by rendering. Prescribed working loads reuse the shared progression resolver, including compatible cross-day exercises and independent incompatible prescriptions. Unknown first-use loads remain editable inputs; known prescriptions use the existing Edit Weight dialog. Previous exercise records remain available as starting-load references. Idle BB2 previews hide the inactive Finish/rest bar.

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
- `bb2_next_flow_browser.cjs`: real 360px/390px UI; completed four-day fixture → Upper A; explicit Start; manual weight/increment edit; automatic weighted increase; other sets before Nordic choice; both explicit choices; interrupted reload; actual file export/import.
- Authenticated cloud browser proof trains a bodyweight offer on one device, resolves it inline on the second, and compares the exact canonical journal with the stored server row.
- Full existing regression, browser, cloud-isolation and packaging checks remain required. No additional 220-session endurance run.

PR #73 remains draft. Production v2.9.21 stays on HOLD. Next checkpoint: owner Android acceptance using the separately packaged v2.9.22 test build.

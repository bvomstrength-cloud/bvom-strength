# BB2 Stage (ii) — isolated setup and catalogue checkpoint

**Design authority:** `BVOM-BB2-SPEC-REVIEW-V3.5.1.md`, SHA-256 `c1cfb71c60e38e0bf64b290def561eb5787da488556db7c5d0eb652fe76591a6`. Read the original design specification before expanding this implementation. This note is only a development checkpoint.

**Frozen prerequisite:** Stage (i) ledger and event schema at `4818f0b4df189ff20ea3e81d863d59719cf0ad5e` on draft PR #71. Independent Round 5 audit: **GO for schema freeze**; BVOM Lab #540, Browser Runner #296, Draft Packaging #287 green for that exact commit. No approval to merge or deploy.

## What this first Stage (ii) checkpoint provides

- A pure, CommonJS, versioned exercise and prescription catalogue in `bb2/catalogue.cjs`. No imports, application shell, storage, network, clock, or changes to BB1 or the Stage (i) ledger.
- Four weekly template IDs: Upper A, Lower A, Upper B, Lower B. Default prescribed counts and minimum-finish counts: **12/9, 11/8, 13/10, 12/9**. The explicit pre-Start optional Upper B curls selection makes Upper B **15/11** when enabled.
- A finite role-scoped initial list of exercise choices, suitable for minimum-equipment training with optional machines/cables; roles and options are validated as closed, versioned setup snapshots.
- Explicit specialist overrides: conventional deadlift 2×4–6 vs RDL 3×6–10; log push press 2×4–6 vs conventional press 2×8–12; unassisted Nordic curl 2×4–8. Other role defaults and exercise choices must be checked against Rev 3.5.1 before enabling real workouts.
- Each slot carries a rep floor and ceiling, fixed prescribed set count, equipment class and warm-up class; one stable warm-up-friendly order intended for both future Workout and Warm-up screens. No arbitrary kilogram guesses for bodyweight exercise variants.
- Strict, immutable setup change helpers (`createBB2Setup`, `chooseBB2Exercise`, `setBB2OptionalCurls`) that can later be stored before Start, but **no application persistence or Start event is emitted** at this checkpoint.

Focused proof: `node tests/bvom-lab/bb2_stage2_catalogue_contracts.js`. Included in the full `tests/bvom-lab/gate.js` regression sequence.

## Second checkpoint — guarded new NORMAL Start

`bb2/start.cjs` is an app-independent, pure validator plus atomic-transaction adapter. It accepts only *new* NORMAL and EXTRA_NORMAL Starts; RECOVERY will have its own low-stress planner. It checks the exact catalogue version's slots, role order, set counts, both rep-range endpoints, equipment and optional-curls denominator before calling the frozen `commitBB2Transaction`.

- An uncalibrated first loaded Start must contain a genuine, typed numeric origin and explicit increment. It cannot claim arbitrary `DERIVED` source metadata or silently use an LP setting.
- A subsequent Start inherits its computed/current load and increment **exactly** from the folded event stream. DERIVED source lineage must correspond to an actual earning event and a verified load change.
- A sealed predecessor's DERIVED load requires replay-verified sealed-block evidence (`priorSealedBlock.opening` plus its complete events); an unattested opening field is insufficient. Historical corrected snapshots remain read-only; this validator is **not** applied retroactively when replaying them.
- A bodyweight Start requires explicit variation and assistance, with added numeric mass only when the user entered it. No guessed mass.
- Commit requires an explicit inactive-workout guard, and Stage (i) still guards owner/block/rules/head/seal and overlapping workout state.

Focused proof: `node tests/bvom-lab/bb2_stage2_start_contracts.js`, including a real 32-credit sealed block and adversarial forged-carry test. Included in the full Lab gate.

This is a validator for constructed new Start events, **not** an installed writer or a runtime app integration. It does not yet persist setup or enforce at-rest import validation.

## Required next Stage (ii) contracts — not yet implemented

1. Real application-side `WORKOUT_STARTED` planner and atomic persistence that call the pure guarded Start boundary, bind it to a **durably stored** pre-Start setup and enforce isolation from legacy save/restore and cloud comparison logic. Add a distinct low-stress RECOVERY Start planner.
2. Durable local pre-Start setup persistence (exercise choices and optional curls), guarded for ownership/restore. Do not add new data to an unprotected cloud fingerprint or cloud payload.
3. Persistent `(blockId, sessionId, eventRevision)` Finish/credit idempotence and a restore/import validation path that enforces eligible NORMAL Finish plus its credit together. Arbitrary bare `foldBB2Block` must never be treated as trusted imported application state.
4. Append through `planBB2Finish` and `commitBB2Transaction` with stale-head, ownership and sealed-block protection. Later UI and storage integration require separate gates, then an independent audit before enabling users.

The Stage (i) event and fold rules remain frozen. Stage (ii) can introduce a new validated writer outside that ledger; any fold-rule change must follow the pinned `foldRulesVersion` mechanism. No merge, production deployment or Supabase access is authorised by this checkpoint.

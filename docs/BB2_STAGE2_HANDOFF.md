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

## Third checkpoint — replay-verifying restore and Finish key material

`bb2/restore.cjs` validates a complete restored/imported block with the original frozen fold. It then checks each NORMAL Finish **at its original ordinal**: when that Finish was 70%-eligible under its quota, the next event must be the matching `CREDIT_GRANTED`. This rejects a bare Finish that the low-level fold can otherwise represent as `COMPLETED_NORMAL_NONCREDIT`; a later unrelated credit cannot disguise the omission. Legitimate future corrections plus revocation remain replayable. A below-70%-gate session records `WORKOUT_INCOMPLETE`, not a falsely credited Finish.

`bb2FinishRevisionKey(blockId, sessionId, eventRevision)` produces deterministic, collision-free idempotence key material. **It is not durable on its own**: the eventual storage commit must atomically save the key and the Finish/credit events, with owner/head/lease guards. Structural adjacency is proof of pairing in the restored stream, not independent proof of original atomic disk writes.

Focused proof: `node tests/bvom-lab/bb2_stage2_restore_contracts.js`. Included in the full gate.

## Fourth checkpoint — dormant owner-scoped local storage adapter

`bb2/local-store.cjs` provides a **dependency-injected, not runtime-registered** local writer. Its host must supply a localStorage-style adapter and a real exclusive per-owner cross-tab lock. It never reads or writes the legacy BVOM `state`, cloud payload, comparison fingerprint, auth, or browser globals. The sole owner-namespaced key is `bvom.bb2.local.v1.<encoded owner ID>`.

- `initialize` saves a versioned setup plus Stage (i) opening snapshot as one JSON value; it never resets or replaces a different existing block.
- `saveSetup` durably commits optional curls / exercise choices before Start, rejecting active-workout changes or stale revisions. `commitStart` uses the **persisted** setup, never an unsaved UI draft, and delegates to the pure catalogue/lineage validator and Stage (i) transaction guard.
- `appendEvents` uses `commitBB2Transaction` while blocking direct Start, Finish, first credit, and Seal bypasses. `commitFinish` plans Finish + any first credit together, saves the stable revision key and events in **one `setItem`**, and replays strictly upon load.
- Writes return success only after verifying the exact serialized bytes can be read back. If storage throws after writing, the outcome is explicitly **uncertain**, never falsely rolled back. The same Finish key can safely be retried after re-reading the durable event stream.
- All operations reject stale expected local revision within the required injected exclusive lock. Two competing tabs cannot silently overwrite each other; owner switching produces a separate key. Full restored-ledger and Finish-pair validation runs before trusting imported bytes.

Focused proof: `node tests/bvom-lab/bb2_stage2_local_store_contracts.js` (13/13), including two-tab races, post-write exceptions, duplicate Finish, key-order-insensitive saved setup, malformed import, owner isolation and full 673-event history replay (~0.3–0.4 seconds locally). This is part of the full Lab gate.

**Not live yet.** This module is a testable storage boundary, not a PWA integration. The actual browser wiring must prove Web Locks availability/fallback, offline reload, owner changes, input durability, older-client writer fencing, backup/restore, and cloud-payload/fingerprint exclusion. It currently stores one block only; rollover/archive wiring and performance at full real-user history sizes remain pending. Do not permit real users to write BB2 before these safety gates pass.

## Fifth checkpoint — dormant real-browser Web Locks host

`bb2/browser-host.mjs` provides an import-safe ES module bridge for a future browser integration. The host injects `runtime`, authenticated and local owner checks, and a positive `canWrite` policy which **must remain disabled for real users** until rollout is approved. It exposes a localStorage-style wrapper restricted to the single owner-specific BB2 key and a non-waiting exclusive `navigator.locks.request` callback. Writes outside the held lock, on an account/owner switch, on an unsupported browser, while another tab owns the lock, or when the writer policy is not explicitly `true` fail closed. There is no localStorage-lock imitation or automatic takeover. All guards are repeated inside the lock and immediately before disk writes. Importing the module has no side effects.

Focused Node proof: `node tests/bvom-lab/bb2_stage2_browser_host_contracts.mjs` (8/8), including an actual call into the dormant `createBB2LocalStore`. Real Chromium proof: `node tests/bvom-lab/bb2_browser_host_browser.cjs` exercises two isolated tabs, contested write refusal and handoff, account switches during work, unsupported browser, read-only policy, and offline reload using an HTTP fixture. The latter runs in the Browser Runner CI workflow; it requires installed Playwright Chromium and is not a production app interaction.

This does **not** yet authorize app installation. In particular, a callback supplied by a future production host must independently prove that its BVOM document is entitled, belongs to the current account, is on the supported writer protocol, and is not mid-account-switch. Existing older documents do not know about BB2, so the separated key keeps their ordinary state and cloud payloads untouched, but a multi-device writer/restore rule still needs proof. The CommonJS ledger/local writer also still needs a deliberately reviewed browser packaging strategy; no script is included in `index.html` and no BB2 UI is exposed.

## Required next Stage (ii) contracts — not yet implemented

1. Wire the tested browser host to the dormant writer after a reviewed browser packaging strategy; prove the real BVOM auth/entitlement/document-owner callbacks, older-client/cloud-writer fencing and **multi-device** safety. Do not add any BB2 data to unprotected cloud fingerprints or payloads, or expose the option to real users before the guards are independently proven.
2. Real app-side `WORKOUT_STARTED` planning, first-load entry, bodyweight assistance selection, exact Warm-up/Workout shared ordering, historical backup/restore and tab-scoped reload resume. Add a distinct low-stress RECOVERY planner.
3. Seal/next-block rollover and archive retention with a full verified origin chain, plus performance hardening of large-history load/replay and tested corruption recovery.
4. Independent adversarial audit and browser/mobile tests of the complete integration before any user-visible activation. Stage (i) fold schema and BB1 remain unchanged.

The Stage (i) event and fold rules remain frozen. Stage (ii) can introduce a new validated writer outside that ledger; any fold-rule change must follow the pinned `foldRulesVersion` mechanism. No merge, production deployment or Supabase access is authorised by this checkpoint.

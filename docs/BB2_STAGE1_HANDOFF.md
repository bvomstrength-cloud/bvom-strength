# BB2 Stage (i): isolated ledger foundation — handoff

**Status:** Development branch only; no production changes and no Stage (i) application code yet.

- **Branch:** `feature/bb2-stage1-ledger-foundation`
- **Baseline:** `c167cc37b14d1f0b6e99720d2fdae36d4cac2ab8` (v2.9.18)
- **Design authority:** `BVOM-BB2-SPEC-REVIEW-V3.5.1.md` (full document supplied by owner in ChatGPT), SHA-256 `c1cfb71c60e38e0bf64b290def561eb5787da488556db7c5d0eb652fe76591a6`. **Obtain and inspect the entire original document before making feature code changes.** This handoff is not a substitute for that specification.
- **Independent reviews:** Codex GO for Stage (i) on Rev 3.5; Claude GO for Stage (i) with three clarifications adopted in Rev 3.5.1.
- **Merge/release:** Not authorised; owner approval is required. The default `main` application and Netlify v2.9.18 must remain unchanged.

## Stage (i) intended scope

1. Define an isolated, versioned `bodybuilding2` domain shape and immutable event types. Identity must include template + role slot + exercise; four eight-credit quotas, stable session/block IDs, canonical integer grams, event ordinals (including tombstones), pinned fold rules and seals.
2. Write a **pure, deterministic fold** for normal/extra normal, recovery/incomplete/void, per-exercise calibration, progression, credit grants/revocations/restorations, manual edits and explicit ACCEPT/KEEP/difficulty events. The same fold must govern Finish and correction and emit a canonical History projection.
3. Write golden expected-output fixtures **before** live UI integration, including: mixed-calibration/no baseline; 70% session credit vs complete exercise gates; original planned snapshots across later corrections; invalidated acceptance after correcting its *later* superseder; KEEP-as-manual taking effect at its **original value event ordinal** while a revision audit is recorded at the correction ordinal; independently committed global pre-lock edit surviving Discard; and displayed 226 lb representing unchanged 102500 g for both set entry and prescription-edit no-op.
4. Reconcile credit corrections without credit displacement, confirm sealed-block snapshot rules, revalidate ledger head and owner/seal before any correction writes, reject unsupported fold versions, and test that incremental projection agrees with full replay **and** fixed expected outcomes.
5. Add focused tests for atomic rejection, idempotence, and anti-cross-program leakage. Run full BVOM Lab gate; do not weaken existing BB1 contracts.

## Strict non-goals and safety gates

- **No visible BB2 programme, setup/workout screens, stage (ii) engine integration, altered BB1 progression, migration of existing training, or cloud integration during Stage (i).**
- No production Supabase contact, no production Netlify deployment, no direct changes to `main`.
- **Never allow unprotected BB2 bytes to enter the existing cloud payload or comparison fingerprint.** Before any dev/test user can actually save a BB2 ledger in the application, prove local-only staging, guarded legacy restore, ownership, and rollback. Server-enforced older-client writer denial + monotonic seal CAS remain mandatory for real-user/cloud release.
- Do not publish or enable the staged feature outside developer/test accounts before gates are proven.
- Respect repository `AGENTS.md`, `ARCHITECTURE.md` and `BVOM_SPEC.md`. BB1 stays 24 sessions; BB2's four-template 32-credit engine is independent.

## First development checkpoint

Start with tests covering the **closed event inventory** and the **pure fold contract**, before wiring persistence or UI. Produce a draft PR with focused tests, exact source baseline, a full gate and independent review. **Stop before merging to `main`.**

## Claude independent cold audit — 25 October 2026 (re-audit requested)

Claude read Rev 3.5.1 but only the first ~1,000 lines of the pinned ledger; the remaining seal/transaction code and complete tests were inaccessible. Its **HOLD was a verification hold, not a verified release regression**. It identified issues that were reproduced with new local failing contracts before repair:

- Repeated historical prefix folds caused exponential calibration replay. A single top-level fold now memoises its exact historical prefixes, without caching between changed event streams.
- Unknown event/slot/origin fields previously passed validation. v1 has per-event closed payload fields, including immutable numeric-origin keys.
- Qualitative bodyweight DIFFICULTY_ACCEPT now records variation/assistance without made-up grams; an explicitly chosen added load remains permitted. Test both current-block and sealed-to-next-block offers.
- REPLACE explicitly starts a fresh comparable epoch even when it confirms the same canonical grams.
- Restored credit grant/revoke/regrant events cannot modify older quota credits while another session is active, matching the transaction guard.
- Displayed unchanged earned loads can inherit `{kind:'DERIVED', sourceEventId}` without inventing an original typed weight.

These cases are covered in `tests/bvom-lab/bb2_stage1_cold_audit_contracts.js` and included in the Lab gate and mutation harness. Existing goldens, hardening and replay-performance checks remain required. **Stage (i) is still unmerged and not yet approved to begin Stage (ii)** pending a truly complete source/spec cold re-audit of the latest exact candidate.

## Claude cold audit, round 2 — 25 October 2026 (five findings addressed)

Claude independently executed the full packaged Stage (i) source and tests at `3c010f0` and reported **GO WITH FINDINGS**, conditional on resolving three medium-risk integrity issues before schema freeze. The following fixes were reproduced with adversarial streams and added to the cold-audit regressions before this follow-up candidate:

1. **Qualitative bodyweight REPLACE:** accepts a changed variation/assistance without fictitious kilograms; forces a fresh comparable epoch even at a null load.
2. **Earned DERIVED provenance:** Start slots and on-plan recorded sets may preserve their claimed derived source-event ID; a set may not contradict the saved plan's source or grams, and corrections may only inherit originally recorded derived provenance. **This does not independently prove that the Start plan's `sourceEventId` exists**; catalogue/append-time source-lineage validation remains required before Stage (ii) writes.
3. **Next-block opening authority:** `createNextBB2Opening(previousOpening, previousEvents, newBlockId)` folds the exact sealed ledger internally. No exported API trusts a caller-supplied projection, even if a forged progress value matches a forged closing snapshot.
4. **Closed opening shape:** opening snapshot, progress records, and carried pending offers reject unknown keys.
5. **Atomic NORMAL Finish:** `commitBB2Transaction` refuses an eligible below-quota NORMAL Finish unless the same transaction grants its credit. The idempotent `planBB2Finish` path still creates the correct paired events and no-ops on retries.

All modifications remain in the isolated `bb2/` module and dedicated Stage (i) tests. The earlier sealed-projection adversarial hardening checks still exercise the *private* snapshot checker from an isolated test-only VM; production callers can only use the replay-verified public next-block API. This round does **not** constitute independent final GO: re-run the full lab, browser, packaging and mutation gates and request another independent read of the exact new source after committing it.

**Stage (ii) integration prerequisites (not implemented here):** a versioned catalogue validating newly appended Start plans against computed prescriptions and the four canonical template denominators; persistence of optional-curls selection before Start; a durable `(blockId, sessionId, eventRevision)` Finish/credit idempotence key; and routing *all* application writes through `planBB2Finish` and `commitBB2Transaction`. Historical Start snapshots must remain replayable without retrospective catalogue rejection.

Items for Stage (ii) contract review rather than changes to the Stage (i) replay schema: persist the pre-Start optional-curls selection in the versioned setup catalogue; validate new Starts against that catalogue and computed prescribed ranges/denominators while preserving legal historical plan snapshots; and define the integration-side stable finish/commit idempotence key. `planBB2Finish` already treats duplicate Finish calls as no-ops, while the fold deliberately refuses duplicate imported Finish events. Loaded zero-gram actuals are currently permitted by the canonical nonnegative mass rule; confirm UI equipment constraints before enabling user input.

## Round 3 independent audit reconciliation — 25 October 2026 (schema-freeze HOLD pending re-audit)

Claude independently read and ran the complete `ed589966` source/tests against the verified Rev 3.5.1 specification and gave **GO for the five round-2 repairs**. He separately documented two Low integration boundaries: a DERIVED Start origin does not prove the claimed source event exists, and a bare eligible NORMAL Finish is rejected at `commitBB2Transaction`, not by an arbitrary restored raw-stream fold. Both require Stage (ii) append/restore validation, not a silent exception.

A separate Codex cold audit then reported five **different** calibration/progression/schema errors. We reproduced all five as RED with independent adversarial cases **before changes**. This next Stage (i) candidate repairs:

1. **First-exposure offer bypass:** a historical ACCEPT/KEEP or difficulty resolution now requires a pending offer at its **original event ordinal**. First calibration never issues ordinary off-plan/difficulty offers, so it cannot earn an illicit all-top ACCEPT increment. Later correction does not invalidate a choice that was genuinely offered when originally made.
2. **False assisted bodyweight calibration baseline:** a uniform first-exposure record seeds comparable reps only if its actual variation, assistance and added load match the final accepted exercise identity. Wrong-band records remain History but cannot seed `bestReps` or leak a false baseline through block sealing.
3. **Unchanged difficulty ACCEPT:** both current-block and carried decisions require an actual change to variation, assistance or explicit added load. Accepting the exact existing identity cannot reset a hard-earned epoch.
4. **Historical assisted promotion:** a qualified Finish compares and promotes the *entire* comparable bodyweight identity, not just grams. A historical on-plan different-band snapshot starts a fresh epoch before setting `bestReps` or counting stalls, **including retroactive first-exposure calibration**, which must still suppress any automatic increase. An already-matching qualitative identity does not create a phantom load epoch.
5. **Closed rep ranges:** optional validated `floor` is now retained alongside `ceiling` in immutable Start/lock/History snapshots. Invalid or rewritten floors are rejected. The Stage (ii) versioned catalogue must require the floor for every new Start while allowing old Stage (i) fixtures to replay.

Older consent hardening fixtures that issued ordinary ACCEPT/KEEP on an uncalibrated first exposure were corrected to seed an **explicit already-calibrated opening**, preserving the intended correction/consent contract without relying on an illegal offer. Additional mutation operators defend the five fixes. This is a **new candidate** requiring complete gates and fresh independent review; Claude's earlier GO does not automatically cover these changes. PR stays draft/unmerged; Stage (ii) remains withheld.

**Exact local candidate gate:** **GO** — 20/20 deterministic goldens, 156/156 hardening, 20/20 independent cold-audit regressions, **124/124 deliberate BB2 mutations killed**, replay performance PASS, and all static/behaviour/sequence/legacy mutation/known-bad reference tiers PASS. These are author-side results, not an independent cold-audit GO for this new revision.

**Additional Stage (ii) restore contract:** validate imported/restored ledgers through the same atomic Finish+credit and versioned-start checks as append-time writes. Do not treat a successful raw fold alone as proof that a complete NORMAL Finish's credit was persisted.

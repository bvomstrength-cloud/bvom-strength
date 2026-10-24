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

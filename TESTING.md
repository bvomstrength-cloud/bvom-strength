# BVOM Strength — Testing and Release Gates

This document is the practical testing source of truth for BVOM Strength development.

Read it with:

- `AGENTS.md` — development rules and working style
- `ARCHITECTURE.md` — system boundaries and high-risk code paths
- `BVOM_SPEC.md` — behavioural contracts
- `tests/bvom-lab/README.md` — detailed regression-suite history
- `tests/bvom-lab/MANUAL_REGRESSION_MATRIX.md` — checks that require a real browser, device, account, or external service

## 1. Core rule

BVOM changes use this sequence:

**reproduce → understand → smallest fix → focused proof → full regression → PR gate**

A syntax check is not release evidence. A targeted test is not a substitute for the full gate. A green full gate is not a substitute for real-device checks where the harness cannot model the platform.

## 2. Current automated gate

The current protected workflow job is named:

`v15.2 full regression gate`

That exact job name is also the required status-check context for protected `main`. Do not casually rename it without updating branch protection at the same time.

The current maintenance gate shape after F44 is:

- Static: **23/23 PASS**
- Behaviour: **78/78 PASS**
  - 21 CONTROL
  - 8 NEGATIVE
  - 49 DEFECT
- Sequence / invariants: **14/14 PASS**
- Mutation: **62/62 killed**
- v2.8.0 known-bad reference: **47/47 applicable DEFECT contracts fail**
- Later-regression provenance N/A on the v2.8.0 reference: **F23, F25**
- Final verdict: **GO**

These counts describe the current test suite, not a promise that future suites will retain the same numbers.

## 3. What each tier proves

### Static / packaging

File: `tests/bvom-lab/regression_guard.js`

Protects release structure and static contracts, including:

- required shipped files
- JavaScript syntax/loadability
- manifest structure
- service-worker cache references
- build identifiers
- title/build agreement
- locale cache-busters
- selected contractual EN/JA wording

This tier does not prove live application behaviour.

### Behaviour

File: `tests/bvom-lab/behaviour_guard.js`

This is the authoritative executable behavioural tier.

It boots BVOM's real inline application script inside the Node harness and exercises real application functions and state transitions. It checks persisted state and, where relevant, rendered output.

Test kinds:

- `CONTROL` — established behaviour that must keep working
- `NEGATIVE` — access or unsafe behaviour that must remain blocked
- `DEFECT` — permanent contracts added for reproduced production defects

Focused execution:

```bash
node tests/bvom-lab/behaviour_guard.js <candidate-build-dir> --only=TEST-ID
```

Multiple IDs may be comma-separated.

Example:

```bash
node tests/bvom-lab/behaviour_guard.js <candidate-build-dir> --only=F44-ACTIVE-WORKOUT-CLOUD-RESTORE-GUARD
```

### Sequence / invariants

File: `tests/bvom-lab/sequence_guard.js`

Protects state-machine rules that span features and sequences rather than one isolated screen or function.

Examples include:

- no-op settings neutrality
- correction rollback and recomputation
- unit-conversion reversibility
- active-workout prescription immutability
- lift-scoped correction isolation
- recorded actual-load round trips
- persisted unresolved progression decisions

### Mutation validation

File: `tests/bvom-lab/mutation_check.js`

Mutation testing deliberately injects known-bad changes into throwaway copies of the candidate.

A healthy suite must kill those mutations.

Important outcomes:

- `KILLED` — expected; a regression test detected the injected defect
- `SURVIVED` — NO-GO; known-bad code escaped detection
- `STALE` — NO-GO; the source anchor changed and the mutation must be updated
- `N/A` — acceptable only where explicitly documented, such as later-regression provenance that cannot apply to the older reference build

Never weaken a real behavioural contract merely to make a mutation or historical fixture convenient.

## 4. Known-bad reference

The permanent historical reference is:

`test-fixtures/v2.8.0-known-bad/`

Its purpose is to prove that applicable DEFECT contracts really detect older broken behaviour.

It is not a production candidate and is not expected to pass those defect contracts.

The current reference expectation is:

- 47/47 applicable DEFECT contracts fail
- F23 and F25 are explicit later-regression provenance N/A

## 5. Full local gate

Requires Node 18 or newer and no npm dependencies.

Run:

```bash
node tests/bvom-lab/gate.js <candidate-build-dir> test-fixtures/v2.8.0-known-bad
```

The gate runs, in order:

1. static
2. behaviour
3. sequence
4. isolated BB2 Stage (i) golden contracts (`bb2_stage1_contracts.js`),
   hardening contracts and independent cold-audit regressions
   (`bb2_stage1_cold_audit_contracts.js`)
5. mutation + known-bad reference

BB2's independent contract tier checks original numeric-entry provenance alongside
canonical integer grams: saved plans, increments, actuals and revisions require
an immutable `*Origin` value/unit field. Unit display changes and unchanged
rounded submissions cannot create a new load epoch; an explicitly different
actual is a separate action. Malformed or contradictory origins fail closed.
These are draft Stage (i) domain contracts, not live-app or cloud features.

The final line must be:

`VERDICT: GO`

Anything else is NO-GO.

## 6. Production candidate boundary

GitHub Actions stages only the shipped production surface into `.bvom-candidate` before running the gate.

The 12 production files are:

```text
admin.html
i18n/en.js
i18n/ja.js
icon-192.png
icon-512.png
index.html
manifest.json
og-image.png
sw.js
theme-bee-v23c.svg
theme-cherry-v23f.svg
theme-coastal-v23f.svg
```

Tests, fixtures and documentation are not part of the deployed candidate.

If the shipped file set intentionally changes, update the workflow, static guard and architecture documentation together.

## 7. GitHub Actions

Workflow:

`.github/workflows/bvom-lab.yml`

Automatic triggers:

- push to `main`
- push to `dev/**`
- pull request targeting `main`

Therefore a push to a branch such as `fix/**` or `docs/**` does not automatically run the Lab merely because it was pushed.

A PR targeting `main` does run the required gate.

Protected `main` requires the exact status context:

`v15.2 full regression gate`

and requires the branch to be up to date before merge.

## 8. Bug-fix proof sequence

For a reproducible defect:

1. Start from current `main`.
2. Create a focused branch.
3. Add or identify the smallest executable contract that expresses the intended behaviour.
4. Run that contract against the unfixed code and confirm it fails for the expected reason.
5. Inspect the responsible production path.
6. Make the smallest production change.
7. Re-run the focused contract and confirm it passes.
8. Run the full BVOM Lab gate.
9. Inspect the diff for unrelated changes.
10. Open a PR to `main`.
11. Require the protected PR gate to pass.
12. Merge only after the evidence is clean.
13. Verify the post-merge `main` run also passes.

A test that was written only after the fix and never shown red against the reproduced defect is weaker evidence than a red→green contract.

## 9. F44 example

The active-workout Cloud Restore defect is the reference example for the workflow above.

Permanent contract:

`F44-ACTIVE-WORKOUT-CLOUD-RESTORE-GUARD`

Pre-fix evidence:

```text
beforeActive=true afterActive=false unchanged=false reloads=1
```

Post-fix evidence:

```text
beforeActive=true afterActive=true unchanged=true reloads=0
```

The production fix was one guard in `bvomCloudRestore()`, followed by focused and full regression, protected PR validation, merge, and a green post-merge `main` run.

## 10. Manual regression boundary

The Node harness intentionally does not claim to simulate everything.

Use `tests/bvom-lab/MANUAL_REGRESSION_MATRIX.md` for checks that require:

- installed PWA lifecycle
- iOS / Android behaviour
- real browser layout
- service-worker / HTTP caching
- real Supabase authentication and cloud behaviour
- Stripe checkout/webhook behaviour
- real admin backend authorization
- device sound/vibration/timer behaviour
- visual and Japanese-layout checks

The automated gate must be GO before production-promotion manual checks.

## 11. Release / promotion evidence

A release candidate should have evidence appropriate to what changed.

At minimum for production code:

- focused regression evidence for the changed behaviour
- full BVOM Lab GO
- clean diff review
- protected PR gate PASS
- post-merge main gate PASS
- applicable manual/device checks for browser/PWA/external-service changes

Do not promote a build because it "looks fine" or because one test passed.

## 12. When tests themselves change

Test code is production-safety infrastructure.

When changing a test:

- preserve the intended contract
- explain why the old assertion was insufficient or obsolete
- prefer strengthening coverage over relaxing it
- check mutation anchors if relevant
- run the full gate
- inspect known-bad provenance
- never change expected behaviour merely to turn red into green

If a legitimate product decision changes a behavioural contract, update the specification and tests together and make that decision explicit in the PR.


## Stage 1 bodyweight recording checks

`bodyweight_contracts.js`, loaded by the authoritative behaviour tier, covers actual accessory/Bodybuilding/On-Ramp entry, zero/arbitrary added load, RPE/effort, assistance, estimates, manual Custom settings/locks, program isolation, correction, failed/stale writes, physical unit conversion, recovery, completed History/share/export and lazy cloud comparison. All nine final forward-feature contracts were RED against unchanged v2.9.7 `dbaad6ef217769a0b028a2a1c88ba528eb67d3f8`; all nine contracts must pass. They are explicit v2.8.0 historical-provenance N/A, not changes to existing progression expectations.

Owner-approved PR #46 refinements add `BW-REFINE-VOLUME`, `BW-REFINE-HISTORY`, `BW-REFINE-INCREMENT`, and `BW-REFINE-INCOMPLETE-GPP`. All four were RED on the exact original PR #46 source (`09d0f571faaefe6c071662a8d90bb5d46e689dbf`) before implementation. They cover 90+0/90+2.5 Pull-Ups, user-entered 55 Push-Up resistance, blank assisted Nordic work, exactly-once mixed accounting, correction, immutable approximate History/share/export, arbitrary positive increments with physical unit roundtrips and cloud JSON, partial records and zero-load GPP export. Their historical v2.8.0 provenance is N/A. The original Stage 1 History assertion intentionally changes from 10 external-load-only volume to ~1200 including recorded estimates; other original contracts remain mandatory.

Run the `BW-STAGE1-*` and `BW-REFINE-*` IDs through `behaviour_guard.js`, then the documented full gate on the production candidate. Mutations cover loss of the recording-only route, zero export, exact conversion, negative-load validation and failed-save rollback. Existing accessory/Bodybuilding controls and sequence invariants remain mandatory.

`node tests/bvom-lab/bodyweight_browser.cjs` exercises real Chromium DOM, callbacks, storage and Web Locks in EN/JA at 375 px, with dummy verified offline ownership and external network blocked: six scenarios covering the refined EN/JA labels, 1.25/2.5 saved increments, Pull-Up/Push-Up/Nordic estimated volume (~2010), per-set correction, no mobile overflow, full export and Custom builder/actual sets/RPE/escaping/restart/secondary-window rejection/Finish/History/export, plus selected Bodybuilding Chin-Up and On-Ramp Nordic actual recording and exact unit conversion in both languages. `BVOM_CHROMIUM_PATH` optionally selects an installed Chromium executable. The existing recovery/Starting Setup browser suites remain applicable. These checks stub external services and block service workers; they do not establish real cloud interoperability, installed-PWA updates or Android/iOS behavior.

Refinement validation (13 October 2026): the explicit 13-file shipped candidate passed **29/29 static, 154/154 behavior, 14/14 sequence, 113/113 mutations killed, 68/68 applicable known-bad DEFECT contracts failing; VERDICT: GO**. All 13 Bodyweight contracts pass, including actual abandoned-session expiry in Custom/LP/Bodybuilding and selected exercise preferences. Chromium passed **6/6** refined EN/JA mobile scenarios, **26/26** existing recovery scenarios, the HLM/4-Day deferred Starting Setup journeys and the existing isolated two-window infrastructure proof. The recovery suite now accepts the same optional `BVOM_CHROMIUM_PATH` test-only executable selection. No live backend or physical-device release checks were performed.

Before any separately authorised release, verify Android Chrome/installed PWA and Safari/iOS keyboards/layout, offline restart, background recovery and shell updates. Test real cloud backup/restore with a separate dummy account, including completed bodyweight snapshots. The owner accepted limited older-client misinterpretation; recommend updating other devices before editing new bodyweight data. No production cloud access or migration is part of Stage 1.

## 13. Manual release checkpoint

Passing automated tests means the code is eligible for the next release step; it does not itself deploy or promote anything.

Production deployment, hosting promotion, store/package release, or other irreversible release actions remain separate checkpoints.

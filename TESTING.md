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
4. mutation + known-bad reference

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

## 13. Manual release checkpoint

Passing automated tests means the code is eligible for the next release step; it does not itself deploy or promote anything.

Production deployment, hosting promotion, store/package release, or other irreversible release actions remain separate checkpoints.

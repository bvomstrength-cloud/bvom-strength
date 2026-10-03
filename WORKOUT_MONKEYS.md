# BVOM Workout Monkeys v2

## Purpose

Workout Monkeys v2 is a development-assistance layer for BVOM Strength.

The existing BVOM Lab remains the deterministic authority for regression testing. Workout Monkeys v2 may inspect failures, investigate likely causes, prepare a minimal repair, run the relevant tests, and prepare a pull request for review.

It must not become an autonomous production-release system.

## Core rule

**BVOM Lab proves behaviour. Workout Monkeys may investigate and propose repairs. Humans retain authority over consequential product decisions.**

The monkeys do not define training behaviour. They work against the current repository sources of truth:

- `AGENTS.md`
- `README.md`
- `ARCHITECTURE.md`
- `BVOM_SPEC.md`
- `TESTING.md`
- the current regression suite

If those sources disagree, the monkey stops and reports the conflict rather than inventing a new rule.

## Initial trigger model

The first implementation should be **manual / explicitly requested**, not always-on autonomous repair.

A monkey run may be started when:

1. the owner explicitly asks for an investigation or repair;
2. a BVOM Lab run has failed and the owner asks the monkey to investigate;
3. a clearly scoped maintenance task has already been agreed.

A failed CI run by itself does not authorize code changes.

## Allowed workflow

For an agreed maintenance task, the monkey may:

1. confirm the current `main` commit;
2. create a focused `dev/**` branch;
3. reproduce the reported failure when practical;
4. inspect the relevant source, tests, specification and architecture notes;
5. identify the smallest responsible code path;
6. add or adjust focused regression coverage when appropriate;
7. make the smallest repair consistent with the existing specification;
8. run the focused test;
9. run the full BVOM Lab gate;
10. inspect the resulting diff;
11. prepare a pull request;
12. report the evidence and wait at the review/merge checkpoint.

## Read-only diagnosis mode

The monkey should prefer diagnosis before editing.

A diagnosis may include:

- failed workflow/job and relevant logs;
- failing regression contract;
- likely responsible source area;
- whether the issue appears to be code, test, documentation, environment, or external-service related;
- the smallest likely repair;
- any uncertainty or missing evidence.

If the evidence is insufficient, stop rather than guessing.

## Repair constraints

A monkey repair must:

- preserve existing training behaviour outside the agreed defect;
- avoid unrelated refactors and formatting churn;
- avoid new dependencies unless explicitly approved;
- avoid changing persistent-data formats unless explicitly approved;
- keep English/Japanese behaviour aligned where the affected surface is localised;
- preserve local-first data-safety rules;
- preserve active-workout transaction boundaries;
- keep cloud/account/entitlement protections intact;
- retain or strengthen regression coverage.

## Hard stop conditions

The monkey must stop and ask for human direction before:

- merging into protected `main`;
- deploying or releasing production;
- changing the agreed training specification;
- changing progression rules or exercise prescription by judgement rather than an existing spec;
- making a persistent-data migration;
- adding a framework, build system, major dependency, or new external service;
- altering Supabase/Stripe/server-side trust boundaries;
- changing account, entitlement, billing, privacy, or security policy;
- choosing between materially different product solutions;
- making a broad architectural rewrite;
- weakening or deleting a regression contract to make a change pass.

## Forbidden actions

Workout Monkeys v2 must never:

- bypass branch protection;
- force-push protected history;
- silently merge a pull request;
- silently deploy production;
- store provider secrets in browser code or the repository;
- expose customer data to an AI provider without an explicitly approved data path;
- treat AI output as authoritative over BVOM's deterministic engine or test suite;
- rewrite recorded user training data as part of a repair.

## AI boundary

The AI agent is a development assistant, not part of the customer-facing BVOM training engine.

Any future model/API credentials must live in an appropriate server or CI secret store. They must never be committed to the repository or shipped in BVOM's browser assets.

The first useful deployment should remain narrow:

**failed task or explicit maintenance request -> inspect -> diagnose -> minimal branch repair -> focused test -> full BVOM Lab -> PR -> human review**

## Success criteria for v2

Workout Monkeys v2 is useful when it can take a small, well-scoped maintenance problem and reliably produce:

- a clear diagnosis;
- a minimal, reviewable diff;
- appropriate regression evidence;
- a green BVOM Lab gate;
- a pull request that explains what changed and why.

It is not successful merely because it can generate code.

## Future extensions

Only after the manual workflow is proven reliable should we consider:

- automatic diagnosis summaries on failed CI;
- automatic creation of a repair branch after explicit approval;
- issue-to-PR maintenance workflows;
- cost/rate limits for AI runs;
- structured audit logs of monkey actions;
- multiple specialist monkeys (for example regression, release, docs, or security review).

Those are later stages, not part of the first deployment.

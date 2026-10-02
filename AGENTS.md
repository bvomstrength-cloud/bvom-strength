# BVOM Strength — AI Development Guide

This file is the first source of truth for AI-assisted development in this repository.

## Repository status

- Application: **BVOM Strength**
- Current approved production baseline: **v2.8.3**
- Production branch: `main`
- Approved v2.8.3 commit: `872270f1f4752e8920ec58aa6aa3eb33c7048f90`
- Approved deployment ZIP SHA-256: `8354302d31a4b1573e519cf0e3f2323f369aba3d4599eca984745a592b92286f`
- Regression baseline: **v15.2 maintenance**

Treat `main` as the known-good production baseline.

## Core development rule

Do not casually edit `main`.

Normal development flow:

1. Start from the current approved `main`.
2. Create a focused development branch.
3. Make the smallest change that solves the agreed task.
4. Inspect the diff.
5. Run the relevant focused tests and regression gate.
6. Open a pull request.
7. Review the change and evidence.
8. Merge to `main` only when the relevant gate passes.

Do not skip directly from an idea to modifying production.

## Working style

BVOM development follows this pattern:

**reproduce → understand → smallest fix → prove → broader regression**

When fixing a bug:

- Reproduce the actual failure first when practical.
- Identify the smallest responsible code path.
- Avoid unrelated cleanup, refactors, formatting churn, or feature creep.
- Preserve existing behaviour outside the agreed scope.
- Add or update targeted regression coverage when appropriate.
- Run broader regression after the focused test passes.

When adding a feature:

- Agree on the behaviour and scope before editing code.
- Prefer small, reviewable increments.
- Keep existing training logic and persisted-data behaviour stable unless the task explicitly changes them.
- Do not redesign adjacent systems merely because they could be improved.

## AI behaviour in this repository

Before changing source, an AI assistant should:

1. Read this file and `README.md`.
2. Confirm the active branch and its relationship to `main`.
3. Understand the requested change before editing.
4. Inspect the relevant existing code rather than guessing.
5. State which files are expected to change.
6. Keep the user informed in plain English.
7. Stop at meaningful review points instead of racing through the whole GitHub workflow.

The repository should be treated as the durable project memory. Prefer verified repository state over assumptions carried from an old chat.

## Important user workflow

The owner is learning GitHub and wants the process handled **one step at a time**.

Do not automatically perform an entire branch → edit → test → PR → merge sequence in one action unless explicitly asked.

“Go for it” or “GFI” means: **continue with the next agreed step**.

It does not mean “perform every remaining step”.

## Production safety

Unless a task explicitly requires otherwise:

- Do not modify `main` directly.
- Do not overwrite the approved production baseline.
- Do not remove production files without a clearly reviewed reason.
- Do not change persistent data formats casually.
- Do not change training progression logic as collateral damage.
- Do not weaken regression coverage to make a change pass.
- Do not treat a successful syntax check as sufficient release evidence.
- Do not introduce dependencies, frameworks, build systems, or architectural rewrites without deliberate agreement.

## Current application scope

BVOM Strength includes multiple training and support systems, including:

- LP / RPT
- HLM RPT
- 4-Day Split
- Custom Training
- Bodybuilding block
- optional Bodybuilding On-Ramp
- accessories
- GPP / conditioning
- warm-up engine
- history / sharing
- backup / restore
- optional account / cloud sync
- subscription / entitlement behaviour
- English and Japanese localisation
- administration functionality

Changes in one area can have consequences elsewhere. Inspect shared state, unit conversion, persistence, progression, and rendering paths where relevant.

## Bodybuilding behaviour worth protecting

The approved Bodybuilding design includes:

- 8-week block
- 24 A/B sessions
- primary work around RPE 8
- no failure / AMRAP / deload model
- primary top-set range of 6–8 reps
- 8 reps → increase
- 6–7 reps → hold
- below 6 reps → reduce
- below-range precedence
- Stable RPT, Demanding, and Double Progression primary systems
- bodyweight / assistance work uses directional progression rather than pretending load precision exists

The optional On-Ramp is separate from normal performance progression and should preserve its intended provisional/confirmed hand-off behaviour.

Do not alter these rules incidentally.

## Warm-up behaviour worth protecting

Supported modes include:

- Full
- Feeder
- None

Numeric warm-ups are approximately:

- 50% × 5
- 70% × 3
- 85% × 1–2

Warm-up changes should be checked against exercise loading, units, rounding/increments, and the active program.

## Release evidence

The approved v2.8.3 release gate was:

- Static: **23/23 PASS**
- Behaviour: **77/77 PASS**
- Sequence / invariants: **14/14 PASS**
- Mutations: **62/62 killed**
- ZIP integrity: **PASS**
- Independent review: **GO**

Those numbers describe the approved v2.8.3 baseline. Future work should run the relevant current tests rather than merely quoting these historic results.

## Documentation strategy

Over time, this repository should become understandable without a huge chat handoff.

Useful companion documents may include:

- `ARCHITECTURE.md` — where major systems live and how they interact
- `TESTING.md` — exact test suites, commands, and release gates
- `CHANGELOG.md` — important behavioural changes and why they were made

Add these deliberately as the project evolves. Do not create documentation for its own sake.

## Final principle

A good BVOM change should be easy to explain:

**what was wrong or wanted → what changed → why the change is minimal → how it was proven safe**

If that explanation is unclear, the change probably needs more investigation before merge.

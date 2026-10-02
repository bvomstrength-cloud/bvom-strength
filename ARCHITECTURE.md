# BVOM Strength Architecture

This document is the practical architecture map for BVOM Strength.

It describes the current repository and runtime structure so a developer or AI assistant can find the right subsystem before changing code. It is not a replacement for the behavioural specification or the regression suite.

For development rules, read `AGENTS.md` first. For the current approved production baseline, read `README.md`.

## 1. Architectural shape

BVOM Strength is a browser-first Progressive Web App with a deliberately small deployment surface.

The production application is primarily a single HTML application:

- `index.html` — application shell, styles, state model, training engines, UI rendering, persistence, cloud/auth integration, subscription flow, setup, history, backup/restore, and most runtime behaviour
- `admin.html` — small administration surface for granting complimentary access through the BVOM backend
- `i18n/en.js` and `i18n/ja.js` — English and Japanese localisation resources
- `sw.js` — service worker and application-shell caching
- `manifest.json` — PWA manifest
- icons, social artwork, and theme SVGs — static presentation assets

There is no application build framework, package manager dependency tree, or compile step in the repository. The shipped files are the application.

That simplicity is intentional. Do not introduce a framework, bundler, dependency layer, or architectural rewrite as incidental cleanup.

## 2. Runtime overview

At a high level:

```text
Browser / installed PWA
        |
        v
     index.html
        |
        +-- in-memory BVOM state
        |
        +-- localStorage / sessionStorage
        |       |
        |       +-- local-first training data
        |       +-- account ownership markers
        |       +-- tab/workout ownership guards
        |       +-- entitlement/offline metadata
        |
        +-- render / interaction functions
        |       |
        |       +-- Workout
        |       +-- Warm-up
        |       +-- History
        |       +-- Info
        |       +-- Settings
        |
        +-- training engines
        |       |
        |       +-- LP / RPT
        |       +-- HLM RPT
        |       +-- 4-Day Split
        |       +-- Custom Training
        |       +-- Bodybuilding
        |       +-- Bodybuilding On-Ramp
        |       +-- accessories
        |       +-- GPP / conditioning
        |
        +-- optional Supabase account/cloud layer
        |       |
        |       +-- authentication
        |       +-- entitlement RPCs
        |       +-- cloud backup / restore
        |       +-- Edge Function calls
        |
        +-- Stripe Checkout via backend-created checkout URL
        |
        +-- service worker / cache
```

The core training application remains usable from local state. Cloud features are an additional account/sync layer, not the primary live-workout storage mechanism.

## 3. Source-order layering in `index.html`

This is one of the most important implementation details in the repository.

`index.html` has evolved through successive compatibility and hardening layers. Some functions are defined more than once, and some later sections retain an earlier implementation and wrap or replace it.

Examples visible in the current source include multiple effective layers around:

- `renderWorkout()`
- `renderWarm()`
- `renderHistory()`
- `renderAll()`
- `changeUnits()`
- Bodybuilding / On-Ramp rendering and finishing

JavaScript source order matters: a later definition or wrapper may be the effective runtime implementation.

Therefore:

1. Do not assume the first matching function is the active one.
2. Search the entire file before modifying a shared function.
3. Look for later assignments such as `const oldFn = fn; fn = function (...) { ... }`.
4. Preserve wrapper order and downstream assumptions.
5. Regression-test any change to a shared function because it may serve several programs.

A future refactor may choose to split the monolith deliberately, but that is a separate architectural project and must not be mixed into ordinary bug fixes.

## 4. State and persistence

### 4.1 Primary state object

The live application centres on the mutable `state` object.

The initial state includes core setup and training values such as configuration status, profile, current day, working weights, equipment, attempts, history, current session, and timer state. Migration/default layers add later features as required.

Major state areas used by the current application include, among others:

- core lift weights and per-lift configuration
- `session` — recorded live workout sets
- `history` — completed workout records
- `attempts`
- accessories and accessory progression
- GPP definitions and live GPP session data
- HLM / 4-Day state
- processed-result markers and rollback snapshots
- Bodybuilding state and progression
- Bodybuilding On-Ramp state
- warm-up state
- unit-conversion origin metadata
- pending progression decisions

The exact schema is evolutionary. Do not casually replace or normalise it without checking migration, restore, cloud comparison, unit conversion, and regression behaviour.

### 4.2 Local-first persistence

The primary local data key is:

`bvom_data`

`save()` serialises the current `state` into localStorage.

Persistence is defensive rather than "last writer wins". The current save path protects against:

- browser/device storage write failure
- a stale BVOM tab overwriting newer local data
- a secondary tab writing while another tab owns an active workout

If local persistence fails or a stale-write conflict is detected, BVOM blocks further unsafe continuation and tells the user to reload rather than pretending the workout was saved.

### 4.3 Ownership and multi-tab safety

Separate local/session keys track account ownership and tab/workout ownership, including:

- `bvom_data_owner`
- `bvom_workout_tab_owner`
- `bvom_tab_id`

This is part of the data-safety boundary. Changes to sign-in, tab handling, account switching, or local persistence must preserve these protections.

## 5. Rendering and interaction

The application shell exposes five main tabs:

- Workout
- Warm-up
- History
- Info
- Settings

The renderer is direct DOM/HTML generation rather than a component framework.

The main orchestration function is ultimately `renderAll()`, which refreshes the relevant surfaces and also re-presents persisted unresolved progression choices.

User interaction functions mutate `state`, save it, and rerender the affected surface. A workout is therefore a state machine distributed across:

- the current program prescription
- recorded sets
- processed markers
- rollback snapshots
- pending decisions
- future settings
- finish/close transaction logic

Treat those pieces as one transaction system rather than independent UI fields.

## 6. Training-engine boundary

The program selector routes into several training modes:

- LP / RPT
- HLM RPT
- 4-Day Split
- Custom Training
- Bodybuilding

Shared features include accessories, GPP/conditioning, warm-ups, history, units, equipment configuration, persistence, and cloud handling.

### 6.1 LP / RPT

The original core engine operates around:

- current lift weights
- per-lift configuration
- prescriptions and set plans
- recorded sets
- immediate progression/failure decisions
- attempts/rescue behaviour
- PB tracking

Progression decisions can be persisted when user input is still required; they must survive reload rather than existing only in a transient modal.

### 6.2 HLM RPT and 4-Day Split

HLM and 4-Day share intermediate-program concepts such as:

- heavy/progression drivers
- `nextHeavy`
- rep/failure state
- optional heavy singles
- workout-specific settings
- correction rollback

A critical invariant is lift-scoped correction: correcting one processed lift must not erase another lift's independently earned state.

Settings labelled for future workouts must not rewrite an already-started workout.

### 6.3 Custom Training

Custom Training uses the same application shell and persistence environment but must not leak progression changes into structured-program state.

### 6.4 Bodybuilding

Bodybuilding is its own program subsystem with its own exercise selections, progression records, session keys, setup flow, finish logic, and warm-up behaviour.

The approved design includes a 24-session / 8-week A/B block. Behavioural details belong in `BVOM_SPEC.md`; architecturally, the important point is that Bodybuilding is integrated into the shared state, persistence, units, history, and rendering systems without being interchangeable with LP/RPT progression.

### 6.5 Bodybuilding On-Ramp

The optional On-Ramp is a calibration/familiarisation state machine attached to Bodybuilding.

Its exercise state progresses through:

`UNSET -> PROVISIONAL -> CONFIRMED`

It can run for up to six A/B sessions, can hand confirmed/calibrated loads into the main Bodybuilding block, and can be skipped into manual setup.

The hand-off is a transaction. Failed validation must not partially terminate or mutate the active On-Ramp.

## 7. Workout transaction and correction model

BVOM has accumulated explicit transaction protections because progression, editing, correction, units, and future settings interact.

Important architectural state includes:

- `processed` — whether a result has already been applied
- `processedSnapshots` — pre-result rollback state
- staged post-edit/future configuration
- live prescription locks / active-workout settings snapshots
- persisted pending progression choices

The broad rule is:

**Recorded work defines the current workout. Later settings may define future training, but must not silently reinterpret already-recorded work.**

When a user corrects recorded work, BVOM must:

1. restore the relevant pre-result state,
2. recompute the earned result from the corrected workout,
3. preserve unrelated lifts,
4. then merge explicit future settings back in.

This boundary is heavily protected by the regression suite.

## 8. Unit conversion

Unit conversion is not a display-only operation.

`changeUnits()` converts state across core lifts, active sets, accessories, GPP, HLM/4-Day state, rollback snapshots, PBs, and later Bodybuilding/On-Ramp layers.

BVOM combines:

- practical one-way target-unit rounding
- equipment/progression increment grids
- reversible origin metadata for no-training round trips

A legitimate value that is merely converted kg -> lb -> kg without intervening training/editing should be restorable exactly where the protected contract requires it.

Because unit conversion reaches deeply into active and rollback state, changes here are high risk and require broad regression coverage.

## 9. Warm-up subsystem

Warm-ups are guidance/preparation and do not count as work progression.

The application supports the general warm-up engine plus Bodybuilding-specific warm-up classification.

Protected concepts include:

- Full
- Feeder
- None
- practical load rounding
- bar/equipment floors where relevant
- active units
- no progression/calibration effect from warm-up completion

Bodybuilding warm-up plans are generated from the selected exercise/equipment and its current working/calibration load.

## 10. History, backup, and restore

Completed sessions are copied into `state.history`.

History records preserve workout context such as date, unit, session data, notes, duration/volume where applicable, and program-specific metadata.

Manual JSON backup/export and restore are available from Settings.

Cloud restore is separate from manual restore and keeps a pre-cloud local copy before replacing device data.

Deleting a history record is intentionally separate from current progression state; the current code describes it as removing the history record only.

## 11. Account, entitlement, and cloud boundary

BVOM uses Supabase JS in the browser for the optional account/cloud layer.

The repository contains the browser-side Supabase project URL and publishable client key. These are client configuration, not server credentials.

The browser layer handles:

- Supabase authentication/session state
- account/local-data ownership checks
- entitlement checks
- verified offline access rules
- cloud comparison and conflict detection
- cloud save/restore
- automatic backup scheduling

The browser calls backend interfaces including:

- RPC `ensure_bvom_entitlement`
- RPC `start_bvom_trial`
- table operations for `bvom_data`
- Edge Function `super-api` for checkout creation
- Edge Function `bvom-admin` from `admin.html`

The server implementations and database security policies are **not present in this repository**. They are an external trust boundary. Never infer server-side authorization merely from the browser code.

### 11.1 Cloud is not allowed to casually overwrite live work

The cloud layer deliberately pauses or refuses operations around active workouts, account switching, offline-local access, or detected remote/local divergence.

Cloud comparison normalises harmless transient/default state so startup defaults do not create false conflicts.

The browser must not upload blindly when the remote copy changed independently.

## 12. Subscription / Stripe boundary

The frontend does not construct payment credentials or a Stripe secret flow itself.

It asks the backend Edge Function `super-api` for a checkout URL and accepts only an HTTPS Stripe Checkout URL before navigation.

On return, the query string can indicate success/cancelled, but the UI explicitly does not treat that return alone as authoritative subscription activation; entitlement is confirmed through the BVOM backend/account path.

## 13. Administration surface

`admin.html` is a separate small browser page.

It:

1. reuses the Supabase session,
2. requires a signed-in user before enabling the action,
3. sends the target account email to the `bvom-admin` Edge Function,
4. displays the server response.

The server-side administrator authorization is outside this repository and must remain authoritative. Hiding or gating a button in `admin.html` is not a security boundary.

## 14. Localisation

English and Japanese resources live in:

- `i18n/en.js`
- `i18n/ja.js`

The application also contains some bilingual helper calls/strings directly in `index.html`.

When changing user-visible contractual wording, inspect both languages and the static regression tier. Some text is intentionally regression-protected.

## 15. PWA and caching

`sw.js` defines the cache namespace and core application-shell files.

Current behaviour is broadly:

- install: cache the core shell/assets
- activate: remove older cache namespaces and claim clients
- navigation: network first, refresh cached `index.html` when successful, fall back to cached shell offline
- other same-origin GET requests: cache first, otherwise fetch and cache

`index.html` registers the service worker and includes build-aware reload guards so a restored older shell is reloaded for the current build.

Service-worker changes are release-sensitive because a correct new `index.html` can still appear stale on installed PWAs if cache/update behaviour is wrong.

## 16. Test architecture — BVOM Lab

The automated regression system lives in:

`tests/bvom-lab/`

Main pieces:

- `regression_guard.js` — static/packaging contracts
- `behaviour_guard.js` — authoritative live behavioural contracts
- `sequence_guard.js` — cross-feature state-machine invariants
- `mutation_check.js` — proves tests detect injected known-bad behaviour
- `lib/bvom_harness.js` — Node VM/browser-shell harness
- `gate.js` — runs the full gate
- `MANUAL_REGRESSION_MATRIX.md` — browser/device/service checks that automation does not simulate

The historical known-bad reference is quarantined under:

`test-fixtures/v2.8.0-known-bad/`

It is test evidence, not deployable production source.

The automated suite intentionally runs BVOM's real inline application code inside the harness rather than reimplementing the training algorithms in tests.

## 17. CI and protected-main flow

GitHub Actions workflow:

`.github/workflows/bvom-lab.yml`

For the full gate it creates a temporary candidate directory containing only the shipped application files, then runs:

`node tests/bvom-lab/gate.js <candidate> test-fixtures/v2.8.0-known-bad`

The required GitHub status check is:

`v15.2 full regression gate`

The repository's `main` ruleset requires:

- changes to merge through a pull request
- the required BVOM Lab status check to pass
- the branch to be up to date before merge
- force pushes blocked
- deletion blocked

This makes `main` the known-good integration baseline.

## 18. Production-file boundary

The current CI candidate is explicitly staged from these shipped files:

- `index.html`
- `admin.html`
- `sw.js`
- `manifest.json`
- `icon-192.png`
- `icon-512.png`
- `og-image.png`
- `theme-bee-v23c.svg`
- `theme-cherry-v23f.svg`
- `theme-coastal-v23f.svg`
- `i18n/en.js`
- `i18n/ja.js`

Repository documentation, tests, fixtures, and GitHub workflow files are not part of the staged application candidate.

If a future release adds another production asset, update both the application references and the CI staging/static packaging contract deliberately.

## 19. External systems not defined here

This repository does not contain the implementation/configuration for every production dependency.

External boundaries include at least:

- Supabase authentication
- Supabase database / row-level security
- Supabase RPC implementations
- Supabase Edge Functions
- Stripe server-side/payment configuration
- production hosting/deployment configuration

Changes that depend on those systems require verification against the actual external configuration; do not invent their behaviour from frontend assumptions.

## 20. High-risk areas

Treat these as high-risk shared boundaries:

1. `save()`, local ownership, and stale-tab handling
2. active-workout detection and tab ownership
3. `finishWorkout()` and program-specific finish wrappers
4. correction / `processedSnapshots` rollback
5. future-settings versus live-prescription separation
6. unit conversion and reversible origin metadata
7. HLM/4-Day driver and `nextHeavy` state
8. Bodybuilding / On-Ramp hand-off
9. pending progression decisions across reload
10. account switching and entitlement/offline access
11. cloud conflict detection and upload/restore
12. service-worker cache/update behaviour

A small change in one of these areas can cross several program boundaries.

## 21. How to approach a change

Before editing:

1. Read `AGENTS.md`.
2. Confirm the live `main` and work on a focused branch.
3. Locate **all** definitions/wrappers of the relevant function.
4. Identify which parts of `state` it reads/writes.
5. Check whether the change touches an active-workout transaction, unit conversion, persistence, correction, cloud comparison, or program hand-off.
6. Reproduce the problem or define the new behaviour precisely.
7. Make the smallest coherent change.
8. Add or update focused regression coverage where appropriate.
9. Run the relevant focused checks and the full BVOM Lab gate.
10. Review the diff before opening the PR.

The architectural goal is not cleverness. It is preserving a deterministic training engine whose state transitions are understandable, testable, and difficult to corrupt.

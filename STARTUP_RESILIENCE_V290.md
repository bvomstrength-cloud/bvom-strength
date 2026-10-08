# BVOM Strength v2.9.0 — Startup Resilience Design

Status: DESIGN / TEST-CONTRACT PHASE ONLY  
Baseline: v2.8.9 main @ `c24acc12b019fdcb00ebc082e035c2d1f85050cb`

## Why this exists

A real Android/Chrome test on the BVOM test site reproduced the degraded/offline startup failure on a previously used device with valid local data and a previously verified entitlement.

Measured startup:

- Good connection: app shown at 1874.1 ms.
- Warm repeat load: app shown at 252.0 ms.
- True offline: app shown at 74196.6 ms.

The offline run showed three serial waits before BVOM became usable:

1. Network-first navigation waited about 27.5 s before serving cached `index.html`.
2. Live entitlement RPC then waited about 21.5 s before failing.
3. Cloud-latest then waited about 25.0 s before failing.
4. Only then did the existing cached entitlement fallback allow the app to show.

This proves the startup problem is not only the shell strategy. The signed-in boot path also waits on live entitlement and cloud reads before showing local training.

## Product target

On a previously successful device with matching local ownership and a currently valid BVOM offline entitlement cache, BVOM should show local training immediately even when the network is absent, extremely slow, captive, or intermittently failing.

Live auth refresh, entitlement refresh, cloud comparison/sync, and update discovery happen afterward.

A fresh device, wrong local owner, never-verified account, expired grace window, known-expired entitlement, or explicit sign-out must not use the fast path.

## Security boundary

The fast path must be **no weaker than BVOM's existing verified 7-day offline-access policy**.

The authoritative local gate remains `bvomEntitlementOfflineAccessDecision(userId)` or one deliberately refactored equivalent. Do not create a second looser entitlement rule.

The fast path must require all of the following:

- a real local data owner exists;
- the cached entitlement belongs to the same user;
- `verifiedAt` is valid, not implausibly future-dated, and no older than 7 days;
- cached row `user_id`, if present, matches;
- cached status is complimentary, active subscriber, or an unexpired active trial;
- explicit sign-out has not cleared offline eligibility.

The fast path must never refresh `verifiedAt`. Only a successful live server verification may do that.

Supabase JWT expiry is **not** a separate fast-path veto. BVOM already intentionally allows verified offline use beyond normal token-refresh availability.

## Startup state model

The implementation should make the startup state explicit rather than inferring it from UI visibility.

Suggested states:

- `LOCAL_TRUSTED` — owner + cached entitlement allow local training.
- `VERIFYING` — local UI may be visible while live auth/entitlement/cloud verification runs.
- `VERIFIED` — live account + entitlement confirmed; cloud assessment may proceed.
- `OFFLINE_DEGRADED` — local training allowed; live verification unavailable/unknown.
- `REVOKED` — definitive live result says access is no longer active.
- `OWNER_MISMATCH` — authenticated account does not own current local data.
- `SIGNED_OUT` — explicit sign-out; cached offline eligibility cleared.

Unknown network outcomes are never equivalent to denial. Timeout, fetch failure, 5xx, malformed response, captive-portal content, or CDN failure remain `OFFLINE_DEGRADED` when the local trust gate is valid.

## Non-destructive rules

- Never delete local training data because live verification fails.
- Never overwrite or replace an active workout from cloud.
- Never auto-reload an active workout for a service-worker update.
- A definitive entitlement revocation discovered mid-workout must let the current workout remain locally recoverable and finishable; block starting another workout after the current one is resolved.
- Cloud writes/pulls remain disabled until a real session has been confirmed and existing conflict guards have run.
- Existing fingerprint-based cloud conflict handling remains the source of truth. Do not introduce sequence numbers, vector clocks, or a new sync model for this project unless the existing model is proven insufficient.
- Late auth events must not reset or remount the workout UI mid-set.

## Service-worker target

Current navigation is network-first and can wait tens of seconds before cache fallback.

Target behaviour:

1. Previously cached BVOM shell is served immediately for repeat launches.
2. Network/update discovery runs in the background.
3. A newly fetched shell is validated before becoming an update candidate.
4. No `controllerchange` path may force a reload during an active workout.
5. Update activation occurs at a safe point: explicit user action, app restart, or another proven no-active-workout transition.
6. Multi-tab behaviour must not allow one tab to reload another tab's active workout.
7. First-ever device still requires network because no trusted shell/data/entitlement exists.

Exact implementation (cache-first vs controlled SWR) should be chosen against these invariants, not by pattern name alone.

## Supabase JS target

The current parser-blocking `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` dependency is a startup and supply-chain risk.

v2.9 target:

- vendor/pin one exact Supabase JS build as a same-origin asset;
- include it in the app-shell cache;
- do not float on `@2`;
- preserve current auth semantics during this change;
- lazy loading is optional and should be considered only after the pinned/local dependency is stable.

## Required automated contracts before implementation

Existing F12 offline-security contracts remain mandatory.

Add contracts for the new startup path:

### FASTBOOT-1 — Valid local trust does not await entitlement
Given matching owner + valid cached entitlement + persisted session and an entitlement RPC that never resolves, local BVOM becomes usable without waiting for that RPC.

### FASTBOOT-2 — Valid local trust does not await cloud latest
Given matching owner + valid cached entitlement and a cloud-latest request that never resolves, local BVOM becomes usable without waiting for cloud latest.

### FASTBOOT-3 — Never-verified user stays blocked
No valid cached entitlement means no optimistic local app, even if local data exists.

### FASTBOOT-4 — Grace-expired cache stays blocked
A cache older than seven days cannot use the fast path.

### FASTBOOT-5 — Wrong owner stays blocked
Cached entitlement for account A cannot expose local data owned by account B.

### FASTBOOT-6 — Explicit sign-out stays blocked
Sign-out clears fast-path eligibility before any network operation; offline relaunch remains gated.

### FASTBOOT-7 — Known-expired entitlement stays blocked
A locally cached known-expired status cannot use the fast path.

### FASTBOOT-8 — Fast path does not refresh verification time
Opening locally or receiving an unknown network error must not extend `verifiedAt`.

### FASTBOOT-9 — Unknown is not denial
Timeout/fetch failure/5xx/malformed response after local boot preserves local access and marks verification degraded; it does not purge or lock local data.

### FASTBOOT-10 — Definitive revocation is non-destructive
A definitive server revocation after local boot gates future use without deleting local state.

### FASTBOOT-11 — Revocation during active workout
If definitive revocation arrives during an active workout, the current workout remains finishable/recoverable locally; a new workout cannot begin after resolution.

### FASTBOOT-12 — Late auth event cannot reset active workout
`INITIAL_SESSION`, `SIGNED_IN`, or `TOKEN_REFRESHED` arriving after local UI render cannot replace/reset an active workout.

### FASTBOOT-13 — Edit-before-pull uses existing conflict path
If the user changes local state before delayed cloud reconciliation returns, cloud data cannot silently replace those changes.

### FASTBOOT-14 — Offline-local state cannot cloud-sync without real session
Preserve the current F12 control: synthetic/offline-owner identity alone cannot enable cloud sync.

## Required service-worker/browser contracts

These are not fully provable in the existing Node harness and require browser/service-worker coverage plus real-device checks.

### SW-1 — Cached navigation opens immediately
Previously cached shell opens without waiting for a hanging network navigation.

### SW-2 — Update during active workout does not reload
A waiting/new worker cannot force reload while a workout is active.

### SW-3 — Multi-tab update safety
One tab receiving/activating an update cannot reload another tab with an active workout.

### SW-4 — Safe update discovery
New shell response must be same-origin, successful, and valid before it can become an update candidate.

### SW-5 — Failed update/precache leaves known-good shell usable
Bad install or failed fetch cannot destroy the previous working cached version.

### SW-6 — No reload loop
Install/activate/controller changes cannot cause repeated reloads.

## Manual device matrix

At minimum test Android Chrome and installed Android PWA. iOS Safari/PWA should be tested before claiming cross-platform behaviour.

For a previously verified device:

- good Wi-Fi;
- warm repeat load;
- Airplane Mode with Wi-Fi off;
- severely throttled/high-latency connection;
- connection that stalls rather than fails immediately;
- reconnect while app is open;
- reconnect during active workout;
- update available while idle;
- update available during active workout;
- two tabs with one active workout.

For a fresh/cleared device:

- offline first launch stays blocked;
- slow network produces a clear loading/auth state rather than exposing local app.

## Implementation increments

### Increment 1 — dependency decoupling
Pin/vendor Supabase JS as a same-origin cached asset. No auth policy change.

### Increment 2 — service-worker shell/update lifecycle
Make repeat navigation instant from known-good cache and remove unsafe auto-reload behaviour. No entitlement policy change.

### Increment 3 — trusted local startup state
Allow existing valid offline entitlement state to show local training before live entitlement/cloud requests finish.

### Increment 4 — background reconciliation
Run live session/entitlement/cloud checks behind explicit states and existing conflict guards; handle denial/unknown/account-switch outcomes non-destructively.

Do not combine all increments into one unreviewed diff.

## Release policy

This is a v2.9.0-class behavioural change, not a trivial maintenance patch.

Before merge:

- new automated startup contracts must pass;
- existing full BVOM Lab gate must remain green;
- mutation coverage must be expanded for every new trust/revocation gate that is practical to mutate;
- browser/service-worker tests must pass;
- manual real-device degraded-network matrix must pass;
- diff must confirm no progression, workout schema, backup format, or subscription-price changes.

## Non-goals

- no Strava work;
- no cloud schema change;
- no progression changes;
- no persistence format migration unless proven necessary;
- no new framework/build-system migration;
- no replacement of the existing cloud fingerprint/conflict model;
- no analytics dependency.

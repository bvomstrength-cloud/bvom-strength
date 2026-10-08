# BVOM manual regression matrix (v15 FINAL)

Run before production promotion, **after** `node gate.js` is GO. Everything that the harness can execute has moved to `behaviour_guard.js`; this matrix keeps only what needs a real browser, device, account or payment service.

## A. Installed PWA / device lifecycle
- **F12 airplane-mode relaunch (one-time per release, iOS and Android):** sign in online on an installed PWA with a valid subscription; confirm the account screen shows active access; open a workout, log one set; fully close the PWA (swipe away). Enable airplane mode. Relaunch: local training must open, the logged set must still be there, sets can be recorded, Finish works, cloud status shows unavailable (not an access/sign-in screen). Repeat after >1 hour offline (access token expired). Repeat with a complimentary account.
- **F12 negative, device:** on a fresh install that has never signed in, airplane-mode launch must not open training.
- **F12 explicit sign-out:** after a verified account has worked offline successfully, reconnect and use SIGN OUT. Then enable airplane mode and relaunch: training must stay behind the sign-in gate, while the local training data itself remains on the device.
- **F12 sign-out while offline:** while a previously verified account is training under offline grace, keep airplane mode on and tap SIGN OUT. The app must gate locally even if the server sign-out cannot complete; a subsequent offline relaunch must remain gated, and local training data must still exist for the next authenticated sign-in.
- **F12 grace boundary:** a device whose last verified entitlement is beyond the 7-day offline grace must require an online access check before training opens.
- Airplane mode *during* an open workout: sets, Finish, History continue; reconnecting resumes cloud sync with no false conflict.
- iOS background eviction mid-workout (lock phone ≥10 min, reopen): active workout resumes with logged sets.
- Service-worker update: install build N, deploy N+1, reopen: exactly one reload, header/build identifiers show N+1, no stale UI.
- Timer sound and vibration at 3/5/10 min on device; GPP interval cue audible.

## B. Real Supabase / account
- New user email-code sign-up; existing user sign-in; wrong code; resend.
- Two devices, same account: finish workout on device 1, open device 2 → cloud copy offered/merged without false conflict; genuine divergent edits produce the conflict notice.
- Offline-owner reconnect boundary: relaunch offline using verified-owner access, then restore connectivity. Until Supabase has a real authenticated session, BVOM must not announce a first cloud backup, mark sync ready, or upload. Once the real session returns, normal cloud assessment may resume.
- Account switch in the same browser with an unfinished workout: workout kept, cloud paused, data never shown to the other account.
- Cloud restore and backup-file restore on a real device (pre-restore copy kept).

## C. Stripe / entitlement / admin (real services)
- Trial start on first program start; trial expiry → ACCESS EXPIRED screen with Subscribe.
- Stripe checkout success and cancel return paths; entitlement becomes active after webhook.
- admin.html: grant complimentary to a free account succeeds; attempt on a paid subscriber is refused by the server.

## D. Visual / UI checks not asserted by the harness
- Program chooser highlights the actually active program (including Bodybuilding) in EN and JA.
- BB setup Cancel leaves live state unchanged; draft changes discarded.
- GPP builder draft preservation (exact case): add Farmer's Walk; enter load, distance + metres, 6 rounds; switch Work/Rest → Every and back; toggle metrics; values survive; save, reopen, stored config correct. Repeat inside BB. *(The builder redraws via DOM queries the harness cannot faithfully emulate.)*
- BB accessory duplicate scoping through the real builder: `Curls` in LP/RPT (Both) and a separate `Curls` in BB allowed; a second `Curls` in BB rejected.
- Theme contrast (Coastal, Bee, Cherry, Classic): disabled buttons legible.
- Japanese layout: no truncated buttons on small phones.

## E. Bodybuilding expectations (for reviewers; automated where marked)
- Reduction after a manual load edit is based on the **edited** load, never on a previous-successful value from before the edit (automated: F4-EDITED-LOAD-REDUCTION). *(v5 item "Reduction returns to previous successful load where applicable" removed: it endorsed F4.)*
- Reduction after a normal increase may return to the previous successful load (automated: BB-CORE-DECISIONS).
- A ≥30% comparable-load drop is shown to the user; the next load is still the normal decision (automated: F3-*). Confirm the wording reads well on device.

## F. Unit conversion spot check
- In an active Bodybuilding block, switch kg → lb and inspect a compound, machine, dumbbell and isolation exercise. Increments must use BVOM's standard practical choices (lb: 1 / 2.5 / 5 / 10), and displayed working/back-off loads must sit on that increment grid. Switch back to kg and confirm no surprising cumulative drift. Repeat once during On-Ramp.


## v7 cold-audit follow-up

The following newly discovered cases are now automated in `behaviour_guard.js` and should not rely on manual-only checking: active Bodybuilding/On-Ramp unit changes, 1.5/2 kg increment round trips, non-barbell accessory increments, and GPP Stop persistence/recovery. A final installed-PWA spot check should still include changing units during a visible Bodybuilding workout and killing/reopening the PWA after GPP Stop but before saving extra result metrics, because real lifecycle/render timing remains device-specific.


## v8 second cold-audit follow-up

F17–F19 are now automated in `behaviour_guard.js`: post-completion Advanced Lift Settings + correction authority, active accessory-edit session preservation (including Bodybuilding), and completed-lift manual-weight-edit/correction atomicity. Do not substitute manual spot checks for these contracts. After they are fixed and the automated gate is GO, a final device smoke test may still exercise one completed-lift correction and one active accessory edit for browser/UI lifecycle confidence.


## v11 fifth cold-audit follow-up

F23–F27 are automated in `behaviour_guard.js`, with their broader state-machine properties duplicated in `sequence_guard.js`. Manual testing should not substitute for these contracts. After fixes and a GO automated gate, the final device smoke pass should specifically include: (1) complete a lift, visit Advanced Settings, return and correct it; (2) complete HLM/4-Day work, change units, then correct it; (3) On-Ramp kg→lb→kg before handoff; (4) correct a completed accessory; and (5) attempt to remove an accessory/GPP activity after recording live work.


## v15 pending-decision follow-up

F42 and F43 are automated in `behaviour_guard.js` and the shared pending-decision rule is covered by `sequence_guard.js`. On a final device smoke pass, it is still useful to reproduce one HLM third-failure choice and one LP/RPT close-miss choice, kill/reopen the installed PWA before choosing, and confirm the same decision returns. Then choose a branch and confirm a second relaunch does not ask again.


## v2.9 startup-resilience device matrix

Before any v2.9 production promotion, test the startup path on a previously verified device with matching local ownership and a valid cached entitlement.

- **Good connection baseline:** cold open and warm repeat open; local training must appear normally and cloud verification must complete without a false conflict.
- **True offline:** airplane mode on, Wi-Fi off, fully close the browser/PWA, relaunch. Cached BVOM shell and local training must appear promptly; the app must not wait tens of seconds for navigation, entitlement, or cloud timeouts.
- **Lie-fi / hanging network:** throttle or otherwise create a connection that stays technically online while requests stall. Local training must still become usable from trusted local state before live entitlement/cloud requests resolve.
- **Never-verified / fresh device:** offline or hanging-network launch must remain gated. No local fast path.
- **Owner mismatch:** cached entitlement for account A must never expose local data owned by account B.
- **Grace expiry:** entitlement verification older than 7 days must not unlock local fast boot.
- **Explicit sign-out:** after sign-out, offline/hanging-network relaunch must remain gated while local training data remains intact.
- **Unknown vs denied:** fetch failure, timeout, 5xx, or malformed response after trusted local boot must leave local training available; a definitive live expired/revoked result must gate future use without deleting local data.
- **Revocation during active workout:** if a definitive denial arrives after the user has started/resumed a workout, the workout remains recoverable and finishable locally; once resolved, BVOM gates before another workout begins.
- **Late auth event:** INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED after local UI is visible must not reset, replace, or hide an active workout.
- **Edit before cloud reconciliation:** make a local change immediately after fast boot, then allow delayed cloud checking to finish. Existing fingerprint/conflict handling must prevent silent replacement.
- **Service-worker update while idle:** deploy build N+1 over installed N. The old build remains usable until the update is ready; update notice appears; explicit UPDATE & RELOAD moves to N+1 exactly once.
- **Service-worker update during active workout:** update may become ready, but tapping update must refuse to reload until the workout is finished/exited.
- **Two-tab update safety:** with a workout active in one tab, another tab must not be able to force that workout tab to reload.
- **Failed update install:** interrupt the N+1 install/precache. Build N must remain launchable from its known-good cache.

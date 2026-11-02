# PR #73 — Android UI repair candidate (HOLD)

Production remains v2.9.21 / c22e79e; PR remains draft. No merge or deployment.

- Canonical BB2 History cards are collapsed initially. Native accessible summaries expand/collapse full notes, volume, prescribed/extra sets and correction/removal controls. Open cards survive an in-page correction redraw; no History storage or credit is created by rendering. Chronological integration and original ledger action indices remain intact.
- Every BB2 bodyweight workout card uses the same collapsed Edit Bodyweight Plan and responsive single-column fields at phone widths. Working/extra sets remain outside the editor. Existing pre-lock restrictions and saved progression settings are preserved.
- Actual trainee bodyweight is optional, explicitly kg, and independent of assistance, external added weight and the existing BB1 optional approximate resistance estimate. The shared actual-bodyweight field/reader is used in BB1/accessory recording and BB2 setup/logging/correction. `actualBodyweightKg` is recording metadata in original start/set snapshots, not a second BB2 preference store or progression input. Prefill reads saved actual measurements; approximate resistance is deliberately not relabelled as a physical measurement. Old backups without actual measurements remain blank. Display units never convert this explicitly kg field.
- The 32 historical/current bodyweight catalogue slot combinations (v2–v5) include Nordic Curl, Assisted Nordic Curl, Slider Leg Curl, Chin-Up, Pull-Up, Push-Up, Hanging Knee Raise and historical Bodyweight Calf Raise. They share setup/logging/History/restore paths. Metadata-stripped replay produces identical progress and quotas. Actual weight never enters BB2 volume or load calculations. BB1 approximate resistance semantics remain unchanged.
- No edits to Log Push Press, catalogue prescription, progression, ownership, revision/conflict or stale-device guards. Optional metadata extends strict ledger validation; older BB2 preview clients that cannot read it should be updated before editing this candidate's backup. Their fail-closed validation is retained.

## Verification

`bb2_mobile_repairs_browser.cjs` checks the actual interface at 360px and 390px, with Chin-Up and Assisted Nordic Curl: initial collapsed History, repeated toggle, plan field/button bounds and separation, setup body mass, prefill/update, assisted/weighted/unassisted working and extra sets, corrections, removal, unchanged canonical credits, actual download/upload backup restore. Screenshots are synthetic test fixtures, never owner data. The initial History-toggle assertion is RED against the prior 0a4f6d7 HTML.

`bb2_bodyweight_audit_contracts.mjs` covers all 32 bodyweight catalogue/slot combinations and equal progression/quotas with recording metadata removed. Existing Android History/Add Set, integrated EN/JA mobile and shared bodyweight browser suites remain applicable. Authenticated cloud browser coverage now checks the new physical-weight snapshot through the exact stored revision and receiving device's History.

The full 220-session endurance journeys are explicitly opt-in via `workflow_dispatch.run_endurance`, default false. Focused authenticated transport, owner/RLS, conflict, stale-device and production counterfactual checks remain enabled on PRs.

Next checkpoint: one real Android acceptance test of these three repairs. Automated Chromium is not a physical Android/PWA acceptance result. Test ZIP must only be uploaded to a separate Netlify test site with a disposable account.

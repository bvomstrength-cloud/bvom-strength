# BB2 compatible shared progression — HOLD

Owner approval: [PR #73 comment, 2026-11-03](https://github.com/bvomstrength-cloud/bvom-strength/pull/73#issuecomment-6591466548).

The same exercise shares its next prescription across days only when its full progression prescription matches: exercise, prescribed set count, rep floor/ceiling, equipment/load semantics, increment, and bodyweight variation/assistance and added-weight settings. Actual trainee bodyweight remains recorded metadata, not an invented effective load. All-set progression rules, recovery rules and the 32-credit block remain unchanged.

## Architecture and reconciliation

Original `template|role|exercise` identities and historical events remain intact. `ledger.cjs` resolves compatible identities and mirrors the latest authoritative progression state; `start.cjs` validates the catalogue registry and provenance. The application uses these helpers for Setup, pending decisions, Start and stall review. History remains the existing shared BVOM presentation.

A versioned `PROGRESSION_SHARED` event records the compatibility registry and deterministic opening-state precedence. It commits atomically with the first new Start. Merely viewing Setup or restoring a backup does not rewrite storage. Existing active workouts or unresolved legacy decisions must finish before activation. New Starts explicitly declare the policy; older clients reject unknown policy events rather than silently writing isolated progression.

At activation the latest authoritative writer wins among compatible existing states. Values are neither summed nor selected by maximum weight. An increment-only preference with no working load cannot overwrite an established load; it can inherit an established compatible track while preserving its increment compatibility. Verified sealed ancestry supplies opening-state precedence; old journals continue to replay under their original rules up to the policy event. New shared snapshots and writer order carry through the existing seal/opening proof. Duplicate references within one session aggregate evidence and advance once. Incomplete, recovery and extra sets cannot earn duplicate progression or credits.

Increment edits split incompatible tracks. Exercise swaps retain inactive variant state. Pending bodyweight choices remain explicit; shared decisions cannot be accepted twice through another day. Active-session edit locks apply across compatible aliases. Retrospective corrections replay deterministically without rewriting later recorded actual weights.

Portable restore and cloud validation independently check the registry, writer order, ancestry and load provenance against the saved catalogue. Ownership, conflict revisions, stale-device fencing and cloud schema are unchanged.

## Duplicate exercise audit

Every option in saved catalogue versions 1–5 is inspected by the focused contract suite, including disabled optional curls.

| Catalogue / exercise family | Compatibility result |
| --- | --- |
| Current v5 barbell, cable and dumbbell curls | Both upper days 2 × 10–15; share when settings match |
| Current v5 seated, single-leg and standing calf raises | Both lower days 2 × 10–20; share when settings match |
| Current v5 barbell, cable, chest-supported and dumbbell rows | A 3 × 8–12 versus B 2 × 8–12; independent |
| Current v5 front squat, goblet squat, leg press and safety-bar squat | A 3 × 6–8 versus B 2 × 8–12; independent |
| Historical v1 abdominal options | Matching 2 × 10–15 can share |
| Historical v1 assisted/unassisted Nordic | Matching 2 × 4–8 can share with compatible difficulty settings |
| Historical v1 other duplicated hamstrings | A 8–15 versus B 10–15; independent |
| Historical v1 chin-up, pull-up and lat pulldown | Different prescribed set counts; independent |
| Historical v1–v3 bodyweight calf and v1–v4 loaded calf choices | Matching prescriptions can share; historical selection retained |
| Historical v2–v4 squat, row and optional curl choices | Same full-prescription comparison; no catalogue migration |

Set counts matter because existing progression requires every prescribed set to qualify. Incompatible exercise history is still displayed as a starting-weight reference, with its original day and prescription, without automatically assigning its load.

The approved catalogue, Log Push Press, BB1, LP/RPT, HLM, 4-Day Split and Custom logic are unchanged.

## Focused proof

`bb2_shared_progression_contracts.mjs` covers A10 → B11 → next A12, migration precedence, independent prescriptions/increments, calf sharing, holds, interruptions, swaps, corrections, pending bodyweight decisions, active locks, duplicate references, forged portable/cloud data, all saved catalogue duplicates, and one bounded 32-credit seal/carry seam (`--seal`). No 220-session endurance rerun is required.

`bb2_shared_progression_browser.cjs` uses the actual interface at 360px and 390px, checks different-set rows remain independent, exports/imports a real backup and reloads the shared head. The authenticated browser test transports the canonical journal between two isolated devices and advances curls on each device in turn. Existing full regression, mobile History/bodyweight and cloud-isolation suites remain required.

PR #73 stays draft. Production v2.9.21 remains on HOLD. Next checkpoint: owner acceptance on a real Android phone.

# BB2 History display repair — HOLD

Approval: [PR #73, owner follow-up](https://github.com/bvomstrength-cloud/bvom-strength/pull/73#issuecomment-6594758499).

The reported Lower B workout (9/9 prescribed sets, 1:07 duration, Hanging Knee Raise with 40 kg actual bodyweight) exposed three presentation defects:

- A single bodyweight set suppressed the entire workout volume.
- The shared card repeated duration in its summary and expanded statistics.
- Bodyweight set text repeated internal variation IDs, `none` assistance and physical bodyweight on every set.

`index.html` now projects recorded external-load volume through the existing `bvomSetVolume` and `bvomVolumeText` functions. This includes recorded extra sets and explicit added weight, without inventing effective bodyweight or assistance load. Mixed/bodyweight workouts explain that the metric includes recorded external load only. The Finish dialog's existing unknown-bodyweight-volume behaviour is unchanged.

The shared History renderer shows duration in the collapsed summary or expanded statistics, once. Its exercise-summary helper keeps BB2 reps and external added weight on each set; distinct variation, assistance and actual bodyweight details appear once per exercise. Redundant default variation IDs and `none` are omitted; meaningful variations use human-readable names. Edit Sets retains the exact canonical metadata and existing correction/removal controls. The existing sharing formatter continues to receive the full bodyweight metadata.

These are view transformations only. Ledger/core modules, progression, credits, exercise catalogue (including Log Push Press), ownership, cloud revision protection and persisted formats are unchanged. No stored workout is rewritten.

Focused proof:

- `bb2_history_display_contracts.mjs`: exact Lower B shape, BB1 formatting parity, all eight bodyweight identities across saved catalogues v1–v5, assisted/weighted/unassisted records, varying metadata, extras, kg/lb conversion, and immutable source/projection.
- `bb2_history_display_browser.cjs`: actual 360px/390px interface, BB1 comparison, one duration, clean summaries, metadata access in Edit Sets, normal action controls, collapse and reload.
- The focused contract fails on the previous application because its mixed-workout volume is null.
- Existing History/action, bodyweight, backup/restore, cloud-isolation and full regression suites remain required. No additional 220-session endurance run.

PR #73 stays draft; production v2.9.21 is on HOLD. Next checkpoint is owner acceptance on a real Android phone.

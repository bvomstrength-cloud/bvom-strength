# Legacy cloud pauses — PR #73 remains on HOLD

This audit concerns the five `LEGACY_CLOUD_EXPLICIT_RECOVERY` warnings per trainee
in the full workout journey at `2e17756f1d7824345e5bfffc270b5a5c9015bf3c`.
It does not authorise a merge, deployment or production database change.

## What the guard requires

After Finish, legacy automatic sync is allowed when the whole normalised cloud
payload matches the device, a cloud-restore baseline matches, or the remote copy
still matches the workout's in-memory starting baseline. An active/interrupted
workout is never uploaded or replaced. If none of those conditions establishes
safety, the existing interface shows **SYNC PAUSED** and asks which copy to keep.
A missing or nonmatching baseline is not evidence that the cloud is older.

The workout baseline is an in-memory field, initially null on a new page. On an
active save, `bvomCloudMaybeScheduleFromSave` captures the current cloud payload;
it does not use the `persisted` argument supplied by `save`. Reload can therefore
lose the original baseline and recapture a state containing already-earned
progression, changed On-Ramp confirmations or other saved changes. Finish then
appends History. The resulting copy differs from cloud, and the guard refuses to
infer that it is the authoritative continuation.

The relevant functions (`bvomCloudMaybeScheduleFromSave`, `bvomCloudAssessSync`,
`bvomCloudScheduleAutoSave`, `bvomCloudAutoSave`, `bvomCloudSaveNow`) are byte-identical
to production v2.9.21 at `c22e79e101610c3002929fd1b73fe3530cec0c20`.
BB2's revisioned journal is separate; none of these five pauses occurs in BB2.

## The five boundaries

Both trainees recorded all working sets in workout 2, reloaded before Finish,
re-authenticated the same disposable account, then used normal Finish. The
BB1 On-Ramp uses its existing immediate completion flow. No second device had
changed the cloud in these controlled cases.

| Programme boundary | Local/cloud History at pause | Relevant local changes to inspect |
| --- | --- | --- |
| LP/RPT workout 2 | 2 / 1 | Earned lift weights, RPT/settings, PBs and new History |
| HLM workout 2 | 15 / 14 | Heavy driver/queued progression, day/prescription and History |
| 4-Day Split workout 2 | 27 / 26 | Heavy progression, day/prescription and History |
| BB1 On-Ramp workout 2 | 43 / 42 | Provisional/confirmed exercise states and History |
| BB1 main-block workout 2 | 47 / 46 | Per-exercise progression, block count and History |

These are expected conservative conflict decisions when proof is absent. They
are not network, authentication, RLS, duplicate-workout or lost-History failures.
Losing a useful baseline is an existing continuity/availability limitation; it
must not be represented as a real competing device edit in the test report.

## Why not auto-select the longer History

History prefix/length alone says nothing about newer cloud working weights,
increments, exercise selections, corrections, settings or preferences. A device
can contain one more workout and still lack a newer remote edit. Timestamps and
the user's identity do not establish ancestry either. Automatically keeping that
device would weaken conflict protection.

Automatic catch-up would be safe only with verifiable ownership and a trusted
full-payload starting baseline that still matches the latest cloud state, no
active workout/account switch/restore ambiguity, and the existing final write
protections intact. The five paused states do not supply that proof. Merely
persisting a fingerprint without accounting for backup restore, account changes,
stale devices and concurrent writes is not a justified narrow repair.
Legacy whole-row writes also do not acquire BB2's atomic revision protocol by
adding such a fingerprint. This audit leaves all transport and guards unchanged.

## Expected user behaviour

Recorded sets, progression and Finish/History remain durable on the original
device. The cloud copy remains unchanged while paused. Open **Settings → BVOM
Cloud**. In conflict state the choices are **KEEP THIS DEVICE** and **USE CLOUD
COPY** (rather than the normal **SYNC NOW** label).

First preserve/export the local copy and inspect the other device/cloud copy.
Use **KEEP THIS DEVICE** only if this device contains every record and change
that should be retained: this selects its whole legacy copy, not a journal merge.
Use **USE CLOUD COPY** only after preserving local-only workouts; the normal
restore path saves its recovery copy. If both copies contain unique changes, do
not guess or assume a larger workout count is authoritative. Keep both exports
and resolve the differences before selecting a copy.

WATCH is acceptable as disclosure of an existing explicit-recovery requirement
with preserved records, not as proof of uninterrupted automatic cloud backup.
PR #73 remains HOLD until the owner accepts this limitation and the final test
and physical acceptance evidence. No new production behaviour is enabled here.

## Reproduction and evidence

The isolated cloud workflow checks out the exact production source above and
runs the same Male/Female UI journey through all five boundaries against local
Supabase Auth/RLS only. This audit is explicitly labelled `LEGACY-AUDIT`, never a
full five-programme PASS. The candidate still runs the complete journey.

Both runs save `*-legacy-baseline-trace.json`: full normalised local/remote
payloads and the in-memory baseline immediately before/after each reload and at
pause, with exact changed field paths. The reports distinguish a lost baseline
from a recaptured nonmatching one. Production code is served from the checked-out
static files; no production account, endpoint, credentials or records are used.
CI execution links and final classification belong in PR #73's verification
section alongside the uploaded traces.

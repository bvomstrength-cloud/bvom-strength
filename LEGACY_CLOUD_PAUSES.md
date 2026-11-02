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
it does not use the `persisted` argument supplied by `save`. Reload loses the original baseline. The captured traces show it is null after
reload in all five original cases; a later active save can recapture already-earned
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
| BB1 main-block workout 2 | 47 / 46 | Payload still matches before Finish; Finish adds progression, block count and History |

The original five decisions are expected conservative conflict decisions when proof is absent. They
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
protections intact. Four of the five paused reload states do not supply that proof. BB1 main-block
workout 2 does: its entire normalised active payload still matches the freshly
read cloud copy before Finish. Merely
persisting a fingerprint without accounting for backup restore, account changes,
stale devices and concurrent writes is not a justified narrow repair.
Legacy whole-row writes also do not acquire BB2's atomic revision protocol by
adding such a fingerprint. The transport and final comparison/conflict guards remain unchanged.

### Narrow repair for the proven matching case

After successful authenticated account/entitlement/local-owner resolution,
`bvomCloudRememberMatchingActiveBaseline` may remember the matching full-payload
fingerprint in memory. It requires VERIFIED startup, the same Auth and local
owner, an owned unchanged document, no account switch or write/recovery block,
an active legacy workout and exact full-payload equality. BB2 active journals
are excluded. It neither changes local workout records nor writes cloud data,
sets syncReady or permits an active upload.

Normal Finish then uses the existing baseline comparison and final remote
recheck. Any intervening remote edit still pauses upload. Older backups,
progressed local weights, different cloud increments, foreign ownership and
stale document windows cannot establish this baseline. The focused test was
RED before the helper and is now GREEN with those negative cases. This is an
availability repair for a pre-existing production case, not a new conflict bypass.
The other four original pauses remain expected WATCH decisions.

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
The BB1 matching case is expected to recover automatically in the candidate;
the remaining unproven cases retain explicit recovery. PR #73 remains HOLD until
the owner accepts this limitation and the final test
and physical acceptance evidence. No new production behaviour is enabled here.

## Reproduction and evidence

The isolated cloud workflow checks out the exact production source above and
runs the same Male/Female UI journey through all five boundaries against local
Supabase Auth/RLS only. This audit is explicitly labelled `LEGACY-AUDIT`, never a
full five-programme PASS. The candidate still runs the complete journey.

The first production replay reproduced all five original boundaries plus three
additional first-workout pauses after HLM, Split and On-Ramp setup (14/13, 26/25
and 42/41 History respectively). Their unconfirmed changed programme setup also
differed from cloud. The audit must retain these extra warnings, rather than
require an artificial total of exactly five. The first audit run failed that
incorrect count assumption; no workout or conflict assertion was bypassed.

Both runs save `*-legacy-baseline-trace.json`: full normalised local/remote
payloads and the in-memory baseline immediately before/after each reload and at
pause, with exact changed field paths. The reports distinguish a lost baseline
from a recaptured nonmatching one. Production code is served from the checked-out
static files; no production account, endpoint, credentials or records are used.
CI execution links and final classification belong in PR #73's verification
section alongside the uploaded traces.

A separate short production-source probe preserves the application's actual
`persistSession`/`autoRefreshToken` options, redirects only the client endpoint to
local Supabase, and reloads a genuinely stored Auth session without injecting a
replacement sign-in. It runs two LP workouts per trainee and labels its output
`LEGACY-PERSISTENT-AUDIT`; this rules out explicit test re-login as the sole cause.

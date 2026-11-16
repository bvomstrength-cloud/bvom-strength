# BVOM Strength v3.0.4 — independent re-audit

**Repair review: GO within the executed scope. Production release: HOLD.** The final pinned application resolves the tested A01–A07 failures and the additional A01/A05 manifestations discovered during cold review. No unresolved CRITICAL or MUST FIX defect was found in the final inspected and executed paths. Hosted isolation, the approved old-client cloud-write cutover, physical Android/iOS PWA acceptance and final release gates must not be inferred from local passes.

This is a continuation by a second independent reviewing agent after the first repair reviewer was interrupted. Both reviewers are separate from the implementer, on the same machine/tool stack; this is not an external human or physical-device audit. The first reviewer's red evidence and severity assessments remain valid. Its initial green checks and old review ZIP were superseded by subsequent residual findings. They are not presented as proof of the final source. This continuation wrote independent harness/evidence and this report; it did not implement application fixes, merge, deploy, or write production data/schema.

## Pinned source and evidence

| Item | Verified identity |
| --- | --- |
| Original v3.0.3 baseline | `6c51e612cd5e6aa532766e5ce80f2d226eb950c0`; local `origin/main` also resolves here |
| Original audit evidence ZIP | SHA-256 `af77691a8e20ba14be2ec8056599e4639dcb44afe56cfc74b388faf1c6714dab`, freshly rehashed |
| Final reviewed application | `767f845467a4efca77e82d87e9130d881f208565` on `fix/v3.0.4-monkey-repairs` |
| Final `index.html` | SHA-256 `0b488e466092cbece7c3324dd129f7a672e5e06c40a8e010d5bb506df3c6f86d` |
| Exact CAS migration | `supabase/migrations/20261115203345_legacy_history_compare_and_swap.sql`, SHA-256 `c40abde7255a6c2e9ad45cbbf5b1386167eade20fd3f2329c051ce781a6ac8b2` |
| Independent rules oracle | Original and candidate SHA-256 both `85de553814f2a235f8622e7515850358f62feea0ad9d9d31a6bcbb3c00d96214` |
| Runtime | Chromium `151.0.7922.173`, Playwright `1.56.1`, Node `24.19.0` |
| Draft review PR | https://github.com/bvomstrength-cloud/bvom-strength/pull/85 |

Fresh final executions used an immutable `git archive` of the reviewed commit at `/workspace/bvom-v304-evidence/independent/final-continuation/candidate-app`. `SOURCE.json` in that continuation directory records all 18 shipped asset hashes. The unchanged BB2 shipped modules are included. The separate pre-residual candidate archive is exactly `89114da0f28d233e031285d978e12d9914459741`.

Evidence root: `/workspace/bvom-v304-evidence/independent/`. Earlier work is indexed by its preserved `RUNS.md`; this review's new results, scripts, logs and execution records are under `final-continuation/`. Original v3.0.3 report/evidence was read and not overwritten. No private `/tmp/*status.json`, local service credentials or user JWT is part of the review package.

## Original findings: reproduction and final disposition

The first repair reviewer independently reproduced **all seven** original findings: six local findings in 22 browser cases/85 expected-defect checks and A02 in a real Auth race with 22 checks. This continuation freshly repeated those six local baseline findings, again **22 cases/85 checks**, then ran the final pinned candidate through **22 cases/91 passing checks**. A passing baseline reproduction means the documented defect occurred; it is not a baseline application PASS.

| Finding / original severity | Final independent result |
| --- | --- |
| A01 — CRITICAL, unchanged saves delete later actuals | Core LP/HLM/Split unchanged and RPE-only saves preserve work. Genuine corrections still remove dependent prescribed sets and withdraw earned progression. Additional numeric accessory controls pass across all three programmes. |
| A02 — CRITICAL, concurrent legacy cloud replacement | Two fresh real authenticated browser races, with fully completed LP and Custom workouts, pass **66 checks**: same baseline, one commit, one explicit conflict, winning remote History, exact losing local History, reload, actual losing-device backup download, stale retry rejection and fenced old PATCH. |
| A03 — MUST FIX, Custom actual precision | Off-grid kg/lb initial entries, corrections, extras, PB, volume, Finish and reload preserve actuals; the template remains unchanged. |
| A04 — MUST FIX, BB1 invalid numeric reps | Normal BB1 and On-Ramp reject blank, negative and fractional reps with the dialog retained and no rejected performance/timer/progression write. Explicit zero remains valid. |
| A05 — MUST FIX, actual identity after unit change | Fresh and recoverable legacy actuals retain physical mass through correction, new History and export. GPP, accessories, PB comparisons, BB1/On-Ramp and deliberate changed-weight controls pass as detailed below. |
| A06 — SHOULD FIX, fractional Custom plans | Fractional counts are rejected without template mutation; valid minimum accepted. The primary repair browser run also passes displayed-boundary checks (171 checks overall). |
| A07 — MINOR, English balance prose in Japanese | Both sexes and deviation directions produce Japanese advice/lift labels without programme-state mutation. Ratios and thresholds remain unchanged. |

Local original-finding details are in `baseline-original-findings/RESULTS.json` and `original-findings-fixed/RESULTS.json` within the continuation. The earlier genuine A02 baseline race remains in `baseline-cloud-final/cloud-race.json`; this continuation did not pretend to rerun old unconditional writes against the already fenced database.

## Residual defects found by independent review

The initial repair was not accepted merely because its original 91 checks passed. The first cold reviewer found real remaining A01/A05 failures. This continuation also discovered two previously untested A05 correction paths and required repairs before final approval.

| Residual / severity | Before evidence and actual failure | Final evidence |
| --- | --- | --- |
| A01 numeric accessory unchanged save — CRITICAL | `residual-accessories-baseline` reproduces LP/HLM/Split: 30 kg × 8 × 3 earns 32.5; unchanged first-set save retains only set 0 and reverses progression. Initial repair failure retained under `residual-accessories`. | `additional-controls-v2`: each of three set buttons saves unchanged with identical full state/durable bytes; HLM/Split RPE-only changes preserve progression; genuine 8→7 correction withdraws the earned increase and saves correct rescue actuals/volume. |
| A05 legacy GPP snapshot — MUST FIX | `gpp-legacy-seed` / `gpp-upgrade`: genuine v3.0.3 63.75 kg actual converted to raw 140 lb with recoverable origin; initial repair copied 140 into new History/export. | `gpp-matrix-v2`: **12 cases/78 checks**, quick/set modes × kg/lb source units × legacy/fresh/originless records. Actuals and individual sets normalize on copied snapshots; live persisted data and prior History remain unchanged; planning retains its practical grid. |
| A05 legacy rep corrections — MUST FIX | `residual-legacy-seeds` / `residual-legacy-corrections`: core 60 kg→130 lb, extra 63.75→140, Custom 60→130, BB1 24→55 lose origins on meaningful rep correction. The earlier BB1 Finish helper missed its incomplete approval; that attempt proves live corruption, not finished History. | `legacy-corrections`, plus `residual-assertions.json`: all four paths now preserve exact actuals and origins, complete a real Finish including BB1 approval, survive reload and retain new History/export and prior History. |
| A05 Custom accessory Finish / prior PB — MUST FIX | `legacy-sidepaths-before`: Custom merges raw accessory records into normalized History; a prior physical 60 kg PB stored as 130 lb is incorrectly replaced by a lighter 131 lb actual. | `sidepaths`: new accessory History/export retains 66.138678654 lb for 30 kg, volume 529.11; prior heavier physical PB remains unchanged while the new 131 lb set is recorded. |
| **Additional A05 Custom and BB1 numeric accessory rep corrections — MUST FIX** | Fresh continuation probes independently found separate override callbacks that discarded origins. Authentic v3.0.3 30 kg × 8→65 lb+origin; 8→7 correction and actual Finish produced **65 lb instead of 66.138678654 lb**. Exact pre-residual commit red replays are `customacc-red-pinned` and `bbacc-red-pinned`; discovery attempts are retained too. | `customacc-final` and `bbacc-final` now record 66.138678654 through correction, new History and export. The BB1 override also serves On-Ramp accessories. No raw rounded-load reconstruction remains in these tested numeric callbacks. |

Additional final negative controls are significant:

- **6 browser cases/71 checks** (`additional-controls-v2`) cover all unchanged accessory buttons, isolated RPE edits, meaningful correction, correct rescue loads/History, and genuine actual-weight changes in Extra/Custom/BB1. Entering 71.25 lb clears the obsolete kg origin; converting back uses 71.25 lb rather than restoring the old mass.
- **3 On-Ramp cases/27 checks** (`onramp-controls-v2`) cover unchanged, rep-only and changed-mass entries from a genuine v3.0.3 seed. Exact 24 kg actuals stay 52.9109429232 lb while the next practical prescription remains 55 lb; an intentional 71.25 lb is retained. Incomplete Finish consumes no On-Ramp session.
- **2 fully completed BB1 browser workouts/46 checks** (`bb1-progression-controls`) verify completed History/export and calibration decisions. Rep-only correction retains the practical 55 lb progression basis while preserving the exact physical actual; a genuine 71.25 lb change uses the new basis. Every entered set is reconciled with History.
- **22 independent VM checks** (`intermediate-control`) exercise meaningful post-conversion HLM/Split rollback: converted driver 90 lb/+2.5, first set 5→4, later prescribed work removed, exact original 35 kg actual and 63.75 kg extra retained, `nextHeavy` withdrawn, and one failure after refill. This does not substitute an unchanged Save for a rollback test.
- **46 explicit assertions** in `residual-assertions.json` validate the observation-only legacy/sidepath/accessory artifacts; their scripts' completion exits alone were not counted as proof.

No new unresolved CRITICAL/MUST FIX remains from these challenges. The two new accessory failures were additional manifestations of A05; their red evidence and original MUST FIX severity were preserved rather than relabeled as harmless.

## Longitudinal integrity and regression protection

The implementer reran the unchanged six-monkey schedule on the final source in `/workspace/bvom-v304-evidence/verified-monkeys`: **215 sessions, 1,799 retained sets, 67 extras, 9,393 checks, 72 weekly checkpoints, zero failures**. This continuation independently re-executed the command-to-History reconciler against those new artifacts: **2,145 checks, zero mismatches**. It imports no application engine, primary harness or oracle. It independently reconstructs actual commands, set counts, weekly History/journal prefixes and genuine increment changes. It does not independently prove every physiological rule or unlogged metadata.

The six final counts remain Bruno 34/312, Kong 34/326, Milo 47/301, Rocky 25/342, Buster 41/394 and Chaos 34/124 (sessions/retained sets). BB1 stops after 24 completed workouts; BB2 has 32 normal credits plus eight recovery completions. No training or failed original scenario was removed to obtain a pass.

The final primary weekly portability rerun also completed **72/72 export/restore/reload roundtrips and 876/876 checks** in `verified-monkeys/weeklyportability`. This continuation inspected its 72 completed-roundtrip actions, 72 real backup files, 876 comparisons and zero failures. This is independently inspected primary execution; this continuation did not perform a second set of 72 UI restores.

This continuation separately reran the final source's **1,110 targeted contracts**, **6/6 repair mutations killed**, and **4/4 independent arithmetic/progression/card/extra mutations killed**, with all controls passing. Mutations are temporary in-memory application strings. The original rules oracle is byte-identical. Review of changed legacy contracts found legitimate expectation changes rather than removed coverage: unchanged saves now require preservation; F26's genuinely changed successful accessory correction uses 9 rather than unchanged 8; F29 retains the unchanged-save control and adds a real correction; a new F24 meaningful unit-correction case supplements the retained old F24 case. Mutation anchors follow the same injected faults after source changes.

The source-final primary full Lab completed **GO** in `/workspace/bvom-v304-evidence/full-gate-residual-final.log`: **30 static, 314 behaviour and 14 sequence checks**, all **151 general**, **137 BB2** and **4 extra-set** mutations killed, plus the known-bad reference. This continuation inspected that completed log and independently matched all 18 assets of both its isolated candidate and the worktree to the pinned archive (**36 source-identity checks**). This is primary execution independently inspected, not a second execution of the whole Lab by this reviewer. Earlier `full-gate-final.log` and `release-monkeys` successes remain pre-residual evidence and are not substituted for source-final execution.

## SQL, Auth, ownership and rollout review

The unchanged final SQL was source-reviewed against the Supabase security checklist. Its justified `SECURITY DEFINER` writer has an empty search path, fully qualified table/Auth access, explicit `auth.uid() = p_owner_id`, owner-scoped transaction serialization, latest-row locking and id+revision comparison. PUBLIC/anon execution is revoked. Direct table and column writes are revoked atomically with RPC publication; inherited write privileges abort the transaction. The trigger advances revisions for trusted maintenance. Exact latest-payload retries are idempotent; stale/different requests conflict. BB2's separate table/protocol is unchanged.

The first reviewer executed the exact migration on a fresh local database with production-like broad grants, verified full JSON preservation, and deliberately introduced inherited UPDATE privileges. The migration rejected that case and rolled back columns/function/trigger; the corrected fixture then applied successfully. Those are preserved prior independent executions, not newly claimed executions by this continuation.

This continuation freshly ran **30 real PostgreSQL/GoTrue/PostgREST checks** on that separately named loopback backend: 12 simultaneous first uploads yield one winner and 11 conflicts; owner/foreign/anon restrictions, direct INSERT/UPDATE/DELETE fencing, malformed payloads/revisions, request replay, maintenance invalidation, duplicate documents and exact preservation of a nonempty BB2 sidecar all pass. It also reran the **6/6 existing BB2 real-Auth protocol controls** with pinned modules. User tokens came from genuine GoTrue sign-in with normal `authenticated` role, not manufactured JWTs. Browser cloud races used actual application controls and real requests/responses; only request timing was gated.

**Old clients are a real compatibility blocker.** v3.0.3 unconditional cloud writes fail after the migration; reads/local training/export remain available. v3.0.4 cloud writes also fail closed without the migration. There is no safe fallback to unconditional PATCH, no claimed transparent coexistence, and no safe routine rollback that simply restores those privileges. The owner must approve the cutover/update/recovery plan in `docs/v3.0.4-cloud-rollout.md`. Local fixture success and production schema-metadata inspection do not prove deployed policy/Auth/infrastructure parity. No production user rows were read by this continuation; no production write/migration was executed by either repair reviewer.

## Packaging, PWA and remaining gates

Independent committed-source packaging and verification passed **47 checks**: ZIP integrity/exact 20-member set, member hashes, all 18 source hashes, both entry points' production-endpoint removal, unchanged manifest identity and unique commit cache `bvom-3.0.4-monkey-test-767f845467a4`. Review ZIP SHA-256 is `1194c415de55d4a6b3bba136aedd26f6e931d347b1d1acfa968812e3f59d7234`. Its status is intentionally **HOLD — HOSTED ISOLATED CLOUD NOT CONFIGURED**; no test backend or permission was invented, and nothing was deployed.

This continuation reviewed and independently executed the committed native PWA harness on pinned baseline/final assets: **31 passing assertions**. It uses actual Chromium CDP manifest installation and native standalone launch in a persistent Linux browser profile, without faking the standalone media query. It completes a v3.0.3 workout, retains an interrupted workout while the waiting worker is deferred, finishes it explicitly, updates to v3.0.4, relaunches the installed app, and checks History, state, one worker scope and offline recording/reload. This is genuine installed **Linux Chromium** evidence. It is **not physical Android/iOS acceptance**.

The independently fetched CI runs for the reviewed application commit are:

| Workflow | Successful run |
| --- | --- |
| BVOM Lab | [#724](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428392) |
| Browser Runner Proof | [#464](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428343) |
| v3.0.4 monkey repair replay | [#3](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428350) |
| BB2 authenticated cloud proof | [#91](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428390) |
| Draft Netlify Test ZIP | [#455](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428341) |

| Status | Meaning |
| --- | --- |
| **GO** | The final inspected/tested A01–A07 repair behavior, independent residual checks, real local CAS races, targeted contracts, mutation sensitivity and independent integrity reconciliation pass. |
| **WATCH** | Legacy records without a verified origin retain their stored number; precision is not invented and past History is not silently rewritten. Simulated weeks, selected exercise/settings/input cases and one local browser stack do not exhaust all states. No blanket whole-system survival claim is justified. |
| **HOLD** | Production release/cutover until isolated hosted Supabase/Netlify acceptance, approved old-client write interruption/recovery plan, physical Android/iOS installed-PWA acceptance and required gates for any later promotion commit are complete. The review ZIP alone cannot complete fresh authenticated hosted setup. |

Release-gate note: source-final broad Lab, weekly portability and exact reviewed-source CI are GO. This continuation independently queried GitHub for `767f845467a4efca77e82d87e9130d881f208565` and confirmed all five workflows completed SUCCESS, with PR #85 still draft/open/unmerged and that exact head (`github-exact-source-ci.json`). These results replace the earlier `25efee7` workflow evidence; subsequent commits require their own required CI before promotion. Billing/webhooks, OTP delivery, real long-duration JWT behavior, external Strava posting, OS eviction/termination, audio/vibration and real device keyboards remain untested. Pure Strava adapter checks did not post externally.

## Evidence handling and harness corrections

Failed attempts are retained and excluded from final PASS counts. In addition to the first reviewer's documented setup corrections, this continuation corrected three harness assumptions without changing application code or expectations about training integrity:

1. Authentic GPP matrix seed artifacts were wrappers containing the state in `.before`; the original seed writer had reused the same filename for the observation record. The new On-Ramp discovery likewise retained its genuine state under `.seed`. Initial replays of wrappers failed before boot with zero cases. Final readers select the captured state; original wrapper bytes remain intact. No timestamps or user data were rewritten to force acceptance.
2. Active legacy seed clocks are frozen at their captured last activity plus one second **before application boot**, so legitimate overnight recovery is not mislabeled an A05 failure. New accessory controls use one fixed clock so legitimate RPE activity-time updates do not masquerade as progression changes.
3. The residual BB1 Finish helper now acknowledges the actual incomplete-workout confirmation before entering a note. Final History claims require a new record, export and reload; earlier incomplete-helper attempts are not promoted into Finish coverage.


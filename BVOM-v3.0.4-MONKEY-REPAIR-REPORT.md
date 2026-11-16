# BVOM Strength v3.0.4 — Monkey Repair Report

## Executive summary

**Release verdict: HOLD.** A01–A07 are repaired in the isolated candidate and
the final local full BVOM Lab gate is GO. All five CI workflows have passed on
the same application assets. Production remains v3.0.3 as instructed; nothing
was merged, deployed, migrated or written to a production workout document.

The remaining production blocker is explicit: v3.0.3's unconditional cloud
writes cannot safely coexist with revision-protected uploads. The reviewed SQL
cutover makes old clients' uploads fail closed until they update. Owner approval
of that interruption, an isolated hosted backend/test-site acceptance and
physical installed mobile-PWA acceptance are still required. The supplied test
ZIP intentionally cannot authenticate against production.

The primary final replay completed **215 sessions, 1,799 retained sets, 67 extras,
72 weekly checkpoints and 9,393 comparisons**, with **zero oracle mismatches**.
Every checkpoint also completed a real browser export/restore/reload roundtrip:
**72/72, 876 comparisons, zero errors**. Separate cold reviewers independently reproduced and challenged the repairs.
They found additional manifestations of A01/A05, which were repaired and
independently rechecked. Their bounded repair verdict is GO, with production
release HOLD. Full conclusions and limitations are recorded in
`BVOM-v3.0.4-INDEPENDENT-REAUDIT.md`.

## Source and evidence identity

- Repository: `bvomstrength-cloud/bvom-strength`.
- Owner-confirmed production/repair baseline:
  `6c51e612cd5e6aa532766e5ce80f2d226eb950c0` (v3.0.3).
- Branch: `fix/v3.0.4-monkey-repairs`.
- Candidate application source: `767f845467a4efca77e82d87e9130d881f208565`.
  All 18 deployable assets match this commit; later test/report commits may
  advance the draft PR without changing those application bytes.
- Draft PR: <https://github.com/bvomstrength-cloud/bvom-strength/pull/85>.
- Original audit report was read in full. Original evidence ZIP preserved:
  `BVOM-v3.0.3-WORKOUT-MONKEY-EVIDENCE.zip`, SHA-256
  `af77691a8e20ba14be2ec8056599e4639dcb44afe56cfc74b388faf1c6714dab`.
  Archive manifest: all 517 recorded hashes verified; 518 archive members.
- All seven findings were freshly reproduced on exact v3.0.3 **before repair**.
  Original reproductions were preserved rather than edited in place.
- The independent rules oracle is unchanged, SHA-256
  `85de553814f2a235f8622e7515850358f62feea0ad9d9d31a6bcbb3c00d96214`.

`SOURCE.json` inside the test ZIP and its external manifest identify the exact
committed input and every source/packaged asset hash. The evidence package
contains baseline logs, final expected/actual comparisons, actions, snapshots,
exports, regression logs, cloud proofs, screenshots and the independent review.

## Finding-by-finding repair

| Finding | Baseline severity / cause | Candidate repair | Verification |
|---|---|---|---|
| A01 | CRITICAL — identical core-set saves entered rollback/dependent deletion | Semantic no-op before rollback; HLM/Split effort-only edits save RPE independently; genuine rep corrections keep rollback/deletion | Every prescribed set in LP straight/RPT, all HLM days and all Split days; extras before/after, snapshots, earned weights, failure counts and reload; real browser reproductions; meaningful corrections retained |
| A02 | CRITICAL — GET/fingerprint followed by unconditional legacy PATCH | Atomic owner-scoped revision RPC, explicit conflict, local/export preservation, no unsafe fallback; old-writer server fence | Five real-authenticated completed-workout race pairs; real receiving-device restores; stale/idempotent request tests; direct old INSERT/PATCH denial; independent server challenge |
| A03 | MUST FIX — Custom actual load passed through prescription rounding | Record finite positive actual directly; full actual precision when reopening; durable save/rollback; planning still rounds | Initial/corrected/extra actuals, kg/lb, rejection before mutation, History, total volume, PB, numeric export and backup |
| A04 | MUST FIX — BB1 numeric reps coerced/floored | Shared explicit, finite, safe, nonnegative integer validation; inline EN/JA notice; no state allocation on opening numeric On-Ramp recording; durable rollback for numeric saves too | Normal block and On-Ramp; blank/negative/fractional/nonfinite/unsafe integer rejected; zero deliberately accepted; dialog, memory, storage and timer preserved on rejection |
| A05 | MUST FIX — actuals reused practical prescription conversion | Exact actual conversions with reversible origin metadata; practical plans remain rounded; new History snapshots and PB readers honor verified interrupted-session origins | All legacy programme actuals, accessories/GPP/PBs, 100 roundtrips per programme, one-way Finish/reload/export/adapter/share, existing BB1 progression basis, legacy compatibility |
| A06 | SHOULD FIX — Custom plan counts clamped without integer validation | Safe integers, sets 1–20 and reps 1–50; reject before changing template | Blank, fractional, negative, nonfinite, unsafe/out-of-range counts; editor stays open; valid maximum generates matching controls |
| A07 | MINOR — ratio notice composed as English text | Existing EN/JA mechanism, localized lift names/profile/direction/sentences | Both directions/languages and 320/360/390/430 px; percentages, thresholds and training rules unchanged |

### Exact reproduction / repair checks

**A01:** Record all prescribed Squat sets successfully, add extras, reopen each
completed set, and save the same reps. v3.0.3 removed later numeric sets and
could reverse progression. The candidate preserves the whole workout state and
stored bytes for a true no-op. Changing only HLM/Split RPE preserves every other
training field. Changing reps genuinely still invalidates dependent prescribed
sets, recomputes earned state and retains extras and explicit future settings.
Regression: `repair-contracts.cjs`, `repair-browser.cjs`, existing F28/F35 and
extra-set lifecycle/mutations. No cloud operation reconstructs deleted sets.

**A02:** Restore a common account baseline on devices A and B. Complete a whole
workout independently on each, hold their outgoing conditional requests, then
release them against the same revision. The database permits one write and
returns `conflict` to the other. The loser shows conflict, disables automatic
upload and retains its completed History and downloadable backup. A third real
authenticated device restores the winner without duplication. This ran for
LP/RPT, HLM, Split, BB1 and Custom: **112 recorded checks**. Separate real-server
contracts: **13 checks**, including concurrent first inserts, idempotency,
stale-after-newer retry, anonymous/foreign-owner rejection, maintenance revision
changes and retained older duplicate documents. The original delayed-read race
also passed **14 checks** through the revised RPC transport.

The client never falls back to unconditional PATCH. SYNC NOW cannot silently
adopt a changed remote baseline. Explicit KEEP THIS DEVICE remains a whole-copy
conflict resolution and still uses server CAS; users should export both copies
before choosing a replacement. This fix detects conflicts; it does not claim
to merge divergent histories automatically.

**A03:** Enter 61.25 as the Custom actual, correct to 63.75, and record extras
in both units. The candidate retains the entered numeric values. History,
volume, PB, backup and export use those actuals; changing actuals leaves the
user's planned progression authoritative. Invalid load submissions leave the
dialog and workout state intact.

**A04:** In each BB1 recording path, submit blank, -3, 1.5, nonfinite and unsafe
integer reps. Each is rejected inline without recording a set, changing
progression, starting a timer or writing workout storage. Submit 0 deliberately:
it records 0. First-exposure calibration no longer receives an invented zero
from a blank field. A rejected durable numeric save also rolls back memory.

**A05:** Record 63.75 kg × 4, select pounds, and finish in pounds. The actual is
140.54469213975 lb; History's existing two-decimal volume policy stores
**562.18 lb-reps**, not the old 560. Numeric export preserves the actual and
the Strava adapter returns 63.75 kg. Sharing/History use the correct stored
actual with existing display formatting. Future prescriptions retain their
practical grids. BB1's converted progression basis remains practical even when
its actual has more precision.

Historical records are not silently rewritten. An interrupted record with
matching conversion-origin evidence can be read accurately when newly finishing
or earning a PB. A rounded legacy record without that evidence remains as
stored; the missing precision is not guessed. Repairing previously corrupted
saved History would require a separate explicit, evidence-based operation.

**A06:** Edit a Custom straight-set plan to 2.5 sets / 5.5 reps. Both must be
whole counts within the existing UI limits. The candidate retains the existing
template, keeps the editor open and explains the invalid field. Maximum valid
20 × 50 is accepted and generates 20 prescribed controls.

**A07:** Enable balance advice in Japanese with lifts above and below the
profile relationship. Advice now uses Japanese lift/profile/directional text.
The calculation `(lift / squat - ratio) / ratio`, threshold and rounded
percentage are unchanged. Screenshots cover all four requested widths.

### Residual findings caught by the cold reviewers

The initial candidate's passing checks were insufficient. Independent review
found and reproduced the same critical no-op deletion in numeric accessories,
plus recoverable legacy precision loss during GPP Finish, meaningful core/extra/
Custom/BB1 corrections, Custom/BB1/On-Ramp accessory corrections, Custom accessory
Finish, and prior-PB comparison. These retained **CRITICAL A01 / MUST FIX A05**
severity until independently verified after repair; they were not downgraded.

The final candidate uses the same no-op/RPE-only protection for numeric
accessories; resolves verified physical actuals at entry and new-record snapshots;
retains origins only when actual mass is unchanged and clears them on deliberate
load changes; keeps BB1's converted progression basis practical; normalizes Custom
accessory copies at Finish; and compares prior PBs by verified physical mass.
Previously saved History remains untouched. Genuine v3.0.3 seed files and their
hash provenance are committed under `tests/monkey-v304/fixtures/legacy-actuals/`.

New implementer regressions passed **44 genuine legacy correction/PB checks**
and **36 GPP upgrade/fresh checks**. Final independent checks passed **12 GPP
cases/78 assertions**, **6 accessory/explicit-mass cases/71**, **3 On-Ramp
cases/27**, **2 fully completed BB1 progression cases/46**, **22 intermediate
correction checks**, and **46 explicit legacy residual observations**. The
independent command-to-History reconciliation passed **2,145 checks** against the
final 215-session replay. The re-audit report attributes the two reviewers' runs
and preserves the initial failing evidence and corrected harness assumptions.

## Six-monkey 12-week replay

| Monkey / programme | Seed | Saved sessions | Complete / incomplete | Retained sets | Extras | Comparisons | Weekly checkpoints |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bruno / LP-RPT | 3031101 | 34 | 33 / 1 | 312 | 14 | 1,839 | 12 |
| Kong / HLM RPT | 3031102 | 34 | 33 / 1 | 326 | 14 | 2,073 | 12 |
| Milo / 4-Day Split | 3031103 | 47 | 46 / 1 | 301 | 20 | 2,034 | 12 |
| Rocky / BB1 | 3031104 | 25 | 24 / 1 | 342 | 5 | 1,212 | 12 |
| Buster / BB2 | 3031105 | 41 | 40 / 1 | 394 | 6 | 1,717 | 12 |
| Chaos / Custom | 3031106 | 34 | 34 / 0 | 124 | 8 | 518 | 12 |
| **Primary total** | | **215** | **210 / 5** | **1,799** | **67** | **9,393** | **72** |

Buster's 40 complete sessions comprise **32 normal credits plus 8 recovery
sessions**. Rocky stops normal work at 24 completions; Buster stops normal work
at 32 credits. Remaining calendar weeks are reconciled without inventing more
normal sessions. Custom's deliberately short session is legitimately complete
under its user-controlled rules, not mislabeled incomplete.

The primary totals describe the final committed-source replay, not unique human
workouts across every test suite. Three earlier diagnostic 215-session replays also
ran (860 longitudinal session executions in total); they are not double-counted
as extra scenario coverage. Cloud/browser/VM suite counts below are separate.
Some assertions inside existing suites are not centrally instrumented, so their
reported contract counts are not presented as an invented grand assertion total.

### Progression and data reconciliation

The unchanged independent oracle checks exercise order, live prescriptions,
RPT top/back-offs, HLM drivers and Light/Medium relationships, Split drivers,
failure/reset branches, BB1 exercise methods and BB2 credits/stalls/recovery.
Custom changes stay user-controlled. Extra sets affect actual volume and History
without becoming prescribed progression drivers. Current working weights remain
visible after earned progression (v3.0.3 protection retained).

Every week checks commanded/retained sets, extras, progression/failures, workout
counts, volume, dates/durations, History and programme state. Every final workout
checks prior History immutability and duplicate Finish rejection. **No cumulative
drift, duplicate completion or unexplained transition was observed.** Action logs,
per-set expected/actual comparisons and all 72 complete states are packaged.
The separate cold reviewer also reconstructs the command-to-History sequence
without importing the application or progression oracle.

## Regression evidence

| Executed proof | Result |
|---|---|
| Exact baseline A01–A07 before implementation | All seven reproduced; original scripts/evidence retained |
| Final six-monkey replay | 215 sessions / 9,393 comparisons; 0 mismatches |
| Weekly real export/restore/reload | 72 roundtrips / 876 comparisons; 0 errors |
| Original adversarial scenarios and final six restores | 15 cases / 44 comparisons; 0 errors |
| Targeted real application VM repair checks | 1,110 passed |
| Targeted genuine browser repair checks | 171 passed |
| New deliberate local repair mutations | 6/6 killed |
| Original independent-oracle mutations | 4/4 killed |
| Full existing BVOM Lab | GO: static 30, behaviour 314, sequence 14; all BB2 tiers; all 151 general, 137 BB2 and 4 extra-set mutations killed; known-bad reference checked |
| Existing browser/recovery/lifecycle/bodyweight/BB2 suites | All 21 covered; two harness/environment failures rechecked successfully; full CI browser workflow passed |
| Existing BB2 real Auth/RLS/server revision proof | 6/6 passed |
| Existing BB2 real authenticated browser/lifecycle proof | 17/17 passed |
| Existing legacy guard counterfactuals | 18/18 passed |
| New five-programme completed-workout cloud races/restores | 112 checks passed |
| New real-server CAS challenge | 13 checks passed |
| Original delayed-read legacy cloud scenario | 14 checks passed |
| Timer, one-way units, authenticated programme changes | 3 cases; passed |
| Mobile matrix | 48 combinations / 432 comparisons; passed |
| Source-isolated deterministic ZIP contracts | 30 passed |
| Native Chromium worker update from exact v3.0.3 | Passed; one registration, one update, retained installation identity |
| Actual installed Linux PWA upgrade / relaunch / offline | 31 checks passed; 2 saved sessions, 11 set saves |
| Genuine legacy actual corrections / GPP | 44 / 36 checks passed; original fixtures preserved |

The first full-gate run was NO-GO and remains in the evidence. It exposed test
expectations coupled to rounded actuals, two version assertions, a legacy
transport mock and mutation paths previously activated by unchanged edits.
Those tests were updated to the authorized repaired behavior; meaningful
corrections were added so rollback mutations remained live. The final full gate
passed. No scenario or mutation was deleted, and no progression oracle changed.

The first heavily concurrent backup run timed out on BB2's large final restore.
Its failed log is preserved. A standalone diagnostic and subsequent complete
final 72-roundtrip / six-final-restore runs passed. Runner timeout increased
from 12 to 30 seconds without changing assertions or backup validation.

## Cloud, migration and account isolation

Local cloud tests used disposable real GoTrue 2.197.0, PostgREST 16.5 and
PostgreSQL 17 services on loopback. CI additionally ran a fresh Supabase CLI
2.122.0 environment with production-like legacy grants, applying the exact
reviewed SQL there. No test used the owner's account or production History.

Only schema/permission metadata was read from production: bigint identity id,
postgres owner, owner RLS, nullable JSON data, `auth.uid()` owner default and
legacy table grants. No production rows were read or modified. This metadata
does not substitute for a hosted isolated environment's acceptance tests.

The migration adds revision/request-id columns without rewriting JSON or
deleting duplicate rows. An owner-scoped transaction lock also covers first
uploads. The RPC checks authenticated ownership, locks/checks the latest id and
revision, and returns explicit conflict. A trigger invalidates stale baselines
after trusted maintenance writes. PUBLIC/anon execution is denied; direct
authenticated and anonymous write/trigger/reference privileges are fenced.
BB2's table, modules and revision protocol are unchanged.

**The migration is not deployed and is not old-client write-compatible.** The
genuine cutover blocker, preflight, atomic deployment order, client update,
verification and safe rollback limits are detailed in
[`docs/v3.0.4-cloud-rollout.md`](docs/v3.0.4-cloud-rollout.md). Re-enabling old
unconditional writes is not a safe routine rollback.

## Mobile, language and PWA

All six programmes were tested in English/Japanese at 320, 360, 390 and 430 px.
Recording/correction, extras, start/finish, modal dismissal, rest timer, accidental
double taps, offline browser closure/reopen and reconnect were exercised. No new
material visual defect was established in the 48-case matrix. Original visual
defect screenshots and repaired Japanese balance screenshots are preserved.

The real v3.0.3-to-v3.0.4 service-worker update passed. The manifest is byte-for-
byte unchanged, including start URL/scope/display/icons. An actual installed Linux Chromium PWA upgrade also passed **31 assertions**,
including two saved workouts, active-workout update deferral, standalone launch,
persistent-profile relaunch and offline recording. Physical Android/iOS
installation and upgrade are **NOT TESTED** here.

## CI and release protection

All five workflows passed on exact candidate
`767f845467a4efca77e82d87e9130d881f208565`:

- [BVOM Lab #724](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428392)
- [Browser Runner #464](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428343)
- [Authenticated cloud #91](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428390)
- [Monkey repair replay #3](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428350)
- [Isolated Netlify test ZIP #455](https://github.com/bvomstrength-cloud/bvom-strength/actions/runs/43793428341)

The delivered `BVOM-v3.0.4-TEST.zip` is built from that exact committed source.
SHA-256: `1194c415de55d4a6b3bba136aedd26f6e931d347b1d1acfa968812e3f59d7234`.
All 18 source hashes, all 20 packaged hashes, ZIP integrity, deterministic rebuild
and unchanged manifest identity were verified. Index/admin endpoint replacement
and the marked commit-specific cache are explicit transformations in `SOURCE.json`.
The ZIP status is **HOLD — hosted isolated cloud not configured**; fresh account
setup will not work until an isolated backend is configured and the ZIP rebuilt.
It never uses production Supabase as a testing shortcut.

Final branch-tip CI, independent review and source-manifest verification are
included in the handoff evidence. Later report commits do not change these
18 candidate application assets. Creating a draft PR/CI ZIP
does not authorize a merge, hosted deployment, production migration or release.

## Remaining gates and repair priority

1. The independent re-audit resolves the tested A01–A07 and residual findings;
   no CRITICAL/MUST FIX remains open in the executed scope. Review its limits.
2. Owner decision on the incompatible old-client cloud-write cutover; keep the
   explicit server fence. Never treat a client-only patch as protection for v3.0.3.
3. Provision an explicitly isolated hosted Supabase backend and separate Netlify
   test site; configure/rebuild the test ZIP, apply SQL there, and accept real
   hosted Auth/redirect/RLS/offline/restore and competing-device behavior.
4. Complete physical mobile installed-PWA upgrade/acceptance on copies of data.
5. Only a separate authorized production phase may migrate, merge or deploy.

No redesign, unrelated progression refactor, production data change or silent
historical repair forms part of this candidate.

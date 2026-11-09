# BVOM Strength

## v3.0.3 development candidate — working weight display

Keeps current LP/RPT, HLM and 4-Day working/top weights on workout cards after progression, with a separate confirmed future-load label. Presentation only; progression and stored-data formats are unchanged. Based on verified v3.0.2 main `2e93b4d`. See [audit and verification notes](docs/v3.0.3-working-weight-display.md). Draft PR and separate Netlify test ZIP only; no merge or production deployment.

## v3.0.2 development candidate — extra working sets

Optional extra working sets for LP/RPT, HLM and 4-Day Split. Recorded actuals contribute to volume and History while prescribed sets alone determine progression. See [implementation and verification notes](docs/v3.0.2-extra-working-sets.md). Based on v3.0.1; draft review and separate test ZIP only. No merge, release or production deployment.

## v3.0.1 production release — manual upload pending

- Owner authorized completion and merge of PR #82 after passing release gates, and preparation of the clean production ZIP. Netlify deployment is not authorized; the owner will upload the ZIP.
- Baseline: v3.0.0 main `31d5f7155537b235ae873aec3056ade5600cd049`; approved lifecycle test head `465709fcc7e20168c9ffd32064b78aaf7492c263`. Current deployed version is v3.0.0 per the owner's release instruction; v3.0.1 is not deployed by this workflow.
- Repairs verified empty timestamp remnants under existing ownership fences; Custom/BB1 final-set removal and cleanup use one durable write. Genuine work, pending decisions, legacy archive rules and restore guards stay protected.
- Adds confirmed Cancel Workout for empty explicitly started BB2 sessions, with internal recorded-set rejection and stale-context rechecks. BB2 Start, all prescription/progression/ledger modules, storage/backup formats and Supabase configuration remain unchanged.
- Title, header, `BVOM_BUILD`, first-install worker URL and worker `BUILD` identify v3.0.1; production cache is `bvom-3.0.1`.
- `scripts/package-production.cjs` packages exactly 18 committed production assets from the verified merged source. No HOLD/test markers, instructions, fixtures or documentation are included. See [lifecycle repair notes](docs/v3.0.1-lifecycle-hold.md).

Production source repository for BVOM Strength.

## Previous approved release — v3.0.0

- **Approval:** The owner approved BB2 integration at `de34b476c38b9874ce65fb4cf880f12754282539` for production. PR #73 was squash-merged as `1bd75e2f219ffe9ca19901112a8178dcb87c309c`; all four approved-head workflows passed.
- **Version:** v3.0.0 replaces the proposed v2.9.22 production release. Title, header, `BVOM_BUILD`, first-install worker URL, worker `BUILD` and cache identify v3.0.0. Existing worker registrations and manifest app identity remain stable during upgrades.
- **Integration:** BB2 is available through the normal programme chooser alongside BB1, LP/RPT, HLM, Custom and 4-Day Split. It reuses the numbered selector, workout controls, History and sharing. Automatic next-workout previews, shared compatible progression, inline bodyweight decisions, recovery and 32-credit blocks retain the approved behaviour, including both final audit repairs.
- **Data:** No release migration, local-storage key change, progression rewrite, database schema or Supabase policy change. Existing History, backups, interrupted sessions, ownership, revision and stale-device protections remain in place.
- **Packaging:** `scripts/package-production.cjs` produces `BVOM-v3.0.0-PRODUCTION.zip` from the final Git commit's 18 required production files. It includes no test marker, test cache, notes, fixtures or documentation. Verification and the complete SHA-256 accompany the handoff ZIP.
- **Deployment:** Owner approved source promotion and release preparation, not an automated hosting deployment. **Live hosting remains v2.9.21 until the owner manually uploads the verified v3.0.0 ZIP.** Retain the verified v2.9.21 package for rollback. Physical installed-PWA acceptance after upload remains an owner check.

## Historical deployed release — v2.9.21

- **GitHub application baseline:** merged `main` application commit `4f31e590e2849580e47d672e32aa1d0e23a18e96` (1 November 2026). Later documentation-only commits may advance `main` without changing deployable application files.
- **App version:** `v2.9.21` in the title/header and `BVOM_BUILD`; service worker `BUILD = '2.9.21'` with production cache `bvom-2.9.21`.
- **Owner deployment confirmation:** On 1 November 2026, Richard confirmed uploading the v2.9.21 production ZIP to Netlify. Independently fetched live `https://app.bvomstrength.com/` and `/index.html` both matched Git blob `707aed447316d4c13e06f65366a24164242222e7`; live `/sw.js` matched Git blob `0835af513997988372a09322c29b63a171b9d861`. This verifies the public static release, not signed-in data, cloud sync or an installed Android PWA after updating.
- **Production ZIP:** `BVOM-v2.9.21-PRODUCTION.zip`, 13 deployable files (1,620,956 bytes); SHA-256 `0672bcf379a88816c4fcf8178e88c915cf4ef734b905e00b04a0e48db5297da6`. Archive integrity passed; all 13 members matched the exact merged release-source files and the previously tested release candidate byte-for-byte. Retain the v2.9.20 ZIP for rollback.
- **Change:** LP/RPT Advanced Settings now preserves a lift's existing failure-attempt count when saving an increment-only edit or unchanged settings. A working-weight or other prescription change still resets attempts as before; HLM/4-Day handling is unchanged. No workout data schema change.
- **Release trail:** [PR #78](https://github.com/bvomstrength-cloud/bvom-strength/pull/78) (LP failure-streak fix, merged as `4b6dacad`) and [PR #79](https://github.com/bvomstrength-cloud/bvom-strength/pull/79) (v2.9.21 build/cache markers, merged as `4f31e590`).
- **Verification:** PR #78 Lab #630, Browser Runner #383 and test packaging #374 PASS; PR #79 Lab #632, Browser Runner #384 and test packaging #375 PASS. Post-merge local full regression returned **GO** (static, behaviour, sequence, all mutations killed and known-bad reference). Owner reported test-site acceptance before production upload; installed Android PWA and signed-in cloud state were not independently tested after deployment.
- **Safety:** GitHub merges do not automatically deploy Netlify. Keep previous verified ZIPs, stored workout data, and service-worker update/ownership protections intact.

## Previous approved release — v2.9.20 (superseded 1 November 2026)

- **GitHub application baseline:** merged `main` application commit `bbfe880719838b183386db0f54395963d8f9b81a` (29 October 2026). A later documentation-only commit may advance `main` without changing deployable application files.
- **App version:** `v2.9.20` in the title/header and `BVOM_BUILD`; service worker `BUILD = '2.9.20'` with production cache `bvom-2.9.20`.
- **Owner deployment confirmation:** On 29 October 2026, Richard confirmed deploying the production ZIP to Netlify. Independently fetched live `https://app.bvomstrength.com/` and `/index.html` both matched Git blob `21c2f34f8ba0b2d96cdc68408eee6ba2ae89a239`; live `/sw.js` matched Git blob `7d6963d78b1ebfac7e7ff2399890eab1efca1354`. This verifies the public static release, not signed-in data, cloud sync or an installed Android PWA after updating.
- **Production ZIP:** `BVOM-v2.9.20-PRODUCTION.zip`, 13 deployable files (1,618,994 bytes); SHA-256 `32d7214ad21ac00cdd04ac534df56b35b5a7da06801b8d223f1cced7e7390f75`. Archive integrity passed; all 13 file bytes were compared to the exact merged release-source tree, with the `index.html` and `sw.js` Git blob identities also checked inside the ZIP. Previous release ZIPs are retained for rollback.
- **Change:** BB1's existing Edit Weight dialog now contains both Next working weight and Progression increment. Increment-only edits preserve current prescriptions, warm-ups, historical performance references and completed workout progress; earned 32.5 kg + 1 kg progresses to 33.5 kg. Distinct historical loads survive unit conversions; new blocks reset old preparation-rounding locks. No separate increment button. Other training programs and BB2 were not altered.
- **Release trail:** [PR #75](https://github.com/bvomstrength-cloud/bvom-strength/pull/75) (independently audited BB1 editor, merged as `d046069`) and [PR #76](https://github.com/bvomstrength-cloud/bvom-strength/pull/76) (v2.9.20 build/cache markers, merged as `bbfe880`).
- **Verification:** PR #75 Lab #599 and Browser Runner #355 PASS; PR #76 Lab #601, Browser Runner #356 and test packaging #347 PASS. Final source gate passed 30 static checks, 296 behavioural checks, 14 sequence checks, all mutations killed; English/Japanese mobile Chromium tests passed. Independent cold audit found no remaining P1/P2 blocker.
- **Safety:** GitHub merges do not automatically deploy Netlify. Do not remove previous verified ZIPs, stored workout data or update/ownership protections during cleanup.

## Previous approved release — v2.9.19 (superseded 29 October 2026)

- **GitHub application baseline:** merged `main` application commit `71a0c0acdcfc9cb6593cb61875f0cda41388e5e4` (23 October 2026). Later documentation-only commits may advance `main` without changing these application files.
- **App version:** `v2.9.19` in the title/header and `BVOM_BUILD`; service worker `BUILD = '2.9.19'` with production cache `bvom-2.9.19`.
- **Owner deployment report:** On 23 October 2026, the owner confirmed uploading/deploying the verified production ZIP to Netlify. This is an owner-reported deployment, not independent verification of the public endpoint or installed Android PWA after deployment.
- **Production ZIP:** `BVOM-v2.9.19-PRODUCTION.zip`, 13 files (1,618,278 bytes); SHA-256 `ff3b9d820df0949a53bf72d0a58ab5a42c311b289a759ae4b29dba54d907091d`. All 13 files were verified against the exact Git blobs at the merged `main` commit. The PR-specific test-site service-worker cache was replaced with the canonical production service worker; the test marker was excluded.
- **Change:** Bodybuilding (BB1) workout cards no longer label the already-prescribed top-set weight as “Next working weight” before the complete workout is saved. The `EDIT WEIGHT` button and per-set load/rep prescriptions remain. BB1 progression, On-Ramp, workout completion, saved-data schema and BB2 Stage (i) remain unchanged.
- **Release trail:** [PR #72](https://github.com/bvomstrength-cloud/bvom-strength/pull/72) merged. The production ZIP verification record and checksum are documented in the PR discussion.
- **Verification:** PR #72 full BVOM Lab, browser recovery and EN/JA mobile Chromium checks, service-worker upgrade checks and test ZIP workflow **PASS**; post-merge `main` BVOM Lab run **#485 PASS**. Physical post-deployment Android testing was not independently observed.
- **Safety:** GitHub merges do not automatically deploy Netlify; preserve offline workout ownership, PWA update protections, and backups. Keep prior verified release ZIPs for rollback.

## Previous approved release — v2.9.18 (superseded 23 October 2026)

- **GitHub application baseline:** `main` at `c167cc37b14d1f0b6e99720d2fdae36d4cac2ab8` (22 October 2026; later documentation-only commits may advance `main` without changing the application files).
- **App version:** `v2.9.18`, displayed in the title/header and `BVOM_BUILD`; service worker build `2.9.18` with cache `bvom-2.9.18`.
- **Owner deployment confirmation:** The owner supplied an Android screenshot on 22 October 2026 showing BVOM `v2.9.18` during Bodybuilding Workout 3 of 24, with the existing recorded set ticks visible. This confirms the updated version is running on that device; it is not an independent server-side Netlify deployment audit.
- **Production ZIP:** `BVOM-v2.9.18-PRODUCTION.zip`, 13 files, SHA-256 `91d1d94f29c305a23df47b86b0d2805cac8ec15d023858404694e457617243fd`. All 13 packaged files were checked against the release application blobs merged into `main`.
- **Change:** Bodybuilding (BB1) retains exercise-specific working weight, increment and progression when switching to an alternate exercise, training it, and returning. Cleanup of a stale `previousSuccessfulLoad` applies to edited inactive exercises too. BB1's 24-workout completion model, On-Ramp and other program engines are unchanged.
- **Release trail:** [PR #68](https://github.com/bvomstrength-cloud/bvom-strength/pull/68) (BB1 exercise progression retention, independently reviewed ACCEPT) and [PR #69](https://github.com/bvomstrength-cloud/bvom-strength/pull/69) (v2.9.18 app and service-worker version/cache) merged.
- **Verification:** PR #68 independent Codex ACCEPT; 6/6 focused BB1 contracts and 277/277 behaviour tests reported by Codex; PR #69 full regression/mutation and browser/recovery workflows PASS; post-merge `main` v15.2 regression **GO**.
- **Known follow-ups (not regressions of this release):** Existing BB1 setup-save persistence rollback limitation and the risk of an older app version dropping inactive progression during its own setup save. Preserve the usual update and cloud-conflict guards when changing these separately.
- **Safety:** GitHub merges and documentation changes do not deploy Netlify. Keep production data, offline training and service-worker updates safe.

## Previous approved release — v2.9.17 (superseded 22 October 2026)

- **GitHub application baseline:** `main` at `e126027cabb007a6913035aa5192cc2e16030f12` (20 October 2026).
- **App version / worker cache:** `v2.9.17` / `bvom-2.9.17`.
- **Owner deployment report:** Live Android version confirmed 20 October 2026.
- **Production ZIP:** `BVOM-v2.9.17-PRODUCTION.zip`, SHA-256 `88cd8a7eb84f7e8f836e35487e09fdada00192833e4a2f5b1f63e10e9722db02`.
- **Change:** Bodybuilding On-Ramp corrections can restore previously earned CONFIRMED status; recorded secondary sets remain visible. The original two-exposure calibration rule remains.
- **Release trail:** [PR #65](https://github.com/bvomstrength-cloud/bvom-strength/pull/65), [PR #66](https://github.com/bvomstrength-cloud/bvom-strength/pull/66).
- **Verification:** Independent Codex ACCEPT for PR #65, browser smoke checks and GitHub full regression GO.

**Documentation only:** The historical sections below retain old release evidence and once-current draft plans. They are archived context, **not today's deployment or upgrade instructions**.

## Historical v2.8.9 baseline (superseded)

- Application version: **v2.8.9**
- Branch: **`main`**
- Regression suite: **v15.2 maintenance + F45 + export-ready History metadata + Export v1 translator + Strava adapter v1 + Strava OAuth client boundary v1**
- Current gate: **23/23 static · 83/83 behaviour · 14/14 sequence · 62/62 mutations killed**
- Known-bad reference: **48/48 applicable DEFECT contracts fail**; EXPORT-HISTORY-METADATA, EXPORT-V1-TRANSLATOR, STRAVA-ADAPTER-V1, STRAVA-OAUTH-CLIENT-V1, F23 and F25 are documented historical-provenance N/A
- Final v2.8.9 deployment ZIP SHA-256: `3fa86b33fffc37b0616baa892f0795457c7de9a9e422dcc41cfe9774e7cdbada`

At the time, the source preserved completed Bodybuilding GPP/conditioning results in Workout History, adds destination-neutral metadata to newly completed workout History records, includes a pure Export v1 translator and Strava adapter, and now adds a pure write-only Strava OAuth client boundary plus the documented server-side OAuth/security architecture. No live OAuth execution, token storage, webhook endpoint, Settings UI, or workout upload is enabled.

## Historical v2.9.1 draft plan (superseded)

Proposed next release from [draft PR #39](https://github.com/bvomstrength-cloud/bvom-strength/pull/39). The owner has accepted the Android repeated-tap window-recovery delay as a minor edge case; preserving recorded workouts remains mandatory.

Changes compared with live v2.9.0:
- exclusive browser Web Lock coordination blocks a second tab/window from writing a workout, including background/idle tabs;
- reopened eligible interrupted workouts resume with saved sets and rest timer;
- after 60 minutes without meaningful recorded activity, eligible abandoned workouts are saved once as INCOMPLETE in History, without unearned progression;
- unfinished v2.9.0-format workouts remain read-only until the owner explicitly archives them as incomplete with a full local pre-archive backup, after closing other older BVOM windows; old windows do not participate in the new Web Lock;
- v2.9.1 document title, visible label, shell build marker and new service-worker cache name support a clean update.

Automated browser, static and behavioural regression evidence must be revalidated for the exact v2.9.1-labelled commit before release. Production `main` and live Netlify deployment remain at v2.9.0 until explicit owner approval. Do not present this draft as released.

## v2.9.0 release status

v2.9.0 is the approved production startup-resilience release. It keeps BVOM local-first on previously verified devices even when the network is absent or slow, while preserving the existing owner-bound 7-day offline entitlement boundary.

Key changes:
- repeat navigation serves the known-good cached shell immediately;
- trusted matching local data can open before live entitlement and cloud reads finish;
- live failures are treated as degraded/offline rather than destructive denial;
- delayed definitive revocation cannot destroy or interrupt an active workout;
- service-worker updates require an explicit safe reload and cannot auto-reload an active workout;
- Supabase JS is pinned and vendored as same-origin `2.117.3` and included in the shell cache.

Release evidence:
- 29/29 static PASS
- 87/87 behaviour PASS
- 14/14 sequence PASS
- all mutations killed
- 51/51 applicable known-bad DEFECT contracts fail as expected
- Android Chrome: true-offline app visible at 203.5 ms versus 74196.6 ms on v2.8.9
- Android Chrome: mobile-data app visible at 254.7 ms
- exact vendored Supabase JS SHA-256: `d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3`
- exact deployment ZIP SHA-256: `22048220ceb88da2ef19f9c13812f13f976c0b53d6d5d53f6a7555d2cce3c0fe`
- application production merge commit: `35561db61f42e0449a614ff18b1ec6d88486e14c`

**Production deployment completed on 9 October 2026 using the exact verified v2.9.0 deployment ZIP.** The owner visually confirmed the live production app at `https://app.bvomstrength.com/?v=290` showing `v2.9.0` after deployment.

## v2.8.9 release status

The v2.8.9 package was built deterministically from the 12 shipped production files after the protected release-candidate gate passed.

Automated release evidence:

- 23/23 static PASS
- 83/83 behaviour PASS
- 14/14 sequence PASS
- all 62 mutations killed
- 48/48 applicable known-bad DEFECT contracts fail as expected
- EXPORT-HISTORY-METADATA PASS
- EXPORT-V1-TRANSLATOR PASS
- STRAVA-ADAPTER-V1 PASS
- STRAVA-OAUTH-CLIENT-V1 PASS
- OAuth browser boundary requests only `activity:write`
- browser sanitization rejects Strava code/state/token/client-secret leakage, including nested token material
- authorize URL validation is pinned to the BVOM Supabase Edge Function callback path
- deterministic deployment ZIP contains exactly the 12 shipped production files
- deployment ZIP SHA-256: `3fa86b33fffc37b0616baa892f0795457c7de9a9e422dcc41cfe9774e7cdbada`

**Production deployment completed on 5 October 2026 using the exact verified v2.8.9 deployment ZIP.** The owner confirmed the Netlify test-site and production upload sequence was completed.

## Historical approved package

- Approved v2.8.8 package SHA-256: `3e71111f1813123d8d70ec2d95142bbe7984a34bf1288c80550196c06225fccd`
- Approved v2.8.7 package SHA-256: `802b7671e70c3538b70213f1f4716a7a1df0150811e503137ce28dd731af9976`
- Approved v2.8.6 package SHA-256: `ddf6176689e5671658cd958377c43afae531a5feebd8ac7108942a6ef045ed86`
- Approved v2.8.5 package SHA-256: `ee98469ee65d55b43a4d84a30b5e50bf4cd8df6f5ca58841d369da69529176d9`
- Approved v2.8.4 package SHA-256: `1278dceb8c43429996317c16166627ddc44cb2b017214b562752fd2ee48d8ba5`
- Approved v2.8.3 package SHA-256: `8354302d31a4b1573e519cf0e3f2323f369aba3d4599eca984745a592b92286f`

This hash is retained as historical package evidence and is not a claim that the current `main` tree is byte-identical to that ZIP.

## Project documentation

- `AGENTS.md` — development rules
- `ARCHITECTURE.md` — system structure and high-risk boundaries
- `BVOM_SPEC.md` — behavioural specification
- `TESTING.md` — test tiers, commands, CI gate and release evidence
- `STRAVA_OAUTH.md` — one-way Strava OAuth/security architecture and server contract

## Development rule

Future development happens on branches. Changes merge into `main` only after the relevant regression gate passes.

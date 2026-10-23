# BVOM Strength

Production source repository for BVOM Strength.

## Current approved release — v2.9.19

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

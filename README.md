# BVOM Strength

Production source repository for BVOM Strength.

## Current source baseline

- Application version: **v2.8.7 release candidate**
- Branch: **`main`**
- Regression suite: **v15.2 maintenance + F45 + export-ready History metadata + Export v1 translator**
- Current gate: **23/23 static · 81/81 behaviour · 14/14 sequence · 62/62 mutations killed**
- Known-bad reference: **48/48 applicable DEFECT contracts fail**; EXPORT-HISTORY-METADATA, EXPORT-V1-TRANSLATOR, F23 and F25 are documented historical-provenance N/A
- v2.8.7 release-candidate ZIP SHA-256: `802b7671e70c3538b70213f1f4716a7a1df0150811e503137ce28dd731af9976`

The current source preserves completed Bodybuilding GPP/conditioning results in Workout History, adds destination-neutral metadata to newly completed workout History records, and includes a pure Export v1 translator that converts eligible v2.8.6+ History records into a destination-neutral workout object without network calls or external-service coupling.

## v2.8.7 release status

The v2.8.7 package was built deterministically from the 12 shipped production files after the protected release-candidate gate passed.

Automated release evidence:

- 23/23 static PASS
- 81/81 behaviour PASS
- 14/14 sequence PASS
- all 62 mutations killed
- 48/48 applicable known-bad DEFECT contracts fail as expected
- EXPORT-HISTORY-METADATA PASS
- EXPORT-V1-TRANSLATOR PASS
- legacy/non-workout History is refused rather than guessed
- performed strength/GPP actuals export while prescription/progression/internal state is excluded
- deterministic deployment ZIP contains exactly the 12 shipped production files
- deployment ZIP SHA-256: `802b7671e70c3538b70213f1f4716a7a1df0150811e503137ce28dd731af9976`

**Production deployment is pending the Netlify test-site check and production promotion. The currently deployed production version remains v2.8.6 until that release step is completed.**

## Historical approved package

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

## Development rule

Future development happens on branches. Changes merge into `main` only after the relevant regression gate passes.

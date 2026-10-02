# BVOM Strength

Production source repository for BVOM Strength.

## Current source baseline

- Application version: **v2.8.4**
- Branch: **`main`**
- Regression suite: **v15.2 maintenance + F44**
- Current gate: **23/23 static · 78/78 behaviour · 14/14 sequence · 62/62 mutations killed**
- Known-bad reference: **47/47 applicable DEFECT contracts fail**; F23/F25 are documented provenance N/A
- Final v2.8.4 deployment ZIP SHA-256: `1278dceb8c43429996317c16166627ddc44cb2b017214b562752fd2ee48d8ba5`

The current source includes the maintenance guard that blocks Cloud Restore while an unfinished workout is active.

## v2.8.4 release status

The final v2.8.4 package was built deterministically from the 12 shipped production files and is byte-identical to the previously verified release-candidate ZIP.

Automated release evidence:

- 23/23 static PASS
- 78/78 behaviour PASS
- 14/14 sequence PASS
- all 62 mutations killed
- 47/47 applicable known-bad DEFECT contracts fail as expected
- F44 active-workout Cloud Restore guard PASS

Real-device smoke evidence on the Netlify test site:

- v2.8.4 loaded successfully on Android/Chrome
- existing local BVOM data remained available after the update
- an LP/RPT workout was started and Squat 100 kg × 5 was recorded
- Cloud Restore was refused while the workout was unfinished
- the expected unfinished-workout protection message was shown
- the active workout remained running and the recorded set remained intact after the blocked restore

**Production deployment has not yet occurred. It remains a separate explicit release checkpoint.**

## Historical approved package

- Approved v2.8.3 package SHA-256: `8354302d31a4b1573e519cf0e3f2323f369aba3d4599eca984745a592b92286f`

This hash is retained as historical package evidence and is not a claim that the current `main` tree is byte-identical to that ZIP.

## Project documentation

- `AGENTS.md` — development rules
- `ARCHITECTURE.md` — system structure and high-risk boundaries
- `BVOM_SPEC.md` — behavioural specification
- `TESTING.md` — test tiers, commands, CI gate and release evidence

## Development rule

Future development happens on branches. Changes merge into `main` only after the relevant regression gate passes.

# BVOM Strength

Production source repository for BVOM Strength.

## Current source baseline

- Application version: **v2.8.5**
- Branch: **`main`**
- Regression suite: **v15.2 maintenance + F45**
- Current gate: **23/23 static · 79/79 behaviour · 14/14 sequence · 62/62 mutations killed**
- Known-bad reference: **48/48 applicable DEFECT contracts fail**; F23/F25 are documented provenance N/A
- Final v2.8.5 deployment ZIP SHA-256: `ee98469ee65d55b43a4d84a30b5e50bf4cd8df6f5ca58841d369da69529176d9`

The current source preserves completed Bodybuilding GPP/conditioning results in Workout History and includes permanent F45 regression coverage.

## v2.8.5 release status

The v2.8.5 package was built deterministically from the 12 shipped production files after the protected release-candidate gate passed.

Automated release evidence:

- 23/23 static PASS
- 79/79 behaviour PASS
- 14/14 sequence PASS
- all 62 mutations killed
- 48/48 applicable known-bad DEFECT contracts fail as expected
- F45 Bodybuilding GPP History preservation PASS
- deterministic deployment ZIP contains exactly the 12 shipped production files
- deployment ZIP SHA-256: `ee98469ee65d55b43a4d84a30b5e50bf4cd8df6f5ca58841d369da69529176d9`

**Production deployment completed on 4 October 2026 using the exact verified v2.8.5 deployment ZIP.** The owner confirmed the Netlify test-site and production upload sequence was completed. Independent live-site fetch verification was unavailable from the release assistant environment at closeout.

## Historical approved package

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

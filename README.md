# BVOM Strength

Production source repository for BVOM Strength.

## Current source baseline

- Application version: **v2.8.3**
- Branch: **`main`**
- Regression suite: **v15.2 maintenance + F44**
- Current gate: **23/23 static · 78/78 behaviour · 14/14 sequence · 62/62 mutations killed**
- Known-bad reference: **47/47 applicable DEFECT contracts fail**; F23/F25 are documented provenance N/A

The current source includes the maintenance guard that blocks Cloud Restore while an unfinished workout is active.

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

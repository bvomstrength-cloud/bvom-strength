# v3.0.4 monkey repair proofs

These tests exercise the actual inline application, browser storage and dialogs.
`oracle.cjs` is byte-for-byte the v3.0.3 audit's independent rules model (SHA-256
`85de553814f2a235f8622e7515850358f62feea0ad9d9d31a6bcbb3c00d96214`). It imports
no application engines. Its expectations were not changed for these repairs.

Deterministic seeds: Bruno 3031101, Kong 3031102, Milo 3031103, Rocky 3031104,
Buster 3031105, Chaos 3031106. The original audit archive and reproduction
scripts are preserved separately in the evidence delivery, including red runs
against exact `6c51e612cd5e6aa532766e5ce80f2d226eb950c0` before implementation.

## Local replay

Install test-only Playwright 1.56.1 and its Chromium. Node 20+ is supported.
Use a fresh output directory: the action/comparison logs append for traceability.
No tests may contact a production backend; browser routes deny external origins.

```sh
export BVOM_MONKEY_OUT=/tmp/bvom304-proof
node tests/monkey-v304/repair-contracts.cjs
node tests/monkey-v304/repair-mutations.cjs
node tests/monkey-v304/repair-browser.cjs
node tests/monkey-v304/monkeys.cjs
node tests/monkey-v304/weekly-portability.cjs
node tests/monkey-v304/adversarial.cjs
node tests/monkey-v304/mobile.cjs
node tests/monkey-v304/localization.cjs
node tests/monkey-v304/mutations.cjs
node tests/monkey-v304/metrics.cjs
```

The six-monkey run preserves all 215 baseline sessions and 72 weekly checkpoints.
BB1 stops at 24 credited completions; BB2 normal work stops at 32 credits.
Metrics compare the 18 actual assets to committed HEAD; run them after committing.
`BVOM_APP_ROOT` selects an alternate application checkout for browser probes.
`BVOM_CHROMIUM_PATH` optionally selects an installed real Chromium. The local
`run-existing.cjs` driver uses system Chromium with normal process isolation;
the repository's original CI workflows use Playwright's pinned browser.

## Cloud tests (existing backup workflow)

v3.0.4 retains the v3.0.3 owner-scoped `bvom_data` read/update/insert
protocol, cloud/device fingerprint comparison and explicit restore choice.
No production database migration or CAS RPC is part of this release.

Run `node tests/monkey-v304/existing-cloud-contracts.cjs` for static
protocol checks. The isolated BB2 cloud workflow continues to test real
GoTrue/PostgREST and BB2 revision writes on a disposable local backend.
Those tests are not a substitute for an authenticated hosted
phone → tablet → phone restore acceptance check.

The earlier `cloud-race.cjs`, `cloud-legacy.cjs` and `more-chaos.cjs`
are retained as historical A02 research fixtures, **not** release gates;
they require the deliberately removed CAS migration and must not be run
against production. Precisely simultaneous uploads remain an unsupported
edge case of the existing legacy cloud protocol.

## Review of expectation changes

The longitudinal rules oracle and all 215 training scenarios are unchanged.
Runner changes select an output directory/root, record candidate provenance,
locate translated text and allow 30 seconds for large backup validation.

Existing F13/F24/F41 tests now require exact physical actuals and retain the
previous practical prescription/progression values. The one-way volume check
honors the existing two-decimal total-volume policy (562.18 lb-reps for the
63.75 kg × 4 reproduction); it does not allow the old 560 result. F28/F35 and
the extra-set lifecycle retain unchanged-save controls and additionally submit
meaningful corrections so rollback mutations remain exercised. BW/F32/F41
mutation anchors follow the repaired code and retain their original fault
semantics. No mutant, failing scenario or behavioural contract was removed.

Cloud test expectations for this branch preserve the existing cloud/device
conflict workflow instead of the abandoned conditional RPC.
Version-only expectations in the integrated chooser/activation suites are 3.0.4.

## Test packaging

`scripts/package-monkey-repair-test.cjs` reads only a full committed source SHA.
It produces a marked, commit-specific test cache and source/packaged hashes.
Both index and admin cloud endpoints are replaced. Without an explicitly
configured isolated hosted backend, the ZIP is **HOLD** and fresh authenticated
setup is unavailable. Production and the unrelated LEAKwise project are refused.
No script merges, deploys or applies a production migration.

## Residual findings from the independent cold review

The review found additional instances of A01/A05 in numeric accessories, legacy
rep corrections, GPP Finish, Custom accessory Finish and prior PB comparison.
`fixtures/legacy-actuals/PROVENANCE.json` hashes the genuine v3.0.3 UI-generated
snapshots used by `legacy-actual-regressions.cjs`; no conversion origin was
invented. `gpp-actual-upgrade.cjs --seed` also generates genuine baseline records
before candidate replay in both units and both GPP recording modes. Replay clocks
use the recorded activity time so expected 60-minute recovery does not replace
the active-session scenario after an overnight test interruption.

The accessory no-op tests now also submit real changed reps. Existing F26/F29
success controls use a changed successful count (9 versus the original 8), and
unchanged 8 is separately covered as a whole-state no-op. A new F24 meaningful
post-conversion HLM/Split correction checks revocation, failure count and extras.
The A01 mutation is scoped to its function now that accessories have the same
guard. No original oracle, scenario or mutation was removed.

`native-pwa-upgrade.cjs` uses actual Chromium PWA installation and standalone
launch in an isolated persistent profile, performs real training, proves a pending
update stays deferred while active, then updates after Finish and verifies
relaunch/offline persistence. It uninstalls the disposable app afterward. This
covers a Linux installed PWA; physical Android/iOS upgrades remain a separate
acceptance gate. Early harness assumptions about CDP target ids and update-button
visibility were corrected; the failed attempts are retained as harness evidence.

# BB2 cloud compatibility — decision required before live writer enablement

Status: **PROPOSED / NOT APPROVED / NO DATABASE CHANGE** (26 October 2026)

Scope: Stage (ii), after the isolated ledger and guarded local browser bridge.
This document does not change Stage (i), existing BVOM cloud sync, BB1, or the
production database. `bb2WriterEnabled` and `multiDeviceFenceVerified` must
remain false for real accounts until the decision and implementation are
independently verified.

## Reproduced facts from the existing application

`index.html` still backs up the **whole** `bvom_data.data` JSON document.
`bvomCloudSaveNow()` explicitly replaces that document using a row-ID-only
update after the user selects Sync Now / Keep This Device. This update does
not include a payload/schema revision precondition.

`bvomCloudAutoSave()` improves on that by comparing the most recently read
remote fingerprint against a prior baseline, but its comparison and whole-row
write are separate operations. A different device can change the row between
those operations. The subsequent update also uses only the row ID.

Reproduction (offline, no real database/account):

```text
node tests/bvom-lab/bb2_cloud_legacy_writer_probe.cjs
```

The test boots the **actual** existing BVOM application script through the
behavioural harness. Its Supabase-shaped fake retains a server row in memory.
Two controls are exercised:

1. A remote row has a hypothetical future BB2 property, while an old-device
   local copy does not. Calling the actual `bvomCloudSaveNow()` overwrites
   the complete remote object, dropping the BB2 property.
2. During an actual `bvomCloudAutoSave()`, another simulated device writes
   after the remote fingerprint check but before the old update commits.
   The later unconditional whole-row update removes the competing change.

These are compatibility and concurrency **counterexamples**, not evidence
that any real BB2 records have been lost. BB2 records are not yet stored in
the production cloud document. The tests do not contact Supabase.

## Architectural choices

| Choice | Older BVOM clients | BB2 across devices | Consequence |
| --- | --- | --- | --- |
| **A. Separate BB2 cloud storage** (recommended) | Their whole-row writes cannot touch BB2 rows | Yes, after a guarded sync implementation | New owner-scoped, versioned table/API and independent backup/restore logic are required |
| **B. Embed BB2 in `bvom_data`** | Can silently erase fields unless *the server* rejects unsupported writers | Possible only after coordinated server-side writer fencing | Materially changes the existing sync path and may lock older BVOM installations out of ordinary training uploads |
| **C. BB2 stays local-only** | Cannot overwrite isolated local BB2 data via `bvom_data` | No | Must be clearly presented as device-specific, with manual backup/export; not equivalent to BVOM's existing optional cross-device backup |

### Recommended contract if A is approved

- Keep the current `bvom_data` endpoint and payload untouched. Do not append
  BB2 fields to its whole-row JSON or cloud-comparison fingerprint.
- Introduce a **distinct, owner-scoped BB2 record set**, with an explicit
  protocol version, unique owner/block identity, and immutable Stage (i)
  opening/events semantics. Its database design must be reviewed before any
  migration; the exact table/RPC names here are deliberately not specified.
- Every cloud write requires authenticated owner verification **and a
  server-enforced expected revision**. The comparison and update must be
  atomic at the database, including first-row creation. A client-side
  read-then-update check alone is insufficient.
- Treat a mismatched revision, rejected owner, unknown protocol, malformed
  reply, failed local persistence, or missing cloud baseline as a **sync
  pause**. Keep the verified local ledger intact; never silently choose a
  winner or replay an incompatible snapshot.
- Preserve `(blockId, sessionId, eventRevision)` Finish idempotence and
  credit/consent pairing while moving events between devices. Revalidate
  restored and imported streams against the frozen ledger rules.
- No network operation may be necessary to record a working set locally.
  A deferred upload must be replay-safe after offline use and must not merge
  two divergent ledger heads by concatenating events.
- Access must be restricted to the signed-in owner using Row Level Security,
  suitable API grants, and an ownership predicate. Client identifiers or
  editable user metadata are not authorization. Do not expose privileged
  service credentials to the browser.
- A second device on an older BVOM release may continue to write the old
  `bvom_data` row but must be unable to alter the new BB2 storage.
- A tab or second device using the new BB2 protocol must not commit two
  incompatible heads as one successful revision; it must surface a conflict.
- Cloud deletion, sign-out, restore and account-switch behaviour need
  explicit, reversible user flows and adversarial tests before activation.

## Required pre-activation tests

1. Old BVOM manual and automatic uploads, including overlapping requests,
   cannot change a committed BB2 cloud record.
2. Two BB2 devices starting from revision N cannot both commit divergent
   revision N+1; the loser retains its full local work and gets a conflict.
3. A cloud timeout **after** server commit can be retried idempotently,
   without duplicate credits or an unintended second upload.
4. Offline workout → close browser → reopen → reconnect saves locally and
   uploads once, without changing `bvom_data` or BB1 history.
5. Corrupt, foreign-owner, unsupported-protocol, older or partial cloud
   snapshots never overwrite a valid local block.
6. Sign-out, account switch, legacy active workout, stale Web Lock, failed
   local save and cross-tab contention stop BB2 cloud writes.
7. Real test-project RLS and conditional writes are independently probed,
   followed by whole-app browser, Android PWA, backup/restore and upgrade
   tests. Do not use production user data for this testing.

## Gate

**No Supabase migration, RPC, live client registration, or BB2 cloud upload
is authorized by this document.** The owner must select A, B or C before
cloud integration proceeds. Meanwhile, isolated on-device workout planning,
UI and offline ledger tests can continue behind closed rollout flags.

References: the current `index.html` BVOM cloud code; Supabase documentation
on [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

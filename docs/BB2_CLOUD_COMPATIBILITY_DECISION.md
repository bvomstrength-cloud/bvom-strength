# BB2 cloud compatibility — decision required before live writer enablement

Status: **PROPOSED / NOT APPROVED / NO DATABASE CHANGE** (29 October 2026)

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

## Read-only observations of the existing BVOM Supabase schema (29 October)

The connected **bvom cloud** production project's schema was inspected by
metadata and aggregate-only SELECT queries. No user records were fetched and
no rows, policies, columns or database functions were modified.

- `public.bvom_data` has a primary key on `id`, **not** on `user_id`.
  It currently contains 24 rows belonging to 21 distinct owners, confirming
  that multiple rows per owner exist. The candidate D approach below is not
  a reliable canonical BB2 store without extra row-resolution logic.
- The project already contains `public.bvom_cloud_state`, with **zero rows**.
  Its `user_id` is a unique primary key linked to `auth.users` (delete cascade).
  It has a positive `revision` bigint, a `data_version` text discriminator,
  a `state` JSONB document and an `updated_at` timestamp.
- That existing table has owner-only `SELECT`, `INSERT` and `UPDATE` RLS
  policies that compare `auth.uid()` to `user_id`. The authenticated role has
  the corresponding table grants. There is no BB2-specific RPC in `public`.
- `bvom_cloud_state` is not referenced by the current app source. Its name is
  generic, and its intended future use is not confirmed. A BB2 protocol must
  refuse to overwrite any row bearing an unknown `data_version`.

This establishes a **promising existing storage boundary**, not authority to
use production storage. Read-only metadata inspection cannot prove a real
conditional write, auth-isolated owner access, concurrent commit or retry.

## Architectural choices

| Choice | Older BVOM clients | BB2 across devices | Consequence |
| --- | --- | --- | --- |
| **A. Separate BB2 cloud storage** | Their whole-row writes cannot touch BB2 rows | Yes, after a guarded sync implementation | New owner-scoped, versioned table/API and independent backup/restore logic are required |
| **B. Embed BB2 in `bvom_data`** | Can silently erase fields unless *the server* rejects unsupported writers | Possible only after coordinated server-side writer fencing | Materially changes the existing sync path and may lock older BVOM installations out of ordinary training uploads |
| **C. BB2 stays local-only** | Cannot overwrite isolated local BB2 data via `bvom_data` | No | Must be clearly presented as device-specific, with manual backup/export; not equivalent to BVOM's existing optional cross-device backup |
| **D. Add a protected `bb2_data` column to existing `bvom_data`** (superseded candidate) | Existing `.update({data})` writes leave the distinct column unchanged | Possible, but current duplicated user rows need resolution | One additive JSONB column and more complex canonical-row handling |
| **E. Reuse existing revisioned `bvom_cloud_state`** (preferred candidate) | Old clients write only `bvom_data`; they never touch this table | Yes, after real cross-device proof | **No new table or column**; one row per owner with an existing revision and protocol field; requires safe coordination of that table's future purpose |

### Candidate E — proof in a fake database only

`bb2/cloud-sidecar.mjs` is an **import-inert, unregistered candidate transport**.
It reads and writes only the **existing** `bvom_cloud_state` table and never
changes `bvom_data`, its `data` document or its fingerprint. A first upload
uses a normal INSERT, not upsert, so the unique owner key rejects two
simultaneous first writers. Subsequent updates match the authenticated owner,
the explicit BB2 `data_version` and the *previous revision* in one database
statement. No matched row means conflict, not success; a lost reply is
reconciled using the durable request ID and canonical snapshot comparison.
An active workout, foreign-owner snapshot, other protocol or unavailable
table fails closed. Local-first saving continues unchanged.

### Independent cold audit and local hardening (29 October 2026)

The independent cold audit returned **HOLD for live cloud activation**:
initial transport tests proved table isolation but did not yet validate
ledger semantics or stale-device ancestry. The dormant transport was hardened
without changing Stage (i), BVOM's legacy sync, or any Supabase data:

- Both outbound and inbound snapshots now validate the exact catalogue setup,
  replay their current and archived blocks through the frozen Stage (i) restore
  validator, verify every sealed-block successor opening through the frozen
  next-block constructor, reject duplicate block identities, and refuse
  unfinished sessions and extra cloud-only snapshot fields. A genuinely saved
  `WORKOUT_INCOMPLETE` is closed history, not an active workout.
- Every write requires the exact previously verified remote envelope and
  an allowed append-only ledger ancestry (including legal discard tombstones).
  Tombstone replacement is limited to the exact Stage (i) discardable event
  classes; changing unrelated historical events is never accepted.
  A new remote read must match that saved baseline; the server's revision CAS
  then closes the final read/write race. Stale/replaced journals fail closed.
  Verified ancestry also supports multiple completed blocks accumulated while
  a device was offline; an upload cannot omit the saved predecessor.
- Before and after awaits, writes must pass BVOM's existing
  `bb2AppWriteStatus` account/entitlement/lock/storage/conflict checks **and**
  an injected check against the exact durable pending-upload intent. These
  real BVOM callbacks and their persistent intent storage are **not yet wired**.
- Write receipts now confirm the complete canonical snapshot, not just the
  revision/request ID. Lost-first-insert replies can be reconciled by a stable
  request ID. Revision updates also refresh `updated_at`. Unexpected network
  promise rejections are reported as unavailable/uncertain, not as success.

The in-memory suite now includes valid Stage (i) fixtures, stale history,
valid event append, a closed incomplete workout, changed lock during a
network await, forged events, altered receipts, first-insert race and lost-reply
cases, plus two complete 32-credit block seals, offline reconnection and
rejected network promises. **16/16 PASS** locally. An independent second-round
cold audit returned **GO for draft publication, HOLD for live activation**.
This remains a candidate transport, not an approved cloud integration or real
concurrency/RLS proof; isolated real-database tests are still required.

### Local-only cloud restore preservation (draft integration)

The existing BVOM **Restore from Cloud** action now builds a candidate from the
legacy cloud document plus the same device's independently replay-validated BB2
subtree. It checks the authenticated/local owner, each archived/current block,
sealed ancestry and unfinished sessions before offering confirmation; the
locally saved BB2 data remains unchanged in the restored document and its
pre-cloud recovery backup. A remote `bb2` field, mismatched owner, invalid
journal or failed module validation stops the restore without changing the
local copy. The ordinary legacy cloud fingerprint remains based on the cloud
document without BB2. The existing one-step restore and document-lock checks
still apply. The BVOM integrated contract exercises the real restore callback
with an in-memory cloud response. No BB2 upload or live cloud sync is enabled.

Run `node tests/bvom-lab/bb2_cloud_sidecar_contracts.cjs` to exercise both
actual legacy BVOM cloud writers against separate fake tables, two first
writers, stale competing revisions, a lost-reply retry, owner checks and
protocol mismatch. This **does not** prove PostgREST's real conditional
update behaviour, cross-account RLS or integration into BVOM Settings/restore.
The real write path must be tested in a nonproduction database first.

The existing `bvom_cloud_state` table may have been reserved for a future
whole-BVOM sync migration; its purpose must be confirmed before approving E.
Do not put a BB2 snapshot into a pre-existing row with a different
`data_version`, and do not use that table for other purposes without a migration
strategy. No Supabase write, schema change or BB2 upload is authorized here.

### Required contract for A or E after owner approval

- Keep the current `bvom_data.data` payload untouched. Do not append BB2
  fields to its legacy whole-row JSON or cloud-comparison fingerprint.
- Store BB2 separately from the old clients' replaceable JSON field, whether
  as A's new owner-scoped record set or E's existing revisioned table, with
  explicit protocol and immutable Stage (i) opening/events semantics.
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
  `bvom_data.data` payload but must be unable to alter the new BB2 storage.
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
is authorized by this document.** The owner must select A, B, C, D or E before
cloud integration proceeds. Meanwhile, isolated on-device workout planning,
UI and offline ledger tests can continue behind closed rollout flags.

References: the current `index.html` BVOM cloud code; Supabase documentation
on [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

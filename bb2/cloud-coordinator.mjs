/* BB2's dormant BVOM account/local-document sync coordinator.
 * The real app deliberately leaves both rollout gates OFF. No import-time I/O,
 * no separate local key, and no changes to the legacy bvom_data transport.
 * A caller must inject the existing BVOM account, locked durable document
 * reader/writer, and an authenticated client. This module never owns auth.
 */
import { bb2AppWriteStatus } from './app-session.mjs';
import { createBB2CloudSidecar, readBB2CloudSidecar,
  writeBB2CloudSidecar, reconcileBB2CloudSidecar,
  validateBB2CloudSidecar } from './cloud-sidecar.mjs';

const PROTOCOL = 'bvom-bb2-local-cloud-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => Array.isArray(value)
  ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
    : JSON.stringify(value);
const same = (a, b) => stable(a) === stable(b);

export function createBB2CloudCoordinator({ client, ownerId, readAppSnapshot,
  readLocal, commitLocal, makeRequestId } = {}) {
  if (!client || !ownerId || typeof readAppSnapshot !== 'function' ||
      typeof readLocal !== 'function' || typeof commitLocal !== 'function' ||
      typeof makeRequestId !== 'function')
    throw Error('BB2 cloud coordinator requires the existing BVOM app adapters');

  function local() {
    const snapshot = readLocal();
    if (!snapshot || snapshot.ownerId !== ownerId ||
        typeof snapshot.token !== 'string' || !snapshot.token ||
        (snapshot.bb2 !== null &&
         (!snapshot.bb2 || typeof snapshot.bb2 !== 'object' ||
          Array.isArray(snapshot.bb2))))
      return null;
    return snapshot;
  }
  function ready() {
    try { return bb2AppWriteStatus(readAppSnapshot(), ownerId).allowed === true; }
    catch (_) { return false; }
  }
  function metadata(bb2) {
    const meta = bb2.cloudSync;
    if (meta === undefined) return { baseline: null, pending: null };
    if (!meta || meta.protocol !== PROTOCOL ||
        Object.keys(meta).sort().join(',') !== 'baseline,pending,protocol')
      throw Error('Incompatible BB2 local cloud metadata');
    if (meta.baseline !== null) validateBB2CloudSidecar(meta.baseline, ownerId);
    if (meta.pending !== null) validateBB2CloudSidecar(meta.pending, ownerId);
    if (meta.pending && meta.pending.revision !==
        (meta.baseline ? meta.baseline.revision + 1 : 1))
      throw Error('BB2 pending cloud revision is invalid');
    return meta;
  }
  function withMeta(bb2, baseline, pending) {
    return { ...bb2, cloudSync: { protocol: PROTOCOL,
      baseline: baseline ? clone(baseline) : null,
      pending: pending ? clone(pending) : null } };
  }
  function durableIntentVerified(intent) {
    if (!ready()) return false;
    const saved = local();
    if (!saved?.bb2) return false;
    try {
      const meta = metadata(saved.bb2);
      if (!same(meta.pending, intent.envelope) ||
          !same(meta.baseline, intent.expectedBaseline) ||
          intent.ownerId !== ownerId ||
          intent.previousRevision !== (meta.baseline?.revision ?? null)) return false;
      // An intervening working set or correction may have been saved while
      // awaiting the network. Never acknowledge its older prepared snapshot.
      const current = createBB2CloudSidecar({ ownerId, bb2: saved.bb2,
        previousRevision: intent.previousRevision, requestId: intent.envelope.requestId });
      return same(current, intent.envelope);
    } catch (_) { return false; }
  }
  function finish(localBefore, envelope) {
    if (!ready()) return { status: 'blocked' };
    const saved = local();
    if (!saved?.bb2 || !same(saved.bb2, localBefore.bb2) ||
        !same(metadata(saved.bb2).pending, envelope))
      return { status: 'uncertain' };
    if (!commitLocal(saved.token, withMeta(saved.bb2, envelope, null)))
      return { status: 'uncertain' };
    return { status: 'committed', envelope };
  }

  async function upload() {
    if (!ready()) return { status: 'blocked' };
    let saved = local();
    if (!saved?.bb2) return { status: 'no_local_bb2' };
    let meta;
    try { meta = metadata(saved.bb2); }
    catch (error) { return { status: 'incompatible', error }; }
    let envelope = meta.pending;
    if (!envelope) {
      const remote = await readBB2CloudSidecar({ client, ownerId });
      if (!ready() || !same(local(), saved)) return { status: 'blocked' };
      if (remote.status === 'unavailable' || remote.status === 'incompatible') return remote;
      if (meta.baseline ? remote.status !== 'ready' ||
          !same(remote.envelope, meta.baseline) : remote.status !== 'empty')
        return { status: 'conflict' };
      try {
        const requestId = makeRequestId();
        envelope = createBB2CloudSidecar({ ownerId, bb2: saved.bb2,
          previousRevision: meta.baseline?.revision ?? null, requestId });
        if (meta.baseline && same(meta.baseline.snapshot, envelope.snapshot))
          return { status: 'up_to_date' };
      } catch (error) { return { status: 'incompatible', error }; }
      if (!commitLocal(saved.token, withMeta(saved.bb2, meta.baseline, envelope)))
        return { status: 'blocked' };
      saved = local();
      if (!saved || !durableIntentVerified({ ownerId, envelope,
        previousRevision: meta.baseline?.revision ?? null,
        expectedBaseline: meta.baseline })) return { status: 'blocked' };
    } else {
      // A lost response may have committed. Reconcile BEFORE reissuing the
      // same request; the existing server revision is the idempotence fence.
      const result = await reconcileBB2CloudSidecar({ client, ownerId, envelope });
      if (!ready() || !same(local(), saved)) return { status: 'blocked' };
      if (result.status === 'committed') return finish(saved, result.envelope);
      if (result.status === 'unavailable' || result.status === 'incompatible') return result;
      if (meta.baseline ? result.status !== 'conflict' ||
          !same(result.envelope, meta.baseline) : result.status !== 'empty')
        return { status: 'conflict' };
    }
    const result = await writeBB2CloudSidecar({ client, ownerId, envelope,
      previousRevision: meta.baseline?.revision ?? null,
      expectedBaseline: meta.baseline,
      readAppSnapshot, durableIntentVerified });
    if (result.status === 'committed') return finish(saved, result.envelope);
    if (result.status !== 'uncertain') return result;
    const reconciled = await reconcileBB2CloudSidecar({ client, ownerId, envelope });
    if (reconciled.status === 'committed') return finish(saved, reconciled.envelope);
    return { status: reconciled.status === 'conflict' ? 'conflict' : 'uncertain' };
  }

  async function downloadIfEmpty() {
    if (!ready()) return { status: 'blocked' };
    const before = local();
    if (!before || before.bb2 !== null) return { status: 'local_data_present' };
    const remote = await readBB2CloudSidecar({ client, ownerId });
    if (!ready() || !same(local(), before)) return { status: 'blocked' };
    if (remote.status !== 'ready') return remote;
    const data = clone(remote.envelope.snapshot);
    const incoming = withMeta({ ...data, selectedProgram: false },remote.envelope,null);
    if (!commitLocal(before.token, incoming)) return { status: 'blocked' };
    return { status: 'downloaded', revision: remote.envelope.revision };
  }
  return Object.freeze({ upload, downloadIfEmpty });
}

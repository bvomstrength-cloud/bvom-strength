/* BB2's dormant BVOM account/local-document sync coordinator.
 * The real app deliberately leaves both rollout gates OFF. No import-time I/O,
 * no separate local key, and no changes to the legacy bvom_data transport.
 * A caller must inject the existing BVOM account, locked durable document
 * reader/writer, and an authenticated client. This module never owns auth.
 */
import { bb2AppWriteStatus } from './app-session.mjs';
import { BB2_BROWSER_MODULES, createBB2Opening, createBB2Setup, getBB2TemplatePrescription,
  validateBB2Setup } from './browser-core.mjs';
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

// Only portable, real-user BB2 journals require the current versioned
// catalogue contract. Frozen Stage (i) ledgers remain replayable on their own
// terms; they are not automatically accepted as imported BVOM workouts.
export function validateBB2PortableCatalogue(setup, events,
  { opening = null, priorSealedBlock = null } = {}) {
  validateBB2Setup(setup);
  if (!Array.isArray(events)) throw Error('BB2 portable journal is not an array');
  for (const [index, event] of events.entries()) {
    if (event?.type !== 'WORKOUT_STARTED') continue;
    if (!Array.isArray(event.slots) ||
        !['NORMAL', 'EXTRA_NORMAL', 'RECOVERY'].includes(event.kind))
      throw Error('BB2 portable Start has invalid slots or workout kind');
    const selections = { ...setup.selections };
    for (const slot of event.slots) {
      if (!slot || typeof slot.roleSlotId !== 'string' ||
          typeof slot.exerciseId !== 'string')
        throw Error('BB2 portable Start has invalid exercise identity');
      selections[`${event.templateId}|${slot.roleSlotId}`] = slot.exerciseId;
    }
    // Optional curls and exercise selections may have changed since an older
    // Start. Validate each Start against its own recorded choices, never the
    // device's latest preferred exercises.
    const hasCurls = event.templateId === 'upper_b' &&
      event.slots.some(slot => slot.roleSlotId === 'biceps_curl');
    let prescribed, historical;
    try {
      historical = createBB2Setup({ optionalUpperBCurls: hasCurls,
        selections });
      prescribed = getBB2TemplatePrescription(historical, event.templateId).slots;
    } catch (_) { throw Error('BB2 portable Start uses a non-catalogue exercise'); }
    if (event.slots.length !== prescribed.length)
      throw Error('BB2 portable Start has an incorrect catalogue slot count');
    for (let i = 0; i < prescribed.length; i++) {
      const expected = prescribed[i], actual = event.slots[i];
      if (['roleSlotId', 'exerciseId', 'floor', 'ceiling', 'equipment']
        .some(key => actual[key] !== expected[key]) ||
        actual.sets !== (event.kind === 'RECOVERY' ?
          Math.ceil(expected.sets / 2) : expected.sets))
        throw Error('BB2 portable Start differs from versioned catalogue');
    }
    if (event.kind !== 'RECOVERY') {
      // Re-run the frozen Start precondition at its exact historical ordinal.
      // Generic Stage (i) fold intentionally does not verify entered vs.
      // earned load provenance, but a portable BVOM import must.
      if (!opening) throw Error('BB2 portable Start is missing its opening');
      BB2_BROWSER_MODULES.start.validateBB2NewStart(opening,
        events.slice(0, index), historical, event, { priorSealedBlock });
    } else {
      // Recovery loads are entered on that session, never forged DERIVED
      // references to another exercise's training or earning event.
      for (const slot of event.slots) {
        if (slot.plannedG !== undefined &&
            (!slot.plannedOrigin || !['kg', 'lb'].includes(slot.plannedOrigin.unit) ||
             BB2_BROWSER_MODULES.ledger.canonicalGrams(
               slot.plannedOrigin.value, slot.plannedOrigin.unit) !== slot.plannedG))
          throw Error('BB2 portable recovery has invalid entered load origin');
      }
    }
  }
  return true;
}

export function validateBB2PortableGenesis(opening, ownerId) {
  if (!opening || opening.ownerId !== ownerId ||
      !same(opening, createBB2Opening({ ownerId, blockId: opening.blockId })))
    throw Error('BB2 portable first block is not an unmodified genesis');
  return true;
}

function validatePortableLedger(bb2) {
  const genesis = bb2.sealedBlocks?.[0]?.opening || bb2.opening;
  if (genesis) validateBB2PortableGenesis(genesis, genesis.ownerId);
  const archives = bb2.sealedBlocks || [];
  archives.forEach((block, index) => validateBB2PortableCatalogue(bb2.setup,
    block.events, { opening: block.opening, priorSealedBlock: archives[index-1] || null }));
  validateBB2PortableCatalogue(bb2.setup, bb2.events || [], {
    opening: bb2.opening, priorSealedBlock: archives.at(-1) || null });
}

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
    try { validatePortableLedger(saved.bb2); }
    catch (error) { return { status: 'incompatible', error }; }
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
      // The old request was not committed. An offline workout or setup edit
      // may have advanced the durable local journal while it was uncertain.
      // Refresh only after observing the unchanged remote baseline; an old
      // in-flight request still races safely against the database revision.
      try {
        const current = createBB2CloudSidecar({ ownerId, bb2: saved.bb2,
          previousRevision: meta.baseline?.revision ?? null,
          requestId: envelope.requestId });
        if (!same(current, envelope)) {
          envelope = createBB2CloudSidecar({ ownerId, bb2: saved.bb2,
            previousRevision: meta.baseline?.revision ?? null,
            requestId: makeRequestId() });
          if (!commitLocal(saved.token, withMeta(saved.bb2, meta.baseline, envelope)))
            return { status: 'blocked' };
          saved = local();
          if (!saved || !durableIntentVerified({ ownerId, envelope,
            previousRevision: meta.baseline?.revision ?? null,
            expectedBaseline: meta.baseline })) return { status: 'blocked' };
        }
      } catch (error) { return { status: 'incompatible', error }; }
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
    try { const snapshot = remote.envelope.snapshot;
      const genesis = remote.envelope.snapshot.sealedBlocks[0]?.opening ||
        remote.envelope.snapshot.opening;
      if (genesis) validateBB2PortableGenesis(genesis, ownerId);
      validatePortableLedger(snapshot);
    } catch (error) { return { status: 'incompatible', error }; }
    const data = clone(remote.envelope.snapshot);
    const incoming = withMeta({ ...data, selectedProgram: false },remote.envelope,null);
    if (!commitLocal(before.token, incoming)) return { status: 'blocked' };
    return { status: 'downloaded', revision: remote.envelope.revision };
  }
  return Object.freeze({ upload, downloadIfEmpty });
}

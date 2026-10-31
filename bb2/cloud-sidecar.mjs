/* Candidate BB2 cloud transport, NOT registered in BVOM's application.
 * Uses BVOM's existing, currently unused bvom_cloud_state table (one row
 * per authenticated owner, explicit revision and data_version columns).
 * No database schema change is needed. Importing performs no I/O.
 *
 * Old BVOM clients update bvom_data, which cannot touch this table.
 * BB2 writers update one revisioned row with a database-evaluated revision
 * condition. First inserts rely on the existing unique user_id primary key.
 */
import { validateBB2Setup, validateBB2RestoredBlock,
  BB2_BROWSER_MODULES } from './browser-core.mjs';
import { bb2AppWriteStatus } from './app-session.mjs';

const VERSION = 'bvom-bb2-sidecar-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const validOwner = value => typeof value === 'string' &&
  /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const validId = value => typeof value === 'string' && !!value.trim();
const validRevision = value => Number.isSafeInteger(value) && value >= 1;
const DISCARD_REWRITABLE = new Set(['WORKOUT_STARTED', 'EXERCISE_LOCKED',
  'CALIBRATION_PLAN_REVISED', 'CALIBRATION_ACCEPTED', 'SET_RECORDED',
  'EXTRA_SET_RECORDED', 'NOTE_EDITED']);
const stable = value => Array.isArray(value)
  ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
    : JSON.stringify(value);

function checkLedgerOwnership(ownerId, bb2) {
  if (!bb2 || typeof bb2 !== 'object' || Array.isArray(bb2) || !bb2.setup ||
      !Array.isArray(bb2.events || []) || !Array.isArray(bb2.sealedBlocks || []))
    throw new Error('Invalid BB2 local snapshot');
  if (bb2.activeSessionId) throw new Error('An unfinished BB2 workout must stay local');
  validateBB2Setup(bb2.setup);
  const events = bb2.events || [], archives = bb2.sealedBlocks || [];
  if (!bb2.opening && (events.length || archives.length))
    throw new Error('BB2 events require a block opening');
  if (bb2.opening && !Array.isArray(bb2.events))
    throw new Error('BB2 opening requires its exact event journal');
  if (bb2.opening && bb2.opening.ownerId !== ownerId)
    throw new Error('BB2 block belongs to another owner');
  if (!archives.length && bb2.opening?.previousSealId)
    throw new Error('BB2 cloud record is missing its sealed predecessor');
  if (archives[0]?.opening?.previousSealId)
    throw new Error('BB2 archive is missing an earlier sealed block');
  const seen = new Set();
  const validateBlock = (opening, events, sealed) => {
    if (!opening || opening.ownerId !== ownerId || !Array.isArray(events) ||
        seen.has(opening.blockId)) throw new Error('Invalid BB2 block identity');
    seen.add(opening.blockId);
    const projection = validateBB2RestoredBlock(opening, events);
    if (sealed && projection.sealed !== true) throw new Error('BB2 archive is not sealed');
    const open = new Set();
    for (const event of events) {
      if (event.type === 'WORKOUT_STARTED') open.add(event.sessionId);
      if (event.type === 'WORKOUT_FINISHED' ||
          event.type === 'WORKOUT_INCOMPLETE' || event.type === 'WORKOUT_DISCARDED')
        open.delete(event.sessionId);
    }
    if (open.size) throw new Error('An unfinished BB2 workout must stay local');
  };
  for (const block of archives) {
    if (!block?.opening || block.opening.ownerId !== ownerId || !Array.isArray(block.events))
      throw new Error('BB2 archived block belongs to another owner');
    validateBlock(block.opening, block.events, true);
  }
  if (bb2.opening) validateBlock(bb2.opening, events, false);
  // Every successor opening must be derived from the exact frozen sealed
  // predecessor. Independently valid blocks may not be stitched together.
  for (let i = 0; i < archives.length; i++) {
    const source = archives[i];
    const next = archives[i + 1]?.opening || bb2.opening;
    if (!next || stable(BB2_BROWSER_MODULES.ledger.createNextBB2Opening(source.opening, source.events,
      next.blockId)) !== stable(next)) throw new Error('Invalid BB2 block ancestry');
  }
}

export function createBB2CloudSidecar({ ownerId, bb2, previousRevision, requestId }) {
  if (!validOwner(ownerId) || !validId(requestId) ||
      !(previousRevision === null || validRevision(previousRevision)) ||
      previousRevision === Number.MAX_SAFE_INTEGER)
    throw new Error('Invalid BB2 cloud write precondition');
  checkLedgerOwnership(ownerId, bb2);
  // The local program selection and warm-up ticks are device/session state.
  // The ledger and catalogue setup are the only exported BB2 fields.
  const snapshot = copy({ setup: bb2.setup, opening: bb2.opening || null,
    events: bb2.events || [], sealedBlocks: bb2.sealedBlocks || [] });
  return Object.freeze({ protocol: VERSION, ownerId,
    revision: previousRevision === null ? 1 : previousRevision + 1,
    requestId, snapshot });
}

export function validateBB2CloudSidecar(envelope, expectedOwnerId) {
  if (!validOwner(expectedOwnerId) || !envelope ||
      envelope.protocol !== VERSION ||
      envelope.ownerId !== expectedOwnerId || !validRevision(envelope.revision) ||
      !validId(envelope.requestId)) throw new Error('Incompatible BB2 cloud record');
  if (Object.keys(envelope).sort().join(',') !==
      'ownerId,protocol,requestId,revision,snapshot')
    throw new Error('Unexpected BB2 cloud envelope fields');
  if (!envelope.snapshot ||
      Object.keys(envelope.snapshot).sort().join(',') !==
      'events,opening,sealedBlocks,setup') throw new Error('Unexpected BB2 cloud snapshot fields');
  checkLedgerOwnership(expectedOwnerId, envelope.snapshot);
  return copy(envelope);
}

function queryForOwner(client, ownerId) {
  if (!client || !validOwner(ownerId)) throw new Error('Invalid BB2 cloud owner');
  return client.from('bvom_cloud_state');
}

function eventLineage(oldEvents, newEvents) {
  if (newEvents.length < oldEvents.length) return false;
  return oldEvents.every((old, index) => {
    const next = newEvents[index];
    if (stable(old) === stable(next)) return true;
    // Discard is the one allowed replacement of an already committed event:
    // Stage (i) requires a matching later WORKOUT_DISCARDED and valid tombstones.
    return DISCARD_REWRITABLE.has(old.type) &&
      next?.type === 'TOMBSTONE' && next.eventId === old.eventId &&
      next.commitOrdinal === old.commitOrdinal && next.blockId === old.blockId &&
      next.discardedSessionId === old.sessionId;
  });
}

function descendsFromBaseline(baseline, next) {
  if (!baseline) return true;
  const prev = baseline.snapshot, upcoming = next.snapshot;
  if (upcoming.sealedBlocks.length < prev.sealedBlocks.length) return false;
  for (let i = 0; i < prev.sealedBlocks.length; i++) {
    if (stable(prev.sealedBlocks[i]) !== stable(upcoming.sealedBlocks[i])) return false;
  }
  if (!prev.opening) return true;
  if (upcoming.opening?.blockId === prev.opening.blockId) {
    return stable(prev.opening) === stable(upcoming.opening) &&
      eventLineage(prev.events, upcoming.events) &&
      upcoming.sealedBlocks.length === prev.sealedBlocks.length;
  }
  // Block rotation retains the sealed predecessor, including the exact old
  // opening, before a new opening. No drop/replacement of an earlier block.
  if (upcoming.sealedBlocks.length <= prev.sealedBlocks.length ||
      !upcoming.opening) return false;
  // A device may finish several complete blocks while offline. Their whole
  // chain is already replay-checked above; compare the first new archive with
  // the last cloud-saved live block, never just the most recent archive.
  const archived = upcoming.sealedBlocks[prev.sealedBlocks.length];
  return stable(archived.opening) === stable(prev.opening) &&
    eventLineage(prev.events, archived.events);
}

function appReady(ownerId, readAppSnapshot, durableIntentVerified, intent) {
  try {
    return typeof readAppSnapshot === 'function' &&
      typeof durableIntentVerified === 'function' &&
      bb2AppWriteStatus(readAppSnapshot(), ownerId).allowed === true &&
      durableIntentVerified(intent) === true;
  } catch (_) { return false; }
}

export async function readBB2CloudSidecar({ client, ownerId }) {
  let result;
  try {
    result = await queryForOwner(client, ownerId)
      .select('user_id,revision,data_version,state').eq('user_id', ownerId).maybeSingle();
  } catch (error) { return { status: 'unavailable', error }; }
  if (result.error) return { status: 'unavailable', error: result.error };
  if (!result.data) return { status: 'empty' };
  try {
    if (result.data.data_version !== VERSION) throw new Error('Cloud row belongs to another protocol');
    const envelope = validateBB2CloudSidecar(result.data.state, ownerId);
    if (result.data.revision !== envelope.revision || result.data.user_id !== ownerId)
      throw new Error('Cloud row revision/ownership mismatch');
    return { status: 'ready', envelope };
  } catch (error) { return { status: 'incompatible', error }; }
}

export async function writeBB2CloudSidecar({ client, ownerId, envelope,
  previousRevision, expectedBaseline, readAppSnapshot, durableIntentVerified }) {
  const safe = validateBB2CloudSidecar(envelope, ownerId);
  if (!(previousRevision === null || validRevision(previousRevision)) ||
      safe.revision !== (previousRevision === null ? 1 : previousRevision + 1))
    throw new Error('Invalid BB2 cloud revision transition');
  if (previousRevision === null ? expectedBaseline !== null :
      !expectedBaseline ||
      validateBB2CloudSidecar(expectedBaseline, ownerId).revision !== previousRevision)
    throw new Error('Missing verified BB2 cloud baseline');
  if (!descendsFromBaseline(expectedBaseline, safe)) return { status: 'conflict' };
  const intent = Object.freeze({ ownerId, envelope: safe,
    previousRevision, expectedBaseline });
  if (!appReady(ownerId, readAppSnapshot, durableIntentVerified, intent))
    return { status: 'blocked' };
  // Read and match the entire previously verified cloud baseline. This stops
  // a stale device from attaching its old journal to a freshly fetched revision.
  const remote = await readBB2CloudSidecar({ client, ownerId });
  if (!appReady(ownerId, readAppSnapshot, durableIntentVerified, intent))
    return { status: 'blocked' };
  if (previousRevision === null ? remote.status !== 'empty' :
      remote.status !== 'ready' || stable(remote.envelope) !== stable(expectedBaseline))
    return { status: remote.status === 'unavailable' ? 'unavailable' : 'conflict' };
  let query;
  if (previousRevision === null) {
    // A concurrent first writer receives unique_violation instead of silently
    // overwriting the row. Never use upsert for the first BB2 cloud commit.
    query = queryForOwner(client, ownerId).insert({ user_id: ownerId,
      revision: safe.revision, data_version: VERSION, state: safe });
  } else {
    query = queryForOwner(client, ownerId)
      .update({ revision: safe.revision, state: safe,
        updated_at: new Date().toISOString() })
      .eq('user_id', ownerId).eq('data_version', VERSION)
      .eq('revision', previousRevision);
  }
  if (!appReady(ownerId, readAppSnapshot, durableIntentVerified, intent))
    return { status: 'blocked' };
  let result;
  try { result = await query.select('user_id,revision,data_version,state').maybeSingle(); }
  catch (error) { return { status: 'uncertain', error }; }
  if (!appReady(ownerId, readAppSnapshot, durableIntentVerified, intent))
    return { status: 'uncertain', error: new Error('Local ownership changed during cloud write') };
  if (result.error?.code === '23505') return { status: 'conflict' };
  if (result.error) return { status: 'uncertain', error: result.error };
  if (!result.data) return { status: 'conflict' };
  try {
    const committed = validateBB2CloudSidecar(result.data.state, ownerId);
    if (result.data.revision !== safe.revision ||
        result.data.data_version !== VERSION || result.data.user_id !== ownerId ||
        committed.revision !== safe.revision || committed.requestId !== safe.requestId ||
        stable(committed.snapshot) !== stable(safe.snapshot))
      return { status: 'uncertain', error: new Error('Unexpected cloud write receipt') };
    return { status: 'committed', envelope: committed };
  } catch (error) { return { status: 'uncertain', error }; }
}

export async function reconcileBB2CloudSidecar({ client, ownerId, envelope }) {
  const expected = validateBB2CloudSidecar(envelope, ownerId);
  const observed = await readBB2CloudSidecar({ client, ownerId });
  if (observed.status !== 'ready') return observed;
  if (observed.envelope.revision === expected.revision &&
      observed.envelope.requestId === expected.requestId &&
      stable(observed.envelope.snapshot) === stable(expected.snapshot))
    return { status: 'committed', envelope: observed.envelope };
  return { status: 'conflict', envelope: observed.envelope };
}

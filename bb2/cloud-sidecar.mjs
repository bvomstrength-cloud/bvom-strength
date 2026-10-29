/* Candidate BB2 cloud transport, NOT registered in BVOM's application.
 * Uses BVOM's existing, currently unused bvom_cloud_state table (one row
 * per authenticated owner, explicit revision and data_version columns).
 * No database schema change is needed. Importing performs no I/O.
 *
 * Old BVOM clients update bvom_data, which cannot touch this table.
 * BB2 writers update one revisioned row with a database-evaluated revision
 * condition. First inserts rely on the existing unique user_id primary key.
 */

const VERSION = 'bvom-bb2-sidecar-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const validOwner = value => typeof value === 'string' && value.length > 0;
const validRevision = value => Number.isSafeInteger(value) && value >= 1;
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
  if (!bb2.opening && (bb2.events?.length || bb2.sealedBlocks?.length))
    throw new Error('BB2 events require a block opening');
  if (bb2.opening && bb2.opening.ownerId !== ownerId)
    throw new Error('BB2 block belongs to another owner');
  for (const block of bb2.sealedBlocks || []) {
    if (!block?.opening || block.opening.ownerId !== ownerId || !Array.isArray(block.events))
      throw new Error('BB2 archived block belongs to another owner');
  }
}

export function createBB2CloudSidecar({ ownerId, bb2, previousRevision, requestId }) {
  if (!validOwner(ownerId) || !validOwner(requestId) ||
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
      !validOwner(envelope.requestId)) throw new Error('Incompatible BB2 cloud record');
  checkLedgerOwnership(expectedOwnerId, envelope.snapshot);
  return copy(envelope);
}

function queryForOwner(client, ownerId) {
  if (!client || !validOwner(ownerId)) throw new Error('Invalid BB2 cloud owner');
  return client.from('bvom_cloud_state');
}

export async function readBB2CloudSidecar({ client, ownerId }) {
  const result = await queryForOwner(client, ownerId)
    .select('user_id,revision,data_version,state').eq('user_id', ownerId).maybeSingle();
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
  previousRevision }) {
  const safe = validateBB2CloudSidecar(envelope, ownerId);
  if (!(previousRevision === null || validRevision(previousRevision)) ||
      safe.revision !== (previousRevision === null ? 1 : previousRevision + 1))
    throw new Error('Invalid BB2 cloud revision transition');
  let query;
  if (previousRevision === null) {
    // A concurrent first writer receives unique_violation instead of silently
    // overwriting the row. Never use upsert for the first BB2 cloud commit.
    query = queryForOwner(client, ownerId).insert({ user_id: ownerId,
      revision: safe.revision, data_version: VERSION, state: safe });
  } else {
    query = queryForOwner(client, ownerId)
      .update({ revision: safe.revision, state: safe })
      .eq('user_id', ownerId).eq('data_version', VERSION)
      .eq('revision', previousRevision);
  }
  const result = await query.select('user_id,revision,data_version,state').maybeSingle();
  if (result.error?.code === '23505') return { status: 'conflict' };
  if (result.error) return { status: 'uncertain', error: result.error };
  if (!result.data) return { status: 'conflict' };
  try {
    const committed = validateBB2CloudSidecar(result.data.state, ownerId);
    if (result.data.revision !== safe.revision ||
        result.data.data_version !== VERSION || result.data.user_id !== ownerId ||
        committed.revision !== safe.revision || committed.requestId !== safe.requestId)
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

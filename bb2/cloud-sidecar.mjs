/* Candidate BB2 cloud transport, NOT registered in BVOM's application.
 * Requires a separately approved, nullable JSONB `bb2_data` column on the
 * existing bvom_data row. Importing this module performs no I/O.
 *
 * An old BVOM client updates only `data`, so it cannot remove `bb2_data`.
 * New BB2 writers update only `bb2_data`, with a database-evaluated revision
 * condition. A client-side read/compare/write sequence is NOT a substitute.
 */

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
  return Object.freeze({ protocol: 'bvom-bb2-sidecar-v1', ownerId,
    revision: previousRevision === null ? 1 : previousRevision + 1,
    requestId, snapshot });
}

export function validateBB2CloudSidecar(envelope, expectedOwnerId) {
  if (!validOwner(expectedOwnerId) || !envelope ||
      envelope.protocol !== 'bvom-bb2-sidecar-v1' ||
      envelope.ownerId !== expectedOwnerId || !validRevision(envelope.revision) ||
      !validOwner(envelope.requestId)) throw new Error('Incompatible BB2 cloud record');
  checkLedgerOwnership(expectedOwnerId, envelope.snapshot);
  return copy(envelope);
}

function queryForOwner(client, rowId, ownerId) {
  if (!client || !validOwner(rowId) || !validOwner(ownerId))
    throw new Error('Invalid BB2 cloud row ownership');
  return client.from('bvom_data');
}

export async function readBB2CloudSidecar({ client, rowId, ownerId }) {
  const result = await queryForOwner(client, rowId, ownerId)
    .select('id,bb2_data').eq('id', rowId).eq('user_id', ownerId).maybeSingle();
  if (result.error || !result.data) return { status: 'unavailable', error: result.error || null };
  if (result.data.bb2_data == null) return { status: 'empty' };
  try {
    return { status: 'ready', envelope: validateBB2CloudSidecar(result.data.bb2_data, ownerId) };
  } catch (error) { return { status: 'incompatible', error }; }
}

export async function writeBB2CloudSidecar({ client, rowId, ownerId, envelope,
  previousRevision }) {
  const safe = validateBB2CloudSidecar(envelope, ownerId);
  if (!(previousRevision === null || validRevision(previousRevision)) ||
      safe.revision !== (previousRevision === null ? 1 : previousRevision + 1))
    throw new Error('Invalid BB2 cloud revision transition');
  let query = queryForOwner(client, rowId, ownerId)
    .update({ bb2_data: safe }).eq('id', rowId).eq('user_id', ownerId);
  query = previousRevision === null
    ? query.is('bb2_data', null)
    : query.eq('bb2_data->>revision', String(previousRevision));
  // Return the actual matched row: zero rows is a conflict, not success.
  const result = await query.select('id,bb2_data').maybeSingle();
  if (result.error) return { status: 'uncertain', error: result.error };
  if (!result.data) return { status: 'conflict' };
  try {
    const committed = validateBB2CloudSidecar(result.data.bb2_data, ownerId);
    if (committed.revision !== safe.revision || committed.requestId !== safe.requestId)
      return { status: 'uncertain', error: new Error('Unexpected cloud write receipt') };
    return { status: 'committed', envelope: committed };
  } catch (error) { return { status: 'uncertain', error }; }
}

export async function reconcileBB2CloudSidecar({ client, rowId, ownerId, envelope }) {
  const expected = validateBB2CloudSidecar(envelope, ownerId);
  const observed = await readBB2CloudSidecar({ client, rowId, ownerId });
  if (observed.status !== 'ready') return observed;
  if (observed.envelope.revision === expected.revision &&
      observed.envelope.requestId === expected.requestId &&
      stable(observed.envelope.snapshot) === stable(expected.snapshot))
    return { status: 'committed', envelope: observed.envelope };
  return { status: 'conflict', envelope: observed.envelope };
}

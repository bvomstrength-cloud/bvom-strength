'use strict';
/* Existing BVOM revisioned-table compatibility contracts, fake database only.
 * The production app does not import the sidecar transport.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./lib/bvom_harness');

const root = path.resolve(__dirname, '../..');
const copy = x => JSON.parse(JSON.stringify(x));
const ownerId = '11111111-1111-4111-8111-111111111111';
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('PASS:', name); };

function fakeCloud() {
  const server = { row: null, stateRow: null, writes: [], beforeWrite: null,
    loseNextReply: false, corruptNextReply: false, unavailableTable: false };
  const client = { from(table) {
    assert.ok(table === 'bvom_data' || table === 'bvom_cloud_state');
    let operation = 'select', selected = 'id,data,created_at', incoming, filters = [];
    const matches = row => row && filters.every(([name, kind, val]) => {
      const actual = row[name];
      return kind === 'is' ? (actual ?? null) === val : actual === val;
    });
    const projected = row => {
      if (!row) return null;
      return Object.fromEntries(selected.split(',').map(name => [name, copy(row[name] ?? null)]));
    };
    const execute = () => {
      try {
        if (table === 'bvom_cloud_state' && server.unavailableTable)
          throw Error('Cloud state table unavailable');
        let row = table === 'bvom_data' ? server.row : server.stateRow;
        if (operation === 'select') return { data: projected(matches(row) ? row : null), error: null };
        if (server.beforeWrite) server.beforeWrite(table, row);
        row = table === 'bvom_data' ? server.row : server.stateRow;
        if (operation === 'insert') {
          if (row) return { data: null, error: { code: '23505', message: 'unique user_id' } };
          if (table === 'bvom_data') server.row = { id: 'row-1', ...copy(incoming) };
          else server.stateRow = copy(incoming);
        } else if (matches(row)) {
          Object.assign(row, copy(incoming));
        } else return { data: null, error: null };
        server.writes.push({ table, columns: Object.keys(incoming) });
        if (server.loseNextReply) {
          server.loseNextReply = false;
          return { data: null, error: new Error('Simulated lost reply after commit') };
        }
        const receipt = projected(table === 'bvom_data' ? server.row : server.stateRow);
        if (server.corruptNextReply) {
          server.corruptNextReply = false;
          receipt.state.snapshot.setup.optionalUpperBCurls =
            !receipt.state.snapshot.setup.optionalUpperBCurls;
        }
        return { data: receipt, error: null };
      } catch (error) { return { data: null, error }; }
    };
    const q = {
      select(columns = 'id,data,created_at') { selected = columns; return q; },
      eq(name, value) { filters.push([name, 'eq', value]); return q; },
      is(name, value) { filters.push([name, 'is', value]); return q; },
      order() { return q; },
      async limit() {
        const one = execute(); return { data: one.data ? [one.data] : [], error: one.error };
      },
      update(values) { operation = 'update'; incoming = values; return q; },
      insert(values) { operation = 'insert'; incoming = values; return q; },
      async single() { return execute(); },
      async maybeSingle() { return execute(); }
    };
    return q;
  } };
  return { server, client, supabase: { createClient: () => client } };
}

function sealCreditedBlock(core, opening) {
  const events = [];
  const add = (type, fields) => events.push({ type, eventId: 'event-' +
    opening.blockId + '-' + (events.length + 1),
    commitOrdinal: events.length + 1, blockId: opening.blockId, ...fields });
  const slot = { roleSlotId: 'synthetic_role', exerciseId: 'synthetic_lift',
    sets: 1, floor: 6, ceiling: 10, equipment: 'loaded', plannedG: 60000,
    plannedOrigin: { value: '60', unit: 'kg' }, incrementG: 2500,
    incrementOrigin: { value: '2.5', unit: 'kg' } };
  for (const day of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sessionId = `${opening.blockId}-${day}-${i}`;
      add('WORKOUT_STARTED', { sessionId, templateId: day, kind: 'NORMAL', slots: [slot] });
      add('SET_RECORDED', { sessionId, roleSlotId: slot.roleSlotId,
        exerciseId: slot.exerciseId, setIndex: 0, reps: 6, prescribed: true,
        actualG: 60000, actualOrigin: { value: '60', unit: 'kg' } });
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  assert.deepEqual(Object.values(core.foldBB2Block(opening, events).quotas),
    [8, 8, 8, 8]);
  const sealId = 'seal:' + opening.blockId + ':' + (events.length + 1);
  add('BLOCK_SEALED', { sealId });
  assert.equal(core.foldBB2Block(opening, events).sealed, true);
  return { opening, events };
}

async function main() {
  const sidecar = await import('../../bb2/cloud-sidecar.mjs');
  const core = await import('../../bb2/browser-core.mjs');
  const db = fakeCloud();
  const h = H.boot(H.loadBuild(root), { supabase: db.supabase, online: true });
  H.configureLP(h, { Squat: 60, 'Bench Press': 45, 'Prone Row': 40,
    'Overhead Press': 30, Deadlift: 75 });
  h.ev(`bvomCloud.user={id:'${ownerId}',email:'test@example.invalid'};
    bvomCloud.offlineLocalAccess=false; bvomCloud.accountSwitchDeferred=false;`);
  db.server.row = { id: 'row-1', user_id: ownerId, data: copy(h.S()) };
  const originalLegacy = copy(db.server.row.data);
  const bb2 = { setup: core.createBB2Setup(),
    opening: core.createBB2Opening({ ownerId, blockId: 'test-block' }), events: [],
    sealedBlocks: [], selectedProgram: true, warmupTouched: { deviceTick: true } };
  const envelope = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: null, requestId: 'test-request-1' });
  const safeApp = () => ({ authUserId: ownerId, cloudUserId: ownerId,
    localOwnerId: ownerId, appVisible: true, entitlementAllowed: true,
    documentLockOwned: true, documentLockState: 'owned',
    legacyRecoveryBlocked: false, tabOwnerCompatible: true,
    accountSwitchDeferred: false, recoveryBusy: false,
    localPersistenceHealthy: true, localBlobUnchanged: true,
    legacyWorkoutActive: false, cloudConflict: false,
    bb2WriterEnabled: true, multiDeviceFenceVerified: true });
  let app = safeApp(), pendingDurable = true, persistedIntent = null;
  const guard = { readAppSnapshot: () => app,
    durableIntentVerified: intent => pendingDurable &&
      JSON.stringify(intent) === JSON.stringify(persistedIntent) };
  const write = (next, previousRevision, expectedBaseline, client = db.client) => {
    // Fake durable local pending-upload record; real BVOM integration must
    // compare the exact on-disk intent before enabling the transport.
    persistedIntent = copy({ ownerId, envelope: next, previousRevision, expectedBaseline });
    return sidecar.writeBB2CloudSidecar({ client, ownerId, envelope: next,
      previousRevision, expectedBaseline, ...guard });
  };

  await check('first BB2 write inserts into existing owner-keyed table; legacy data untouched', async () => {
    const r = await write(envelope, null, null);
    assert.equal(r.status, 'committed');
    assert.equal(db.server.stateRow.revision, 1);
    assert.equal(db.server.stateRow.data_version, envelope.protocol);
    assert.deepEqual(db.server.row.data, originalLegacy);
    assert.equal(db.server.stateRow.state.snapshot.selectedProgram, undefined);
    assert.equal(db.server.stateRow.state.snapshot.warmupTouched, undefined);
  });

  await check('second first-write request is rejected by existing unique user key', async () => {
    const r = await write(envelope, null, null);
    assert.equal(r.status, 'conflict');
    assert.equal(db.server.stateRow.revision, 1);
  });

  await check('actual old BVOM manual upload cannot modify separate cloud-state record', async () => {
    await h.ctx.bvomCloudSaveNow();
    assert.equal(db.server.stateRow.state.requestId, 'test-request-1');
    assert.deepEqual(db.server.writes.at(-1), { table: 'bvom_data', columns: ['data'] });
  });

  await check('actual old BVOM auto upload cannot remove concurrent cloud-state write', async () => {
    db.server.row.data = copy(h.ctx.bvomCloudPayload());
    h.ev(`bvomCloud.cloudExists=true; bvomCloud.syncReady=true;
      bvomCloud.conflict=false; bvomCloud.remoteFingerprint=
        bvomCloudComparableFingerprint(bvomCloudPayload());`);
    db.server.beforeWrite = table => {
      if (table === 'bvom_data') db.server.stateRow.state = {
        ...db.server.stateRow.state, extraProofOfConcurrentChange: true };
    };
    await h.ctx.bvomCloudAutoSave();
    db.server.beforeWrite = null;
    assert.equal(db.server.stateRow.state.extraProofOfConcurrentChange, true);
    assert.deepEqual(db.server.writes.at(-1), { table: 'bvom_data', columns: ['data'] });
    delete db.server.stateRow.state.extraProofOfConcurrentChange;
  });

  const version2 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: 1, requestId: 'test-request-2' });
  const losing = sidecar.createBB2CloudSidecar({ ownerId,
    bb2: { ...bb2, setup: core.setBB2OptionalCurls(bb2.setup, true) },
    previousRevision: 1, requestId: 'test-request-loser' });
  const version3 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: 2, requestId: 'test-request-3' });

  await check('two new-device writers with the same revision cannot both succeed', async () => {
    const won = await write(version2, 1, envelope);
    const lost = await write(losing, 1, envelope);
    assert.equal(won.status, 'committed');
    assert.equal(lost.status, 'conflict');
    assert.equal(db.server.stateRow.state.requestId, 'test-request-2');
  });

  await check('lost reply after successful write reconciles without duplicate revision', async () => {
    db.server.loseNextReply = true;
    const uncertain = await write(version3, 2, version2);
    assert.equal(uncertain.status, 'uncertain');
    // PostgreSQL JSONB may return object keys in a different order.
    db.server.stateRow.state.snapshot = Object.fromEntries(
      Object.entries(db.server.stateRow.state.snapshot).reverse());
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: db.client,
      ownerId, envelope: version3 })).status, 'committed');
    assert.equal(db.server.stateRow.revision, 3);
  });

  const version4 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: 3, requestId: 'test-request-4' });

  await check('verified baseline and ledger ancestry both prevent stale-history overwrite', async () => {
    const stale = sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, opening: core.createBB2Opening({ ownerId,
        blockId: 'unrelated-local-block' }) },
      previousRevision: 3, requestId: 'wrong-lineage' });
    assert.equal((await write(stale, 3, version3)).status, 'conflict');
    const forgedBaseline = { ...version3, snapshot: {
      ...version3.snapshot,
      setup: core.setBB2OptionalCurls(bb2.setup, true) } };
    assert.equal((await write(version4, 3, forgedBaseline)).status, 'conflict');
    assert.equal(db.server.stateRow.revision, 3);
  });

  await check('cloud ownership, lock, conflict and durable pending intent gate writes', async () => {
    app = { ...safeApp(), accountSwitchDeferred: true };
    assert.equal((await write(version4, 3, version3)).status, 'blocked');
    app = safeApp(); pendingDurable = false;
    assert.equal((await write(version4, 3, version3)).status, 'blocked');
    pendingDurable = true;
    assert.equal((await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope: version4, previousRevision: 3,
      expectedBaseline: version3 })).status, 'blocked');
    assert.equal(db.server.stateRow.revision, 3);
  });

  await check('altered write receipt does not falsely acknowledge cloud success', async () => {
    db.server.corruptNextReply = true;
    const changed = await write(version4, 3, version3);
    assert.equal(changed.status, 'uncertain');
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: db.client,
      ownerId, envelope: version4 })).status, 'committed');
    assert.equal(db.server.stateRow.revision, 4);
    assert.ok(db.server.writes.at(-1).columns.includes('updated_at'));
  });

  await check('real frozen-ledger append uploads, but a later truncated journal is rejected', async () => {
    const swapped = { type: 'EXERCISE_SWAPPED', eventId: 'swap:test-block:1',
      commitOrdinal: 1, blockId: 'test-block', templateId: 'upper_a',
      roleSlotId: 'flat_press', exerciseId: 'dumbbell_flat_press' };
    const expanded = sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, events: [swapped] },
      previousRevision: 4, requestId: 'test-request-5' });
    assert.equal((await write(expanded, 4, version4)).status, 'committed');
    const truncated = sidecar.createBB2CloudSidecar({ ownerId, bb2,
      previousRevision: 5, requestId: 'stale-with-fresh-revision' });
    assert.equal((await write(truncated, 5, expanded)).status, 'conflict');
    assert.equal(db.server.stateRow.state.snapshot.events.length, 1);
  });

  await check('owner or document lock change during network await cannot acknowledge a write', async () => {
    const v6 = sidecar.createBB2CloudSidecar({ ownerId, bb2: {
      ...bb2, events: db.server.stateRow.state.snapshot.events },
      previousRevision: 5, requestId: 'test-request-6' });
    const baseline = copy(db.server.stateRow.state);
    db.server.beforeWrite = table => {
      if (table === 'bvom_cloud_state') app = { ...safeApp(), documentLockOwned: false };
    };
    const uncertain = await write(v6, 5, baseline);
    db.server.beforeWrite = null; app = safeApp();
    assert.equal(uncertain.status, 'uncertain');
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: db.client,
      ownerId, envelope: v6 })).status, 'committed');
  });

  await check('genuine saved INCOMPLETE session is cloud-eligible; active Start alone is not', async () => {
    const slot = { roleSlotId: 'flat_press', exerciseId: 'bench_press', sets: 3,
      ceiling: 10, equipment: 'loaded', plannedG: 60000,
      plannedOrigin: { value: '60', unit: 'kg' }, incrementG: 2500,
      incrementOrigin: { value: '2.5', unit: 'kg' } };
    const started = { type: 'WORKOUT_STARTED', eventId: 'incomplete:start',
      commitOrdinal: 1, blockId: 'test-block', sessionId: 'incomplete-session',
      templateId: 'upper_a', kind: 'NORMAL', slots: [slot] };
    const closed = { type: 'WORKOUT_INCOMPLETE', eventId: 'incomplete:close',
      commitOrdinal: 2, blockId: 'test-block', sessionId: 'incomplete-session' };
    const incomplete = sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, events: [started, closed] },
      previousRevision: 6, requestId: 'valid-incomplete' });
    assert.equal(sidecar.validateBB2CloudSidecar(incomplete, ownerId)
      .snapshot.events[1].type, 'WORKOUT_INCOMPLETE');
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, events: [started] },
      previousRevision: 6, requestId: 'unclosed' }), /unfinished/);
  });

  await check('lost FIRST-insert reply reconciles; duplicate and racing inserts fail closed', async () => {
    const fresh = fakeCloud(); fresh.server.loseNextReply = true;
    assert.equal((await write(envelope, null, null, fresh.client)).status, 'uncertain');
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: fresh.client,
      ownerId, envelope })).status, 'committed');
    assert.equal((await write(envelope, null, null, fresh.client)).status, 'conflict');
    const racing = fakeCloud();
    racing.server.beforeWrite = table => {
      if (table === 'bvom_cloud_state' && !racing.server.stateRow)
        racing.server.stateRow = { user_id: ownerId, revision: 1,
          data_version: envelope.protocol, state: copy(envelope) };
    };
    assert.equal((await write(envelope, null, null, racing.client)).status, 'conflict');
  });

  await check('foreign owner, active workout, protocol clash and unknown table fail closed', async () => {
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId: '22222222-2222-4222-8222-222222222222',
      bb2, previousRevision: 3, requestId: 'foreign' }), /another owner/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, activeSessionId: 'workout-1' },
      previousRevision: 3, requestId: 'active' }), /unfinished/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, events: [{ type: 'TEST_EVENT', id: 1 }] },
      previousRevision: 3, requestId: 'forged' }), /BB2/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, sealedBlocks: [{ opening: bb2.opening, events: [] }] },
      previousRevision: 4, requestId: 'unsealed-archive' }), /not sealed/);
    db.server.stateRow.data_version = 'reserved-future-use';
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      ownerId })).status, 'incompatible');
    db.server.unavailableTable = true;
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      ownerId })).status, 'unavailable');
  });

  await check('real sealed ancestry and two completed offline blocks preserve the cloud baseline', async () => {
    const first = sealCreditedBlock(core,
      core.createBB2Opening({ ownerId, blockId: 'offline-block-1' }));
    const nextOpening = core.BB2_BROWSER_MODULES.ledger.createNextBB2Opening(
      first.opening, first.events, 'offline-block-2');
    const second = sealCreditedBlock(core, nextOpening);
    const thirdOpening = core.BB2_BROWSER_MODULES.ledger.createNextBB2Opening(
      second.opening, second.events, 'offline-block-3');
    const firstCloud = sidecar.createBB2CloudSidecar({ ownerId, bb2: {
      ...bb2, opening: first.opening, events: first.events.slice(0, -1), sealedBlocks: [] },
      previousRevision: null, requestId: 'offline-before-seal' });
    const bothFinished = sidecar.createBB2CloudSidecar({ ownerId, bb2: {
      ...bb2, opening: thirdOpening, events: [], sealedBlocks: [first, second] },
      previousRevision: 1, requestId: 'offline-two-seals' });
    const fresh = fakeCloud();
    assert.equal((await write(firstCloud, null, null, fresh.client)).status, 'committed');
    assert.equal((await write(bothFinished, 1, firstCloud, fresh.client)).status,
      'committed', 'two offline block rotations must remain uploadable');
    const fakeSecond = { ...second, opening:
      core.createBB2Opening({ ownerId, blockId: second.opening.blockId }) };
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId, bb2: {
      ...bb2, opening: thirdOpening, events: [], sealedBlocks: [first, fakeSecond] },
      previousRevision: 2, requestId: 'false-chain' }), /ancestry/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId, bb2: {
      ...bb2, opening: thirdOpening, events: [], sealedBlocks: [] },
      previousRevision: 2, requestId: 'missing-predecessor' }), /predecessor/);
    assert.throws(() => sidecar.validateBB2CloudSidecar({ ...bothFinished,
      futureProtocolField: true }, ownerId), /envelope fields/);
  });

  await check('rejected network promises report unavailable or uncertain, never false success', async () => {
    const offlineClient = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        throw new Error('offline during read');
      } }) })
    }) };
    assert.equal((await sidecar.readBB2CloudSidecar({
      client: offlineClient, ownerId })).status, 'unavailable');
    assert.equal((await sidecar.reconcileBB2CloudSidecar({
      client: offlineClient, ownerId, envelope })).status, 'unavailable');
    const writingClient = { from: table => {
      const original = fakeCloud().client.from(table);
      return { ...original, insert: () => ({
        select: () => ({ maybeSingle: async () => {
          throw new Error('offline during write');
        } })
      }) };
    } };
    assert.equal((await write(envelope, null, null, writingClient)).status,
      'uncertain', 'a rejected write may already have committed');
  });

  console.log(`BB2 cloud sidecar compatibility: ${passed}/${passed} PASS (in-memory mock only)`);
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

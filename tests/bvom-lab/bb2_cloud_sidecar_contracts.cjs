'use strict';
/* Existing BVOM revisioned-table compatibility contracts, fake database only.
 * The production app does not import the sidecar transport.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./lib/bvom_harness');

const root = path.resolve(__dirname, '../..');
const copy = x => JSON.parse(JSON.stringify(x));
const ownerId = 'test-sidecar-owner';
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('PASS:', name); };

function fakeCloud() {
  const server = { row: null, stateRow: null, writes: [], beforeWrite: null,
    loseNextReply: false, unavailableTable: false };
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
        const row = table === 'bvom_data' ? server.row : server.stateRow;
        if (operation === 'select') return { data: projected(matches(row) ? row : null), error: null };
        if (server.beforeWrite) server.beforeWrite(table, row);
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
        return { data: projected(table === 'bvom_data' ? server.row : server.stateRow), error: null };
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

async function main() {
  const sidecar = await import('../../bb2/cloud-sidecar.mjs');
  const db = fakeCloud();
  const h = H.boot(H.loadBuild(root), { supabase: db.supabase, online: true });
  H.configureLP(h, { Squat: 60, 'Bench Press': 45, 'Prone Row': 40,
    'Overhead Press': 30, Deadlift: 75 });
  h.ev(`bvomCloud.user={id:'${ownerId}',email:'test@example.invalid'};
    bvomCloud.offlineLocalAccess=false; bvomCloud.accountSwitchDeferred=false;`);
  db.server.row = { id: 'row-1', user_id: ownerId, data: copy(h.S()) };
  const originalLegacy = copy(db.server.row.data);
  const bb2 = { setup: { selections: { 'upper_a|flat_press': 'bench_press' } },
    opening: { ownerId, blockId: 'test-block' }, events: [{ type: 'TEST_EVENT', id: 1 }],
    sealedBlocks: [], selectedProgram: true, warmupTouched: { deviceTick: true } };
  const envelope = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: null, requestId: 'test-request-1' });

  await check('first BB2 write inserts into existing owner-keyed table; legacy data untouched', async () => {
    const r = await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope, previousRevision: null });
    assert.equal(r.status, 'committed');
    assert.equal(db.server.stateRow.revision, 1);
    assert.equal(db.server.stateRow.data_version, envelope.protocol);
    assert.deepEqual(db.server.row.data, originalLegacy);
    assert.equal(db.server.stateRow.state.snapshot.selectedProgram, undefined);
    assert.equal(db.server.stateRow.state.snapshot.warmupTouched, undefined);
  });

  await check('second first-write request is rejected by existing unique user key', async () => {
    const r = await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope, previousRevision: null });
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
  });

  const version2 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: 1, requestId: 'test-request-2' });
  const losing = sidecar.createBB2CloudSidecar({ ownerId,
    bb2: { ...bb2, events: [{ type: 'DIVERGENT' }] },
    previousRevision: 1, requestId: 'test-request-loser' });

  await check('two new-device writers with the same revision cannot both succeed', async () => {
    const won = await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope: version2, previousRevision: 1 });
    const lost = await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope: losing, previousRevision: 1 });
    assert.equal(won.status, 'committed');
    assert.equal(lost.status, 'conflict');
    assert.equal(db.server.stateRow.state.requestId, 'test-request-2');
  });

  await check('lost reply after successful write reconciles without duplicate revision', async () => {
    const v3 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
      previousRevision: 2, requestId: 'test-request-3' });
    db.server.loseNextReply = true;
    const uncertain = await sidecar.writeBB2CloudSidecar({ client: db.client,
      ownerId, envelope: v3, previousRevision: 2 });
    assert.equal(uncertain.status, 'uncertain');
    // PostgreSQL JSONB may return object keys in a different order.
    db.server.stateRow.state.snapshot = Object.fromEntries(
      Object.entries(db.server.stateRow.state.snapshot).reverse());
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: db.client,
      ownerId, envelope: v3 })).status, 'committed');
    assert.equal(db.server.stateRow.revision, 3);
  });

  await check('foreign owner, active workout, protocol clash and unknown table fail closed', async () => {
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId: 'other',
      bb2, previousRevision: 3, requestId: 'foreign' }), /another owner/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, activeSessionId: 'workout-1' },
      previousRevision: 3, requestId: 'active' }), /unfinished/);
    db.server.stateRow.data_version = 'reserved-future-use';
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      ownerId })).status, 'incompatible');
    db.server.unavailableTable = true;
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      ownerId })).status, 'unavailable');
  });

  console.log(`BB2 cloud sidecar compatibility: ${passed}/${passed} PASS (in-memory mock only)`);
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

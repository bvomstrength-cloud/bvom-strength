'use strict';
/* Candidate one-column cloud compatibility contracts, fake database only.
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
  const server = { row: null, writes: [], beforeWrite: null, loseNextReply: false,
    unavailableColumn: false };
  const client = { from(table) {
    assert.equal(table, 'bvom_data');
    let operation = 'select', selected = 'id,data,created_at', incoming, filters = [];
    const matches = row => row && filters.every(([name, kind, val]) => {
      const actual = name === 'bb2_data->>revision'
        ? row.bb2_data?.revision == null ? null : String(row.bb2_data.revision)
        : row[name];
      return kind === 'is' ? (actual ?? null) === val : actual === val;
    });
    const projected = row => {
      if (!row) return null;
      if (server.unavailableColumn && selected.includes('bb2_data'))
        throw new Error('column bb2_data does not exist');
      return Object.fromEntries(selected.split(',').map(name => [name, copy(row[name] ?? null)]));
    };
    const execute = () => {
      try {
        if (operation === 'select') return { data: projected(matches(server.row) ? server.row : null), error: null };
        if (server.beforeWrite) server.beforeWrite(server.row);
        if (operation === 'insert') {
          if (server.row) return { data: null, error: new Error('row exists') };
          server.row = { id: 'row-1', user_id: ownerId, data: copy(incoming.data) };
          server.writes.push(Object.keys(incoming));
        } else if (matches(server.row)) {
          Object.assign(server.row, copy(incoming));
          server.writes.push(Object.keys(incoming));
        } else return { data: null, error: null };
        if (server.loseNextReply) {
          server.loseNextReply = false;
          return { data: null, error: new Error('Simulated lost reply after commit') };
        }
        return { data: projected(server.row), error: null };
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
  db.server.row = { id: 'row-1', user_id: ownerId, data: copy(h.S()), bb2_data: null };
  const originalLegacy = copy(db.server.row.data);
  const bb2 = { setup: { selections: { 'upper_a|flat_press': 'bench_press' } },
    opening: { ownerId, blockId: 'test-block' }, events: [{ type: 'TEST_EVENT', id: 1 }],
    sealedBlocks: [], selectedProgram: true, warmupTouched: { deviceTick: true } };
  const envelope = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: null, requestId: 'test-request-1' });

  await check('first BB2 write is conditional on empty sidecar; legacy data untouched', async () => {
    const r = await sidecar.writeBB2CloudSidecar({ client: db.client, rowId: 'row-1',
      ownerId, envelope, previousRevision: null });
    assert.equal(r.status, 'committed');
    assert.equal(db.server.row.bb2_data.revision, 1);
    assert.deepEqual(db.server.row.data, originalLegacy);
    assert.equal(db.server.row.bb2_data.snapshot.selectedProgram, undefined);
    assert.equal(db.server.row.bb2_data.snapshot.warmupTouched, undefined);
  });

  await check('actual old BVOM manual upload cannot remove sidecar BB2 column', async () => {
    await h.ctx.bvomCloudSaveNow();
    assert.equal(db.server.row.bb2_data.requestId, 'test-request-1');
    assert.deepEqual(db.server.writes.at(-1), ['data']);
  });

  await check('actual old BVOM automatic upload cannot remove concurrent sidecar write', async () => {
    db.server.row.data = copy(h.ctx.bvomCloudPayload());
    h.ev(`bvomCloud.cloudExists=true; bvomCloud.syncReady=true;
      bvomCloud.conflict=false; bvomCloud.remoteFingerprint=
        bvomCloudComparableFingerprint(bvomCloudPayload());`);
    db.server.beforeWrite = row => { row.bb2_data = {
      ...row.bb2_data, extraProofOfConcurrentChange: true }; };
    await h.ctx.bvomCloudAutoSave();
    db.server.beforeWrite = null;
    assert.equal(db.server.row.bb2_data.extraProofOfConcurrentChange, true);
    assert.deepEqual(db.server.writes.at(-1), ['data']);
  });

  const version2 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
    previousRevision: 1, requestId: 'test-request-2' });
  const losing = sidecar.createBB2CloudSidecar({ ownerId,
    bb2: { ...bb2, events: [{ type: 'DIVERGENT' }] },
    previousRevision: 1, requestId: 'test-request-loser' });

  await check('two new-device writers with the same revision cannot both succeed', async () => {
    const won = await sidecar.writeBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId, envelope: version2, previousRevision: 1 });
    const lost = await sidecar.writeBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId, envelope: losing, previousRevision: 1 });
    assert.equal(won.status, 'committed');
    assert.equal(lost.status, 'conflict');
    assert.equal(db.server.row.bb2_data.requestId, 'test-request-2');
  });

  await check('lost reply after successful write reconciles without duplicate revision', async () => {
    const v3 = sidecar.createBB2CloudSidecar({ ownerId, bb2,
      previousRevision: 2, requestId: 'test-request-3' });
    db.server.loseNextReply = true;
    const uncertain = await sidecar.writeBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId, envelope: v3, previousRevision: 2 });
    assert.equal(uncertain.status, 'uncertain');
    // PostgreSQL JSONB may return object keys in a different order.
    db.server.row.bb2_data.snapshot = Object.fromEntries(
      Object.entries(db.server.row.bb2_data.snapshot).reverse());
    assert.equal((await sidecar.reconcileBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId, envelope: v3 })).status, 'committed');
    assert.equal(db.server.row.bb2_data.revision, 3);
  });

  await check('foreign owner, active workout, malformed record and unknown schema fail closed', async () => {
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId: 'other',
      bb2, previousRevision: 3, requestId: 'foreign' }), /another owner/);
    assert.throws(() => sidecar.createBB2CloudSidecar({ ownerId,
      bb2: { ...bb2, activeSessionId: 'workout-1' },
      previousRevision: 3, requestId: 'active' }), /unfinished/);
    db.server.row.bb2_data = { protocol: 'unknown', ownerId, revision: 4 };
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId })).status, 'incompatible');
    db.server.unavailableColumn = true;
    assert.equal((await sidecar.readBB2CloudSidecar({ client: db.client,
      rowId: 'row-1', ownerId })).status, 'unavailable');
  });

  console.log(`BB2 cloud sidecar compatibility: ${passed}/${passed} PASS (in-memory mock only)`);
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

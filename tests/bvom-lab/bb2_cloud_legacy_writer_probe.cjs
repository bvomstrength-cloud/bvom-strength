'use strict';
// Read-only compatibility probe: actual legacy BVOM upload functions, fake DB.
// This is research evidence, not a passing guarantee of safe BB2 cloud sync.
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./lib/bvom_harness');

const root = path.resolve(__dirname, '../..');
const build = H.loadBuild(root);
const copy = value => JSON.parse(JSON.stringify(value));
const ownerId = 'dummy-bb2-probe-owner';

function fakeCloud() {
  const server = { row: null, writes: [], beforeUpdate: null };
  const client = { from(table) {
    assert.equal(table, 'bvom_data');
    let operation = 'select', incoming = null;
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; },
      async limit() { return { data: server.row ? [copy(server.row)] : [], error: null }; },
      update(next) { operation = 'update'; incoming = next; return q; },
      insert(next) { operation = 'insert'; incoming = next; return q; },
      async single() {
        if (operation === 'update') {
          if (server.beforeUpdate) server.beforeUpdate(server.row);
          server.row.data = copy(incoming.data);
          server.writes.push('update');
        } else if (operation === 'insert') {
          server.row = { id: 'row-1', data: copy(incoming.data) };
          server.writes.push('insert');
        }
        return { data: { id: server.row.id }, error: null };
      }
    };
    return q;
  } };
  return { server, supabase: { createClient: () => client } };
}

function setup() {
  const cloud = fakeCloud();
  const h = H.boot(build, { supabase: cloud.supabase, online: true });
  H.configureLP(h, { Squat: 60, 'Bench Press': 45, 'Prone Row': 40,
    'Overhead Press': 30, Deadlift: 75 });
  h.ev(`bvomCloud.user={id:'${ownerId}',email:'dummy@example.invalid'};
    bvomCloud.offlineLocalAccess=false; bvomCloud.accountSwitchDeferred=false;`);
  return { h, server: cloud.server };
}

async function manualOverwriteOfUnknownBB2Field() {
  const { h, server } = setup();
  server.row = { id: 'row-1', data: {
    ...copy(h.S()), hypotheticalFutureBB2Data: { events: [{ id: 'earned-progress' }] }
  } };
  assert.equal(server.row.data.hypotheticalFutureBB2Data.events.length, 1);
  assert.equal(h.S().hypotheticalFutureBB2Data, undefined);
  await h.ctx.bvomCloudSaveNow();
  assert.deepEqual(server.writes, ['update']);
  assert.equal(server.row.data.hypotheticalFutureBB2Data, undefined,
    'an old client overwrite removes BB2 data that existed only in cloud');
  assert.equal(h.S().hypotheticalFutureBB2Data, undefined);
  console.log('PASS: old BVOM manual cloud upload overwrites unknown future data');
}

async function automaticReadThenWriteRace() {
  const { h, server } = setup();
  server.row = { id: 'row-1', data: copy(h.S()) };
  h.ev(`bvomCloud.cloudExists=true; bvomCloud.syncReady=true;
    bvomCloud.conflict=false; bvomCloud.remoteFingerprint=
      bvomCloudComparableFingerprint(bvomCloudPayload());`);
  server.beforeUpdate = row => {
    row.data.hypotheticalOtherDeviceChange = { id: 'new-cloud-write' };
  };
  await h.ctx.bvomCloudAutoSave();
  assert.deepEqual(server.writes, ['update']);
  assert.equal(server.row.data.hypotheticalOtherDeviceChange, undefined,
    'read-then-update without a server-side revision check can erase a concurrent write');
  console.log('PASS: legacy auto sync has a read-then-write concurrency gap');
}

async function main() {
  await manualOverwriteOfUnknownBB2Field();
  await automaticReadThenWriteRace();
  console.log('BB2 CLOUD COMPATIBILITY: legacy whole-row writers are unsafe for BB2 payloads');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });

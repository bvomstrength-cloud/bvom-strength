// Run ONLY against an ephemeral `supabase start` service in GitHub Actions.
// Credentials come from local Supabase CLI status, never from BVOM production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createBB2CloudCoordinator } from '../../bb2/cloud-coordinator.mjs';
import { createBB2CloudSidecar, readBB2CloudSidecar,
  writeBB2CloudSidecar } from '../../bb2/cloud-sidecar.mjs';
import { createBB2Opening, createBB2Setup } from '../../bb2/browser-core.mjs';

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'],
  { encoding: 'utf8' }));
const apiUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
assert.match(apiUrl || '', /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/,
  'Authenticated proof must never contact a hosted Supabase project');
assert.ok(anonKey && serviceKey, 'Local CLI must supply test-only keys');

const authOptions = { auth: { autoRefreshToken: false,
  persistSession: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceKey, authOptions);
const makeClient = () => createClient(apiUrl, anonKey, authOptions);
const copy = x => JSON.parse(JSON.stringify(x));
const safe = ownerId => ({ authUserId: ownerId, cloudUserId: ownerId,
  localOwnerId: ownerId, appVisible: true, entitlementAllowed: true,
  documentLockOwned: true, documentLockState: 'owned',
  legacyRecoveryBlocked: false, tabOwnerCompatible: true,
  accountSwitchDeferred: false, recoveryBusy: false,
  localPersistenceHealthy: true, localBlobUnchanged: true,
  legacyWorkoutActive: false, cloudConflict: false,
  bb2WriterEnabled: true, multiDeviceFenceVerified: true });

let passed = 0;
async function check(label, body) {
  await body();
  passed++;
  console.log(`PASS: ${label}`);
}
async function createLogin(label) {
  const email = `bb2-${label}@example.invalid`, password = 'Local-Only-Auth-2026!';
  const created = await admin.auth.admin.createUser({ email,
    password, email_confirm: true });
  if (created.error) throw created.error;
  const client = makeClient();
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  assert.equal(login.data.user.id, created.data.user.id);
  const secondClient = makeClient();
  const secondLogin = await secondClient.auth.signInWithPassword({ email, password });
  if (secondLogin.error) throw secondLogin.error;
  assert.equal(secondLogin.data.user.id, created.data.user.id);
  return { ownerId: created.data.user.id, client, secondClient };
}
function device(account, bb2 = null) {
  let state = { token: 1, bb2: copy(bb2) }, n = 0;
  const session = createBB2CloudCoordinator({
    client: account.client, ownerId: account.ownerId,
    readAppSnapshot: () => safe(account.ownerId),
    readLocal: () => ({ ownerId: account.ownerId,
      token: String(state.token), bb2: copy(state.bb2) }),
    commitLocal: (token, next) => {
      if (String(state.token) !== token) return false;
      state = { token: state.token + 1, bb2: copy(next) };
      return true;
    },
    makeRequestId: () => `local-${++n}-${account.ownerId}`
  });
  return { session, get: () => copy(state.bb2),
    set: next => { state = { token: state.token + 1, bb2: copy(next) }; } };
}

const owner = await createLogin('owner');
const stranger = await createLogin('stranger');
const victim = await createLogin('victim');
const initialBB2 = { setup: createBB2Setup(),
  opening: createBB2Opening({ ownerId: owner.ownerId,
    blockId: 'authenticated-test-block' }),
  events: [], sealedBlocks: [], selectedProgram: true };
const phone = device(owner, initialBB2);
const tablet = device({ ...owner, client: owner.secondClient });

await check('authenticated owner saves a revisioned BB2 row', async () => {
  assert.equal((await phone.session.upload()).status, 'committed');
  const observed = await readBB2CloudSidecar(owner);
  assert.equal(observed.status, 'ready');
  assert.equal(observed.envelope.revision, 1);
  assert.equal(observed.envelope.snapshot.selectedProgram, undefined);
});

await check('same-owner second device downloads the saved journal', async () => {
  assert.equal((await tablet.session.downloadIfEmpty()).status, 'downloaded');
  assert.equal(tablet.get().opening.blockId, 'authenticated-test-block');
  assert.equal(tablet.get().cloudSync.baseline.revision, 1);
});

await check('RLS prevents another authenticated user from reading or inserting owner data', async () => {
  const hidden = await readBB2CloudSidecar({ client: stranger.client,
    ownerId: owner.ownerId });
  assert.equal(hidden.status, 'empty');
  const payload = createBB2CloudSidecar({ ownerId: victim.ownerId,
    bb2: { ...initialBB2, opening: createBB2Opening({
      ownerId: victim.ownerId, blockId: 'unowned-row' }) },
    previousRevision: null, requestId: 'other-user' });
  const attempt = await stranger.client.from('bvom_cloud_state').insert({
    user_id: victim.ownerId, revision: 1,
    data_version: payload.protocol, state: payload }).select().maybeSingle();
  assert.ok(attempt.error, 'another account cannot insert even a currently empty owner row');
  assert.equal((await readBB2CloudSidecar(victim)).status, 'empty');
  const updated = await stranger.client.from('bvom_cloud_state')
    .update({ revision: 99 }).eq('user_id', owner.ownerId).select().maybeSingle();
  assert.equal(updated.data, null);
  assert.equal((await readBB2CloudSidecar(owner)).envelope.revision, 1);
});

await check('two authenticated first-device inserts cannot create competing owner rows', async () => {
  const fresh = await createLogin('first-insert');
  const initial = { setup: createBB2Setup(),
    opening: createBB2Opening({ ownerId: fresh.ownerId, blockId: 'first-race' }),
    events: [], sealedBlocks: [] };
  const a = device(fresh, initial);
  const b = device({ ...fresh, client: fresh.secondClient }, initial);
  const [one, two] = await Promise.all([a.session.upload(), b.session.upload()]);
  assert.deepEqual([one.status, two.status].sort(), ['committed', 'conflict']);
  assert.equal((await readBB2CloudSidecar(fresh)).envelope.revision, 1);
});

await check('stale second device cannot replace newer owner training', async () => {
  const next = phone.get(); next.setup.optionalUpperBCurls = true;
  phone.set(next);
  assert.equal((await phone.session.upload()).status, 'committed');
  const stale = tablet.get(); stale.setup.optionalUpperBCurls = false;
  tablet.set(stale);
  assert.equal((await tablet.session.upload()).status, 'conflict');
  assert.equal((await readBB2CloudSidecar(owner)).envelope.revision, 2);
  assert.equal(tablet.get().cloudSync.baseline.revision, 1);
});

await check('real PostgREST revision condition allows one of two simultaneous updates', async () => {
  const baseline = (await readBB2CloudSidecar(owner)).envelope;
  const changed = phone.get(); changed.setup.optionalUpperBCurls = false;
  const ready = { readAppSnapshot: () => safe(owner.ownerId),
    durableIntentVerified: () => true };
  const attempt = (client, id) => writeBB2CloudSidecar({
    client, ownerId: owner.ownerId,
    envelope: createBB2CloudSidecar({ ownerId: owner.ownerId,
      bb2: changed, previousRevision: 2, requestId: id }),
    previousRevision: 2, expectedBaseline: baseline, ...ready });
  const [one, two] = await Promise.all([
    attempt(owner.client, 'simultaneous-a'),
    attempt(owner.secondClient, 'simultaneous-b')]);
  assert.deepEqual([one.status, two.status].sort(), ['committed', 'conflict']);
  assert.equal((await readBB2CloudSidecar(owner)).envelope.revision, 3);
});

console.log(`BB2 authenticated local Supabase: ${passed}/${passed} PASS`);

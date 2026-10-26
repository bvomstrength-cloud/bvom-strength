'use strict';
const assert = require('node:assert/strict');
const { createBB2Setup, chooseBB2Exercise, setBB2OptionalCurls,
  getBB2TemplatePrescription } = require('../../bb2/catalogue.cjs');
const { validateBB2RestoredBlock, bb2FinishRevisionKey } = require('../../bb2/restore.cjs');
const { createBB2LocalStore } = require('../../bb2/local-store.cjs');

const mass = g => ({ value: String(g / 1000), unit: 'kg' });
const mem = () => {
  const data = new Map(); let writes = 0;
  return { data, get writes() { return writes; },
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { writes++; data.set(key, value); }
  };
};
const exclusiveLock = () => {
  const queues = new Map();
  return async (key, fn) => {
    const before = queues.get(key) || Promise.resolve();
    let release;
    const untilReleased = new Promise(resolve => { release = resolve; });
    queues.set(key, before.then(() => untilReleased));
    await before;
    try { return await fn(); } finally { release(); }
  };
};
const makeStore = (storage = mem(), ownerId = 'owner-1', lock = exclusiveLock()) =>
  createBB2LocalStore({ storage, ownerId, withExclusiveLock: lock });
const start = (saved, sessionId = 's1', templateId = 'upper_a') => ({
  type: 'WORKOUT_STARTED', eventId: `start:${sessionId}`,
  commitOrdinal: saved.events.length + 1, blockId: saved.opening.blockId,
  sessionId, templateId, kind: 'NORMAL',
  slots: getBB2TemplatePrescription(saved.setup, templateId).slots.map(slot => {
    const { roleSlotId, exerciseId, sets, floor, ceiling, equipment } = slot;
    return equipment === 'loaded'
      ? { roleSlotId, exerciseId, sets, floor, ceiling, equipment,
        plannedG: 60000, plannedOrigin: mass(60000),
        incrementG: 2500, incrementOrigin: mass(2500) }
      : { roleSlotId, exerciseId, sets, floor, ceiling, equipment,
        variation: exerciseId, assistance: 'none' };
  })
});
const filledSets = saved => {
  const event = saved.events.find(x => x.type === 'WORKOUT_STARTED');
  let ordinal = saved.events.length;
  return event.slots.flatMap(slot => Array.from({ length: slot.sets }, (_, setIndex) => {
    ordinal += 1;
    return { type: 'SET_RECORDED', eventId: `set:${ordinal}`,
      commitOrdinal: ordinal, blockId: saved.opening.blockId, sessionId: event.sessionId,
      roleSlotId: slot.roleSlotId, exerciseId: slot.exerciseId, setIndex,
      reps: slot.floor, prescribed: true, harderThanIntended: false,
      ...(slot.equipment === 'loaded'
        ? { actualG: slot.plannedG, actualOrigin: slot.plannedOrigin }
        : { variation: slot.variation, assistance: slot.assistance }) };
  }));
};

const checks = [];
const check = (name, test) => checks.push([name, test]);

check('requires explicit owner, storage API and exclusive lock provider', async () => {
  assert.throws(() => createBB2LocalStore({ storage: mem(), ownerId: 'abc' }), /exclusive lock/);
  assert.throws(() => makeStore(mem(), ''), /owner/);
  assert.throws(() => makeStore(mem(), 'x|y'), /owner/);
});

check('setup is saved in one owner-local key before any workout can Start', async () => {
  const storage = mem(), store = makeStore(storage);
  assert.equal(store.read(), null);
  const saved = await store.initialize('block-one');
  assert.equal(saved.snapshot.revision, 0);
  assert.equal(storage.writes, 1);
  assert.ok(store.key.startsWith('bvom.bb2.local.v1.'));
  assert.equal(storage.data.size, 1);
  assert.equal(saved.snapshot.opening.ownerId, 'owner-1');
  assert.deepEqual(store.read(), saved.snapshot);
  assert.equal((await store.initialize('block-one')).noOp, true);
  assert.equal(storage.writes, 1);
  await assert.rejects(store.initialize('other-block'), /replace existing block/);
});

check('persisted optional curls and exercise selection drive Start, not an unsaved draft', async () => {
  const store = makeStore();
  await store.initialize('block-one');
  let selected = setBB2OptionalCurls(createBB2Setup(), true);
  selected = chooseBB2Exercise(selected, 'upper_a', 'shoulder_press', 'log_push_press');
  const result = await store.saveSetup(selected, { expectedRevision: 0, activeWorkout: false });
  assert.equal(result.snapshot.revision, 1);
  assert.equal(result.snapshot.setup.optionalUpperBCurls, true);
  assert.equal(result.snapshot.setup.selections['upper_a|shoulder_press'], 'log_push_press');
  assert.equal((await store.saveSetup(selected,
    { expectedRevision: 1, activeWorkout: false })).noOp, true);
  // JSONB/backup key-order permutations are not a different setup revision.
  const reordered = { selections: Object.fromEntries(
    Object.entries(selected.selections).reverse()),
  optionalUpperBCurls: selected.optionalUpperBCurls,
  catalogueVersion: selected.catalogueVersion };
  assert.equal((await store.saveSetup(reordered,
    { expectedRevision: 1, activeWorkout: false })).noOp, true);
  const unsaved = structuredClone(start(result.snapshot));
  unsaved.slots[0].exerciseId = 'machine_chest_press';
  await assert.rejects(store.commitStart(unsaved,
    { expectedRevision: 1, activeWorkout: false }), /catalogue/);
  const valid = start(result.snapshot);
  assert.equal((await store.commitStart(valid,
    { expectedRevision: 1, activeWorkout: false })).snapshot.events.length, 1);
  await assert.rejects(store.saveSetup(createBB2Setup(),
    { expectedRevision: 2, activeWorkout: false }), /active workout/);
});

check('workout sets and Finish+credit save in one durable revision and stay valid on reload', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  let snapshot = store.read();
  await store.commitStart(start(snapshot), { expectedRevision: 0, activeWorkout: false });
  snapshot = store.read();
  const sets = filledSets(snapshot);
  snapshot = (await store.appendEvents(sets, {
    expectedRevision: 1, activeWorkout: true })).snapshot;
  assert.equal(snapshot.events.length, 1 + 12);
  const before = storage.writes;
  const key = bb2FinishRevisionKey('block-one', 's1', snapshot.revision);
  const saved = await store.commitFinish('s1', 'FINISH', {
    expectedRevision: snapshot.revision,
    eventRevision: snapshot.revision,
    activeWorkout: true
  });
  assert.equal(storage.writes, before + 1);
  assert.deepEqual(saved.snapshot.events.slice(-2).map(x => x.type),
    ['WORKOUT_FINISHED', 'CREDIT_GRANTED']);
  assert.equal(saved.snapshot.finishKeys[key].committedHead, 15);
  assert.equal(validateBB2RestoredBlock(saved.snapshot.opening,
    saved.snapshot.events).quotas.upper_a, 1);
  assert.deepEqual(makeStore(storage).read(), saved.snapshot);
});

check('Finish retry is a durable no-op with same or newer revision', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  await store.commitStart(start(store.read()), { expectedRevision: 0, activeWorkout: false });
  await store.appendEvents(filledSets(store.read()), { expectedRevision: 1, activeWorkout: true });
  const pending = store.read();
  await store.commitFinish('s1', 'FINISH', { expectedRevision: 2, eventRevision: 2,
    activeWorkout: true });
  const beforeWrites = storage.writes;
  const retrySame = await store.commitFinish('s1', 'FINISH', {
    expectedRevision: 2, eventRevision: 2, activeWorkout: true });
  assert.equal(retrySame.noOp, true);
  const retryNext = await store.commitFinish('s1', 'FINISH', {
    expectedRevision: 3, eventRevision: 3, activeWorkout: true });
  assert.equal(retryNext.noOp, true);
  assert.equal(storage.writes, beforeWrites);
  assert.equal(store.read().events.length, pending.events.length + 2);
  await assert.rejects(store.commitFinish('s1', 'FINISH', {
    expectedRevision: 3, eventRevision: 9, activeWorkout: true }),
  /event revision/);
});

check('post-write Finish failure is recovered without a second credit', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  await store.commitStart(start(store.read()), { expectedRevision: 0, activeWorkout: false });
  await store.appendEvents(filledSets(store.read()), { expectedRevision: 1, activeWorkout: true });
  const oldSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    oldSetItem(key, value);
    throw Error('write committed but returned uncertain');
  };
  await assert.rejects(store.commitFinish('s1', 'FINISH', {
    expectedRevision: 2, eventRevision: 2, activeWorkout: true }), /UNCERTAIN/);
  storage.setItem = oldSetItem;
  const result = await store.commitFinish('s1', 'FINISH', {
    expectedRevision: 2, eventRevision: 2, activeWorkout: true });
  assert.equal(result.noOp, true);
  const saved = store.read();
  assert.equal(saved.revision, 3);
  assert.deepEqual(saved.events.slice(-2).map(e => e.type), ['WORKOUT_FINISHED', 'CREDIT_GRANTED']);
  assert.equal(validateBB2RestoredBlock(saved.opening, saved.events).quotas.upper_a, 1);
});

check('simultaneous duplicate Finish taps across locked tabs grant once', async () => {
  const storage = mem(), lock = exclusiveLock();
  const a = makeStore(storage, 'owner-1', lock), b = makeStore(storage, 'owner-1', lock);
  await a.initialize('block-one');
  await a.commitStart(start(a.read()), { expectedRevision: 0, activeWorkout: false });
  await a.appendEvents(filledSets(a.read()), { expectedRevision: 1, activeWorkout: true });
  const opts = { expectedRevision: 2, eventRevision: 2, activeWorkout: true };
  const results = await Promise.all([a.commitFinish('s1', 'FINISH', opts),
    b.commitFinish('s1', 'FINISH', opts)]);
  assert.equal(results.filter(r => r.noOp).length, 1);
  assert.equal(a.read().revision, 3);
  assert.equal(a.read().finishKeys[bb2FinishRevisionKey('block-one', 's1', 2)].committedHead,
    a.read().events.length);
  assert.equal(validateBB2RestoredBlock(a.read().opening, a.read().events).quotas.upper_a, 1);
});

check('failed writes do not claim success; an uncertain write is safely recoverable', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  const original = structuredClone(store.read());
  const priorWriter = storage.setItem;
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /LOCAL WRITE FAILED OR UNCERTAIN/);
  assert.deepEqual(store.read(), original);
  storage.setItem = (key, value) => { priorWriter(key, value); throw Error('post-commit failure'); };
  await assert.rejects(store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false }), /UNCERTAIN/);
  assert.equal(store.read().revision, 1);
  assert.equal(store.read().setup.optionalUpperBCurls, true);
  await assert.rejects(store.saveSetup(createBB2Setup(),
    { expectedRevision: 0, activeWorkout: false }), /stale local revision/);
});

check('exclusive lock serializes two tabs; stale second save cannot clobber first', async () => {
  const storage = mem(), lock = exclusiveLock();
  const a = makeStore(storage, 'owner-1', lock), b = makeStore(storage, 'owner-1', lock);
  await a.initialize('block-one');
  const changes = [setBB2OptionalCurls(createBB2Setup(), true),
    chooseBB2Exercise(createBB2Setup(), 'upper_a', 'flat_press', 'dumbbell_flat_press')];
  const results = await Promise.allSettled(changes.map((setup, index) =>
    [a, b][index].saveSetup(setup, { expectedRevision: 0, activeWorkout: false })));
  assert.deepEqual(results.map(x => x.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(a.read().revision, 1);
  assert.deepEqual(a.read(), b.read());
  assert.equal(storage.data.size, 1);
});

check('different owners never read or overwrite each other', async () => {
  const storage = mem(), lock = exclusiveLock();
  const a = makeStore(storage, 'owner-a', lock), b = makeStore(storage, 'owner-b', lock);
  await a.initialize('a-block');
  assert.equal(b.read(), null);
  await b.initialize('b-block');
  assert.notEqual(a.key, b.key);
  assert.equal(storage.data.size, 2);
  assert.equal(a.read().opening.blockId, 'a-block');
  assert.equal(b.read().opening.blockId, 'b-block');
});

check('tampered imports cannot smuggle bare Finish, unknown fields, or forged credit key', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  await store.commitStart(start(store.read()), { expectedRevision: 0, activeWorkout: false });
  await store.appendEvents(filledSets(store.read()), { expectedRevision: 1, activeWorkout: true });
  const good = storage.getItem(store.key);
  const bareFinish = JSON.parse(good);
  bareFinish.events.push({ type: 'WORKOUT_FINISHED', eventId: 'unsafe:finish',
    blockId: 'block-one', commitOrdinal: bareFinish.events.length + 1, sessionId: 's1' });
  storage.data.set(store.key, JSON.stringify(bareFinish));
  assert.throws(() => store.read(), /paired credit/);
  const unknown = JSON.parse(good); unknown.bogus = true;
  storage.data.set(store.key, JSON.stringify(unknown));
  assert.throws(() => store.read(), /unknown saved envelope/);
  const forgedKey = JSON.parse(good);
  forgedKey.finishKeys[bb2FinishRevisionKey('block-one', 's1', 2)] = {
    outcome: 'FINISH', committedHead: 13 };
  storage.data.set(store.key, JSON.stringify(forgedKey));
  assert.throws(() => store.read(), /orphan|invalid stored Finish marker/);
  storage.data.set(store.key, good);
  assert.equal(store.read().events.length, 13);
});

check('legacy bypass and stale start revision cannot append', async () => {
  const store = makeStore(); await store.initialize('block-one');
  const initial = store.read(), event = start(initial);
  await assert.rejects(store.appendEvents([event], { expectedRevision: 0,
    activeWorkout: false }), /bypasses/);
  await assert.rejects(store.commitStart(event, { expectedRevision: 0,
    activeWorkout: undefined }), /inactive-workout/);
  await store.saveSetup(setBB2OptionalCurls(createBB2Setup(), true), {
    expectedRevision: 0, activeWorkout: false });
  await assert.rejects(store.commitStart(event, { expectedRevision: 0,
    activeWorkout: false }), /stale local revision/);
});

check('full 32-credit / 673-event restored history remains within a conservative budget', async () => {
  const storage = mem(), store = makeStore(storage);
  await store.initialize('block-one');
  const saved = store.read(), events = [];
  const add = (type, fields) => events.push({ type, eventId: `perf-${events.length + 1}`,
    commitOrdinal: events.length + 1, blockId: 'block-one', ...fields });
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sessionId = `${templateId}-${i}`;
      const slots = Array.from({ length: 6 }, (_, n) => ({
        roleSlotId: `role-${n}`, exerciseId: `exercise-${n}`,
        sets: 3, floor: 6, ceiling: 8, equipment: 'loaded',
        plannedG: 60000 + 2500 * n, plannedOrigin: mass(60000 + 2500 * n),
        incrementG: 2500, incrementOrigin: mass(2500)
      }));
      add('WORKOUT_STARTED', { sessionId, templateId, kind: 'NORMAL', slots });
      for (const slot of slots) for (let k = 0; k < slot.sets; k++) {
        add('SET_RECORDED', { sessionId, roleSlotId: slot.roleSlotId,
          exerciseId: slot.exerciseId, setIndex: k, prescribed: true, reps: 7,
          actualG: slot.plannedG, actualOrigin: slot.plannedOrigin });
      }
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: `credit-${sessionId}` });
    }
  }
  add('BLOCK_SEALED', { sealId: 'perf-seal' });
  assert.equal(events.length, 673);
  storage.data.set(store.key, JSON.stringify({ ...saved, revision: 673, events }));
  const startMs = Date.now();
  const result = store.read();
  const firstMs = Date.now() - startMs;
  assert.deepEqual(validateBB2RestoredBlock(result.opening, result.events).quotas,
    { upper_a: 8, lower_a: 8, upper_b: 8, lower_b: 8 });
  const replayStart = Date.now(); store.read();
  const replayMs = Date.now() - replayStart;
  console.log(`BB2-S2-STORE-PERF full-block firstMs=${firstMs} replayMs=${replayMs}`);
  assert.ok(firstMs < 12000 && replayMs < 12000, 'restored local validation too slow');
});

(async () => {
  let passed = 0;
  for (const [name, test] of checks) {
    try { await test(); passed++; console.log('PASS BB2-S2-STORE ' + name); }
    catch (error) { process.exitCode = 1;
      console.error('FAIL BB2-S2-STORE ' + name + ': ' + error.stack); }
  }
  console.log(`BB2 Stage (ii) local store: ${passed}/${checks.length} ${process.exitCode ? 'FAIL' : 'PASS'}`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

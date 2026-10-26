// Stage (ii) guarded Start proof. Independent of application and persistence.
'use strict';
const assert = require('node:assert/strict');
const { createBB2Opening, foldBB2Block, createNextBB2Opening } = require('../../bb2/ledger.cjs');
const { createBB2Setup, chooseBB2Exercise, setBB2OptionalCurls,
  getBB2TemplatePrescription } = require('../../bb2/catalogue.cjs');
const { validateBB2NewStart, commitBB2Start } = require('../../bb2/start.cjs');

const ownerId = 'owner-test', blockId = 'block-start';
const key = 'upper_a|flat_press|bench_press';
const mass = g => ({ value: String(g / 1000), unit: 'kg' });
const makeOpening = progress => createBB2Opening({ ownerId, blockId, progress });
const normalSlots = (setup, templateId) => getBB2TemplatePrescription(setup, templateId).slots.map(s => {
  const { roleSlotId, exerciseId, sets, floor, ceiling, equipment } = s;
  return equipment === 'loaded'
    ? { roleSlotId, exerciseId, sets, floor, ceiling, equipment,
      plannedG: 60000, plannedOrigin: mass(60000),
      incrementG: 2500, incrementOrigin: mass(2500) }
    : { roleSlotId, exerciseId, sets, floor, ceiling, equipment,
      variation: exerciseId, assistance: 'none' };
});
const start = (setup, templateId = 'upper_a', prior = [], sessionId = 'session-1') => ({
  type: 'WORKOUT_STARTED', eventId: 'start:' + sessionId, commitOrdinal: prior.length + 1,
  blockId, sessionId, templateId, kind: 'NORMAL', slots: normalSlots(setup, templateId)
});
const guard = (prior = []) => ({ ownerId, blockId, expectedHead: prior.length,
  foldRulesVersion: 1, sealRevision: 0, activeWorkout: false });
const deep = x => structuredClone(x);
let passed = 0;
const check = (name, fn) => {
  try { fn(); passed += 1; console.log('PASS BB2-S2-START ' + name); }
  catch (e) { process.exitCode = 1; console.error('FAIL BB2-S2-START ' + name + ': ' + e.stack); }
};

check('valid full-catalogue Start commits via Stage (i) guarded transaction', () => {
  const opening = makeOpening(), setup = createBB2Setup(), event = start(setup);
  const saved = commitBB2Start(opening, [], setup, event, guard());
  assert.equal(saved.events.length, 1);
  assert.equal(saved.projection.headOrdinal, 1);
  assert.deepEqual(saved.events[0], event);
  assert.equal(saved.projection.history.length, 0);
  assert.equal(validateBB2NewStart(opening, [], setup, event).headOrdinal, 0);
});

check('pre-Start curls and explicit conventional deadlift affect required sets', () => {
  let setup = setBB2OptionalCurls(createBB2Setup(), true);
  let event = start(setup, 'upper_b');
  assert.deepEqual([event.slots.reduce((n, s) => n + s.sets, 0), event.slots.length], [15, 6]);
  commitBB2Start(makeOpening(), [], setup, event, guard());
  setup = chooseBB2Exercise(createBB2Setup(), 'lower_b', 'hip_hinge', 'conventional_deadlift');
  event = start(setup, 'lower_b');
  const hinge = event.slots.find(s => s.roleSlotId === 'hip_hinge');
  assert.deepEqual([hinge.sets, hinge.floor, hinge.ceiling], [2, 4, 6]);
  assert.equal(event.slots.reduce((n, s) => n + s.sets, 0), 11);
  commitBB2Start(makeOpening(), [], setup, event, guard());
});

check('catalogue disallows altered denominators, floor, role identity and order', () => {
  const setup = createBB2Setup(), opening = makeOpening(), clean = start(setup);
  const cases = [
    e => e.slots[0].sets--,
    e => { delete e.slots[0].floor; },
    e => { e.slots[0].ceiling = 100; },
    e => { e.slots[0].roleSlotId = 'forged'; },
    e => { e.slots.reverse(); },
    e => { e.slots.pop(); },
    e => { e.slots[0].warmup = 'FULL'; }
  ];
  for (const corrupt of cases) {
    const event = deep(clean); corrupt(event);
    assert.throws(() => commitBB2Start(opening, [], setup, event, guard()),
      /catalogue|slot|count/i);
  }
});

check('no forged DERIVED origin or fictitious entered grams on initial Start', () => {
  const setup = createBB2Setup(), opening = makeOpening(), clean = start(setup);
  const forged = deep(clean);
  forged.slots[0].plannedOrigin = { kind: 'DERIVED', sourceEventId: 'nope' };
  assert.throws(() => commitBB2Start(opening, [], setup, forged, guard()), /manually entered/i);
  const mismatch = deep(clean); mismatch.slots[0].plannedOrigin = mass(99900);
  assert.throws(() => commitBB2Start(opening, [], setup, mismatch, guard()), /manually entered/i);
  const badIncrement = deep(clean); badIncrement.slots[0].incrementOrigin = mass(5000);
  assert.throws(() => commitBB2Start(opening, [], setup, badIncrement, guard()), /increment/i);
  const missingIncrement = deep(clean); delete missingIncrement.slots[0].incrementG;
  delete missingIncrement.slots[0].incrementOrigin;
  assert.throws(() => commitBB2Start(opening, [], setup, missingIncrement, guard()), /increment/i);
});

check('bodyweight Start needs variation and explicit assistance, never guessed weight', () => {
  const setup = createBB2Setup(), opening = makeOpening(), clean = start(setup);
  const i = clean.slots.findIndex(s => s.equipment === 'bodyweight');
  assert.ok(i >= 0);
  const noAssistance = deep(clean); delete noAssistance.slots[i].assistance;
  assert.throws(() => commitBB2Start(opening, [], setup, noAssistance, guard()), /bodyweight/i);
  const noVariation = deep(clean); noVariation.slots[i].variation = '';
  assert.throws(() => commitBB2Start(opening, [], setup, noVariation, guard()), /bodyweight/i);
  const imaginaryOrigin = deep(clean); imaginaryOrigin.slots[i].plannedOrigin = mass(0);
  assert.throws(() => commitBB2Start(opening, [], setup, imaginaryOrigin, guard()), /orphan/i);
  const loadedBodyweight = deep(clean); loadedBodyweight.slots[i].plannedG = 1250;
  loadedBodyweight.slots[i].plannedOrigin = { value: '1.25', unit: 'kg' };
  assert.equal(commitBB2Start(opening, [], setup, loadedBodyweight, guard()).events.length, 1);
});

check('existing entered prescription cannot be overridden by an invented Start', () => {
  const opening = makeOpening({ [key]: { loadG: 55000, loadOrigin: mass(55000),
    incrementG: 1250, incrementOrigin: mass(1250) } });
  const setup = createBB2Setup(), event = start(setup);
  assert.throws(() => commitBB2Start(opening, [], setup, event, guard()), /inherit/i);
  const first = event.slots.find(s => s.roleSlotId === 'flat_press');
  first.plannedG = 55000; first.plannedOrigin = mass(55000);
  first.incrementG = 1250; first.incrementOrigin = mass(1250);
  assert.equal(commitBB2Start(opening, [], setup, event, guard()).events.length, 1);
});

check('in-block legitimately earned DERIVED progression is inherited with real Finish lineage', () => {
  const opening = makeOpening();
  const historical = [];
  const add = (type, attrs) => historical.push({ type, eventId: 'history-' + (historical.length + 1),
    commitOrdinal: historical.length + 1, blockId, ...attrs });
  for (const name of ['a', 'b']) {
    add('WORKOUT_STARTED', { sessionId: name, templateId: 'upper_a', kind: 'NORMAL',
      slots: [{ roleSlotId: 'flat_press', exerciseId: 'bench_press', equipment: 'loaded',
        sets: 1, floor: 6, ceiling: 8, plannedG: 60000, plannedOrigin: mass(60000),
        incrementG: 2500, incrementOrigin: mass(2500) }] });
    add('SET_RECORDED', { sessionId: name, roleSlotId: 'flat_press', exerciseId: 'bench_press',
      setIndex: 0, reps: 8, actualG: 60000, actualOrigin: mass(60000),
      harderThanIntended: false, prescribed: true });
    add('WORKOUT_FINISHED', { sessionId: name });
    add('CREDIT_GRANTED', { sessionId: name, creditId: 'credit-' + name });
  }
  const current = foldBB2Block(opening, historical).progress[key];
  assert.equal(current.loadG, 62500);
  assert.deepEqual(current.loadOrigin,
    { kind: 'DERIVED', sourceEventId: 'history-7' });
  const setup = createBB2Setup(), event = start(setup, 'upper_a', historical, 'session-next');
  const first = event.slots.find(s => s.roleSlotId === 'flat_press');
  first.plannedG = current.loadG; first.plannedOrigin = current.loadOrigin;
  assert.equal(commitBB2Start(opening, historical, setup, event, guard(historical)).events.length, 9);
  const inventedSource = deep(event);
  inventedSource.slots[0].plannedOrigin.sourceEventId = 'nope';
  assert.throws(() => commitBB2Start(opening, historical, setup,
    inventedSource, guard(historical)), /inherit/i);
});

check('carried DERIVED snapshot without verified sealed predecessor cannot Start', () => {
  const opening = makeOpening({ [key]: { loadG: 62500,
    loadOrigin: { kind: 'DERIVED', sourceEventId: 'nonexistent' },
    incrementG: 2500, incrementOrigin: mass(2500) } });
  const setup = createBB2Setup(), event = start(setup);
  event.slots[0].plannedG = 62500;
  event.slots[0].plannedOrigin = { kind: 'DERIVED', sourceEventId: 'nonexistent' };
  assert.throws(() => commitBB2Start(opening, [], setup, event, guard()),
    /verified sealed predecessor/i);
});

check('real sealed 32-credit carry proves DERIVED lineage; forged carry is refused', () => {
  const previousOpening = createBB2Opening({ ownerId, blockId: 'block-previous' });
  const previousEvents = [];
  const add = (type, fields) => previousEvents.push({ type, eventId: 'prev-' + (previousEvents.length + 1),
    commitOrdinal: previousEvents.length + 1, blockId: 'block-previous', ...fields });
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let n = 0; n < 8; n++) {
      const sessionId = templateId + '-' + n;
      const plannedG = templateId === 'upper_a' && n >= 2 ? 62500 : 60000;
      const reps = templateId === 'upper_a' && n === 1 ? 8 : 7;
      const roleSlotId = templateId === 'upper_a' ? 'flat_press' : 'test_role';
      const exerciseId = templateId === 'upper_a' ? 'bench_press' : 'test_lift';
      add('WORKOUT_STARTED', { sessionId, templateId, kind: 'NORMAL',
        slots: [{ roleSlotId, exerciseId, sets: 1, floor: 6, ceiling: 8,
          equipment: 'loaded', plannedG, plannedOrigin: n >= 2 && templateId === 'upper_a'
            ? { kind: 'DERIVED', sourceEventId: 'prev-7' } : mass(plannedG),
          incrementG: 2500, incrementOrigin: mass(2500) }] });
      add('SET_RECORDED', { sessionId, roleSlotId, exerciseId, setIndex: 0,
        reps, actualG: plannedG, actualOrigin: mass(plannedG),
        harderThanIntended: false, prescribed: true });
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  add('BLOCK_SEALED', { sealId: 'seal-prev' });
  const nextOpening = createNextBB2Opening(previousOpening, previousEvents, blockId);
  assert.equal(nextOpening.progress[key].loadG, 62500);
  assert.deepEqual(nextOpening.progress[key].loadOrigin,
    { kind: 'DERIVED', sourceEventId: 'prev-7' });
  const setup = createBB2Setup(), event = start(setup);
  event.slots[0].plannedG = 62500;
  event.slots[0].plannedOrigin = nextOpening.progress[key].loadOrigin;
  const saved = commitBB2Start(nextOpening, [], setup, event,
    { ...guard(), sealRevision: nextOpening.sealRevision },
    { priorSealedBlock: { opening: previousOpening, events: previousEvents } });
  assert.equal(saved.events.length, 1);
  assert.throws(() => commitBB2Start(nextOpening, [], setup, event,
    { ...guard(), sealRevision: nextOpening.sealRevision },
    { priorSealedBlock: { opening: previousOpening, events: previousEvents.slice(0, -1) } }),
  /unsealed|incomplete|sealed/i);
});

check('guard and canonical new Start reject stale, foreign, overlapping and recovery plans', () => {
  const opening = makeOpening(), setup = createBB2Setup(), clean = start(setup);
  assert.throws(() => commitBB2Start(opening, [], setup, clean,
    { ...guard(), activeWorkout: undefined }), /inactive-workout guard/);
  assert.throws(() => commitBB2Start(opening, [], setup, clean,
    { ...guard(), expectedHead: 1 }), /stale/i);
  const foreign = deep(clean); foreign.blockId = 'other';
  assert.throws(() => commitBB2Start(opening, [], setup, foreign, guard()), /block/i);
  const stale = deep(clean); stale.commitOrdinal += 1;
  assert.throws(() => commitBB2Start(opening, [], setup, stale, guard()), /head/i);
  const recovery = deep(clean); recovery.kind = 'RECOVERY';
  assert.throws(() => commitBB2Start(opening, [], setup, recovery, guard()), /recovery/i);
  const started = commitBB2Start(opening, [], setup, clean, guard());
  const next = start(setup, 'upper_b', started.events, 'session-2');
  assert.throws(() => commitBB2Start(opening, started.events, setup, next, guard(started.events)),
    /another workout is active/i);
});

console.log('BB2 Stage (ii) Start checks: ' + passed + '/10 ' + (process.exitCode ? 'FAIL' : 'PASS'));

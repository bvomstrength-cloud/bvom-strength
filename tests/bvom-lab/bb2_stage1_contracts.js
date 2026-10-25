// BB2 Revision 3.5.1 golden contracts. Run: node tests/bvom-lab/bb2_stage1_contracts.js
// Deliberately independent of the shipped index.html / BB1 application state.
'use strict';
const assert = require('node:assert/strict');
const {
  EVENT_TYPES, createBB2Opening, foldBB2Block, commitBB2Transaction,
  canonicalGrams, resolveNumericSubmission, discardBB2Session,
  planBB2Finish, createNextBB2Opening
} = require('../../bb2/ledger.cjs');

const ownerId = 'test-owner';
const K = 'upper_a|chest|bench';
const P = 'upper_a|row|row';
// The fixtures represent actual kg entries; an origin must be logged with the
// canonical grams, never guessed by the production fold.
const kgOrigin = grams => ({ value: String(grams / 1000), unit: 'kg' });
const withOrigins = value => {
  const v = { ...value };
  for (const [gramsField, originField] of [
    ['plannedG', 'plannedOrigin'], ['incrementG', 'incrementOrigin'],
    ['actualG', 'actualOrigin'], ['loadG', 'loadOrigin'],
    ['addedWeightG', 'addedWeightOrigin']
  ]) if (Object.hasOwn(v, gramsField) && !Object.hasOwn(v, originField)) {
    v[originField] = kgOrigin(v[gramsField]);
  }
  return v;
};
const slot = (roleSlotId, exerciseId, sets, plannedG, ceiling = 8, incrementG = 2500) =>
  withOrigins({ roleSlotId, exerciseId, sets, ceiling, plannedG, incrementG, equipment: 'loaded' });
const open = (progress = {}) => createBB2Opening({ ownerId, blockId: 'block-a',
  progress: Object.fromEntries(Object.entries(progress).map(([k, v]) => [k, withOrigins(v)])) });
const journal = () => {
  const events = [];
  const add = (type, fields = {}) => {
    const n = events.length + 1;
    const e = withOrigins({ type, eventId: `event-${n}`, commitOrdinal: n, blockId: 'block-a', ...fields });
    events.push(e); return e;
  };
  return { events, add };
};
const start = (add, sessionId, kind, slots, templateId = 'upper_a') =>
  add('WORKOUT_STARTED', { sessionId, templateId, kind, slots });
const sets = (add, sessionId, roleSlotId, exerciseId, loads, reps, hard = []) => {
  const recorded = [];
  for (let i = 0; i < loads.length; i++) recorded.push(add('SET_RECORDED', {
    sessionId, roleSlotId, exerciseId, setIndex: i, reps: reps[i], actualG: loads[i],
    harderThanIntended: hard.includes(i), prescribed: true
  }));
  return recorded;
};
const finish = (add, sessionId, creditId) => {
  add('WORKOUT_FINISHED', { sessionId });
  if (creditId) add('CREDIT_GRANTED', { sessionId, creditId });
};
const progressAt = (out, key = K) => out.progress[key];
const creditAt = (out, template = 'upper_a') => out.quotas[template];
const check = (name, fn) => {
  try { fn(); process.stdout.write(`PASS BB2-S1 ${name}\n`); }
  catch (error) { process.stderr.write(`FAIL BB2-S1 ${name}: ${error.stack}\n`); process.exitCode = 1; }
};

check('closed event inventory and strictly consecutive ordinals', () => {
  assert.ok(Object.isFrozen(EVENT_TYPES));
  assert.ok(EVENT_TYPES.includes('CHOICE_RECLASSIFIED'));
  assert.ok(EVENT_TYPES.includes('TOMBSTONE'));
  const b = open();
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 's1', templateId: 'upper_a', kind: 'NORMAL', slots: [slot('chest', 'bench', 3, 100000)] });
  assert.equal(foldBB2Block(b, events).headOrdinal, 1);
  assert.throws(() => foldBB2Block(b, [{ ...events[0], type: 'UNLISTED_DECISION' }]), /unsupported event/i);
  assert.throws(() => foldBB2Block(b, [{ ...events[0], commitOrdinal: 2 }]), /ordinal/i);
  assert.throws(() => foldBB2Block(b, [events[0], { ...events[0], eventId: 'other' }]), /ordinal/i);
  assert.throws(() => foldBB2Block({ ...b, foldRulesVersion: 999 }, []), /foldRulesVersion/i);
});

check('70 percent credit is not the exercise-progression gate', () => {
  const b = open({ [K]: { loadG: 100000, incrementG: 2500 } });
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 100000), slot('row', 'row', 9, 60000)]);
  sets(add, 's1', 'row', 'row', Array(9).fill(60000), Array(9).fill(8));
  finish(add, 's1', 'credit-1');
  const result = foldBB2Block(b, events);
  assert.equal(creditAt(result), 1); // ceil(12 * .7) = 9
  assert.equal(result.history[0].status, 'COMPLETED_NORMAL');
  assert.equal(result.history[0].prescribedCount, 12);
  assert.equal(result.history[0].validCount, 9);
  assert.equal(progressAt(result).loadG, 100000); // omitted bench cannot progress
  assert.equal(progressAt(result).calibrated, false);
  assert.equal(progressAt(result, P).calibrated, true);
});

check('first mixed calibration has no baseline; later identical exposure stalls only on repetition', () => {
  const b = open({ [K]: { loadG: 100000, incrementG: 2500 } });
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  sets(add, 's1', 'chest', 'bench', [80000, 90000, 100000], [8, 8, 8]);
  add('CALIBRATION_ACCEPTED', { sessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench', loadG: 100000 });
  finish(add, 's1', 'credit-1');
  start(add, 's2', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  sets(add, 's2', 'chest', 'bench', [100000, 100000, 100000], [8, 8, 7]);
  finish(add, 's2', 'credit-2');
  let r = foldBB2Block(b, events);
  assert.deepEqual([progressAt(r).loadG, progressAt(r).bestReps, progressAt(r).stallCount, creditAt(r)], [100000, 23, 0, 2]);
  start(add, 's3', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  sets(add, 's3', 'chest', 'bench', [100000, 100000, 100000], [8, 8, 7]);
  finish(add, 's3', 'credit-3');
  r = foldBB2Block(b, events);
  assert.deepEqual([progressAt(r).bestReps, progressAt(r).stallCount], [23, 1]);
});

check('corrected earlier progression never rewrites a later saved plan; only qualifying Finish promotes', () => {
  const b = open({ [K]: { loadG: 100000, incrementG: 2500, calibrated: true, bestReps: 22 } });
  const { events, add } = journal();
  start(add, 'sA', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  const [first] = sets(add, 'sA', 'chest', 'bench', [100000, 100000, 100000], [8, 8, 8]);
  // Original A qualifies at its ceiling; a correction later makes it ineligible for an increase.
  finish(add, 'sA', 'credit-A');
  start(add, 'sB', 'NORMAL', [slot('chest', 'bench', 3, 102500)]);
  sets(add, 'sB', 'chest', 'bench', [102500, 102500, 102500], [8, 8, 7]);
  finish(add, 'sB', 'credit-B');
  add('SET_CORRECTED', { sessionId: 'sA', targetEventId: first.eventId, reps: 7, actualG: 100000 });
  const r = foldBB2Block(b, events);
  assert.deepEqual([progressAt(r).loadG, progressAt(r).bestReps, progressAt(r).stallCount], [102500, 23, 0]);
  assert.equal(r.history.find(h => h.sessionId === 'sB').slots[0].plannedG, 102500);
});

check('Discard tombstones session-only records and keeps committed global edit at original ordinal', () => {
  const b = open({ [K]: { loadG: 100000, incrementG: 2500 } });
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  const edited = add('PRESCRIPTION_EDITED', { sessionId: 's1', templateId: 'upper_a', roleSlotId: 'chest', exerciseId: 'bench', loadG: 105000, scope: 'GLOBAL' });
  add('EXERCISE_LOCKED', { sessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench', plannedG: 105000 });
  sets(add, 's1', 'chest', 'bench', [105000], [8]);
  add('CALIBRATION_PLAN_REVISED', { sessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench', plannedG: 107500 });
  const discarded = discardBB2Session(events, 's1');
  const r = foldBB2Block(b, discarded);
  assert.equal(r.progress[K].loadG, 105000);
  assert.equal(r.history.length, 0);
  assert.equal(r.quotas.upper_a, 0);
  assert.equal(discarded.find(e => e.eventId === edited.eventId).type, 'PRESCRIPTION_EDITED');
  assert.equal(discarded.filter(e => e.type === 'TOMBSTONE').length, 4);
  assert.deepEqual(discarded.map(e => e.commitOrdinal), [1, 2, 3, 4, 5, 6]);
  assert.equal(JSON.stringify(discarded).includes('107500'), false);
});

check('102.5 kg displays as 226 lb but unchanged submitted plan and set inherit 102500 grams', () => {
  assert.equal(canonicalGrams('226', 'lb'), 102512);
  assert.equal(canonicalGrams('102.5', 'kg'), 102500);
  const existing = { grams: 102500, displayed: '226', unit: 'lb', originalValue: '102.5', originalUnit: 'kg' };
  assert.deepEqual(resolveNumericSubmission(existing, '226', 'lb', 'PRESCRIPTION'), { grams: 102500,
    origin: { value: '102.5', unit: 'kg' }, inherited: true, emitEvent: false });
  assert.deepEqual(resolveNumericSubmission(existing, '226', 'lb', 'ACTUAL'), { grams: 102500,
    origin: { value: '102.5', unit: 'kg' }, inherited: true, emitEvent: false });
  assert.deepEqual(resolveNumericSubmission(existing, '226', 'lb', 'DIFFERENT_ACTUAL'), { grams: 102512,
    origin: { value: '226', unit: 'lb' }, inherited: false, emitEvent: true });
  assert.throws(() => resolveNumericSubmission(existing, '225', 'lb', 'ACTUAL'), /different actual/i);
  const shownIncrement = { grams: 2500, displayed: '5.5', unit: 'lb', originalValue: '2.5', originalUnit: 'kg' };
  for (let n = 0; n < 10; n++) {
    assert.deepEqual(resolveNumericSubmission(existing, '226', 'lb', 'PRESCRIPTION'), {
      grams: 102500, origin: { value: '102.5', unit: 'kg' }, inherited: true, emitEvent: false
    });
    assert.deepEqual(resolveNumericSubmission(shownIncrement, '5.5', 'lb', 'INCREMENT'), {
      grams: 2500, origin: { value: '2.5', unit: 'kg' }, inherited: true, emitEvent: false
    });
  }
  assert.equal(canonicalGrams('0.0005', 'kg'), 1); // half-gram tie upward
});

check('numeric entry origin is immutable through display-only conversion, correction and seal', () => {
  const original = { grams: 102500, displayed: '226', unit: 'lb', originalValue: '102.5', originalUnit: 'kg' };
  const inherited = resolveNumericSubmission(original, '226', 'lb', 'ACTUAL');
  const changed = resolveNumericSubmission(original, '226', 'lb', 'DIFFERENT_ACTUAL');
  assert.deepEqual(inherited.origin, { value: '102.5', unit: 'kg' });
  assert.deepEqual(changed.origin, { value: '226', unit: 'lb' });
  const b = open({ [K]: { loadG: 102500, incrementG: 2500, calibrated: true, bestReps: 18 } });
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 2, 102500)]);
  const first = add('SET_RECORDED', { sessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench',
    setIndex: 0, reps: 7, prescribed: true, actualG: inherited.grams, actualOrigin: inherited.origin });
  add('SET_RECORDED', { sessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench',
    setIndex: 1, reps: 7, prescribed: true, actualG: inherited.grams, actualOrigin: inherited.origin });
  add('UNIT_METADATA', { unit: 'lb' });
  finish(add, 's1', 'credit-s1');
  let r = foldBB2Block(b, events);
  assert.equal(r.history[0].sets[0].actualG, 102500);
  assert.deepEqual(r.history[0].sets[0].actualOrigin, { value: '102.5', unit: 'kg' });
  assert.deepEqual(r.history[0].slots[0].plannedOrigin, { value: '102.5', unit: 'kg' });
  assert.deepEqual(r.progress[K].loadOrigin, { value: '102.5', unit: 'kg' });
  assert.equal(r.progress[K].bestReps, 18); // two 7s do not beat the prior 18
  add('SET_CORRECTED', { sessionId: 's1', targetEventId: first.eventId,
    reps: 7, actualG: changed.grams, actualOrigin: changed.origin });
  r = foldBB2Block(b, events);
  assert.equal(r.history[0].sets[0].actualG, 102512);
  assert.deepEqual(r.history[0].sets[0].actualOrigin, { value: '226', unit: 'lb' });
  assert.equal(r.history[0].sets[1].actualG, 102500);
  assert.deepEqual(r.history[0].sets[1].actualOrigin, { value: '102.5', unit: 'kg' });
  assert.equal(r.progress[K].loadG, 102500); // mixed actuals cannot rewrite plan
  assert.deepEqual(r.progress[K].loadOrigin, { value: '102.5', unit: 'kg' });
});

check('fail-closed numeric event provenance and malformed event payloads', () => {
  const b = open();
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 2, 102500)]);
  const saved = JSON.stringify(events);
  const badPlan = structuredClone(events);
  delete badPlan[0].slots[0].plannedOrigin;
  assert.throws(() => foldBB2Block(b, badPlan), /planned origin/i);
  const badGrams = structuredClone(events);
  badGrams[0].slots[0].plannedOrigin = { value: '226', unit: 'lb' };
  assert.throws(() => foldBB2Block(b, badGrams), /planned origin/i);
  const missingActualOrigin = [{ type: 'SET_RECORDED', eventId: 'missing-provenance',
    commitOrdinal: 2, blockId: 'block-a', sessionId: 's1', roleSlotId: 'chest',
    exerciseId: 'bench', setIndex: 0, reps: 8, prescribed: true, actualG: 102500 }];
  assert.throws(() => foldBB2Block(b, [...events, ...missingActualOrigin]), /actual origin/i);
  const mismatchedActual = [{ ...missingActualOrigin[0], actualOrigin: { value: '226', unit: 'lb' } }];
  assert.throws(() => foldBB2Block(b, [...events, ...mismatchedActual]), /actual origin/i);
  const malformed = { type: 'NOTE_EDITED', eventId: 'bad-note', commitOrdinal: 2,
    blockId: 'block-a', sessionId: 's1' };
  assert.throws(() => foldBB2Block(b, [...events, malformed]), /note text/i);
  assert.equal(JSON.stringify(events), saved);
});

check('stale correction preview or active BVOM workout is rejected atomically', () => {
  const b = open();
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  const original = JSON.stringify(events);
  const extra = [{ type: 'NOTE_EDITED', eventId: 'note', commitOrdinal: 2, blockId: 'block-a', sessionId: 's1', text: 'test' }];
  assert.throws(() => commitBB2Transaction(b, events, extra, { ownerId, blockId: 'block-a', foldRulesVersion: 1, expectedHead: 0, sealRevision: 0, activeWorkout: false }), /stale/i);
  assert.throws(() => commitBB2Transaction(b, events, extra, { ownerId, blockId: 'block-a', foldRulesVersion: 1, expectedHead: 1, sealRevision: 0, activeWorkout: true, retrospective: true }), /active workout/i);
  assert.equal(JSON.stringify(events), original);
});

check('revoked eighth credit cannot displace its replacement when old session becomes eligible again', () => {
  const b = open();
  const { events, add } = journal();
  let original;
  for (let i = 1; i <= 8; i++) {
    start(add, `s${i}`, 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
    const entries = sets(add, `s${i}`, 'chest', 'bench', [100000, 100000, 100000], [7, 7, 7]);
    if (i === 8) original = entries[0];
    finish(add, `s${i}`, `credit-${i}`);
  }
  assert.equal(creditAt(foldBB2Block(b, events)), 8);
  add('SET_VOIDED', { sessionId: 's8', targetEventId: original.eventId });
  add('CREDIT_REVOKED', { sessionId: 's8', creditId: 'credit-8' });
  assert.equal(creditAt(foldBB2Block(b, events)), 7);
  start(add, 'replacement', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  sets(add, 'replacement', 'chest', 'bench', [100000, 100000, 100000], [7, 7, 7]);
  finish(add, 'replacement', 'replacement-credit');
  add('SET_CORRECTED', { sessionId: 's8', targetEventId: original.eventId, reps: 7, actualG: 100000 });
  const r = foldBB2Block(b, events);
  assert.equal(creditAt(r), 8);
  assert.equal(r.history.find(x => x.sessionId === 's8').status, 'COMPLETED_NORMAL_NONCREDIT');
  assert.equal(r.history.find(x => x.sessionId === 's8').sets[0].setIndex, 0);
  assert.equal(r.history.find(x => x.sessionId === 'replacement').creditId, 'replacement-credit');
  assert.throws(() => foldBB2Block(b, [...events, { type: 'CREDIT_REGRANTED',
    eventId: 'bad-regrant', commitOrdinal: events.length + 1, blockId: 'block-a',
    sessionId: 's8', creditId: 'second-grant-s8' }]), /quota full/i);
});

check('ACCEPT 55 seeds same-exposure best; a later qualified same-value Finish supersedes consent', () => {
  const b = open({ [K]: { loadG: 60000, incrementG: 2500, calibrated: true, bestReps: 15 } });
  const { events, add } = journal();
  start(add, 'A', 'NORMAL', [slot('chest', 'bench', 3, 60000)]);
  const aRecords = sets(add, 'A', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7]);
  finish(add, 'A', 'credit-A');
  const accept = add('CHOICE_RESOLVED', { sourceSessionId: 'A', roleSlotId: 'chest', exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000 });
  let r = foldBB2Block(b, events);
  assert.deepEqual([progressAt(r).loadG, progressAt(r).bestReps, progressAt(r).stallCount], [55000, 21, 0]);
  start(add, 'B', 'NORMAL', [slot('chest', 'bench', 3, 55000)]);
  const bRecords = sets(add, 'B', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7]);
  finish(add, 'B', 'credit-B');
  add('SET_CORRECTED', { sessionId: 'A', targetEventId: aRecords[0].eventId, reps: 7, actualG: 50000 });
  r = foldBB2Block(b, events);
  assert.deepEqual(r.requiredConsent, []); // B's full on-plan Finish reaffirmed 55
  assert.deepEqual([progressAt(r).loadG, progressAt(r).bestReps], [55000, 21]);
  add('SET_VOIDED', { sessionId: 'B', targetEventId: bRecords[2].eventId });
  add('CREDIT_REVOKED', { sessionId: 'B', creditId: 'credit-B' });
  r = foldBB2Block(b, events);
  assert.deepEqual(r.requiredConsent, [{ choiceEventId: accept.eventId, sourceSessionId: 'A', key: K, valueG: 55000 }]);
  const still = JSON.stringify(events);
  assert.throws(() => commitBB2Transaction(b, events.slice(0, -2), events.slice(-2), {
    ownerId, blockId: 'block-a', foldRulesVersion: 1, expectedHead: events.length - 2, sealRevision: 0, retrospective: true, activeWorkout: false
  }), /consent/i);
  assert.equal(JSON.stringify(events), still);
  add('CHOICE_RECLASSIFIED', { targetEventId: accept.eventId, decision: 'KEEP_AS_MANUAL' });
  r = foldBB2Block(b, events);
  assert.deepEqual(r.requiredConsent, []);
  assert.deepEqual([progressAt(r).loadG, progressAt(r).bestReps, progressAt(r).stallCount], [55000, null, 0]);
  assert.equal(progressAt(r).epochId, `choice:${accept.eventId}`); // original, not reclassification ordinal
});

check('unqualified Start, recovery, incomplete and hard effort cannot supersede accepted consent', () => {
  const cases = ['INCOMPLETE', 'RECOVERY', 'HARD'];
  for (const mode of cases) {
    const b = open({ [K]: { loadG: 60000, incrementG: 2500, calibrated: true } });
    const { events, add } = journal();
    start(add, 'A', 'NORMAL', [slot('chest', 'bench', 3, 60000)]);
    const entries = sets(add, 'A', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7]);
    finish(add, 'A', 'credit-A');
    const accepted = add('CHOICE_RESOLVED', { sourceSessionId: 'A', roleSlotId: 'chest', exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000 });
    start(add, 'B', mode === 'RECOVERY' ? 'RECOVERY' : 'NORMAL', [slot('chest', 'bench', 3, 55000)]);
    sets(add, 'B', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7], mode === 'HARD' ? [1] : []);
    if (mode === 'INCOMPLETE') add('WORKOUT_INCOMPLETE', { sessionId: 'B' });
    else finish(add, 'B', mode === 'HARD' ? 'credit-B' : null);
    add('SET_CORRECTED', { sessionId: 'A', targetEventId: entries[0].eventId, reps: 7, actualG: 50000 });
    const r = foldBB2Block(b, events);
    assert.equal(r.requiredConsent[0]?.choiceEventId, accepted.eventId, mode);
    assert.equal(progressAt(r).loadG, 55000, mode);
  }
});

check('off-plan ACCEPT at the ceiling earns from actual 55, not hypothetical 60', () => {
  const b = open({ [K]: { loadG: 60000, incrementG: 2500, calibrated: true } });
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 60000)]);
  sets(add, 's1', 'chest', 'bench', [55000, 55000, 55000], [8, 8, 8]);
  finish(add, 's1', 'credit-1');
  assert.deepEqual(foldBB2Block(b, events).pending[K], { kind: 'OFF_PLAN', sessionId: 's1', valueG: 55000, plannedG: 60000 });
  assert.throws(() => {
    const next = { ...events[0], eventId: 'new-start', commitOrdinal: events.length + 1, sessionId: 's2', slots: [slot('chest', 'bench', 3, 60000)] };
    foldBB2Block(b, [...events, next]);
  }, /unresolved choice/i);
  add('CHOICE_RESOLVED', { sourceSessionId: 's1', roleSlotId: 'chest', exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000 });
  const r = foldBB2Block(b, events);
  assert.deepEqual([r.progress[K].loadG, r.progress[K].bestReps, r.progress[K].stallCount], [57500, null, 0]);
  assert.equal(r.quotas.upper_a, 1);
  assert.equal(Object.keys(r.pending).length, 0);
});

check('bodyweight all-at-top asks for explicit direction and never invents numeric added weight', () => {
  const bwSlot = withOrigins({ roleSlotId: 'vertical', exerciseId: 'pullup', equipment: 'bodyweight',
    variation: 'pull-up', assistance: 'none', sets: 2, ceiling: 12, plannedG: 0, incrementG: 1000 });
  const b = open();
  const { events, add } = journal();
  const doSession = (sid, reps) => {
    start(add, sid, 'NORMAL', [bwSlot]);
    for (let i = 0; i < 2; i++) add('SET_RECORDED', { sessionId: sid, roleSlotId: 'vertical', exerciseId: 'pullup',
      setIndex: i, reps: reps[i], actualG: 0, variation: 'pull-up', assistance: 'none', prescribed: true });
    finish(add, sid, `credit-${sid}`);
  };
  doSession('s1', [12, 12]); // first-exposure calibration suppression
  assert.equal(foldBB2Block(b, events).pending['upper_a|vertical|pullup'], undefined);
  doSession('s2', [12, 12]);
  const r = foldBB2Block(b, events);
  assert.equal(r.pending['upper_a|vertical|pullup'].kind, 'DIFFICULTY');
  assert.equal(r.progress['upper_a|vertical|pullup'].loadG, 0);
  assert.equal(r.quotas.upper_a, 2);
});

check('32 credits seal the prior block; inactive records and stable History survive', () => {
  const b = open();
  const { events, add } = journal();
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sid = `${templateId}-${i}`;
      start(add, sid, 'NORMAL', [slot('chest', 'bench', 3, 100000)], templateId);
      sets(add, sid, 'chest', 'bench', [100000, 100000, 100000], [7, 7, 7]);
      finish(add, sid, `credit-${sid}`);
    }
  }
  const pre = foldBB2Block(b, events);
  assert.deepEqual(pre.quotas, { upper_a: 8, lower_a: 8, upper_b: 8, lower_b: 8 });
  assert.equal(pre.history.length, 32);
  add('BLOCK_SEALED', { sealId: 'seal-a' });
  const r = foldBB2Block(b, events);
  assert.equal(r.sealed, true);
  assert.equal(r.closingSnapshot.foldRulesVersion, 1);
  assert.deepEqual(r.closingSnapshot.progress['upper_a|chest|bench'].loadOrigin,
    { value: '100', unit: 'kg' });
  assert.equal(r.closingSnapshot.priorCreditIds.length, 32);
  assert.equal(r.sealRevision, 1);
  const next = createNextBB2Opening(r, 'block-b');
  assert.equal(next.blockId, 'block-b');
  assert.deepEqual(next.previousQuotas, { upper_a: 8, lower_a: 8, upper_b: 8, lower_b: 8 });
  assert.equal(next.sealRevision, 1);
  assert.equal(foldBB2Block(next, []).quotas.upper_a, 0);
  assert.equal(foldBB2Block(next, []).progress['upper_a|chest|bench'].calibrated, true);
  const corrected = { type: 'SET_CORRECTED', blockId: 'block-a', eventId: 'late-correction',
    commitOrdinal: events.length + 1, sessionId: 'upper_a-0', targetEventId: 'event-2',
    reps: 6, actualG: 100000, actualOrigin: kgOrigin(100000) };
  assert.throws(() => foldBB2Block(b, [...events, corrected]), /sealed block/i);
});

check('Finish planner is idempotent and credit grants exactly once', () => {
  const b = open();
  const { events, add } = journal();
  start(add, 's1', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  sets(add, 's1', 'chest', 'bench', [100000, 100000, 100000], [7, 7, 7]);
  const first = planBB2Finish(b, events, 's1');
  assert.equal(first.noOp, false);
  assert.equal(first.projection.quotas.upper_a, 1);
  assert.equal(first.projection.history[0].sessionId, 's1');
  const again = planBB2Finish(b, first.events, 's1');
  assert.equal(again.noOp, true);
  assert.deepEqual(again.events, first.events);
  assert.deepEqual(again.projection.quotas, first.projection.quotas);
  assert.equal(first.events.filter(e => e.type === 'CREDIT_GRANTED').length, 1);
});

check('fixed consent golden: removing both superseders needs KEEP at later ordinal without repricing A', () => {
  const b = open(), { events, add } = journal();
  const bench = slot('chest', 'bench', 3, 60000);
  start(add, 'A', 'NORMAL', [bench]);
  const a = sets(add, 'A', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7]);
  finish(add, 'A');
  const accepted = add('CHOICE_RESOLVED', { sourceSessionId: 'A', roleSlotId: 'chest',
    exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000 });
  start(add, 'B', 'NORMAL', [slot('chest', 'bench', 3, 55000)]);
  const later = sets(add, 'B', 'chest', 'bench', [55000, 55000, 55000], [7, 7, 7]);
  finish(add, 'B');
  add('SET_VOIDED', { sessionId: 'A', targetEventId: a[0].eventId });
  assert.deepEqual(foldBB2Block(b, events).requiredConsent, []);
  add('SET_VOIDED', { sessionId: 'B', targetEventId: later[0].eventId });
  assert.deepEqual(foldBB2Block(b, events).requiredConsent, [
    { choiceEventId: accepted.eventId, sourceSessionId: 'A',
      key: K, valueG: 55000 }
  ]);
  add('CHOICE_RECLASSIFIED', { targetEventId: accepted.eventId,
    decision: 'KEEP_AS_MANUAL' });
  const out = foldBB2Block(b, events), p = progressAt(out);
  assert.deepEqual({
    headOrdinal: out.headOrdinal, quotas: out.quotas,
    loadG: p.loadG, epochId: p.epochId,
    calibrated: p.calibrated, bestReps: p.bestReps,
    stallCount: p.stallCount, requiredConsent: out.requiredConsent,
    history: out.history.map(h => ({ sessionId: h.sessionId,
      finishOrdinal: h.finishOrdinal, status: h.status,
      validCount: h.validCount, creditId: h.creditId }))
  }, {
    headOrdinal: 14, quotas: { upper_a: 0, lower_a: 0, upper_b: 0, lower_b: 0 },
    loadG: 55000, epochId: 'choice:event-6',
    calibrated: false, bestReps: null, stallCount: 0, requiredConsent: [],
    history: [
      { sessionId: 'A', finishOrdinal: 5, status: 'INCOMPLETE_CORRECTED', validCount: 2, creditId: null },
      { sessionId: 'B', finishOrdinal: 11, status: 'INCOMPLETE_CORRECTED', validCount: 2, creditId: null }
    ]
  });
  assert.equal(events.at(-1).loadG, undefined, 'KEEP is audit only, not a new weight event');
});

check('fixed credit golden: two revoke/regrant cycles preserve Finish and unique active lineage', () => {
  const b = open(), { events, add } = journal();
  start(add, 'A', 'NORMAL', [slot('chest', 'bench', 3, 100000)]);
  const recorded = sets(add, 'A', 'chest', 'bench', [100000, 100000, 100000], [7, 7, 7]);
  finish(add, 'A', 'credit-original');
  for (let round = 1; round <= 2; round++) {
    add('SET_VOIDED', { sessionId: 'A', targetEventId: recorded[0].eventId });
    add('CREDIT_REVOKED', { sessionId: 'A',
      creditId: round === 1 ? 'credit-original' : 'credit-regrant-1' });
    add('SET_CORRECTED', { sessionId: 'A', targetEventId: recorded[0].eventId, reps: 7 });
    add('CREDIT_REGRANTED', { sessionId: 'A', creditId: 'credit-regrant-' + round });
  }
  const out = foldBB2Block(b, events), p = progressAt(out);
  assert.deepEqual({
    headOrdinal: out.headOrdinal, quotas: out.quotas,
    activeCredits: out.activeCredits, creditLedger: out.creditLedger,
    loadG: p.loadG, calibrated: p.calibrated, bestReps: p.bestReps,
    stallCount: p.stallCount,
    history: out.history.map(h => ({ sessionId: h.sessionId,
      finishOrdinal: h.finishOrdinal, status: h.status, creditId: h.creditId,
      prescribedCount: h.prescribedCount, validCount: h.validCount }))
  }, {
    headOrdinal: 14, quotas: { upper_a: 1, lower_a: 0, upper_b: 0, lower_b: 0 },
    activeCredits: { A: 'credit-regrant-2' },
    creditLedger: {
      'credit-original': { sessionId: 'A', templateId: 'upper_a', active: false,
        grantEventId: 'event-6', grantOrdinal: 6, previousCreditId: null,
        revokeEventId: 'event-8', revokeOrdinal: 8 },
      'credit-regrant-1': { sessionId: 'A', templateId: 'upper_a', active: false,
        grantEventId: 'event-10', grantOrdinal: 10, previousCreditId: 'credit-original',
        revokeEventId: 'event-12', revokeOrdinal: 12 },
      'credit-regrant-2': { sessionId: 'A', templateId: 'upper_a', active: true,
        grantEventId: 'event-14', grantOrdinal: 14, previousCreditId: 'credit-regrant-1' }
    },
    loadG: 100000, calibrated: true, bestReps: 21, stallCount: 0,
    history: [{ sessionId: 'A', finishOrdinal: 5, status: 'COMPLETED_NORMAL',
      creditId: 'credit-regrant-2', prescribedCount: 3, validCount: 3 }]
  });
});

check('fixed event-order golden: unit metadata, load/increment edits and swap retain independent effects', () => {
  const b = open({ [K]: { loadG: 100000, incrementG: 2500,
    calibrated: true, bestReps: 20, stallCount: 2, epochId: 'earlier-exposure' } });
  const { events, add } = journal();
  add('UNIT_METADATA', { unit: 'lb' });
  add('PRESCRIPTION_EDITED', { templateId: 'upper_a', roleSlotId: 'chest',
    exerciseId: 'bench', scope: 'GLOBAL', loadG: 105000 });
  add('INCREMENT_EDITED', { templateId: 'upper_a', roleSlotId: 'chest',
    exerciseId: 'bench', scope: 'GLOBAL', incrementG: 1250 });
  add('EXERCISE_SWAPPED', { templateId: 'upper_a', roleSlotId: 'chest',
    exerciseId: 'dumbbell-bench' });
  add('UNIT_METADATA', { unit: 'kg' });
  const out = foldBB2Block(b, events), p = progressAt(out);
  assert.deepEqual({
    headOrdinal: out.headOrdinal, quotas: out.quotas,
    progress: { loadG: p.loadG, loadOrigin: p.loadOrigin,
      incrementG: p.incrementG, incrementOrigin: p.incrementOrigin,
      calibrated: p.calibrated, epochId: p.epochId,
      bestReps: p.bestReps, stallCount: p.stallCount },
    selections: out.selections, unitMetadata: out.unitMetadata,
    history: out.history, pending: out.pending
  }, {
    headOrdinal: 5, quotas: { upper_a: 0, lower_a: 0, upper_b: 0, lower_b: 0 },
    progress: { loadG: 105000, loadOrigin: { value: '105', unit: 'kg' },
      incrementG: 1250, incrementOrigin: { value: '1.25', unit: 'kg' },
      calibrated: true, epochId: 'event:event-2', bestReps: null, stallCount: 0 },
    selections: { 'upper_a|chest': 'dumbbell-bench' },
    unitMetadata: [{ eventId: 'event-1', ordinal: 1, unit: 'lb' },
      { eventId: 'event-5', ordinal: 5, unit: 'kg' }],
    history: [], pending: {}
  });
});

if (!process.exitCode) process.stdout.write('BB2-STAGE1 GOLDEN: PASS\n');

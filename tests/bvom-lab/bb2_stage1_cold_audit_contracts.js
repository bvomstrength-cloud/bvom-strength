// Independent-review regressions for BB2 Stage (i), Rev 3.5.1.
// Run: node tests/bvom-lab/bb2_stage1_cold_audit_contracts.js
'use strict';
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { EVENT_TYPES, createBB2Opening, foldBB2Block, createNextBB2Opening,
  resolveNumericSubmission, commitBB2Transaction, planBB2Finish } = require('../../bb2/ledger.cjs');

const origin = grams => ({ value: String(grams / 1000), unit: 'kg' });
const opening = () => createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block' });
const slot = (name, plannedG = 60000, sets = 3) => ({
  roleSlotId: name, exerciseId: name, equipment: 'loaded', sets, ceiling: 8,
  plannedG, plannedOrigin: origin(plannedG), incrementG: 2500,
  incrementOrigin: origin(2500)
});
const journal = () => {
  const events = [];
  const add = (type, fields = {}) => {
    const event = { type, eventId: 'audit-' + (events.length + 1),
      commitOrdinal: events.length + 1, blockId: 'audit-block', ...fields };
    events.push(event);
    return event;
  };
  return { events, add };
};
let failures = 0;
function check(name, callback) {
  try { callback(); console.log('PASS BB2-COLD ' + name); }
  catch (error) { failures++; console.error('FAIL BB2-COLD ' + name + ': ' + error.stack); }
}

check('22 calibration choices complete within a bounded prefix-replay budget', () => {
  const { events, add } = journal();
  const slots = Array.from({ length: 22 }, (_, i) => slot('movement-' + i, 60000, 1));
  add('WORKOUT_STARTED', { sessionId: 'first-exposure', templateId: 'upper_a', kind: 'NORMAL', slots });
  for (const s of slots) {
    add('SET_RECORDED', { sessionId: 'first-exposure', roleSlotId: s.roleSlotId,
      exerciseId: s.exerciseId, setIndex: 0, reps: 7, prescribed: true,
      actualG: 60000, actualOrigin: origin(60000) });
    add('CALIBRATION_ACCEPTED', { sessionId: 'first-exposure',
      roleSlotId: s.roleSlotId, exerciseId: s.exerciseId,
      loadG: 60000, loadOrigin: origin(60000) });
  }
  add('WORKOUT_FINISHED', { sessionId: 'first-exposure' });
  const before = performance.now();
  const first = foldBB2Block(opening(), events);
  const elapsed = performance.now() - before;
  assert.ok(elapsed < 8000, 'prefix replay exceeded 8-second CI budget: ' + elapsed);
  assert.equal(Object.values(first.progress).filter(p => p.calibrated).length, 22);
  assert.deepEqual(foldBB2Block(opening(), events), first);
});

check('qualitative bodyweight difficulty acceptance never fabricates zero grams', () => {
  const { events, add } = journal();
  const bodyweight = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 8, variation: 'chinup', assistance: 'heavy-band' };
  for (const id of ['first', 'second']) {
    add('WORKOUT_STARTED', { sessionId: id, templateId: 'upper_a', kind: 'NORMAL',
      slots: [bodyweight] });
    add('SET_RECORDED', { sessionId: id, roleSlotId: 'pull', exerciseId: 'chinup',
      setIndex: 0, reps: 8, variation: 'chinup', assistance: 'heavy-band', prescribed: true });
    add('WORKOUT_FINISHED', { sessionId: id });
  }
  assert.equal(foldBB2Block(opening(), events).pending['upper_a|pull|chinup'].kind, 'DIFFICULTY');
  const acceptance = add('CHOICE_RESOLVED', { sourceSessionId: 'second',
    roleSlotId: 'pull', exerciseId: 'chinup', decision: 'DIFFICULTY_ACCEPT',
    variation: 'chinup', assistance: 'light-band' });
  const explicitlyLoaded = structuredClone(events);
  explicitlyLoaded.at(-1).addedWeightG = 5000;
  explicitlyLoaded.at(-1).addedWeightOrigin = origin(5000);
  assert.equal(foldBB2Block(opening(), explicitlyLoaded).progress['upper_a|pull|chinup'].loadG,
    5000, 'a consciously chosen added load must remain expressible');
  const result = foldBB2Block(opening(), events);
  assert.equal(result.progress['upper_a|pull|chinup'].loadG, null);
  assert.equal(result.progress['upper_a|pull|chinup'].loadOrigin, null);
  assert.equal(result.progress['upper_a|pull|chinup'].epochId, 'choice:' + acceptance.eventId);
  assert.equal(result.progress['upper_a|pull|chinup'].assistance, 'light-band');
  add('WORKOUT_STARTED', { sessionId: 'third', templateId: 'upper_a', kind: 'NORMAL',
    slots: [{ ...bodyweight, assistance: 'light-band' }] });
  add('SET_RECORDED', { sessionId: 'third', roleSlotId: 'pull', exerciseId: 'chinup',
    setIndex: 0, reps: 7, variation: 'chinup', assistance: 'light-band', prescribed: true });
  add('WORKOUT_FINISHED', { sessionId: 'third' });
  const after = foldBB2Block(opening(), events).progress['upper_a|pull|chinup'];
  assert.equal(after.loadG, null);
  assert.equal(after.epochId, 'choice:' + acceptance.eventId,
    'qualitative follow-up must not invent a different load epoch');
});

check('REPLACE confirming equal grams resets comparable epoch and performance', () => {
  // The source is a genuine post-calibration OFF_PLAN offer; first-exposure
  // calibration deliberately cannot issue the ordinary ACCEPT/KEEP choice.
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { 'upper_a|bench|bench': { calibrated: true, loadG: 60000,
      loadOrigin: origin(60000) } } });
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'source', templateId: 'upper_a', kind: 'NORMAL',
    slots: [slot('bench')] });
  const records = Array.from({ length: 3 }, (_, index) => add('SET_RECORDED', {
    sessionId: 'source', roleSlotId: 'bench', exerciseId: 'bench', setIndex: index,
    reps: 7, prescribed: true, actualG: 55000, actualOrigin: origin(55000)
  }));
  add('WORKOUT_FINISHED', { sessionId: 'source' });
  const accepted = add('CHOICE_RESOLVED', { sourceSessionId: 'source', roleSlotId: 'bench',
    exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000, loadOrigin: origin(55000) });
  add('SET_CORRECTED', { sessionId: 'source', targetEventId: records[0].eventId,
    reps: 7, actualG: 50000, actualOrigin: origin(50000) });
  assert.deepEqual(foldBB2Block(b, events).requiredConsent.map(x => x.choiceEventId),
    [accepted.eventId]);
  const replaced = add('CHOICE_REPLACED', { targetEventId: accepted.eventId,
    sourceSessionId: 'source', roleSlotId: 'bench', exerciseId: 'bench',
    decision: 'REPLACE', loadG: 55000, loadOrigin: origin(55000) });
  const result = foldBB2Block(b, events);
  const p = result.progress['upper_a|bench|bench'];
  assert.deepEqual(result.requiredConsent, []);
  assert.deepEqual([p.loadG, p.epochId, p.bestReps, p.stallCount],
    [55000, 'choice:' + replaced.eventId, null, 0]);
});

check('restored credit regrant cannot be posted during another active workout', () => {
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'A', templateId: 'upper_a', kind: 'NORMAL',
    slots: [slot('bench')] });
  const recorded = Array.from({ length: 3 }, (_, i) => add('SET_RECORDED', {
    sessionId: 'A', roleSlotId: 'bench', exerciseId: 'bench', setIndex: i,
    reps: 7, prescribed: true, actualG: 60000, actualOrigin: origin(60000) }));
  add('WORKOUT_FINISHED', { sessionId: 'A' });
  add('CREDIT_GRANTED', { sessionId: 'A', creditId: 'credit-A' });
  add('SET_VOIDED', { sessionId: 'A', targetEventId: recorded[0].eventId });
  add('CREDIT_REVOKED', { sessionId: 'A', creditId: 'credit-A' });
  add('SET_CORRECTED', { sessionId: 'A', targetEventId: recorded[0].eventId, reps: 7 });
  add('WORKOUT_STARTED', { sessionId: 'B', templateId: 'upper_b', kind: 'NORMAL',
    slots: [slot('bench')] });
  add('CREDIT_REGRANTED', { sessionId: 'A', creditId: 'credit-A-new' });
  assert.throws(() => foldBB2Block(opening(), events), /active workout.*credit|credit.*active workout/i);
});

check('unknown event and slot fields are rejected rather than silently persisted', () => {
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'A', templateId: 'upper_a', kind: 'NORMAL',
    slots: [slot('bench')] });
  const unknownEvent = structuredClone(events);
  unknownEvent[0].injectedPrescription = 5;
  assert.throws(() => foldBB2Block(opening(), unknownEvent), /unknown|unsupported|unexpected/i);
  const unknownSlot = structuredClone(events);
  unknownSlot[0].slots[0].unrecognisedRepFloor = 1;
  assert.throws(() => foldBB2Block(opening(), unknownSlot), /unknown|unsupported|unexpected/i);
  for (const type of EVENT_TYPES) {
    const probe = [{ type, eventId: 'probe', commitOrdinal: 1,
      blockId: 'audit-block', ...(type === 'TOMBSTONE' ? { discardedSessionId: 'lost' } : {}),
      unexpectedFuturePayload: true }];
    assert.throws(() => foldBB2Block(opening(), probe),
      /unknown|unsupported|unexpected|tombstone cannot retain/i, type);
  }
  const unknownMassOrigin = structuredClone(events);
  unknownMassOrigin[0].slots[0].plannedOrigin.injected = 'future';
  assert.throws(() => foldBB2Block(opening(), unknownMassOrigin), /unknown.*origin.*field/i);
});

check('unchanged displayed earned weights inherit source-event provenance', () => {
  const derived = { grams: 102500, displayed: '226', unit: 'lb',
    origin: { kind: 'DERIVED', sourceEventId: 'finish-A' } };
  for (const intent of ['PRESCRIPTION', 'ACTUAL', 'INCREMENT']) {
    assert.deepEqual(resolveNumericSubmission(derived, '226', 'lb', intent), {
      grams: 102500, origin: { kind: 'DERIVED', sourceEventId: 'finish-A' },
      inherited: true, emitEvent: false
    });
  }
  assert.deepEqual(resolveNumericSubmission(derived, '226', 'lb', 'DIFFERENT_ACTUAL'), {
    grams: 102512, origin: { value: '226', unit: 'lb' },
    inherited: false, emitEvent: true
  });
});

check('sealed qualitative difficulty carries to next block without invented grams', () => {
  const { events, add } = journal();
  const bodyweight = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 8, variation: 'chinup', assistance: 'heavy-band' };
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sessionId = templateId + '-' + i;
      const bw = templateId === 'upper_a';
      const s = bw ? bodyweight : slot('movement');
      add('WORKOUT_STARTED', { sessionId, templateId, kind: 'NORMAL', slots: [s] });
      for (let index = 0; index < s.sets; index++) {
        add('SET_RECORDED', { sessionId, roleSlotId: s.roleSlotId, exerciseId: s.exerciseId,
          setIndex: index, reps: bw && i === 7 ? 8 : 7, prescribed: true,
          ...(bw ? { variation: 'chinup', assistance: 'heavy-band' } :
            { actualG: 60000, actualOrigin: origin(60000) }) });
      }
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  add('BLOCK_SEALED', { sealId: 'qualitative-seal' });
  const sealed = foldBB2Block(opening(), events);
  assert.equal(sealed.closingSnapshot.pending['upper_a|pull|chinup'].kind, 'DIFFICULTY');
  assert.equal(sealed.closingSnapshot.pending['upper_a|pull|chinup'].addedWeightG, undefined);
  const next = createNextBB2Opening(opening(), events, 'next-block');
  const decision = { type: 'CHOICE_RESOLVED', eventId: 'carried-accept', commitOrdinal: 1,
    blockId: 'next-block', sourceBlockId: 'audit-block', sourceSessionId: 'upper_a-7',
    roleSlotId: 'pull', exerciseId: 'chinup', decision: 'DIFFICULTY_ACCEPT',
    variation: 'chinup', assistance: 'light-band' };
  const accepted = foldBB2Block(next, [decision]);
  const p = accepted.progress['upper_a|pull|chinup'];
  assert.deepEqual([p.loadG, p.loadOrigin, p.assistance, p.epochId],
    [null, null, 'light-band', 'choice:carried-accept']);
  assert.deepEqual(accepted.pending, {});
  const loadedDecision = { ...decision, addedWeightG: 5000,
    addedWeightOrigin: origin(5000) };
  assert.equal(foldBB2Block(next, [loadedDecision]).progress['upper_a|pull|chinup'].loadG,
    5000, 'a next-block qualitative offer can be accepted with explicit added load');
  const unchanged = { ...decision, assistance: 'heavy-band' };
  assert.throws(() => foldBB2Block(next, [unchanged]),
    /difficulty acceptance must change/i,
    'a carried choice cannot reset the epoch without an actual difficulty change');
});

check('qualitative difficulty correction may REPLACE with no fictitious grams', () => {
  const { events, add } = journal();
  const bw = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 8, variation: 'chinup', assistance: 'heavy-band' };
  for (const id of ['A', 'B']) {
    add('WORKOUT_STARTED', { sessionId: id, templateId: 'upper_a', kind: 'NORMAL', slots: [bw] });
    const set = add('SET_RECORDED', { sessionId: id, roleSlotId: 'pull', exerciseId: 'chinup',
      setIndex: 0, reps: 8, prescribed: true, variation: 'chinup', assistance: 'heavy-band' });
    add('WORKOUT_FINISHED', { sessionId: id });
    if (id === 'B') {
      const accepted = add('CHOICE_RESOLVED', { sourceSessionId: id, roleSlotId: 'pull',
        exerciseId: 'chinup', decision: 'DIFFICULTY_ACCEPT', variation: 'chinup',
        assistance: 'light-band' });
      add('SET_CORRECTED', { sessionId: id, targetEventId: set.eventId, reps: 7 });
      assert.deepEqual(foldBB2Block(opening(), events).requiredConsent.map(x => x.choiceEventId),
        [accepted.eventId]);
      const replacement = add('CHOICE_REPLACED', { targetEventId: accepted.eventId,
        sourceSessionId: 'B', roleSlotId: 'pull', exerciseId: 'chinup', decision: 'REPLACE',
        variation: 'chinup', assistance: 'medium-band' });
      const result = foldBB2Block(opening(), events);
      const p = result.progress['upper_a|pull|chinup'];
      assert.deepEqual(result.requiredConsent, []);
      assert.deepEqual([p.loadG, p.loadOrigin, p.assistance, p.epochId, p.bestReps],
        [null, null, 'medium-band', 'choice:' + replacement.eventId, null]);
    }
  }
});

check('earned DERIVED provenance survives Start and inherited actual recording', () => {
  const computed = { kind: 'DERIVED', sourceEventId: 'source-finish' };
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { 'upper_a|bench|bench': { loadG: 102500, loadOrigin: computed,
      calibrated: true, incrementG: 2500, incrementOrigin: origin(2500) } } });
  const { events, add } = journal();
  const nextSlot = { ...slot('bench', 102500, 1), plannedOrigin: computed };
  add('WORKOUT_STARTED', { sessionId: 'earned', templateId: 'upper_a', kind: 'NORMAL',
    slots: [nextSlot] });
  add('SET_RECORDED', { sessionId: 'earned', roleSlotId: 'bench', exerciseId: 'bench',
    setIndex: 0, reps: 7, actualG: 102500, actualOrigin: computed, prescribed: true });
  add('WORKOUT_FINISHED', { sessionId: 'earned' });
  const result = foldBB2Block(b, events);
  assert.deepEqual(result.history[0].slots[0].plannedOrigin, computed);
  assert.deepEqual(result.history[0].sets[0].actualOrigin, computed);
  assert.deepEqual(result.progress['upper_a|bench|bench'].loadOrigin, computed);
  const forged = structuredClone(events);
  forged[1].actualG = 102512;
  assert.throws(() => foldBB2Block(b, forged), /derived.*inherit|source.*plan|actual.*origin/i);
  const mismatchedSource = structuredClone(events);
  mismatchedSource[1].actualOrigin = { kind: 'DERIVED', sourceEventId: 'different-finish' };
  assert.throws(() => foldBB2Block(b, mismatchedSource), /derived.*inherit/i);
  const corrected = [...events, { type: 'SET_CORRECTED', eventId: 'earned-correction',
    blockId: 'audit-block', commitOrdinal: events.length + 1,
    sessionId: 'earned', targetEventId: events[1].eventId, reps: 6 }];
  assert.deepEqual(foldBB2Block(b, corrected).history[0].sets[0].actualOrigin, computed);
  corrected.at(-1).actualG = 102500;
  corrected.at(-1).actualOrigin = { kind: 'DERIVED', sourceEventId: 'forged-source' };
  assert.throws(() => foldBB2Block(b, corrected), /corrected derived actual.*source/i);
});

function sealedLoadedFixture() {
  const { events, add } = journal();
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = 0; i < 8; i++) {
      const sessionId = templateId + '-' + i;
      add('WORKOUT_STARTED', { sessionId, templateId, kind: 'NORMAL', slots: [slot('bench', 60000, 1)] });
      add('SET_RECORDED', { sessionId, roleSlotId: 'bench', exerciseId: 'bench',
        setIndex: 0, reps: 7, actualG: 60000, actualOrigin: origin(60000), prescribed: true });
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  add('BLOCK_SEALED', { sealId: 'audit-seal' });
  return { events, opening: opening() };
}

check('next block is derived exclusively from its verified opening and sealed events', () => {
  const prior = sealedLoadedFixture();
  const projection = foldBB2Block(prior.opening, prior.events);
  assert.equal(projection.progress['upper_a|bench|bench'].loadG, 60000);
  const next = createNextBB2Opening(prior.opening, prior.events, 'next-audit');
  assert.equal(next.progress['upper_a|bench|bench'].loadG, 60000);
  const tampered = structuredClone(projection);
  tampered.progress['upper_a|bench|bench'].loadG = 200000;
  tampered.progress['upper_a|bench|bench'].loadOrigin = origin(200000);
  tampered.closingSnapshot.progress['upper_a|bench|bench'].loadG = 200000;
  tampered.closingSnapshot.progress['upper_a|bench|bench'].loadOrigin = origin(200000);
  assert.throws(() => createNextBB2Opening(tampered, 'forged-next'),
    /opening|events|verified|invalid/i, 'legacy caller-provided projection must not be trusted');
});

check('opening progress and carried pending reject unknown fields', () => {
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { 'upper_a|bench|bench': { loadG: 60000, loadOrigin: origin(60000),
      bogusProgressField: 'unlisted' } } });
  assert.throws(() => foldBB2Block(b, []), /unknown.*progress|unknown.*field/i);
  const prior = sealedLoadedFixture();
  const next = createNextBB2Opening(prior.opening, prior.events, 'next-audit');
  next.pending['upper_a|bench|bench'] = { kind: 'OFF_PLAN', sourceBlockId: 'audit-block',
    sessionId: 'upper_a-7', valueG: 55000, plannedG: 60000, sourceRepSum: 7,
    sourceAllTop: false, bogus: 'leak' };
  assert.throws(() => foldBB2Block(next, []), /unknown.*pending|unknown.*field/i);
});

check('an eligible NORMAL Finish cannot commit without its credit grant', () => {
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'credit-source', templateId: 'upper_a',
    kind: 'NORMAL', slots: [slot('bench', 60000, 1)] });
  add('SET_RECORDED', { sessionId: 'credit-source', roleSlotId: 'bench',
    exerciseId: 'bench', setIndex: 0, reps: 7, actualG: 60000,
    actualOrigin: origin(60000), prescribed: true });
  const guard = { ownerId: 'audit-owner', blockId: 'audit-block', foldRulesVersion: 1,
    expectedHead: events.length, sealRevision: 0, activeWorkout: false };
  const bareFinish = { type: 'WORKOUT_FINISHED', eventId: 'bare-finish',
    blockId: 'audit-block', commitOrdinal: events.length + 1, sessionId: 'credit-source' };
  assert.throws(() => commitBB2Transaction(opening(), events, [bareFinish], guard),
    /credit.*same.*transaction|Finish.*credit|missing.*grant/i);
  const planned = planBB2Finish(opening(), events, 'credit-source');
  const committed = commitBB2Transaction(opening(), events, planned.events.slice(events.length), guard);
  assert.equal(committed.projection.quotas.upper_a, 1);
  assert.equal(committed.projection.history[0].creditId, 'credit:credit-source');
});

check('first-exposure off-plan choice cannot bypass calibration and earn an increase', () => {
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'first-off-plan', templateId: 'upper_a',
    kind: 'NORMAL', slots: [slot('bench', 60000, 1)] });
  add('SET_RECORDED', { sessionId: 'first-off-plan', roleSlotId: 'bench', exerciseId: 'bench',
    setIndex: 0, reps: 8, actualG: 55000, actualOrigin: origin(55000), prescribed: true });
  add('WORKOUT_FINISHED', { sessionId: 'first-off-plan' });
  assert.equal(foldBB2Block(opening(), events).pending['upper_a|bench|bench'], undefined);
  add('CHOICE_RESOLVED', { sourceSessionId: 'first-off-plan', roleSlotId: 'bench',
    exerciseId: 'bench', decision: 'ACCEPT', loadG: 55000, loadOrigin: origin(55000) });
  assert.throws(() => foldBB2Block(opening(), events), /calibrat|offer|choice.*eligible/i);
});

check('first-exposure all-top bodyweight calibration cannot invent harder-direction offer', () => {
  const { events, add } = journal();
  const pull = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 12, variation: 'chinup', assistance: 'heavy-band' };
  add('WORKOUT_STARTED', { sessionId: 'first-bw', templateId: 'upper_a',
    kind: 'NORMAL', slots: [pull] });
  add('SET_RECORDED', { sessionId: 'first-bw', roleSlotId: 'pull', exerciseId: 'chinup',
    setIndex: 0, reps: 12, prescribed: true, variation: 'chinup', assistance: 'heavy-band' });
  add('WORKOUT_FINISHED', { sessionId: 'first-bw' });
  assert.equal(foldBB2Block(opening(), events).pending['upper_a|pull|chinup'], undefined);
  add('CHOICE_RESOLVED', { sourceSessionId: 'first-bw', roleSlotId: 'pull',
    exerciseId: 'chinup', decision: 'DIFFICULTY_ACCEPT', variation: 'chinup',
    assistance: 'light-band' });
  assert.throws(() => foldBB2Block(opening(), events), /difficulty choice.*offer|calibrat/i);
});

check('retroactive first calibration qualifying Finish can reaffirm an invalidated choice', () => {
  const { events, add } = journal();
  const record = (id, planned, actual) => {
    add('WORKOUT_STARTED', { sessionId: id, templateId: 'upper_a',
      kind: 'NORMAL', slots: [slot('bench', planned, 3)] });
    const sets = Array.from({ length: 3 }, (_, i) => add('SET_RECORDED', {
      sessionId: id, roleSlotId: 'bench', exerciseId: 'bench', setIndex: i,
      reps: 7, actualG: actual, actualOrigin: origin(actual), prescribed: true }));
    add('WORKOUT_FINISHED', { sessionId: id });
    return sets;
  };
  const initial = record('original-calibration', 60000, 60000);
  const acceptedSets = record('accepted-off-plan', 60000, 55000);
  const choice = add('CHOICE_RESOLVED', { sourceSessionId: 'accepted-off-plan',
    roleSlotId: 'bench', exerciseId: 'bench', decision: 'ACCEPT',
    loadG: 55000, loadOrigin: origin(55000) });
  record('later-reaffirmation', 55000, 55000);
  add('SET_VOIDED', { sessionId: 'original-calibration', targetEventId: initial[0].eventId });
  add('SET_VOIDED', { sessionId: 'accepted-off-plan', targetEventId: acceptedSets[0].eventId });
  const projected = foldBB2Block(opening(), events);
  assert.deepEqual(projected.requiredConsent, []);
  assert.equal(projected.progress['upper_a|bench|bench'].loadG, 55000);
  assert.equal(projected.progress['upper_a|bench|bench'].bestReps, 21);
  assert.ok(projected.history.some(h => h.sessionId === 'later-reaffirmation'));
  assert.ok(choice.eventId);
});

check('wrong assistance during first bodyweight calibration never seeds a carried baseline', () => {
  const { events, add } = journal();
  const pull = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 12, variation: 'chinup', assistance: 'light-band' };
  add('WORKOUT_STARTED', { sessionId: 'wrong-band', templateId: 'upper_a',
    kind: 'NORMAL', slots: [pull] });
  add('SET_RECORDED', { sessionId: 'wrong-band', roleSlotId: 'pull', exerciseId: 'chinup',
    setIndex: 0, reps: 8, prescribed: true, variation: 'chinup', assistance: 'heavy-band' });
  add('WORKOUT_FINISHED', { sessionId: 'wrong-band' });
  const key = 'upper_a|pull|chinup';
  assert.equal(foldBB2Block(opening(), events).progress[key].bestReps, null);
  add('CREDIT_GRANTED', { sessionId: 'wrong-band', creditId: 'wrong-band-credit' });
  for (const templateId of ['upper_a', 'lower_a', 'upper_b', 'lower_b']) {
    for (let i = templateId === 'upper_a' ? 1 : 0; i < 8; i++) {
      const sessionId = templateId + '-fill-' + i;
      add('WORKOUT_STARTED', { sessionId, templateId, kind: 'NORMAL', slots: [slot('bench', 60000, 1)] });
      add('SET_RECORDED', { sessionId, roleSlotId: 'bench', exerciseId: 'bench',
        setIndex: 0, reps: 7, actualG: 60000, actualOrigin: origin(60000), prescribed: true });
      add('WORKOUT_FINISHED', { sessionId });
      add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
    }
  }
  add('BLOCK_SEALED', { sealId: 'wrong-band-seal' });
  assert.equal(createNextBB2Opening(opening(), events, 'after-wrong-band').progress[key].bestReps, null);
});

check('unchanged bodyweight DIFFICULTY_ACCEPT cannot erase earned reference', () => {
  const { events, add } = journal();
  const pull = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 12, variation: 'chinup', assistance: 'medium-band' };
  for (const [id, reps] of [['calibration', 8], ['all-top', 12]]) {
    add('WORKOUT_STARTED', { sessionId: id, templateId: 'upper_a', kind: 'NORMAL', slots: [pull] });
    add('SET_RECORDED', { sessionId: id, roleSlotId: 'pull', exerciseId: 'chinup',
      setIndex: 0, reps, prescribed: true, variation: 'chinup', assistance: 'medium-band' });
    add('WORKOUT_FINISHED', { sessionId: id });
  }
  const before = foldBB2Block(opening(), events).progress['upper_a|pull|chinup'];
  assert.equal(before.bestReps, 8);
  add('CHOICE_RESOLVED', { sourceSessionId: 'all-top', roleSlotId: 'pull',
    exerciseId: 'chinup', decision: 'DIFFICULTY_ACCEPT', variation: 'chinup',
    assistance: 'medium-band' });
  assert.throws(() => foldBB2Block(opening(), events), /difficulty.*change|unchanged.*difficulty|same.*variation/i);
});

check('historical bodyweight Finish promotes assistance identity before stall evaluation', () => {
  const key = 'upper_a|pull|chinup';
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { calibrated: true, variation: 'chinup', assistance: 'light-band',
      bestReps: 18, stallCount: 0, epochId: 'old-band' } } });
  const { events, add } = journal();
  const oldPlan = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 2, ceiling: 12, variation: 'chinup', assistance: 'heavy-band' };
  add('WORKOUT_STARTED', { sessionId: 'historical-band', templateId: 'upper_a',
    kind: 'NORMAL', slots: [oldPlan] });
  for (let i = 0; i < 2; i++) add('SET_RECORDED', { sessionId: 'historical-band',
    roleSlotId: 'pull', exerciseId: 'chinup', setIndex: i, reps: 8,
    variation: 'chinup', assistance: 'heavy-band', prescribed: true });
  add('WORKOUT_FINISHED', { sessionId: 'historical-band' });
  const p = foldBB2Block(b, events).progress[key];
  assert.deepEqual([p.variation, p.assistance, p.bestReps, p.stallCount],
    ['chinup', 'heavy-band', 16, 0]);
  assert.equal(p.epochId, 'promote:audit-4:' + key);
});

check('retroactive first bodyweight calibration can promote a different saved assistance', () => {
  const key = 'upper_a|pull|chinup';
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { variation: 'chinup', assistance: 'light-band',
      calibrated: false, bestReps: null, stallCount: 0 } } });
  const { events, add } = journal();
  const historical = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 12, variation: 'chinup', assistance: 'heavy-band' };
  add('WORKOUT_STARTED', { sessionId: 'retro-first-band', templateId: 'upper_a',
    kind: 'NORMAL', slots: [historical] });
  add('SET_RECORDED', { sessionId: 'retro-first-band', roleSlotId: 'pull',
    exerciseId: 'chinup', setIndex: 0, reps: 9, prescribed: true,
    variation: 'chinup', assistance: 'heavy-band' });
  add('WORKOUT_FINISHED', { sessionId: 'retro-first-band' });
  const p = foldBB2Block(b, events).progress[key];
  assert.deepEqual([p.calibrated, p.assistance, p.bestReps, p.stallCount, p.epochId],
    [true, 'heavy-band', 9, 0, 'promote:audit-3']);
  const matching = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { variation: 'chinup', assistance: 'heavy-band',
      calibrated: false, bestReps: null, stallCount: 0 } } });
  assert.equal(foldBB2Block(matching, events).progress[key].epochId, 'opening',
    'a matching qualitative first calibration must not create a phantom epoch');
});

check('closed Start and lock snapshots retain an optional explicit rep floor', () => {
  const { events, add } = journal();
  const ranged = { ...slot('bench', 60000, 1), floor: 6 };
  add('WORKOUT_STARTED', { sessionId: 'ranged', templateId: 'upper_a',
    kind: 'NORMAL', slots: [ranged] });
  add('SET_RECORDED', { sessionId: 'ranged', roleSlotId: 'bench', exerciseId: 'bench',
    setIndex: 0, reps: 7, actualG: 60000, actualOrigin: origin(60000), prescribed: true });
  add('WORKOUT_FINISHED', { sessionId: 'ranged' });
  assert.equal(foldBB2Block(opening(), events).history[0].slots[0].floor, 6);
  const locked = structuredClone(events);
  locked.splice(1, 0, { type: 'EXERCISE_LOCKED', eventId: 'audit-ranged-lock',
    blockId: 'audit-block', commitOrdinal: 2, sessionId: 'ranged', roleSlotId: 'bench',
    exerciseId: 'bench', plannedG: 60000, plannedOrigin: origin(60000), floor: 6 });
  locked.forEach((event, i) => { event.commitOrdinal = i + 1; });
  const lockedHistory = foldBB2Block(opening(), locked).history[0];
  assert.equal(lockedHistory.initialSlots[0].floor, 6);
  assert.equal(lockedHistory.effectiveSlots[0].floor, 6);
  const forgedLock = structuredClone(locked);
  forgedLock[1].floor = 7;
  assert.throws(() => foldBB2Block(opening(), forgedLock), /lock field differs|floor/i);
  const impossible = structuredClone(events);
  impossible[0].slots[0].floor = 9;
  assert.throws(() => foldBB2Block(opening(), impossible), /rep floor|range|ceiling/i);
});


check('restored opening progress retains fixed baseline and rejects forged types', () => {
  const key = 'upper_a|bench|bench';
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { loadG: 100000, loadOrigin: origin(100000),
      incrementG: 2500, incrementOrigin: origin(2500), calibrated: true,
      bestReps: 21, stallCount: 2, epochId: 'baseline',
      lastNormalSessionId: 'prior-session' } } });
  const p = foldBB2Block(b, []).progress[key];
  assert.deepEqual([p.loadG, p.calibrated, p.bestReps, p.stallCount,
    p.epochId, p.lastNormalSessionId],
    [100000, true, 21, 2, 'baseline', 'prior-session']);
  const invalid = [
    ['calibrated', 'false', /calibrated flag/],
    ['calibrated', 1, /calibrated flag/],
    ['epochId', { forged: true }, /progression epoch/],
    ['lastNormalSessionId', 42, /last normal session/],
    ['variation', 12, /progression variation/],
    ['assistance', { band: 'heavy' }, /progression assistance/]
  ];
  for (const [field, value, message] of invalid) {
    const altered = structuredClone(b);
    altered.progress[key][field] = value;
    assert.throws(() => foldBB2Block(altered, []), message, field);
  }
});

check('restored opening cannot fabricate stalls without comparable rep evidence', () => {
  const key = 'upper_a|bench|bench';
  const b = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { loadG: 100000, loadOrigin: origin(100000),
      calibrated: true, bestReps: null, stallCount: 4 } } });
  assert.throws(() => foldBB2Block(b, []), /stall without baseline/);
  b.progress[key].bestReps = 21;
  const p = foldBB2Block(b, []);
  assert.deepEqual(p.stallSignals[key], { kind: 'OFFER', epochId: 'opening',
    stallCount: 4, dismissed: false,
    actions: ['REDUCE_ABOUT_10_PERCENT', 'SWAP_MOVEMENT', 'RECOVERY_SESSION'] });
});

check('orphan numeric origins cannot enter restored progress or saved plans', () => {
  const key = 'upper_a|bench|bench';
  const badLoad = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { loadG: null, loadOrigin: origin(100000) } } });
  assert.throws(() => foldBB2Block(badLoad, []), /orphan progress load origin/);
  const badIncrement = createBB2Opening({ ownerId: 'audit-owner', blockId: 'audit-block',
    progress: { [key]: { incrementOrigin: origin(2500) } } });
  assert.throws(() => foldBB2Block(badIncrement, []), /orphan progress increment origin/);
  const bw = { roleSlotId: 'pull', exerciseId: 'chinup', equipment: 'bodyweight',
    sets: 1, ceiling: 12, variation: 'chinup', assistance: 'none',
    plannedOrigin: origin(5000) };
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'orphan-plan', templateId: 'upper_a',
    kind: 'NORMAL', slots: [bw] });
  assert.throws(() => foldBB2Block(opening(), events), /orphan planned origin/);
  events[0].slots = [{ ...slot('bench', 60000, 1) }];
  delete events[0].slots[0].incrementG;
  assert.throws(() => foldBB2Block(opening(), events), /orphan increment origin/);
});

check('explicit extra-set prescribed flag cannot impersonate a gating set', () => {
  const { events, add } = journal();
  add('WORKOUT_STARTED', { sessionId: 'extra-flag', templateId: 'upper_a',
    kind: 'NORMAL', slots: [slot('bench', 60000, 1)] });
  add('EXTRA_SET_RECORDED', { sessionId: 'extra-flag', roleSlotId: 'bench',
    exerciseId: 'bench', setIndex: 1, reps: 8, prescribed: true,
    actualG: 60000, actualOrigin: origin(60000) });
  add('WORKOUT_INCOMPLETE', { sessionId: 'extra-flag' });
  assert.throws(() => foldBB2Block(opening(), events), /extra set cannot be prescribed/);
  events[1].prescribed = false;
  const out = foldBB2Block(opening(), events);
  assert.deepEqual([out.quotas.upper_a, out.history[0].status,
    out.history[0].sets[0].prescribed], [0, 'INCOMPLETE', false]);
});

if (failures) process.exitCode = 1;
else console.log('BB2 STAGE (i) COLD AUDIT CONTRACTS: PASS');

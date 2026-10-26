'use strict';
const assert = require('node:assert/strict');
const { createBB2Opening, foldBB2Block } = require('../../bb2/ledger.cjs');
const { validateBB2RestoredBlock, bb2FinishRevisionKey } = require('../../bb2/restore.cjs');

const opening = () => createBB2Opening({ ownerId: 'owner-restore', blockId: 'block-restore' });
const mass = g => ({ value: String(g / 1000), unit: 'kg' });
const journal = () => {
  const events = [];
  const add = (type, fields = {}) => events.push({
    type, eventId: 'e' + (events.length + 1), commitOrdinal: events.length + 1,
    blockId: 'block-restore', ...fields
  });
  const start = (sessionId, sets = 1) => add('WORKOUT_STARTED', {
    sessionId, templateId: 'upper_a', kind: 'NORMAL',
    slots: [{ roleSlotId: 'press', exerciseId: 'bench', sets, floor: 6, ceiling: 8,
      equipment: 'loaded', plannedG: 60000, plannedOrigin: mass(60000),
      incrementG: 2500, incrementOrigin: mass(2500) }]
  });
  const record = (sessionId, setIndex = 0) => add('SET_RECORDED', {
    sessionId, roleSlotId: 'press', exerciseId: 'bench', setIndex, reps: 7,
    actualG: 60000, actualOrigin: mass(60000), prescribed: true,
    harderThanIntended: false
  });
  const finish = sessionId => add('WORKOUT_FINISHED', { sessionId });
  const grant = sessionId => add('CREDIT_GRANTED', { sessionId, creditId: 'credit-' + sessionId });
  return { events, add, start, record, finish, grant };
};
const check = (name, fn) => {
  try { fn(); console.log('PASS BB2-S2-RESTORE ' + name); }
  catch (e) { process.exitCode = 1; console.error('FAIL BB2-S2-RESTORE ' + name + ': ' + e.stack); }
};

check('eligible NORMAL Finish plus immediately paired credit restores exactly', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1'); j.grant('s1');
  const raw = foldBB2Block(opening(), j.events);
  const restored = validateBB2RestoredBlock(opening(), j.events);
  assert.deepEqual(restored, raw);
  assert.equal(restored.quotas.upper_a, 1);
  assert.equal(restored.history[0].status, 'COMPLETED_NORMAL');
});

check('bare credit-eligible NORMAL Finish that fold accepts is rejected on restore', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1');
  assert.equal(foldBB2Block(opening(), j.events).history[0].status, 'COMPLETED_NORMAL_NONCREDIT');
  assert.throws(() => validateBB2RestoredBlock(opening(), j.events), /paired credit/);
});

check('a delayed credit after a note cannot impersonate a paired atomic Finish', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1');
  j.add('NOTE_EDITED', { sessionId: 's1', text: 'between' }); j.grant('s1');
  assert.equal(foldBB2Block(opening(), j.events).quotas.upper_a, 1);
  assert.throws(() => validateBB2RestoredBlock(opening(), j.events), /paired credit/);
});

check('under-70% incomplete outcome without a grant earns no credit', () => {
  const j = journal(); j.start('s1', 2); j.record('s1');
  j.add('WORKOUT_INCOMPLETE', { sessionId: 's1' });
  const restored = validateBB2RestoredBlock(opening(), j.events);
  assert.equal(restored.quotas.upper_a, 0);
  assert.equal(restored.history[0].status, 'INCOMPLETE');
});

check('later correction and paired revoke preserve original eligibility evidence', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1'); j.grant('s1');
  j.add('SESSION_VOIDED', { sessionId: 's1' });
  j.add('CREDIT_REVOKED', { sessionId: 's1', creditId: 'credit-s1' });
  const restored = validateBB2RestoredBlock(opening(), j.events);
  assert.equal(restored.quotas.upper_a, 0);
  assert.equal(restored.history[0].status, 'VOID');
});

check('normal later credited session cannot compensate for first missing credit', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1');
  j.start('s2'); j.record('s2'); j.finish('s2'); j.grant('s2');
  assert.equal(foldBB2Block(opening(), j.events).quotas.upper_a, 1);
  assert.throws(() => validateBB2RestoredBlock(opening(), j.events), /paired credit/);
});

check('restores still reject bad event ordinals/duplicate grants/sealed edits', () => {
  const j = journal(); j.start('s1'); j.record('s1'); j.finish('s1'); j.grant('s1');
  const duplicateOrdinal = structuredClone(j.events); duplicateOrdinal[3].commitOrdinal = 2;
  assert.throws(() => validateBB2RestoredBlock(opening(), duplicateOrdinal), /ordinal/);
  const extraGrant = structuredClone(j.events);
  extraGrant.push({ ...extraGrant[3], eventId: 'e5', commitOrdinal: 5, creditId: 'another-credit' });
  assert.throws(() => validateBB2RestoredBlock(opening(), extraGrant), /duplicate credit|second first-grant/);
});

check('durable key material is stable, ordered, collision-free and validated', () => {
  const a = bb2FinishRevisionKey('b1', 's1', 9);
  assert.equal(a, bb2FinishRevisionKey('b1', 's1', 9));
  assert.deepEqual(JSON.parse(a), ['b1', 's1', 9]);
  assert.notEqual(a, bb2FinishRevisionKey('b1', 's1', 10));
  assert.notEqual(a, bb2FinishRevisionKey('b1', 's2', 9));
  assert.notEqual(a, bb2FinishRevisionKey('b2', 's1', 9));
  assert.throws(() => bb2FinishRevisionKey('b|2', 's1', 9), /block ID/);
  assert.throws(() => bb2FinishRevisionKey('b1', '', 9), /session ID/);
  assert.throws(() => bb2FinishRevisionKey('b1', 's1', -1), /revision/);
  assert.throws(() => bb2FinishRevisionKey('b1', 's1', 1.5), /revision/);
});

if (!process.exitCode) console.log('BB2 Stage (ii) restore: 8/8 PASS');

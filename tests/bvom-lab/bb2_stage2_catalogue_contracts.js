// Stage (ii) catalogue/setup contracts. Run independently of the app shell.
'use strict';
const assert = require('node:assert/strict');
const {
  CATALOGUE_VERSION, TEMPLATE_ORDER, WARMUP_ORDER, CATALOGUE,
  createBB2Setup, validateBB2Setup, chooseBB2Exercise,
  setBB2OptionalCurls, getBB2TemplatePrescription
} = require('../../bb2/catalogue.cjs');

let checks = 0;
const check = (name, fn) => {
  try { fn(); checks += 1; console.log('PASS BB2-S2 ' + name); }
  catch (error) { process.exitCode = 1; console.error('FAIL BB2-S2 ' + name + ': ' + error.stack); }
};
const plan = (setup, id) => getBB2TemplatePrescription(setup, id);
const slot = (setup, template, role) => plan(setup, template).slots.find(s => s.roleSlotId === role);
const ids = setup => Object.entries(setup.selections);

check('four versioned templates and closed role inventory', () => {
  assert.equal(CATALOGUE_VERSION, 1);
  assert.deepEqual(TEMPLATE_ORDER, ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.deepEqual(WARMUP_ORDER, ['FULL', 'FEEDER', 'QUALITATIVE', 'NONE']);
  assert.deepEqual(TEMPLATE_ORDER.map(k => CATALOGUE[k].length), [5, 5, 6, 5]);
  assert.equal(ids(createBB2Setup()).length, 21);
  for (const id of TEMPLATE_ORDER) {
    assert.ok(Object.isFrozen(CATALOGUE[id]));
    assert.equal(new Set(CATALOGUE[id].map(role => role.roleSlotId)).size, CATALOGUE[id].length);
    for (const role of CATALOGUE[id]) {
      assert.ok(Object.isFrozen(role));
      assert.ok(Object.isFrozen(role.options));
      assert.equal(new Set(role.options.map(x => x.id)).size, role.options.length);
      assert.ok(role.options.some(x => x.id === role.defaultExerciseId));
      assert.ok(role.options.every(x => Object.isFrozen(x)));
    }
  }
});

check('default 12/11/13/12 prescribed sets and exact 70% finish gates', () => {
  const setup = createBB2Setup();
  assert.deepEqual(TEMPLATE_ORDER.map(id => plan(setup, id).prescribedCount), [12, 11, 13, 12]);
  assert.deepEqual(TEMPLATE_ORDER.map(id => plan(setup, id).minimumToFinish), [9, 8, 10, 9]);
  assert.equal(plan(setup, 'upper_b').slots.find(s => s.roleSlotId === 'biceps_curl'), undefined);
  assert.ok(Object.isFrozen(setup) && Object.isFrozen(setup.selections));
  assert.throws(() => { setup.optionalUpperBCurls = true; }, TypeError);
});

check('optional curls are a setup choice made before Start, not hidden set inflation', () => {
  const before = createBB2Setup();
  const after = setBB2OptionalCurls(before, true);
  assert.equal(before.optionalUpperBCurls, false);
  assert.equal(after.optionalUpperBCurls, true);
  assert.deepEqual([plan(before, 'upper_b').prescribedCount, plan(before, 'upper_b').minimumToFinish], [13, 10]);
  assert.deepEqual([plan(after, 'upper_b').prescribedCount, plan(after, 'upper_b').minimumToFinish], [15, 11]);
  assert.equal(plan(after, 'upper_b').slots.filter(s => s.roleSlotId === 'biceps_curl').length, 1);
  assert.deepEqual(TEMPLATE_ORDER.filter(id => id !== 'upper_b').map(id => plan(after, id).prescribedCount), [12, 11, 12]);
  assert.deepEqual(ids(before), ids(after));
  assert.throws(() => setBB2OptionalCurls(before, 'yes'), /optional curls/i);
});

check('conventional deadlift specialist override is 2 x 4-6, not RDL 3 x 6-10', () => {
  const normal = createBB2Setup();
  const changed = chooseBB2Exercise(normal, 'lower_b', 'hip_hinge', 'conventional_deadlift');
  assert.deepEqual([slot(normal, 'lower_b', 'hip_hinge').sets,
    slot(normal, 'lower_b', 'hip_hinge').floor, slot(normal, 'lower_b', 'hip_hinge').ceiling], [3, 6, 10]);
  assert.deepEqual([slot(changed, 'lower_b', 'hip_hinge').sets,
    slot(changed, 'lower_b', 'hip_hinge').floor, slot(changed, 'lower_b', 'hip_hinge').ceiling], [2, 4, 6]);
  assert.deepEqual([plan(changed, 'lower_b').prescribedCount, plan(changed, 'lower_b').minimumToFinish], [11, 8]);
  assert.equal(slot(changed, 'lower_b', 'hip_hinge').warmup, 'FULL');
  assert.equal(slot(normal, 'lower_b', 'hip_hinge').exerciseId, 'romanian_deadlift');
});

check('log push press overrides an ordinary press without changing Upper A count', () => {
  const base = createBB2Setup();
  const log = chooseBB2Exercise(base, 'upper_a', 'shoulder_press', 'log_push_press');
  const press = slot(log, 'upper_a', 'shoulder_press');
  assert.deepEqual([press.sets, press.floor, press.ceiling, press.warmup], [2, 4, 6, 'FULL']);
  assert.deepEqual([slot(base, 'upper_a', 'shoulder_press').floor,
    slot(base, 'upper_a', 'shoulder_press').ceiling], [8, 12]);
  assert.deepEqual([plan(log, 'upper_a').prescribedCount, plan(log, 'upper_a').minimumToFinish], [12, 9]);
  assert.equal(slot(base, 'upper_a', 'shoulder_press').exerciseId, 'overhead_press');
});

check('unassisted Nordic override persists independently on both lower templates', () => {
  const base = createBB2Setup();
  const lowerA = chooseBB2Exercise(base, 'lower_a', 'hamstring_curl', 'nordic_curl');
  const both = chooseBB2Exercise(lowerA, 'lower_b', 'hamstring_curl', 'nordic_curl');
  for (const template of ['lower_a', 'lower_b']) {
    const nordic = slot(both, template, 'hamstring_curl');
    assert.deepEqual([nordic.sets, nordic.floor, nordic.ceiling,
      nordic.warmup, nordic.equipment], [2, 4, 8, 'QUALITATIVE', 'bodyweight']);
  }
  assert.notEqual(slot(base, 'lower_a', 'hamstring_curl').exerciseId, 'nordic_curl');
  assert.notEqual(slot(base, 'lower_b', 'hamstring_curl').exerciseId, 'nordic_curl');
  assert.equal(slot(lowerA, 'lower_b', 'hamstring_curl').exerciseId, 'lying_leg_curl');
});

check('qualitative exercises have no invented kilograms or assistance in catalogue', () => {
  const setup = createBB2Setup();
  for (const id of TEMPLATE_ORDER) for (const s of plan(setup, id).slots) {
    assert.deepEqual(Object.keys(s).sort(),
      ['roleSlotId', 'exerciseId', 'sets', 'floor', 'ceiling', 'equipment', 'warmup'].sort());
    assert.equal(s.plannedG, undefined);
    assert.equal(s.addedWeightG, undefined);
    assert.equal(s.assistance, undefined);
    assert.ok(s.floor > 0 && s.floor <= s.ceiling);
  }
  assert.equal(slot(setup, 'upper_a', 'vertical_pull').equipment, 'bodyweight');
  const machine = chooseBB2Exercise(setup, 'upper_a', 'vertical_pull', 'lat_pulldown');
  assert.equal(slot(machine, 'upper_a', 'vertical_pull').equipment, 'loaded');
  assert.equal(slot(machine, 'upper_a', 'vertical_pull').warmup, 'FEEDER');
});

check('Workout/Warm-up common deterministic numerical-first slot ordering', () => {
  const variations = [createBB2Setup(), setBB2OptionalCurls(createBB2Setup(), true),
    chooseBB2Exercise(createBB2Setup(), 'upper_a', 'shoulder_press', 'log_push_press')];
  for (const setup of variations) for (const id of TEMPLATE_ORDER) {
    const a = plan(setup, id);
    const b = plan(structuredClone(setup), id);
    assert.deepEqual(a, b);
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.slots) && a.slots.every(s => Object.isFrozen(s)));
    const order = a.slots.map(s => WARMUP_ORDER.indexOf(s.warmup));
    assert.deepEqual(order, order.toSorted ? order.toSorted((x, y) => x - y) : order.slice().sort((x, y) => x - y));
  }
  assert.equal(slot(createBB2Setup(), 'lower_a', 'unilateral_quad').warmup, 'FULL');
});

check('strict closed setup, unsupported version, missing/unknown role and bad variant', () => {
  const base = createBB2Setup();
  assert.equal(validateBB2Setup(base), base);
  assert.throws(() => validateBB2Setup({ ...base, extra: 'x' }), /unknown setup field/);
  assert.throws(() => validateBB2Setup({ ...base, catalogueVersion: 2 }), /version/);
  assert.throws(() => validateBB2Setup({ ...base, optionalUpperBCurls: 1 }), /optional curls/);
  const { 'upper_a|flat_press': removed, ...short } = base.selections;
  assert.throws(() => validateBB2Setup({ ...base, selections: short }), /incomplete/);
  assert.throws(() => validateBB2Setup({ ...base, selections: { ...base.selections, bogus: 'x' } }), /unknown/);
  assert.throws(() => validateBB2Setup({ ...base, selections: { ...base.selections, 'upper_a|flat_press': 'squat' } }), /finite catalogue/);
  assert.throws(() => chooseBB2Exercise(base, 'upper_a', 'flat_press', 'conventional_deadlift'), /finite catalogue/);
  assert.throws(() => chooseBB2Exercise(base, 'lower_b', 'flat_press', 'bench_press'), /invalid exercise role/);
  assert.throws(() => plan(base, 'wrong'), /unknown template/);
  assert.throws(() => createBB2Setup({ selections: { unexpected: 'squat' } }), /unknown/);
});

check('state snapshots are isolated and serialise without alteration', () => {
  const original = createBB2Setup();
  const modified = chooseBB2Exercise(original, 'upper_a', 'shoulder_press', 'log_push_press');
  assert.notEqual(original, modified);
  assert.notEqual(original.selections, modified.selections);
  assert.equal(original.selections['upper_a|shoulder_press'], 'overhead_press');
  assert.equal(modified.selections['upper_a|shoulder_press'], 'log_push_press');
  const roundTrip = JSON.parse(JSON.stringify(modified));
  validateBB2Setup(roundTrip);
  assert.deepEqual(plan(roundTrip, 'upper_a'), plan(modified, 'upper_a'));
  assert.ok(Object.isFrozen(modified) && Object.isFrozen(modified.selections));
});

console.log('BB2 Stage (ii) catalogue checks: ' + checks + '/10 ' + (process.exitCode ? 'FAIL' : 'PASS'));

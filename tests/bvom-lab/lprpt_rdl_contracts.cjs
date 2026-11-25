'use strict';

const assert = require('node:assert/strict');
const H = require('./lib/bvom_harness');
const build = H.loadBuild(process.argv[2] || '.');
const rdl = 'Romanian Deadlift';
const copy = value => JSON.parse(JSON.stringify(value));

function fixture({ unit = 'kg', history = [], loads = {} } = {}) {
  const initial = H.boot(build);
  H.configureLP(initial, { ...H.LP_W, ...loads });
  const state = initial.S();
  state.unit = unit;
  state.bar = unit === 'lb' ? 45 : 20;
  delete state.weights[rdl];
  for (const name of Object.keys(state.barByLift)) state.barByLift[name] = state.bar;
  state.enabledStandard = copy(initial.ctx.defaultPlates(unit).std);
  state.enabledMicro = [];
  state.history = history;
  const ls = H.memStore({ bvom_data: JSON.stringify(state) });
  return H.boot(build, { ls });
}

function record(h, name, reps) {
  for (let i = 0; i < h.ctx.getSetPlan(name).length; i++) {
    h.reps.push(reps?.[i] ?? h.ctx.getSetPlan(name)[i].target);
    h.ctx.tapSet(name, i);
  }
}

function reload(h) {
  return H.boot(build, { ls: h.ls, ss: h.ctx.sessionStorage });
}

function squatRecord(load, unit = 'kg') {
  return { program: 'lprpt', day: 'A', unit, incomplete: false,
    weights: { Squat: load + 2.5 }, session: { Squat: { 0: { load, reps: 5, target: 5 } } } };
}

function exercisePlan(h, name) {
  return h.ctx.getSetPlan(name).map(q => [q.load, q.target, q.amrap]);
}

const expectedLadder = [[8, 9, 11], [7, 8, 10], [6, 7, 9], [5, 6, 8], [4, 5, 7]];
let count = 0;
for (const unit of ['kg', 'lb']) for (const schedule of [['ABA'], ['ABA', 'BAB']]) {
  const inc = unit === 'kg' ? 2.5 : 5;
  const start = unit === 'kg' ? 40 : 225;
  const h = fixture({ unit, history: [squatRecord(start, unit)],
    loads: { Deadlift: unit === 'kg' ? 70 : 315 } });
  assert.equal(h.S().weights[rdl], start);
  let rdlExpected = start;
  for (let week = 0; week < 8; week++) for (const day of schedule[week % schedule.length]) {
    h.ctx.switchDay(day);
    const names = copy(h.ctx.program());
    const expected = day === 'A' ? [['Squat', 3, 5], ['Bench Press', 3, 5], ['Prone Row', 3, 5]] :
      [[rdl, 3, 8], ['Deadlift', 1, 5], ['Overhead Press', 5, 5]];
    assert.deepEqual(names, expected);
    const squatBefore = h.S().weights.Squat;
    for (const [name] of names) record(h, name);
    H.finish(h);
    if (day === 'B') {
      const log = h.S().history.at(-1);
      assert.equal(log.session[rdl][0].load, rdlExpected);
      assert.equal(log.exerciseMeta[rdl].id, 'core.romanian_deadlift');
      assert.equal(h.S().weights.Squat, squatBefore);
      rdlExpected += inc;
    }
    assert.equal(h.S().weights[rdl], rdlExpected);
    count++;
  }
}
console.log('PASS', count, 'recorded ABA and ABA/BAB workouts with independent kg/lb load oracles');

{
  const h = fixture({ history: [squatRecord(100)], loads: { Deadlift: 145 } });
  h.ctx.switchDay('B');
  for (let level = 0; level < expectedLadder.length; level++) {
    Object.assign(h.S().core[rdl], { mode: 'rpt', rptLevel: level });
    assert.deepEqual(copy(exercisePlan(h, rdl)), expectedLadder[level].map((reps, i) => [100 - i * 10, reps, i === 2]));
  }
  Object.assign(h.S().core[rdl], { mode: 'straight', rptLevel: 0 });
  assert.deepEqual(copy(h.ctx.getWarmupPlan('Deadlift').sets), [[60, 5], [80, 5], [100, 3], [120, 2], [135, 1]]);
  record(h, rdl);
  assert.deepEqual(copy(h.ctx.getWarmupPlan('Deadlift').sets), [[120, 2], [135, 1]]);
  const plan = h.ctx.getWarmupPlan('Deadlift');
  const tick = { dataset: { plan: plan.fingerprint }, classList: { add() {}, remove() {} } };
  h.ctx.completeWarmup('Deadlift', 0, plan.sets.length, tick);
  const persisted = reload(h);
  assert.equal(persisted.S().warmupDone['B|Deadlift'][0], true);
  assert.equal(persisted.ctx.getWarmupPlan('Deadlift').fingerprint, plan.fingerprint);
  persisted.S().exerciseDisplayOrder = { 'lprpt:B': [rdl, 'Overhead Press', 'Deadlift'] };
  assert.equal(persisted.ctx.getWarmupPlan('Deadlift').sets.length, 5);
  persisted.ctx.completeWarmup('Deadlift', 0, 2, tick);
  assert.equal(persisted.S().warmupDone['B|Deadlift'].fingerprint, plan.fingerprint);
  assert.notEqual(persisted.ctx.getWarmupPlan('Deadlift').fingerprint, plan.fingerprint);
  console.log('PASS approved RPT loads, native ramp, shortened handoff, reload-safe ticks and reorder fallback');
}

{
  const h = fixture({ history: [squatRecord(100)] });
  h.ctx.switchDay('B');
  h.reps.push(6);
  h.ctx.tapSet(rdl, 0);
  assert.deepEqual(copy(exercisePlan(h, rdl)), [[100, 8, false], [90, 7, false], [80, 9, true]]);
  assert.equal(h.S().attempts[rdl] || 0, 0);
  h.ctx.tapSet(rdl, 1);
  h.ctx.tapSet(rdl, 2);
  assert.equal(h.S().weights[rdl], 100);
  assert.equal(h.S().attempts[rdl], 1);
  assert.deepEqual(copy(h.ctx.getWarmupPlan('Deadlift').sets), copy(h.ctx.warmups(120, 'Deadlift')));
  H.finish(h);
  h.S().attempts[rdl] = 2;
  h.choices.push('R');
  record(h, rdl, [6, 7, 9]);
  assert.equal(h.S().core[rdl].mode, 'rpt');
  assert.equal(h.S().core[rdl].rptLevel, 0);
  H.finish(h);
  assert.deepEqual(copy(h.ctx.corePrescription(rdl).targets), [8, 9, 11]);
  h.S().core[rdl].rptLevel = 4;
  h.S().attempts[rdl] = 2;
  h.ctx.bvomEndRoad = (_name, takeReset) => takeReset();
  h.ctx.bvomWeightModal = (_name, _previous, apply) => apply(75);
  record(h, rdl, [2, 3, 5]);
  assert.equal(h.S().core[rdl].mode, 'straight');
  assert.equal(h.S().weights[rdl], 75);
  assert.equal(h.S().attempts[rdl], 0);
  assert.equal(h.S().weights.Squat, 100);
  console.log('PASS partial RDL, rescue, failed-attempt progression, LP-to-RPT and terminal weight reset');
}

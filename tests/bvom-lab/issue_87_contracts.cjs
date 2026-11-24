'use strict';

const assert = require('node:assert/strict');
const { boot, loadBuild, configureLP } = require('./lib/bvom_harness');

const build = loadBuild(process.argv[2] || '.');
for (const [mode, day] of [['lprpt', 'A'], ['hlm', 'H'], ['fourday', '1']]) {
  const app = boot(build);
  configureLP(app);
  app.ev(`state.programMode='${mode}';state.day='${day}';save();renderAll()`);
  const lift = app.ev('program()[0][0]');
  const key = day + '|' + lift;
  const warmups = app.ctx.getWarmupPlan(lift).sets;
  assert(warmups.length > 0, mode);
  warmups.forEach((_, index) => app.ctx.completeWarmup(lift, index, warmups.length, {
    classList: { add() {} }
  }));
  app.ctx.tapSet(lift, 0);
  const edited = app.ev('program()[1][0]');
  app.ctx.bvomWeightModal = (_name, current, saveWeight) => saveWeight(current + 10);
  app.ctx.editWeight(edited);
  app.ev('renderWarm()');
  const ticks = state => Object.keys(state.warmupDone[key] || {}).length;
  assert.equal(ticks(app.S()), warmups.length, mode + ' in memory');
  const reload = boot(build, { ls: app.ls });
  assert.equal(ticks(reload.S()), warmups.length, mode + ' after reload');
}
console.log('Issue 87 warm-up weight edit and reload contracts passed');

function verifyFinalSetUndo() {
  const app = boot(build);
  configureLP(app);
  app.ev("state.programMode='hlm';state.day='M';ensureHLM();state.hlm.optionalSingles=false;save()");
  const lift = app.ev("program().find(([name]) => corePrescription(name).kind==='hlmMedium')[0]");
  app.ctx.tapSet(lift, 0);
  assert.equal(app.S().processed[lift], true);
  app.ctx.bvomRepModal = (_title, _load, _target, _initial, _save, _rpe, cancel) => {
    assert.equal(cancel(), true);
  };
  app.ctx.tapSet(lift, 0);
  assert.equal(app.S().session[lift][0], undefined);
  assert.equal(app.S().workoutStartedAt, null);
  assert.equal(app.S().processed[lift], undefined);
  assert.equal(app.S().processedSnapshots[lift], undefined);
  console.log('Issue 87 cancelling the final recorded set clears the empty workout');
}

verifyFinalSetUndo();

async function verifyCloudRoundTrip() {
  const { finish, launch, memStore, mockSupabase } = require('./lib/bvom_harness');
  const net = { online: true };
  const supabase = mockSupabase({
    net, entitlement: [{ status: 'subscriber', user_id: 'user-1' }], session: true
  });
  const app = await launch(build, { ls: memStore(), net, supabase });
  configureLP(app);
  app.ctx.tapSet('Squat', 0);
  app.ctx.tapSet('Squat', 1);
  app.ctx.bvomRepModal = (_title, _load, _target, _initial, _save, _rpe, cancel) => {
    assert.equal(cancel(), true);
  };
  app.ctx.tapSet('Squat', 0);
  assert.equal(app.S().session.Squat[0], undefined);
  await app.ctx.bvomCloudRestore();
  assert.equal(app.S().session.Squat[0], undefined);
  assert.ok(app.S().session.Squat[1], 'active restore leaves local sets alone');

  finish(app);
  const saved = JSON.parse(app.ls.getItem('bvom_data'));
  assert.equal(saved.history.at(-1).session.Squat[0], undefined);
  assert.equal(saved.history.at(-1).session.Squat[1].reps, 5);
  app.lastOverlay().querySelector('[data-ok]').click();
  await app.ctx.bvomCloudSaveNow();
  assert.equal(app.ev('bvomCloud.cloudExists'), true);

  const otherDevice = await launch(build, { ls: memStore(), net, supabase });
  otherDevice.choices.push('R');
  await otherDevice.ctx.bvomCloudRestore();
  const restored = JSON.parse(otherDevice.ls.getItem('bvom_data'));
  assert.deepEqual(restored.history, saved.history);
  assert.deepEqual(restored.weights, saved.weights);
  assert.equal(restored.session.Squat, undefined);
  console.log('Issue 87 mocked cloud backup/restore retains finished history after Cancel');
}

verifyCloudRoundTrip().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';

const assert = require('node:assert/strict');
const H = require('./lib/bvom_harness');
const build = H.loadBuild(process.argv[2] || '.');
const copy = value => JSON.parse(JSON.stringify(value));
const plan = (app, lift) => Array.from(app.ctx.getSetPlan(lift), row => row.target);

function edit(app, lift, sets, reps, load) {
  app.ctx.bvomWeightModal = (_lift, current, onSave, fields) => {
    assert.ok(fields, lift + ' offers editable fields');
    onSave(load ?? current, { sets, reps }, load ?? current);
  };
  app.ctx.editWeight(lift);
}

for (const [mode, day, lift, defaultReps] of [
  ['lprpt', 'A', 'Squat', [5, 5, 5]],
  ['hlm', 'H', 'Prone Row', [5, 5, 5]],
  ['fourday', '1', 'Prone Row', [5, 5, 5]]
]) {
  const app = H.boot(build);
  H.configureLP(app);
  app.ev(`state.programMode='${mode}';state.day='${day}';renderAll();save()`);
  assert.deepEqual(plan(app, lift), defaultReps);
  const weight = app.S().weights[lift];
  edit(app, lift, 4, 9, weight + 10);
  assert.deepEqual(plan(app, lift), [9, 9, 9, 9]);
  app.reps.push(9, 9, 9);
  [0, 1, 2].forEach(i => app.ctx.tapSet(lift, i));
  const recorded = copy(app.S().session[lift]);
  assert.equal(recorded[0].load, weight + 10);
  assert.equal(app.S().weights[lift], weight + 10, 'missing fourth set cannot progress');

  edit(app, lift, 2, 9);
  assert.equal(app.S().weights[lift], weight + 10 + app.S().core[lift].increment);
  assert.deepEqual(copy(app.S().session[lift]), recorded, 'shortening preserves every actual');
  assert.ok(app.els['#workout'].innerHTML.includes('RECORDED OUTSIDE PLAN'));
  const reload = H.boot(build, { ls: app.ls, ss: H.memStore({ bvom_tab_id: app.ctx.bvomTabId() }) });
  assert.deepEqual(plan(reload, lift), [9, 9]);
  assert.deepEqual(copy(reload.S().session[lift]), recorded);
  assert.deepEqual(copy(reload.ctx.bvomCloudPayload().fixedWorkingSets[mode][lift]), {sets: 2, reps: 9});

  edit(app, lift, 5, 3);
  assert.equal(app.S().weights[lift], weight + 10, 'expansion revokes earned increment');
  assert.deepEqual(copy(app.S().session[lift]), recorded);
  app.S().session[lift]['EXTRA:0'] = { load: weight, reps: 30, extra: true };
  app.reps.push(2, 3);
  app.ctx.tapSet(lift, 3);
  assert.equal(app.S().attempts[lift] || 0, 0);
  app.ctx.tapSet(lift, 4);
  assert.equal(app.S().attempts[lift], 1);
  assert.equal(app.S().weights[lift], weight + 10);
  assert.equal(app.S().session[lift]['EXTRA:0'].reps, 30);
  assert.ok(app.ctx.coreResult(lift).failed);
}
const app = H.boot(build);
H.configureLP(app);
assert.deepEqual(plan(app, 'Deadlift'), [5]);
assert.deepEqual(plan(app, 'Overhead Press'), [5, 5, 5, 5, 5]);
app.ev("cfg('Squat').mode='rpt'");
assert.equal(app.ctx.bvomFixedEligible('Squat'), true);
app.ev("state.programMode='hlm';state.day='H';cfg('Squat').mode='straight'");
assert.equal(app.ctx.bvomFixedEligible('Squat'), false);
assert.equal(app.ctx.corePrescription('Squat').topIndex, 2);
app.ev("state.programMode='fourday';state.day='4'");
assert.equal(app.ctx.bvomFixedEligible('Squat'), false);
assert.equal(app.ctx.bvomFixedEligible('Deadlift'), false);
console.log('Issue 89 fixed-prescription contracts passed');


function rptRecovery(target, firstMiss, recoveryReps, nextTarget) {
  const app = H.boot(build);
  H.configureLP(app);
  app.ev("cfg('Squat').mode='rpt';cfg('Squat').drop=10;save()");
  edit(app, 'Squat', 4, target, 100);
  app.reps.push(target, firstMiss);
  app.ctx.tapSet('Squat', 0);
  app.ctx.tapSet('Squat', 1);
  const before = copy(app.S().session.Squat);
  const reload = H.boot(build, { ls: app.ls, ss: H.memStore({ bvom_tab_id: app.ctx.bvomTabId() }) });
  assert.deepEqual(copy(reload.S().session.Squat), before);
  const beforeRecovery = Array.from(reload.ctx.getSetPlan('Squat'), ({target,load})=>[target,load]);
  assert.deepEqual(beforeRecovery.slice(0,3), [[target,100],[target,100],[firstMiss+1,90]]);
  reload.reps.push(recoveryReps);
  reload.ctx.tapSet('Squat',2);
  assert.deepEqual(plan(reload,'Squat'),[target,target,firstMiss+1,nextTarget]);
  assert.equal(reload.ctx.getSetPlan('Squat')[3].load,80);
  reload.ctx.bvomChoiceModal=()=>{};
  reload.reps.push(nextTarget);
  reload.ctx.tapSet('Squat',3);
  assert.equal(reload.S().pendingCloseMissChoice.lift,'Squat');
  assert.equal(reload.S().weights.Squat,100,'a backoff miss still requires a decision');
  const actuals=copy(reload.S().session.Squat);
  edit(reload,'Squat',1,target);
  assert.deepEqual(copy(reload.S().session.Squat),actuals,'reducing the plan retains all rescue actuals');
  assert.equal(reload.S().pendingCloseMissChoice,undefined);
  assert.equal(reload.S().weights.Squat,102.5,'the shortened prescription completed at target');
  H.finish(reload);
  assert.equal(reload.S().history.at(-1).session.Squat[2].target,firstMiss+1);
  assert.equal(reload.S().history.at(-1).session.Squat[3].load,80);
}
rptRecovery(9, 8, 9, 11);
rptRecovery(7, 5, 6, 8);
rptRecovery(7, 5, 4, 7);
for (const [reps,progresses] of [[[7,7,7,7],true],[[5,6,7,9],false]]) {
  const rpt=H.boot(build);
  H.configureLP(rpt);
  rpt.ev("cfg('Squat').mode='rpt';cfg('Squat').drop=10;save()");
  edit(rpt,'Squat',4,7);
  rpt.reps.push(...reps);
  reps.forEach((_,i)=>rpt.ctx.tapSet('Squat',i));
  assert.equal(rpt.S().weights.Squat,progresses?102.5:100);
  assert.equal(rpt.S().attempts.Squat,progresses?0:1);
  assert.equal(rpt.S().pendingCloseMissChoice,undefined);
}

async function cloudAndHistory() {
  const net = { online: true };
  const supabase = H.mockSupabase({ net, session: true });
  const first = await H.launch(build, { ls: H.memStore(), net, supabase });
  H.configureLP(first);
  first.reps.push(5);
  first.ctx.tapSet('Squat', 0);
  const legacyActual = copy(first.S().session.Squat[0]);
  edit(first, 'Squat', 2, 10);
  first.reps.push(10);
  first.ctx.tapSet('Squat', 1);
  assert.equal(first.S().attempts.Squat, 1, 'legacy set is tested against the edited rep target');
  assert.deepEqual(copy(first.S().session.Squat[0]), legacyActual);
  H.finish(first);
  const oldHistory = copy(first.S().history);
  assert.deepEqual(oldHistory.at(-1).session.Squat[0], legacyActual);
  first.lastOverlay().querySelector('[data-ok]').click();
  await first.ctx.bvomCloudSaveNow();
  assert.equal(first.ev('bvomCloud.cloudExists'), true);
  const second = await H.launch(build, { ls: H.memStore(), net, supabase });
  second.choices.push('R');
  await second.ctx.bvomCloudRestore();
  const restored = H.boot(build, { ls: second.ls });
  assert.deepEqual(copy(restored.S().history), oldHistory);
  assert.deepEqual(plan(restored, 'Squat'), [10, 10]);
  restored.ev("state.programMode='hlm';state.day='H'");
  assert.equal(restored.ctx.corePrescription('Squat').kind, 'hlmHeavy');
  restored.ev("state.programMode='lprpt';state.day='A'");
  assert.deepEqual(plan(restored, 'Squat'), [10, 10]);
  console.log('Issue 89 History, programme scope and mocked cloud restore passed');
}
cloudAndHistory().catch(error => { console.error(error); process.exitCode = 1; });

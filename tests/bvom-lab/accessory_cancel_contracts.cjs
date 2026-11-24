'use strict';

const assert = require('node:assert/strict');
const H = require('./lib/bvom_harness');
const build = H.loadBuild(process.argv[2] || '.');
const copy = value => JSON.parse(JSON.stringify(value));

function boot() {
  const app = H.boot(build);
  H.configureLP(app);
  return app;
}

function reload(app) {
  return H.boot(build, {ls: app.ls, ss: H.memStore({bvom_tab_id: app.ctx.bvomTabId()})});
}

function dialog(app, open) {
  let handlers;
  app.ctx.bvomRepModal = (_name, _load, _target, _reps, record, _rpe, cancel) => {
    handlers = {record, cancel: cancel || (() => {})};
  };
  open();
  return handlers;
}

for (const kind of (process.argv[3] || 'loaded,gpp,main').split(',')) {
  let app = boot();
  if (kind === 'gpp') {
    app.ev(`state.gppList=[{id:'test',name:'Carries',metrics:{sets:true,reps:true,load:true},planned:{sets:3,reps:5,load:20}}];save()`);
    const open = index => {
      app.ctx.bvomGppSetModal('test', index);
      return app.lastOverlay();
    };
    open(0).querySelector('[data-s]').onclick();
    open(1).querySelector('[data-s]').onclick();
    const other = copy(app.S().gppSession.test.sets[1]);
    open(2).querySelector('[data-c]').onclick();
    assert.ok(app.S().gppSession.test.sets[0].completed);
    open(0).querySelector('[data-c]').onclick();
    app = reload(app);
    assert.equal(app.S().gppSession.test.sets[0], null);
    assert.deepEqual(copy(app.S().gppSession.test.sets[1]), other);
    open(1).querySelector('[data-c]').onclick();
    assert.equal(reload(app).S().gppSession.test, undefined);
  } else {
    const key = kind === 'main' ? 'Squat' : 'ACC:test';
    if (kind === 'loaded') app.ev(`state.accessoryList=[{id:'test',name:'Curl',assignment:'Both',style:'straight',equipment:'dumbbell',sets:3,reps:5,weight:20,increment:2.5}];save()`);
    const open = index => dialog(app, () => kind === 'main' ? app.ctx.tapSet(key, index) : app.ctx.tapAccessory('test', index));
    const weight = () => kind === 'main' ? app.S().weights[key] : app.S().accessoryList[0].weight;
    const initialWeight = weight();
    open(2).cancel();
    assert.equal(app.S().session[key]?.[2], undefined);
    for (let index = 0; index < 3; index++) open(index).record(5, 8);
    assert.ok(weight() > initialWeight);
    const other = copy(app.S().session[key][1]);
    const last = copy(app.S().session[key][2]);
    const stale = open(0);
    open(0).cancel();
    stale.cancel();
    app = reload(app);
    assert.equal(app.S().session[key][0], undefined);
    assert.deepEqual(copy(app.S().session[key][1]), other);
    assert.deepEqual(copy(app.S().session[key][2]), last);
    assert.equal(weight(), initialWeight);
  }
  console.log('PASS Cancel contract:', kind);
}

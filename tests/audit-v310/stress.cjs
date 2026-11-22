'use strict';

const assert = require('node:assert/strict');
const H = require('../bvom-lab/lib/bvom_harness');
const O = require('./oracle.cjs');
const build = H.loadBuild(process.argv[2] || '.');
const mode = process.argv[3];
const lift = 'Squat';
const seeds = [310017, 310053, 310091, 310219, 310447, 310701];

function configure(app, {sets, reps, load=100, drop=10, grid=2.5, rpt=false}) {
  const state = app.S();
  state.day = 'A';
  state.weights[lift] = load;
  state.enabledStandard = [grid/2];
  state.barByLift[lift] = 20;
  Object.assign(state.core[lift], {mode:rpt?'rpt':'straight',drop,increment:grid});
  state.fixedWorkingSets = {lprpt:{[lift]:{sets,reps}}};
  state.session = {};
  state.processed = {};
  state.processedSnapshots = {};
  state.attempts = {};
  state.workoutStartedAt = null;
  delete state.pendingCloseMissChoice;
}

function open(app, index) {
  let dialog;
  app.ctx.bvomRepModal = (_title,_weight,_target,_initial,record,_rpe,cancel) => { dialog={record,cancel}; };
  app.ctx.tapSet(lift,index);
  assert.ok(dialog);
  return dialog;
}

function edit(app, sets, reps, load) {
  app.ctx.bvomWeightModal = (_name,current,save) => save(load??current,{sets,reps},load??current);
  app.ctx.editWeight(lift);
}

const cases = {planner:0, oracleChecks:0, durable:0, reloads:0};
if (mode !== 'edges') {
  for (const seed of seeds) {
    const roll=O.random(seed);
    const app=H.boot(build);
    H.configureLP(app);
    for (let n=0;n<500;n++) {
      const grid=[1,2.5,5][roll(0,2)];
      const spec={sets:roll(1,20),reps:roll(1,50),load:grid*roll(23,120),bar:20,grid,
        drop:roll(1,25),rpt:n%4!==0,actual:[]};
      configure(app,spec);
      for(let i=0;i<=spec.sets;i++) {
        const expected=O.prescription(spec);
        const actual=Array.from(app.ctx.getSetPlan(lift),({target,load})=>({target,load}));
        assert.deepEqual(actual,expected,`seed ${seed}, case ${n}, prefix ${i}`);
        const result=app.ctx.coreResult(lift);
        const outcome=result.incomplete?'open':result.failed?'failure':result.close?'close':'success';
        assert.equal(outcome,O.outcome(spec));
        cases.oracleChecks+=2;
        if(i===spec.sets)break;
        const row={...expected[i],reps:Math.max(0,expected[i].target+roll(-5,4))};
        spec.actual.push(row);
        app.S().session[lift][i]=row;
      }
      cases.planner++;
    }
    for(let n=0;n<12;n++) {
      const a=H.boot(build);
      H.configureLP(a);
      const [sets,reps]=n<5?[[1,1],[3,8],[4,9],[5,3],[2,10]][n]:[roll(1,7),roll(1,15)];
      configure(a,{sets,reps,load:100,grid:2.5});
      a.ev('save()');
      const rows=[];
      for(let i=0;i<sets;i++) {
        const entry=open(a,i);
        entry.record(reps);
        entry.record(reps);
        rows.push([a.S().session[lift][i].load,a.S().session[lift][i].reps,a.S().session[lift][i].target]);
        assert.equal(a.S().weights[lift],i+1===sets?102.5:100);
      }
      const bigger=sets+1;
      edit(a,bigger,reps);
      assert.equal(a.S().weights[lift],100);
      const same=a.ls.getItem('bvom_data');
      edit(a,bigger,reps);
      assert.equal(a.ls.getItem('bvom_data'),same);
      const r=H.boot(build,{ls:a.ls,ss:H.memStore({bvom_tab_id:a.ctx.bvomTabId()})});
      assert.equal(r.ctx.getSetPlan(lift).length,bigger);
      assert.equal(r.S().weights[lift],100);
      edit(r,Math.max(1,sets-1),reps);
      assert.equal(r.S().weights[lift],102.5);
      assert.deepEqual(Object.values(r.S().session[lift]).map(x=>[x.load,x.reps,x.target]),rows);
      H.finish(r);
      H.finish(r);
      assert.equal(r.S().history.length,1);
      assert.deepEqual(Object.values(r.S().history[0].session[lift]).map(x=>[x.load,x.reps,x.target]),rows);
      cases.durable++;
      cases.reloads++;
    }
  }
  console.log(JSON.stringify({seeds,...cases}));
}

function edge(name, check) {
  try { check(); console.log('PASS',name); }
  catch(error) { console.error('FAIL',name,error.message);process.exitCode=1; }
}
if(mode!=='oracle') {
  edge('final fixed set Cancel releases the active workout',()=>{
    const app=H.boot(build);H.configureLP(app);
    configure(app,{sets:1,reps:1});app.ev('save()');
    open(app,0).record(1);
    assert.equal(app.S().weights[lift],102.5);
    assert.equal(open(app,0).cancel(),true);
    assert.equal(app.S().weights[lift],100);
    assert.equal(app.S().workoutStartedAt,null);
    assert.equal(app.ctx.bvomStateWorkoutActive(app.S()),false);
  });
  edge('stale set entry after prescription edit cannot record the old target',()=>{
    const app=H.boot(build);H.configureLP(app);
    configure(app,{sets:1,reps:8});app.ev('save()');
    const old=open(app,0);
    edit(app,2,10);
    old.record(8);
    assert.equal(app.S().session[lift][0],undefined);
    assert.equal(app.S().weights[lift],100);
  });
  edge('old lighter actual cannot earn an increment at raised working weight',()=>{
    const app=H.boot(build);H.configureLP(app);
    configure(app,{sets:1,reps:8});app.ev('save()');
    open(app,0).record(8);
    edit(app,1,8,120);
    assert.equal(app.S().session[lift][0].load,100);
    assert.equal(app.S().weights[lift],120);
    assert.equal(Boolean(app.S().processed[lift]),false);
  });
  edge('RPT half-grid drop rounds to the upper load',()=>{
    const app=H.boot(build);H.configureLP(app);
    configure(app,{sets:2,reps:8,load:250,drop:7,grid:5,rpt:true});app.ev('save()');
    open(app,0).record(4);
    assert.equal(app.ctx.getSetPlan(lift)[1].load,235);
  });
  edge('unit conversion does not disqualify the same physical work',()=>{
    const app=H.boot(build);H.configureLP(app);
    configure(app,{sets:2,reps:8,load:62.5});app.ev('save()');
    open(app,0).record(8);
    app.ctx.changeUnits('lb',true);
    assert.equal(app.ctx.getSetPlan(lift)[0].load,140);
    assert.ok(app.S().session[lift][0].load<140);
    open(app,1).record(8);
    assert.equal(app.S().weights[lift],145);
  });
}

'use strict';
const assert=require('node:assert/strict');
const H=require('../bvom-lab/lib/bvom_harness');
const O=require('./oracle.cjs');
const build=H.loadBuild(process.argv[2]||'.');
const seeds=[713101,713227,713423,713551,713693];
const names=['Squat','Bench Press','Prone Row'];
const copy=x=>JSON.parse(JSON.stringify(x));

function edit(app,lift,sets,reps) {
  app.ctx.bvomWeightModal=(_lift,weight,save)=>save(weight,{sets,reps},weight);
  app.ctx.editWeight(lift);
}

function display(app,lift) {
  const name=lift.replace(/\W/g,'');
  const html=app.els['#workout'].innerHTML;
  const start=html.indexOf('id="work-'+name+'"');
  assert.ok(start>=0,'lift card is rendered');
  const tail=html.slice(start+name.length+10);
  const end=tail.indexOf('data-core-add-extra=');
  const card=tail.slice(0,end);
  return Array.from(card.matchAll(/<div class="setload">([\d.]+)×(\d+)(\+?)<\/div>(<div class="extraLabel">RPT<\/div>)?/g),
    m=>[Number(m[1]),Number(m[2]),m[3]==='+',Boolean(m[4])]);
}
function expectCard(app,name,lift,message){
  const expected=O.rows(lift);
  const visible=display(app,name);
  assert.deepEqual(visible,expected.map(([load,reps,amrap,rpt],i)=>[lift.actual[i]?.load??load,reps,amrap,rpt]),message);
}

let workouts=0,actions=0,checks=0,reloads=0,histories=0,liveEdits=0;
const trials=Number(process.env.BVOM_E2E_VM_TRIALS||180);
for(const seed of seeds){
  const roll=O.random(seed);
  let app=H.boot(build);
  H.configureLP(app);
  for(let run=0;run<trials;run++){
    Object.assign(app.S(),{session:{},processed:{},processedSnapshots:{},attempts:{},fixedWorkingSets:{},
      history:[],workoutStartedAt:null,workoutOwnershipVersion:null,warmupPlans:{},warmupDone:{},timerStart:null});
    delete app.S().pendingCloseMissChoice;
    const lifts={};
    names.forEach((name,index)=>{
      const weight=roll(14,48)*2.5,drop=roll(1,10)*2;
      app.S().weights[name]=weight;
      Object.assign(app.S().core[name],{mode:'straight',increment:2.5,drop});
      lifts[name]={sets:3,reps:5,weight,drop,grid:2.5,actual:[],edited:false,missAt:-1};
    });
    app.S().enabledStandard=[1.25];
    app.ev('save();renderAll()');
    for(const [index,name] of names.entries()){
      const lift=lifts[name];
      const policy=(run+index)%3;
      if(policy!==0){
        const sets=roll(1,6),reps=roll(2,12);
        edit(app,name,sets===3&&reps===5?4:sets,reps);
        if(policy===2)edit(app,name,3,5);
        else Object.assign(lift,{sets:sets===3&&reps===5?4:sets,reps,edited:true});
      }
      lift.missAt=roll(-1,lift.sets-1);
      expectCard(app,name,lift,`${seed}/${run} initial ${name}`);
      checks++;
    }
    let next;
    while((next=names.filter(n=>lifts[n].actual.length<O.rows(lifts[n]).length)).length){
      const name=next[roll(0,next.length-1)],lift=lifts[name],i=lift.actual.length;
      const [load,target]=O.rows(lift)[i];
      const reps=i===lift.missAt?roll(0,target-1):i>lift.missAt&&lift.missAt>=0&&i<lift.sets&&roll(0,3)===0?0:target;
      app.reps.push(reps);
      app.ctx.tapSet(name,i);
      lift.actual.push({reps,load,target});
      for(const checked of names){
        expectCard(app,checked,lifts[checked],`${seed}/${run}/${name}/${i} → ${checked}`);
        checks++;
      }
      const result=O.result(lift),increment=result==='increase'?2.5:0;
      assert.equal(app.S().weights[name],lift.weight+increment,`${seed}/${run}/${name} progression`);
      assert.equal(app.S().attempts[name]||0,result==='repeat'?1:0);
      checks+=2;actions++;
      if(run%5===0&&name==='Squat'&&i===0&&lift.sets>1){
        const actual=copy(app.S().session[name]);
        const sets=3,reps=run%10===0?5:roll(6,12);
        edit(app,name,sets,reps);
        Object.assign(lift,{sets,reps,edited:lift.edited||lift.sets!==sets||lift.reps!==reps,missAt:roll(1,sets-1)});
        assert.deepEqual(copy(app.S().session[name]),actual);
        expectCard(app,name,lift,`${seed}/${run} mid-workout edit`);
        liveEdits++;checks+=2;
      }
      if(run%30===0&&i===0&&name==='Squat'){
        const tab=app.ctx.bvomTabId();
        app=H.boot(build,{ls:app.ls,ss:H.memStore({bvom_tab_id:tab})});
        app.ev('renderAll()');
        for(const k of names){expectCard(app,k,lifts[k],'reloaded displays');checks++}
        reloads++;
      }
    }
    if(run%6===0){
      H.finish(app);H.finish(app);
      assert.equal(app.S().history.length,1);
      for(const name of names){
        const actual=Object.values(app.S().history[0].session[name]).map(({reps,load,target})=>({reps,load,target}));
        assert.deepEqual(actual,lifts[name].actual);
      }
      histories++;checks+=4;
    }
    workouts++;
  }
}
console.log(JSON.stringify({seeds,workouts,liftSequences:workouts*names.length,actions,checks,reloads,histories,liveEdits}));

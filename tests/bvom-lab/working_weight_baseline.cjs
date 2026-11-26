'use strict';
// Compare real engine outcomes, recorded actuals and completed History to exact v3.0.2.
const a=require('node:assert/strict'),path=require('node:path'),H=require('./lib/bvom_harness');
const baseline=process.argv[2];if(!baseline)throw Error('Pass exact v3.0.2 checkout');
const candidate=H.loadBuild(path.resolve(__dirname,'../..')),previous=H.loadBuild(path.resolve(baseline)),clone=x=>JSON.parse(JSON.stringify(x));
const evolvedB=candidate.html.includes('core.romanian_deadlift')&&!previous.html.includes('core.romanian_deadlift');
function boot(build,mode,day,rpt,attempts){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);Object.assign(h.S(),{programMode:mode,day,accessoryList:[],gppList:[]});h.ev('ensureHLM()');for(const[n]of h.ctx.program()){h.S().core[n].mode=rpt?'rpt':'straight';h.S().attempts[n]=attempts;h.S().hlm.failCount[n]=attempts}h.ctx.bvomWeightModal=(_n,_w,save)=>save(80);h.ev('save()');return h}
function outcome(h){
 const s=h.S(),result=clone({weights:s.weights,attempts:s.attempts,core:s.core,hlm:s.hlm,session:s.session,processed:s.processed,snapshots:s.processedSnapshots,history:s.history.map(({date,workoutId,sourceAppVersion,...performance})=>performance),pending:s.pendingCloseMissChoice,setup:s.setupAfterFinish});
 // These workouts do not prescribe RDL. Keep the paired comparison on all
 // previously existing data, with the added lift verified by its own contracts.
 if(evolvedB){
  delete result.weights['Romanian Deadlift'];delete result.core['Romanian Deadlift'];
  for(const item of result.history)delete item.weights['Romanian Deadlift'];
 }
 return result;
}
let count=0;H.withClock(()=>{
 for(const[mode,days]of [['lprpt',['A','B']],['hlm',['H','L','M']],['fourday',['1','2','3','4']]])for(const day of days)for(const rpt of [false,true])for(const attempts of [0,2])for(const scenario of ['success','fail','close'])for(const pick of ['L','R']){
  if(evolvedB&&mode==='lprpt'&&day==='B')continue;
  const pair=[boot(previous,mode,day,rpt,attempts),boot(candidate,mode,day,rpt,attempts)];
  for(const h of pair){h.choices=Array(40).fill(pick);for(const[n]of h.ctx.program()){
   h.S().session[n]={'EXTRA:0':{load:999,reps:99,extra:true}};
   for(let i=0;i<h.ctx.getSetPlan(n).length;i++){const q=h.ctx.getSetPlan(n)[i];h.reps.push(scenario==='fail'&&i===0?0:scenario==='close'&&i===1?q.target-1:q.target);h.ctx.tapSet(n,i)}
   h.S().session[n]['EXTRA:1']={load:777,reps:7,extra:true};h.ctx.renderWorkout();
  }}
  const label=[mode,day,rpt,attempts,scenario,pick].join('/');
  function expectedOutcome(){
   const expected=outcome(pair[0]);
   // v3.0.2's mutable preview leaked Supine Row's suggested mode or
   // level into its settings even when the lifter chose Repeat.
   if(mode==='hlm'&&day==='M'&&attempts===2&&scenario!=='success'&&pick==='L'){
    const row=expected.core['Supine Row'];
    if(rpt){a.equal(row.rptLevel,1,label);row.rptLevel=0;}
    else{a.equal(row.mode,'rpt',label);row.mode='straight';}
   }
   return expected;
  }
  a.deepEqual(outcome(pair[1]),expectedOutcome(),label);
  for(const h of pair)H.finish(h);a.deepEqual(outcome(pair[1]),expectedOutcome(),label);count++;
 }
});console.log('PASS '+count+' paired full workouts on shared templates: matched progression, decisions, actuals and History with corrected Supine Row Repeat behavior');

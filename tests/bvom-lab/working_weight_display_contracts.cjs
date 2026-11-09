'use strict';
module.exports=({test,ok,H,build})=>{
 const a=require('node:assert/strict'),clone=x=>JSON.parse(JSON.stringify(x));
 function boot(mode='lprpt',day='A'){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().programMode=mode;h.S().day=day;h.S().accessoryList=[];h.S().gppList=[];h.ev('ensureHLM();save()');return h}
 function record(h,n,fail=false){for(let i=0;i<h.ctx.getSetPlan(n).length;i++){const q=h.ctx.getSetPlan(n)[i];h.reps.push(fail&&i===0?0:q.target);h.ctx.tapSet(n,i)}}
 function card(h,n){h.ctx.renderWorkout();return h.els['#workout'].innerHTML.split('id="work-'+n.replace(/\W/g,'')+'"')[1]?.split('<div class="exercise"')[0]||''}
 function main(h,n,w){a.match(card(h,n),new RegExp('class="weight"[^>]*>'+h.ctx.fmt(w)+' '+h.ctx.unitLabel()+'</div>'))}
 test('WORKING-WEIGHT-LP-RPT','DEFECT','Successful LP/RPT current/top weights survive progression, reload and corrections',()=>{
  for(const rpt of [false,true])for(const day of ['A','B']){let h=boot('lprpt',day);for(const [n]of h.ctx.program()){h.S().core[n].mode=rpt?'rpt':'straight';const p=h.ctx.corePrescription(n),w=p.loads[p.topIndex];record(h,n);main(h,n,w);a.match(card(h,n),/data-next-workout-weight/);const saved=clone(h.S());h=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});main(h,n,w);a.deepEqual(clone(h.S().weights),saved.weights);h.ctx.tapSet(n,0);main(h,n,w);}}
  return ok(true,'straight, RPT3, RPT5 and deadlift; reload and correction');
 });
 test('WORKING-WEIGHT-INTERMEDIATE','DEFECT','All HLM and four Split days keep session loads separate from Heavy drivers',()=>{
  for(const [mode,days]of [['hlm',['H','L','M']],['fourday',['1','2','3','4']]])for(const day of days){const h=boot(mode,day);for(const [n]of h.ctx.program()){const p=h.ctx.corePrescription(n),w=p.kind==='hlmHeavy'?h.ctx.hlmHeavyTarget(n):p.loads[p.topIndex];record(h,n);main(h,n,w);if(['hlmMedium','hlmLight'].includes(p.kind))a.doesNotMatch(card(h,n),/data-next-workout-weight/);if(p.kind==='hlmHeavy')a.match(card(h,n),mode==='hlm'?/Next Heavy workout/:/Next workout [12]/);}}
  return ok(true,'all seven session destinations');
 });
 test('WORKING-WEIGHT-FAIL-DECISION','DEFECT','Failure, terminal reset and unresolved close miss retain the current weight without predictions',()=>{
  for(const rpt of [false,true])for(const attempts of [0,2]){const h=boot();h.S().core.Squat.mode=rpt?'rpt':'straight';h.S().core.Squat.rptLevel=rpt?4:0;h.S().attempts.Squat=attempts;h.ctx.bvomChoiceModal=()=>{};h.ctx.bvomEndRoad=(_n,f)=>f();h.ctx.bvomWeightModal=(_n,_w,f)=>f(80);record(h,'Squat',true);main(h,'Squat',100);if(h.S().weights.Squat===80)a.match(card(h,'Squat'),/Next workout: 80 kg/);else a.doesNotMatch(card(h,'Squat'),/data-next-workout-weight/);}
  const h=boot();h.S().core.Squat.mode='rpt';h.ctx.bvomChoiceModal=()=>{};for(let i=0;i<h.ctx.getSetPlan('Squat').length;i++){const q=h.ctx.getSetPlan('Squat')[i];h.reps.push(i===1?q.target-1:q.target);h.ctx.tapSet('Squat',i)}a.ok(h.S().pendingCloseMissChoice);main(h,'Squat',100);a.doesNotMatch(card(h,'Squat'),/data-next-workout-weight/);
  const r=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});main(r,'Squat',100);a.doesNotMatch(card(r,'Squat'),/data-next-workout-weight/);
  for(const mode of ['hlm','fourday']){const z=boot(mode,mode==='hlm'?'H':'2');const w=z.ctx.hlmHeavyTarget('Squat');z.S().hlm.failCount.Squat=2;z.ctx.bvomChoiceModal=()=>{};record(z,'Squat',true);a.ok(z.S().hlm.pendingRepChoice);main(z,'Squat',w);a.doesNotMatch(card(z,'Squat'),/data-next-workout-weight/);const rr=H.boot(build,{ls:z.ls,ss:z.ctx.sessionStorage,supabase:null,online:false});main(rr,'Squat',w);a.doesNotMatch(card(rr,'Squat'),/data-next-workout-weight/);}
  return ok(true,'failures, terminal deload and durable LP/HLM/Split pending decisions');
 });
 test('WORKING-WEIGHT-MANUAL-EXTRAS','DEFECT','Manual weight edits remain visible; extras never replace current prescriptions',()=>{
  for(const mode of ['lprpt','hlm','fourday']){const h=boot(mode,mode==='hlm'?'H':mode==='fourday'?'2':'A');h.ctx.tapSet('Squat',0);h.ctx.bvomWeightModal=(_n,_w,f)=>f(110);h.ctx.editWeight('Squat');main(h,'Squat',110);record(h,'Squat');main(h,'Squat',110);h.ctx.bvomWeightModal=(_n,_w,f)=>f(115);h.ctx.editWeight('Squat');main(h,'Squat',115);a.doesNotMatch(card(h,'Squat'),/data-next-workout-weight/);h.S().session.Squat['EXTRA:0']={load:999,reps:99,extra:true};main(h,'Squat',115);h.ev('save()');const r=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});main(r,'Squat',115);}
  const z=boot('hlm','H');z.S().hlm.nextHeavy.Squat=110;z.S().session.Squat={'EXTRA:0':{load:999,reps:99,extra:true}};main(z,'Squat',110);a.doesNotMatch(card(z,'Squat'),/data-next-workout-weight/);record(z,'Squat');main(z,'Squat',110);a.match(card(z,'Squat'),/Next Heavy workout: 112.5 kg/);z.ctx.changeUnits('lb',true);z.ctx.changeUnits('kg',true);main(z,'Squat',110);
  return ok(true,'edits before/after processing and reload; extras before queued Heavy activation; unit roundtrip');
 });
};

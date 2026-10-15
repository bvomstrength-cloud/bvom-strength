'use strict';
// Issue #55, Stage A — real app, read-only candidate planner contracts.
// These tests exercise the unwired candidate only; they do NOT claim the
// Bodybuilding Warm-up screen has changed or that On-Ramp is now qualitative.
module.exports=({test,ok,H,build})=>{
 const example=(h,id,load,onramp=false)=>h.ev('bvomBbStageAWarmupPlan('+JSON.stringify(id)+','+Number(load)+','+Boolean(onramp)+')');
 const stable=(a)=>a.every((set,i)=>Number.isFinite(set[0])&&set[0]>0&&(i===0||set[0]>=a[i-1][0]));

 test('BB-STAGE-A-CATALOGUE','CONTROL','Stage-A warm-up roles account for every Bodybuilding exercise exactly once',()=>{
  const h=H.boot(build);
  const ids=h.ev('Object.keys(BVOM_BB_EXERCISES)'),profile=h.ev('Object.keys(BVOM_BB_WARMUP_STAGE_A_PROFILES)');
  const missing=ids.filter(x=>!profile.includes(x)),extra=profile.filter(x=>!ids.includes(x));
  return ok(missing.length===0&&extra.length===0&&new Set(profile).size===profile.length,
   JSON.stringify({count:ids.length,profile:profile.length,missing,extra}));
 });
 test('BB-STAGE-A-CORE-UNCHANGED','CONTROL','Adapter preserves the real strength warmups() output and never mutates stored state',()=>{
  const h=H.boot(build),loads=[['Squat',100],['Bench Press',85],['Prone Row',100],['Deadlift',120],['Overhead Press',50]];
  const before=loads.map(([lift,w])=>JSON.stringify(h.ctx.warmups(w,lift))),saved=h.ls.getItem('bvom_data');
  const state=JSON.stringify(h.S());
  for(const [id,w] of [['high_bar_squat',100],['barbell_bench_press',85],['barbell_row',50],['romanian_deadlift',100],['leg_press',100],['bulgarian_split_squat',20]])example(h,id,w);
  const after=loads.map(([lift,w])=>JSON.stringify(h.ctx.warmups(w,lift)));
  return ok(before.join('|')===after.join('|')&&state===JSON.stringify(h.S())&&saved===h.ls.getItem('bvom_data'),
   JSON.stringify({same:before.join('|')===after.join('|'),stateSame:state===JSON.stringify(h.S()),persistedSame:saved===h.ls.getItem('bvom_data')}));
 });
 test('BB-STAGE-A-FREEBAR','CONTROL','Main-block freebar squat and bench retain the original engine ramps including repeated bar exposures',()=>{
  const h=H.boot(build),a=example(h,'high_bar_squat',100),b=example(h,'barbell_bench_press',85);
  const sq=h.ctx.warmups(100,'Squat'),bp=h.ctx.warmups(85,'Bench Press');
  return ok(a.kind==='full'&&b.kind==='full'&&JSON.stringify(a.sets)===JSON.stringify(sq)&&JSON.stringify(b.sets)===JSON.stringify(bp)&&sq.filter(x=>x[0]===20).length===2&&stable(a.sets)&&stable(b.sets),
   JSON.stringify({squat:a.sets,bench:b.sets}));
 });
 test('BB-STAGE-A-MACHINE','CONTROL','Leg press has progressive advisory loads, with no invented empty-bar exposure or plate advice',()=>{
  const h=H.boot(build);
  h.S().bodybuilding={progression:{leg_press:{increment:5}}};
  const a=example(h,'leg_press',100),b=example(h,'leg_press',150);
  const valid=p=>p.kind==='full'&&p.equipmentNote==='nearest_available_weight'&&p.sets.length>=2&&p.sets.every(([w])=>w>20&&w%5===0&&w<p.targetW)&&stable(p.sets);
  return ok(valid({...a,targetW:100})&&valid({...b,targetW:150}),
   JSON.stringify({legPress100:a.sets,legPress150:b.sets}));
 });
 test('BB-STAGE-A-LIGHT-ROWS-HINGES','CONTROL','Light barbell rows and hinges still receive nonempty preparation below core 60 kg floor',()=>{
  const h=H.boot(build),row=example(h,'barbell_row',50),hinge=example(h,'romanian_deadlift',55);
  return ok(row.sets.length>0&&hinge.sets.length>0&&row.sets.every(([w])=>w<50)&&hinge.sets.every(([w])=>w<55)&&stable(row.sets)&&stable(hinge.sets),JSON.stringify({row:row.sets,hinge:hinge.sets}));
 });
 test('BB-STAGE-A-DB-ONRAMP-ACCESSORY','CONTROL','Per-hand DB preparation is short; On-Ramp calibration stays qualitative; accessories none',()=>{
  const h=H.boot(build),db=example(h,'dumbbell_bench_press',30),bul=example(h,'bulgarian_split_squat',20),
   ramp=example(h,'high_bar_squat',100,true),unknown=example(h,'missing_id',100),
   accessory=example(h,'cable_lateral_raise',10);
  return ok(db.unitBasis==='per_hand'&&db.kind==='short'&&db.sets.length===2&&db.sets.every(([w])=>w<30)&&
   bul.kind==='short'&&bul.sets.length>0&&ramp.kind==='guidance'&&ramp.sets.length===0&&ramp.finding===true&&
   unknown.kind==='none'&&accessory.kind==='none',JSON.stringify({db:db.sets,bulgarian:bul.sets,or:ramp}));
 });
 test('BB-STAGE-A-IMPERIAL','CONTROL','Imperial ramps are increasing, below working load, and no false 45 lb machine bar is prescribed',()=>{
  const h=H.boot(build);h.S().unit='lb';h.S().bar=45;
  const sq=example(h,'high_bar_squat',225),machine=example(h,'leg_press',225);
  return ok(sq.kind==='full'&&sq.sets.some(([w])=>w===45)&&stable(sq.sets)&&sq.sets.every(([w])=>w<225)&&
   machine.kind==='full'&&stable(machine.sets)&&machine.sets.every(([w])=>w>45&&w<225),JSON.stringify({squat:sq.sets,machine:machine.sets}));
 });
};

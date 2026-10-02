#!/usr/bin/env node
'use strict';
// BVOM sequence/invariant gate.
// Purpose: protect cross-feature state-machine invariants rather than individual historical bugs.
// Usage: node sequence_guard.js <extracted-build-dir> [--json]
const H=require('./lib/bvom_harness');
const args=process.argv.slice(2),dir=args.find(a=>!a.startsWith('--')),asJson=args.includes('--json');
if(!dir){console.error('Usage: node sequence_guard.js <extracted-build-dir> [--json]');process.exit(2)}
const build=H.loadBuild(dir),R=[];
const test=(id,title,fn)=>R.push({id,title,fn});
const {configureLP,bbStart,bbSet}=H;
function setLiftSettingsFields(h,n,{weight,increment,drop=10,mode='straight',level=0,rep=5,bar=20}={}){
  const id=n.replace(/\W/g,''),d=h.ctx.document,vals={['plateMode'+id]:'standard',['mode'+id]:mode,['inc'+id]:String(increment),['drop'+id]:String(drop),['level'+id]:String(level),['weight'+id]:String(weight),['bar'+id]:String(bar),['hlmRep'+id]:String(rep)};
  for(const [k,v] of Object.entries(vals))d.getElementById(k).value=v;
}
function accessory(id='a1'){return{id,name:'Cable Row',category:'Upper',assignment:'A',hlmAssignment:'Any',fourDayAssignment:'Any',freeAssignment:null,bbAssignment:null,equipment:'machine',plateMode:'standard',style:'straight',sets:3,reps:8,topReps:8,weight:20,increment:2.5,drop:5}}
function completeCore(h,n){let p=h.ctx.getSetPlan(n);for(let i=0;i<p.length;i++){h.ctx.tapSet(n,i);p=h.ctx.getSetPlan(n)}}
function completeMissingCore(h,n,start=0){let p=h.ctx.getSetPlan(n);for(let i=start;i<p.length;i++){if(!h.S().session[n]?.[i])h.ctx.tapSet(n,i);p=h.ctx.getSetPlan(n)}}

test('INV-NOOP-IS-NEUTRAL','A no-op settings save after a processed lift must not rewrite the semantic rollback point',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});completeCore(h,'Squat');const before=JSON.parse(JSON.stringify(h.S().processedSnapshots.Squat));
  setLiftSettingsFields(h,'Squat',{weight:h.S().weights.Squat,increment:h.S().core.Squat.increment});h.ctx.saveLiftSettings('Squat');const after=h.S().processedSnapshots.Squat;
  return {pass:JSON.stringify(after)===JSON.stringify(before),detail:`snapshot weight ${before?.weight}->${after?.weight}; current=${h.S().weights.Squat}`};
});

test('INV-RESTORABLE-STATE-UNIT-COHERENCE','Every state object that may later be restored must convert together and survive a no-training unit round trip',()=>{
  const out=[];let pass=true;for(const mode of ['hlm','fourday']){
    const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40,'Bench Press':40});const n=mode==='hlm'?'Squat':'Bench Press';h.S().core[n].increment=1.5;h.choices.push('R');h.ctx.chooseProgramMode(mode);completeCore(h,n);h.ctx.changeUnits('lb',true);
    const live=h.S().hlm.driver[n],snap=h.S().processedSnapshots?.[n]?.hlm?.driver?.[n],snapIncLb=h.S().processedSnapshots?.[n]?.cfg?.increment;h.ctx.changeUnits('kg',true);const backLive=h.S().hlm.driver[n],backSnap=h.S().processedSnapshots?.[n]?.hlm?.driver?.[n],liveInc=h.S().core[n].increment,snapInc=h.S().processedSnapshots?.[n]?.cfg?.increment,good=live>=85&&snap>=85&&Math.abs(live-snap)<=5&&snapIncLb===2.5&&backLive===40&&backSnap===40&&liveInc===1.5&&snapInc===1.5;pass=pass&&good;out.push(`${mode}/${n}: lb live/snapshot=${live}/${snap} inc=${snapIncLb}; back=${backLive}/${backSnap} inc=${liveInc}/${snapInc}`)
  }return {pass,detail:out.join(' | ')};
});

test('INV-NO-TRAINING-ROUNDTRIP-REVERSIBLE','Program state changed only by kg→lb→kg must return to the original practical On-Ramp values before handoff',()=>{
  const out=[];let pass=true;for(const inc of [1,1.5,2,2.5]){const h=H.boot(build);bbStart(h,{onramp:true});for(const id of Object.values(h.S().bodybuilding.selections)){const e=h.ctx.bvomBbOnRampEx(id);if(h.ctx.bvomBbNumericExercise(id)){e.load=id==='machine_chest_press'?30:(H.BB_LOADS[id]||20);e.increment=id==='machine_chest_press'?inc:2.5}else e.resistance='green band';e.state='CONFIRMED'}h.ev('save()');const e0=h.ctx.bvomBbOnRampEx('machine_chest_press'),before=[e0.load,e0.increment];h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);const e=h.ctx.bvomBbOnRampEx('machine_chest_press'),good=e.load===before[0]&&e.increment===before[1];pass=pass&&good;out.push(`+${inc}: ${before[0]}/+${before[1]} -> ${e.load}/+${e.increment}`)}return {pass,detail:out.join(' | ')};
});

test('INV-CORRECTION-RECOMPUTES-RESULT','Correcting processed work must roll back the result before recalculating it; a stale processed guard cannot preserve earned progression',()=>{
  const h=H.boot(build);configureLP(h);const a=accessory();h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);const earned=a.weight;h.reps.push(5);h.ctx.tapAccessory('a1',0);const corrected=a.weight,plan=h.ctx.accessoryPlan17(a),ss=h.S().session['ACC:a1']||{},coherent=plan.every((q,i)=>!ss[i]||Math.abs(Number(ss[i].load)-Number(q.load))<1e-9);return {pass:earned===22.5&&corrected===20&&coherent,detail:`earned=${earned} corrected=${corrected} coherent=${coherent}`};
});

test('INV-RECORDED-WORK-IS-NONDESTRUCTIVE','Once live work is recorded, removing its template cannot erase the record before Finish/History',()=>{
  let pass=true;const out=[];
  {const h=H.boot(build);configureLP(h);const a=accessory();h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};h.ctx.tapAccessory('a1',0);h.choices.push('R');h.ctx.removeAccessory('a1');const kept=!!h.S().session['ACC:a1']&&h.S().accessoryList.some(x=>x.id==='a1');pass=pass&&kept;out.push(`accessory=${kept?'kept':'lost'}`)}
  {const h=H.boot(build);configureLP(h);h.S().gppList=[{id:'g1',name:'Sled Push',assignment:'A',metrics:{reps:true,load:true,distance:false,timed:false}}];h.S().gppSession={g1:{sets:[{reps:10,load:20}],actual:{reps:10,load:20}}};h.S().workoutStartedAt=Date.now();h.ev('save()');h.choices.push('R');h.ctx.removeGpp('g1');const kept=!!h.S().gppSession.g1&&h.S().gppList.some(x=>x.id==='g1');pass=pass&&kept;out.push(`gpp=${kept?'kept':'lost'}`)}
  return {pass,detail:out.join(' | ')};
});



test('INV-POSTRESULT-CONFIG-CANNOT-REPRICE-EARNED-RESULT','Settings changed after a result is earned may affect future progression, but cannot retroactively re-price or erase that already-earned result',()=>{
  let pass=true;const out=[];
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40});completeCore(h,'Squat');const earned=h.S().weights.Squat;setLiftSettingsFields(h,'Squat',{weight:earned,increment:5});h.ctx.saveLiftSettings('Squat');h.reps.push(5);h.ctx.tapSet('Squat',2);completeMissingCore(h,'Squat');const good=h.S().weights.Squat===earned&&h.S().core.Squat.increment===5;pass=pass&&good;out.push(`core=${earned}->${h.S().weights.Squat}/+${h.S().core.Squat.increment}`)}
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100});h.choices.push('R');h.ctx.chooseProgramMode('hlm');completeCore(h,'Squat');const earned=h.S().hlm.nextHeavy.Squat;setLiftSettingsFields(h,'Squat',{weight:100,increment:5});h.ctx.saveLiftSettings('Squat');const good=h.S().hlm.nextHeavy.Squat===earned;pass=pass&&good;out.push(`hlm next=${earned}->${h.S().hlm.nextHeavy.Squat}`)}
  return {pass,detail:out.join(' | ')};
});

test('INV-CORRECTION-INVALIDATES-SUPERSEDED-CALIBRATION','When a corrected observation replaces the evidence that established calibration, stale confirmation cannot survive',()=>{
  const h=H.boot(build);bbStart(h,{onramp:true});const id='machine_chest_press',e=h.ctx.bvomBbOnRampEx(id);e.state='PROVISIONAL';e.load=40;e.increment=2.5;h.ev('save()');H.orSet(h,id,0,{reps:7,load:40,feel:'about_right',inc:'2.5'});const before=e.state;H.orSet(h,id,0,{reps:5,load:40,inc:'2.5'});return {pass:before==='CONFIRMED'&&e.state!=='CONFIRMED',detail:`${before}->${e.state}, corrected reps=${h.S().session['BBOR:'+id]?.[0]?.reps}`};
});

test('INV-FAILED-VALIDATION-IS-ATOMIC','A rejected transaction must leave both persisted state and the live in-memory model unchanged',()=>{
  const h=H.boot(build);bbStart(h,{onramp:true});const id='machine_chest_press',e=h.ctx.bvomBbOnRampEx(id);e.state='PROVISIONAL';e.load=40;e.increment=2.5;h.ev('save()');const before=JSON.stringify({load:e.load,inc:e.increment,session:h.S().session['BBOR:'+id]||{}});h.ctx.bvomBbOnRampSetModal(id,0);const o=h.lastOverlay();o.querySelector('[data-load]').value='60';o.querySelector('[data-inc]').value='0';o.querySelector('[data-reps]').value='7';o.querySelector('[data-save]').onclick();const after=JSON.stringify({load:e.load,inc:e.increment,session:h.S().session['BBOR:'+id]||{}});return {pass:before===after,detail:`before=${before} after=${after}`};
});

test('INV-NO-TRAINING-ROUNDTRIP-PRESERVES-RECORDED-VALUES','Changing display units twice with no training cannot change an already-recorded physical load or arbitrary legitimate equipment increment',()=>{
  let pass=true;const out=[];
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:41});h.S().session.Squat={0:{load:41,reps:5,target:5,index:0}};h.ev('save()');h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);const good=h.S().weights.Squat===41&&h.S().session.Squat[0].load===41;pass=pass&&good;out.push(`core=${h.S().weights.Squat}/${h.S().session.Squat[0].load}`)}
  {const h=H.boot(build);bbStart(h,{loads:{...H.BB_LOADS,machine_chest_press:30},incs:{machine_chest_press:4.5}});const p=h.S().bodybuilding.progression.machine_chest_press;h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);const good=p.load===30&&p.increment===4.5;pass=pass&&good;out.push(`BB=${p.load}/+${p.increment}`)}
  return {pass,detail:out.join(' | ')};
});



test('INV-ACTIVE-WORKOUT-PRESCRIPTION-IMMUTABLE','Once a lift has recorded work, later Settings changes may define future training but cannot change today’s prescription, completion obligations, or progression basis',()=>{
  let pass=true;const out=[];
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100});h.ctx.tapSet('Squat',0);const before=h.ctx.getSetPlan('Squat').map(q=>Number(q.load));setLiftSettingsFields(h,'Squat',{weight:110,increment:2.5,mode:'rpt'});h.ctx.saveLiftSettings('Squat');const after=h.ctx.getSetPlan('Squat').map(q=>Number(q.load));const good=JSON.stringify(before)===JSON.stringify(after);pass=pass&&good;out.push(`core ${before.join('/')} -> ${after.join('/')}`)}
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100,'Bench Press':80});h.choices.push('R');h.ctx.chooseProgramMode('hlm');h.ctx.switchDay('L');h.S().hlm.lightPct=20;h.ev('save()');h.ctx.tapSet('Squat',0);const before=h.ctx.getSetPlan('Squat').map(q=>Number(q.load));const d=h.ctx.document;d.getElementById('hlmLight').value='10';d.getElementById('hlmSqMed').value=String(h.S().hlm.squatMediumPct);d.getElementById('hlmBnMed').value=String(h.S().hlm.benchMediumPct);d.getElementById('hlmSingles').checked=!!h.S().hlm.optionalSingles;d.getElementById('hlmSingleSq').value=String(h.S().hlm.singlePct.Squat);d.getElementById('hlmSingleBn').value=String(h.S().hlm.singlePct['Bench Press']);d.getElementById('hlmSingleDl').value=String(h.S().hlm.singlePct.Deadlift);h.ctx.saveHlmSettings();const after=h.ctx.getSetPlan('Squat').map(q=>Number(q.load)),good=JSON.stringify(before)===JSON.stringify(after)&&h.S().hlm.lightPct===10;pass=pass&&good;out.push(`HLM ${before.join('/')} -> ${after.join('/')} future=${h.S().hlm.lightPct}`)}
  return {pass,detail:out.join(' | ')};
});


test('INV-CORRECTION-RECOMPUTES-EARNED-THEN-MERGES-EXPLICIT-FUTURE-OVERRIDES','A correction after post-result settings edits must first recompute the old workout result, then merge only the user’s explicit future-setting overrides',()=>{
  let pass=true;const out=[];
  {const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:100});completeCore(h,'Squat');const earned=h.S().weights.Squat;setLiftSettingsFields(h,'Squat',{weight:earned,increment:5});h.ctx.saveLiftSettings('Squat');h.reps.push(4);h.ctx.tapSet('Squat',0);completeMissingCore(h,'Squat');const good=h.ctx.coreResult('Squat').failed&&h.S().weights.Squat===100&&h.S().core.Squat.increment===5;pass=pass&&good;out.push(`core earned=${earned} corrected=${h.S().weights.Squat}/+${h.S().core.Squat.increment} attempts=${h.S().attempts.Squat||0}`)}
  {const h=H.boot(build);configureLP(h);const a=accessory();h.S().accessoryList=[a];h.S().accessoryProgress={a1:{weight:20,attempts:0}};for(let i=0;i<3;i++)h.ctx.tapAccessory('a1',i);h.ctx.openAccessoryBuilder('a1');const o=h.lastOverlay(),q=s=>o.querySelector(s);q('#accWeight').value='30';q('#accInc').value='2.5';q('#accSave').onclick();h.reps.push(9);h.ctx.tapAccessory('a1',0);let p=h.ctx.accessoryPlan17(a);for(let i=1;i<p.length;i++){if(!h.S().session['ACC:a1']?.[i])h.ctx.tapAccessory('a1',i);p=h.ctx.accessoryPlan17(a)}const good=a.weight===30;pass=pass&&good;out.push(`accessory future=30 corrected=${a.weight}`)}
  return {pass,detail:out.join(' | ')};
});



test('INV-CORRECTION-ROLLBACK-IS-LIFT-SCOPED','Correcting one processed intermediate lift cannot restore whole-program snapshot maps and erase another lift’s independently earned progression',()=>{
  const h=H.boot(build);configureLP(h,{...H.LP_W,Squat:40,'Bench Press':30});h.choices.push('R');h.ctx.chooseProgramMode('hlm');
  const complete=n=>{let g=0;while(g++<16){const p=h.ctx.getSetPlan(n);let did=false;for(let i=0;i<p.length;i++)if(!h.S().session[n]?.[i]){h.ctx.tapSet(n,i);did=true;break}if(!did)return;}throw Error('guard')};
  complete('Squat');complete('Bench Press');const earned=h.S().hlm.nextHeavy['Bench Press'];const p=h.ctx.getSetPlan('Squat'),top=p.findIndex(x=>x.top);h.reps.push(Number(p[top].target)-1);h.ctx.tapSet('Squat',top);const kept=h.S().hlm.nextHeavy['Bench Press'];return{pass:earned===32.5&&kept===32.5,detail:`Bench earned=${earned} after Squat correction=${kept}`};
});

test('INV-RECORDED-ACTUAL-LOAD-ROUNDTRIP-EXACT','Display-unit round-trips cannot mutate the physical value of a live actual load that the user already recorded',()=>{
  const h=H.boot(build);bbStart(h,{loads:{...H.BB_LOADS,machine_chest_press:22.5},incs:{machine_chest_press:2.5}});h.S().bodybuilding.progression.machine_chest_press.calibrated=true;bbSet(h,'machine_chest_press',0,{reps:8,load:24});const before=Number(h.S().session['BB:machine_chest_press'][0].load);h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);const after=Number(h.S().session['BB:machine_chest_press'][0].load);return{pass:before===24&&after===24,detail:`actual ${before}kg -> ${after}kg`};
});

test('INV-UNRESOLVED-PROGRESSION-DECISIONS-SURVIVE-RELOAD','A progression decision that requires explicit user choice must remain recoverable after reload; transient DOM cannot be the sole source of truth',()=>{
  const ls=H.memStore(),h=H.boot(build,{ls});configureLP(h,{...H.LP_W,'Bench Press':30});h.S().core['Bench Press'].mode='rpt';h.S().core['Bench Press'].rptLevel=0;h.ev('save()');let shown='';h.ctx.bvomChoiceModal=(title)=>{shown=String(title)};h.ctx.tapSet('Bench Press',0);h.reps.push(5);h.ctx.tapSet('Bench Press',1);let g=0;while(g++<12){const p=h.ctx.getSetPlan('Bench Press');let did=false;for(let i=0;i<p.length;i++)if(!h.S().session['Bench Press']?.[i]){h.ctx.tapSet('Bench Press',i);did=true;break}if(!did)break}const r=H.boot(build,{ls});let reopened='';r.ctx.bvomChoiceModal=(title)=>{reopened=String(title)};r.ctx.renderAll();return{pass:/close miss/i.test(shown)&&/close miss/i.test(reopened),detail:`before="${shown}" reload="${reopened}"`};
});

(async()=>{const out=[];for(const t of R){let r;try{r=await t.fn()}catch(e){r={pass:false,detail:'THREW '+String(e&&e.stack||e).split('\n').slice(0,2).join(' ')}}out.push({id:t.id,title:t.title,pass:!!r.pass,detail:r.detail||''})}if(asJson){process.stdout.write(JSON.stringify(out));process.exit(out.every(x=>x.pass)?0:1)}for(const r of out)console.log(`${r.pass?'PASS':'FAIL'}  [${r.id}] ${r.title}\n        ${r.detail}`);const p=out.filter(x=>x.pass).length;console.log(`\nRESULT: ${p} passed, ${out.length-p} failed`);process.exit(p===out.length?0:1)})();

'use strict';
// Stage 2A Bodyweight offer contracts. No network or live account.
module.exports=({test,ok,H,build})=>{
 const fixture=(mode='lprpt',topLoad=0,goal=8)=>{const h=H.boot(build);H.configureLP(h);h.S().programMode=mode;h.S().day=mode==='fourday'?'1':mode==='hlm'?'H':'A';if(mode==='free')h.ctx.bvomFtEnsure();
  const a={id:'stage2bw',name:'Chin Ups',category:'Upper',equipment:'bodyweight',style:'straight',sets:3,reps:8,weight:topLoad,increment:1.25,approximateBodyweight:90,resistance:'',bwProgressOptIn:true,bwProgressGoal:goal,assignment:'A',hlmAssignment:'H',fourDayAssignment:'1',bbAssignment:'Any',freeAssignment:h.ctx.bvomFtDayId()};
  h.S().accessoryList=[a];h.ctx.save();return{h,a};};
 const record=(h,i,reps,load,effort)=>{h.ctx.tapAccessory('stage2bw',i);const o=h.lastOverlay();o.querySelector('[data-reps]').value=String(reps);o.querySelector('[data-load]').value=String(load);o.querySelector('[data-rpe]').value=String(effort);o.querySelector('[data-bw-estimate]').value='90';o.querySelector('[data-res]').value='';o.querySelector('[data-save]').onclick();};
 const core=h=>{const days=Array.from(h.ctx.program());for(const item of days){const name=item[0],plan=h.ctx.getSetPlan(name);for(let i=0;i<plan.length;i++){h.reps.push(plan[i].target);h.ctx.tapSet(name,i)}}};
 const run=(top=8,rpe=8,choice='R',mode='lprpt',weight=0,complete=true)=>{
  const {h,a}=fixture(mode,weight);
  if(complete)core(h);
  const logs=[];h.ctx.bvomChoiceModal=(title,body,left,right,L,R)=>{logs.push({title,body,left,right});(choice==='R'?R:L)();};
  const loads=[weight,0,0];[top,6,6].forEach((reps,i)=>record(h,i,reps,loads[i],i===0?rpe:8));
  const prior=JSON.stringify(h.S().session);
  h.ctx.finishWorkout();
  return {h,a,logs,prior};
 };
 test('BW-STAGE2-OPT-IN-UI','CONTROL','Structured Bodyweight option has explicit opt-in and top-set target; Custom remains manual',()=>{
  const {h}=fixture();h.ctx.openAccessoryBuilder('stage2bw');const html=h.lastOverlay().innerHTML;const {h:free}=fixture('free');free.ctx.openAccessoryBuilder('stage2bw');const manual=free.lastOverlay().innerHTML;return ok(html.includes('id="accBwProgress"')&&html.includes('id="accBwGoal"')&&!manual.includes('id="accBwProgress"'))});
 test('BW-STAGE2-EARNED-ACCEPT','CONTROL','8/6/6 at top RPE 8 offers accept; exact +1.25 next top only',()=>{
  const {h,a,logs}=run();const rec=h.S().history.at(-1);const plan=h.ctx.accessoryPlan17(a);return ok(logs.length===1&&/HOLD/i.test(logs[0].left)&&/ACCEPT/i.test(logs[0].right)&&a.weight===1.25&&plan[0].load===1.25&&plan[1].load===0&&plan[2].load===0&&rec.session['ACC:stage2bw'][0].load===0&&rec.volumeApproximate===true&&rec.session['ACC:stage2bw'][0].approximateBodyweight===90,JSON.stringify({logs,weight:a.weight,plan,history:rec.volume}))});
 test('BW-STAGE2-EARNED-HOLD','CONTROL','Declining the earned + increment does not advance',()=>{
  const {h,a,logs}=run(8,8,'L');return ok(logs.length===1&&a.weight===0&&h.S().history.length===1)});
 test('BW-STAGE2-HARD-HOLD','CONTROL','Eight reps at RPE 9 cannot offer progression',()=>{
  const {h,a,logs}=run(8,9);return ok(logs.length===0&&a.weight===0&&h.S().history.length===1)});
 test('BW-STAGE2-SEVEN-HOLD','CONTROL','Seven first-set reps cannot earn a load increment',()=>{
  const {h,a,logs}=run(7,8);return ok(logs.length===0&&a.weight===0&&h.S().history.length===1)});
 test('BW-STAGE2-BELOW-RANGE','CONTROL','First set below 6 offers reduction, accepts one increment, floor zero',()=>{
  const a=run(5,8,'R','lprpt',1.25),b=run(5,8,'R','lprpt',0);return ok(a.logs.length===1&&a.a.weight===0&&b.logs.length===0&&b.a.weight===0)});
 test('BW-STAGE2-INCOMPLETE-CORE-ACCEPT','CONTROL','FINISH ANYWAY with incomplete core but complete Chin-Ups 8/8/6 offers ACCEPT once and saves incomplete History',()=>{
  const {h,a}=fixture('lprpt',0);a.increment=1;h.ctx.save();
  for(const [i,reps] of [8,8,6].entries())record(h,i,reps,0,8);
  let confirms=0;const original=h.ctx.bvomIncompleteConfirm;
  h.ctx.bvomIncompleteConfirm=(accept,back)=>{confirms++;accept()};
  const offers=[];h.ctx.bvomChoiceModal=(title,body,left,right,L,R)=>{offers.push({title,body,left,right});R()};
  h.ctx.finishWorkout();
  const recordSaved=h.S().history.at(-1);
  return ok(confirms===1&&offers.length===1&&/ACCEPT/.test(offers[0].right)&&a.weight===1&&recordSaved?.incomplete===true&&recordSaved?.session['ACC:stage2bw']?.[0]?.reps===8&&recordSaved?.bodyweightProgression?.[0]?.to===1&&h.ctx.accessoryPlan17(a).map(x=>x.load).join(',')==='1,0,0',JSON.stringify({confirms,offers,weight:a.weight,hist:recordSaved?.incomplete}));
 });
 test('BW-STAGE2-INCOMPLETE-CORE-HOLD','CONTROL','FINISH ANYWAY with complete accessory still offers HOLD without changing future load',()=>{
  const {h,a}=fixture('lprpt',0);for(const [i,reps] of [8,8,6].entries())record(h,i,reps,0,8);
  h.ctx.bvomIncompleteConfirm=accept=>accept();let offers=0;h.ctx.bvomChoiceModal=(_t,_b,_l,_r,L)=>{offers++;L()};
  h.ctx.finishWorkout();return ok(offers===1&&a.weight===0&&h.S().history.at(-1)?.incomplete===true);
 });
 test('BW-STAGE2-INCOMPLETE-CORE-BACK','CONTROL','GO BACK on incomplete main workout neither offers progression nor commits History',()=>{
  const {h,a}=fixture('lprpt',0);for(const [i,reps] of [8,8,6].entries())record(h,i,reps,0,8);
  let prompts=0,backs=0;h.ctx.bvomIncompleteConfirm=(_accept,onBack)=>{backs++;onBack()};h.ctx.bvomChoiceModal=()=>{prompts++};
  h.ctx.finishWorkout();return ok(backs===1&&prompts===0&&a.weight===0&&h.S().history.length===0&&h.S().session['ACC:stage2bw'][2].reps===6);
 });
 test('BW-STAGE2-INCOMPLETE-ACCESSORY-HOLD','CONTROL','FINISH ANYWAY must never offer progression when accessory itself has an unrecorded set',()=>{
  const {h,a}=fixture('lprpt',0);record(h,0,8,0,8);record(h,1,8,0,8);
  h.ctx.bvomIncompleteConfirm=accept=>accept();let prompts=0;h.ctx.bvomChoiceModal=()=>{prompts++};
  h.ctx.finishWorkout();return ok(prompts===0&&a.weight===0&&h.S().history.at(-1)?.incomplete===true);
 });
 test('BW-STAGE2-DEFAULT-OFF','CONTROL','Stage 1 Bodyweight accessories remain manual without explicit opt-in',()=>{
  const {h,a}=fixture();delete a.bwProgressOptIn;h.ctx.save();core(h);for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);let calls=0;h.ctx.bvomChoiceModal=()=>{calls++};h.ctx.finishWorkout();return ok(calls===0&&a.weight===0&&h.S().history.length===1)});
 test('BW-STAGE2-DURABLE-ROLLBACK','CONTROL','Rejected durable Finish retains the active workout with no phantom accepted increment',()=>{
  const {h}=fixture();core(h);for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);
  h.ctx.bvomChoiceModal=(_t,_b,_l,_r,L,R)=>R();
  const raw=h.ls.getItem('bvom_data'),before=JSON.stringify(h.S()),write=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('fixture quota');return write(k,v)};
  h.ctx.finishWorkout();h.ls.setItem=write;
  const actual=h.S(),stored=JSON.parse(h.ls.getItem('bvom_data'));
  return ok(actual.accessoryList[0].weight===0&&JSON.stringify(actual)===before&&h.ls.getItem('bvom_data')===raw&&actual.history.length===0&&stored.history.length===0&&stored.session['ACC:stage2bw'][0].reps===8,JSON.stringify({weight:actual.accessoryList[0].weight,history:actual.history.length,persistedHistory:stored.history.length}));
 });
 test('BW-STAGE2-STRUCTURED-MODES','CONTROL','HLM and 4-Day scoped accessory first-set offer does not affect unrelated core rules',()=>{
  const out=[];for(const mode of ['hlm','fourday']){
   const {h,a}=fixture(mode);core(h);for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);
   let calls=0;h.ctx.bvomChoiceModal=(_t,_b,_l,_r,L,R)=>{calls++;R()};
   h.ctx.finishWorkout();out.push({mode,calls,weight:a.weight,history:h.S().history.length});
  }return ok(out.every(x=>x.calls===1&&x.weight===1.25&&x.history===1),JSON.stringify(out));
 });
 test('BW-STAGE2-PARTIAL-ACCESSORY','CONTROL','No first-set offer if a later accessory set was not recorded',()=>{
  const {h,a}=fixture();core(h);record(h,0,8,0,8);record(h,1,6,0,8);
  let calls=0;h.ctx.bvomChoiceModal=()=>{calls++};h.ctx.finishWorkout();
  return ok(calls===0&&a.weight===0&&h.S().history.length===1);
 });
 test('BW-STAGE2-CUSTOM-NEVER-AUTO','CONTROL','Opt-in flag present on old Custom data still cannot activate earned progression',()=>{
  const {h,a}=fixture('free');for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);let calls=0;h.ctx.bvomChoiceModal=()=>{calls++};h.ctx.finishWorkout();return ok(calls===0&&a.weight===0&&h.S().history.length===1)});
};

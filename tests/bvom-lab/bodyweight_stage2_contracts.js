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
 test('BW-STAGE2-INCOMPLETE-HOLD','CONTROL','Missing core sets do not trigger accessory progression on incomplete finish',()=>{
  const {h,a,logs}=run(8,8,'R','lprpt',0,false);return ok(logs.length===0&&a.weight===0&&h.S().history.length===1&&h.S().history[0].incomplete)});
 test('BW-STAGE2-DEFAULT-OFF','CONTROL','Stage 1 Bodyweight accessories remain manual without explicit opt-in',()=>{
  const {h,a}=fixture();delete a.bwProgressOptIn;h.ctx.save();core(h);for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);let calls=0;h.ctx.bvomChoiceModal=()=>{calls++};h.ctx.finishWorkout();return ok(calls===0&&a.weight===0&&h.S().history.length===1)});
 test('BW-STAGE2-DURABLE-ROLLBACK','CONTROL','Failed durable Finish rolls back accepted next load and can retry exactly once',()=>{
  const {h,a}=fixture();core(h);for(const [i,reps] of [8,6,6].entries())record(h,i,reps,0,8);
  h.ctx.bvomChoiceModal=(_t,_b,_l,_r,L,R)=>R();
  const raw=h.ls.getItem('bvom_data'),savedState=JSON.stringify(h.S()),write=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('fixture quota');return write(k,v)};
  h.ctx.finishWorkout();
  h.ls.setItem=write;
  const rejected=a.weight===0&&JSON.stringify(h.S())===savedState&&h.ls.getItem('bvom_data')===raw&&h.S().history.length===0;
  h.ctx.finishWorkout();const persisted=JSON.parse(h.ls.getItem('bvom_data'));
  return ok(rejected&&h.S().history.length===1&&persisted.history.length===1&&h.S().accessoryList[0].weight===1.25&&persisted.accessoryList[0].weight===1.25,{rejected,history:persisted.history.length,weight:persisted.accessoryList[0].weight});
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

'use strict';
// Issue #52: Bodyweight accessory extra sets are saved actual work, never template progression.
module.exports=({test,ok,H,build})=>{
 const fixture=(mode='lprpt',opt=false)=>{
  const h=H.boot(build);H.configureLP(h);
  if(mode==='bodybuilding')H.bbStart(h);
  else {h.S().programMode=mode;h.S().day=mode==='hlm'?'H':mode==='fourday'?'1':'A';if(mode==='free')h.ctx.bvomFtEnsure();}
  const a={id:'ex52',name:'Pull-Ups',category:'Upper',equipment:'bodyweight',style:'straight',sets:3,reps:8,weight:0,increment:1.25,approximateBodyweight:90,resistance:'',bwProgressOptIn:opt,bwProgressGoal:8,assignment:'A',hlmAssignment:'H',fourDayAssignment:'1',freeAssignment:h.ctx.bvomFtDayId(),bbAssignment:'Any'};
  h.S().accessoryList=[a];h.ctx.save();h.ctx.renderWorkout();return{h,a};
 };
 const setFields=(o,{reps=6,load=0,estimate=90,rpe=8,resistance=''}={})=>{
  for(const [sel,v] of Object.entries({'[data-reps]':reps,'[data-load]':load,'[data-bw-estimate]':estimate,'[data-rpe]':rpe,'[data-res]':resistance}))o.querySelector(sel).value=String(v);
 };
 const extra=(h,values)=>{h.ctx.bvomBwAddExtraSet('ex52');const o=h.lastOverlay();setFields(o,values);o.querySelector('[data-save]').onclick();return o};
 const planned=(h,i,reps=8,rpe=8)=>{h.ctx.tapAccessory('ex52',i);const o=h.lastOverlay();setFields(o,{reps,rpe});o.querySelector('[data-save]').onclick()};
 const core=h=>{for(const [lift] of h.ctx.program()){const p=h.ctx.getSetPlan(lift);for(let i=0;i<p.length;i++){h.reps.push(p[i].target);h.ctx.tapSet(lift,i)}}};
 test('BW-EXTRA-MODES','CONTROL','Extra-set control and persisted recording work in LP, HLM, 4-Day, Custom and optional Bodybuilding accessories',()=>{
  const results=[];
  for(const mode of ['lprpt','hlm','fourday','free','bodybuilding']){
   const {h,a}=fixture(mode),before=h.els['#workout'].innerHTML,more=extra(h,{reps:7,load:1.25,estimate:85,rpe:8.5,resistance:'light band'});
   const s=h.S().session['ACC:ex52']?.[3],after=h.els['#workout'].innerHTML;
   results.push({mode,pass:before.includes('ADD EXTRA SET')&&more.removed&&a.sets===3&&h.ctx.accessoryPlan17(a).length===3&&s?.extra===true&&s.bodyweight===true&&s.reps===7&&s.load===1.25&&s.rpe===8.5&&s.approximateBodyweight===85&&s.resistance==='light band'&&after.includes('data-bw-extra="3"')});
  }
  return ok(results.every(x=>x.pass),JSON.stringify(results));
 });
 test('BW-EXTRA-MULTIPLE','CONTROL','Multiple extra sets append without creating phantom planned sets or changing the next-workout template',()=>{
  const {h,a}=fixture();extra(h,{reps:7});extra(h,{reps:5,load:2.5,estimate:80});
  const s=h.S().session['ACC:ex52'],html=h.els['#workout'].innerHTML;
  return ok(Object.keys(s).join(',')==='3,4'&&s[3].reps===7&&s[4].reps===5&&s[4].load===2.5&&h.ctx.bvomBwNextExtraSetIndex(a)===5&&a.sets===3&&html.includes('data-bw-extra="3"')&&html.includes('data-bw-extra="4"'));
 });
 test('BW-EXTRA-CANCEL-CORRECT-REMOVE','CONTROL','Cancel is neutral; extra sets can be corrected and removed without editing the plan',()=>{
  const {h,a}=fixture(),raw=h.ls.getItem('bvom_data');
  h.ctx.bvomBwAddExtraSet(a.id);const cancelled=h.lastOverlay();cancelled.querySelector('[data-cancel]').onclick();
  const neutral=raw===h.ls.getItem('bvom_data')&&!h.S().session['ACC:ex52'];
  extra(h,{reps:5,load:1.25});h.ctx.bvomBwAccessoryModal(a.id,3);const edit=h.lastOverlay();setFields(edit,{reps:9,load:2.5});edit.querySelector('[data-save]').onclick();
  const changed=h.S().session['ACC:ex52'][3]?.reps===9&&h.S().session['ACC:ex52'][3]?.load===2.5;
  h.ctx.bvomBwAccessoryModal(a.id,3);const remove=h.lastOverlay();remove.querySelector('[data-remove]').onclick();
  const gone=!h.S().session['ACC:ex52']?.[3]&&!h.els['#workout'].innerHTML.includes('data-bw-extra="3"')&&a.sets===3;
  return ok(neutral&&changed&&gone,JSON.stringify({neutral,changed,gone}));
 });
 test('BW-EXTRA-DURABLE-REJECT','CONTROL','Failed local write retains the pre-entry memory/blob and the open recording dialog',()=>{
  const {h}=fixture(),raw=h.ls.getItem('bvom_data'),before=JSON.stringify(h.S()),put=h.ls.setItem;
  h.ctx.bvomBwAddExtraSet('ex52');const o=h.lastOverlay();setFields(o,{reps:6,load:1.25});
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic quota');return put(k,v)};
  o.querySelector('[data-save]').onclick();h.ls.setItem=put;
  return ok(raw===h.ls.getItem('bvom_data')&&JSON.stringify(h.S())===before&&!o.removed&&!h.S().session['ACC:ex52']);
 });
 test('BW-EXTRA-REMOVE-REJECT','CONTROL','Rejected extra-set removal restores memory and leaves the original set and modal recoverable',()=>{
  const {h,a}=fixture();extra(h,{reps:6,load:1.25});
  h.ctx.bvomBwAccessoryModal(a.id,3);const o=h.lastOverlay(),before=JSON.stringify(h.S()),raw=h.ls.getItem('bvom_data'),put=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic quota');return put(k,v)};
  o.querySelector('[data-remove]').onclick();h.ls.setItem=put;
  return ok(!o.removed&&JSON.stringify(h.S())===before&&h.ls.getItem('bvom_data')===raw&&h.S().session['ACC:ex52'][3].reps===6);
 });
 test('BW-EXTRA-STALE-OWNER','NEGATIVE','Stale owner may not append, alter or remove extra workout data',()=>{
  const {h,a}=fixture();planned(h,0);extra(h,{reps:6});
  const raw=h.ls.getItem('bvom_data'),before=JSON.stringify(h.S());h.ls.setItem('bvom_workout_tab_owner','another-tab');
  h.ctx.bvomBwAddExtraSet(a.id);h.ctx.bvomBwAccessoryModal(a.id,3);
  return ok(raw===h.ls.getItem('bvom_data')&&JSON.stringify(h.S())===before&&h.S().session['ACC:ex52'][3].reps===6);
 });
 test('BW-EXTRA-RELOAD','CONTROL','Recorded extras survive same-owner reload and retain their per-set context',()=>{
  const {h}=fixture();extra(h,{reps:11,load:1.25,estimate:75,rpe:9,resistance:'feet assisted'});
  const reload=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage}),s=reload.S().session['ACC:ex52']?.[3];
  reload.ctx.renderWorkout();
  return ok(s?.extra===true&&s.reps===11&&s.load===1.25&&s.approximateBodyweight===75&&s.resistance==='feet assisted'&&reload.els['#workout'].innerHTML.includes('data-bw-extra="3"'));
 });
 test('BW-EXTRA-HISTORY','CONTROL','Actual extras contribute once to approximate volume and survive History/share/export',()=>{
  const {h}=fixture('free');extra(h,{reps:6,load:1.25,estimate:90,rpe:8});
  const volume=h.ctx.bvomWorkoutVolume();h.ctx.finishWorkout();const hist=h.S().history.at(-1),share=h.ctx.bvomShareWorkoutText(hist),exported=h.ctx.bvomBuildExportV1(hist),r=hist?.session?.['ACC:ex52']?.[3];
  return ok(volume===547.5&&hist.volume===547.5&&hist.volumeApproximate===true&&r?.extra===true&&r.load===1.25&&r.bodyweight===true&&share.includes('~547.5')&&exported.exercises.some(x=>x.sets?.some(set=>set.reps===6&&set.load===1.25)),JSON.stringify({volume,hist:hist?.volume,exportCount:exported?.exercises?.length}));
 });
 test('BW-EXTRA-PROGRESSION-ISOLATED','CONTROL','Only planned first set controls optional added-weight offers despite extra high-rep or low-rep work',()=>{
  const {h,a}=fixture('lprpt',true);
  planned(h,0,8,8);planned(h,1,6,8);planned(h,2,6,8);extra(h,{reps:1,rpe:10,load:0});
  const first=h.ctx.bvomBwProgressCandidate(a);h.ctx.bvomBwAccessoryModal(a.id,3);const edit=h.lastOverlay();setFields(edit,{reps:30,rpe:6});edit.querySelector('[data-save]').onclick();const second=h.ctx.bvomBwProgressCandidate(a);
  return ok(first?.action==='increase'&&first.next===1.25&&second?.action==='increase'&&second.next===1.25&&a.sets===3);
 });
 test('BW-EXTRA-PLANNED-INCOMPLETE','CONTROL','Extra sets do not satisfy unrecorded planned sets or unlock a progression offer',()=>{
  const {h,a}=fixture('lprpt',true);planned(h,0,8,8);extra(h,{reps:20,rpe:6});
  return ok(h.ctx.bvomBwProgressCandidate(a)===null&&h.S().session['ACC:ex52'][3].reps===20&&!h.S().session['ACC:ex52']?.[1]);
 });
 test('BW-EXTRA-FINISH-CHOICE','CONTROL','HOLD/ACCEPT future load changes remain independent of extra set performance',()=>{
  const out=[];
  for(const choose of ['HOLD','ACCEPT']){
   const {h,a}=fixture('lprpt',true);core(h);planned(h,0,8,8);planned(h,1,6,8);planned(h,2,6,8);extra(h,{reps:2,rpe:10});
   let offers=0;h.ctx.bvomChoiceModal=(_t,_b,_l,_r,left,right)=>{offers++;(choose==='HOLD'?left:right)()};
   h.ctx.finishWorkout();const hist=h.S().history.at(-1),weight=choose==='ACCEPT'?1.25:0;
   out.push({choose,pass:offers===1&&a.weight===weight&&hist?.session?.['ACC:ex52']?.[3]?.extra===true&&h.ctx.accessoryPlan17(a).length===3});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });

 test('BW-EXTRA-M020-HOLE-REUSE','CONTROL','Monkey 020: after removal, ADD EXTRA SET reuses the empty actual-set slot without overwriting a surviving set',()=>{
  const {h,a}=fixture();extra(h,{reps:7});extra(h,{reps:5,load:1.25});
  h.ctx.bvomBwAccessoryModal(a.id,3);const rm=h.lastOverlay();rm.querySelector('[data-remove]').onclick();
  const firstFree=h.ctx.bvomBwNextExtraSetIndex(a),survivor=JSON.stringify(h.S().session['ACC:ex52'][4]);
  extra(h,{reps:11,load:2.5});
  const ss=h.S().session['ACC:ex52']||{};
  return ok(firstFree===3&&ss[3]?.reps===11&&ss[4]?.reps===5&&JSON.stringify(ss[4])===survivor&&a.sets===3&&h.ctx.bvomBwExtraSetIndices(a,ss).length===2,JSON.stringify({firstFree,recorded:Object.keys(ss),survivorIntact:JSON.stringify(ss[4])===survivor}));
 });
 test('BW-EXTRA-M020-CHURN-FIVE-MODES','CONTROL','Monkey 020: 30 add/remove cycles in all five modes must not exhaust capacity with only one retained extra',()=>{
  const results=[];
  for(const mode of ['lprpt','hlm','fourday','bodybuilding','free']){
   const {h,a}=fixture(mode);
   extra(h,{reps:6,load:0});extra(h,{reps:7,load:1.25});
   let current=3,good=true;
   const remove=i=>{h.ctx.bvomBwAccessoryModal(a.id,i);const o=h.lastOverlay();const b=o?.querySelector('[data-remove]');if(!b)return false;b.onclick();return !!o.removed};
   if(!remove(current))good=false;current=4;
   for(let k=0;k<28&&good;k++){
    const before=h.ctx.bvomBwExtraSetIndices(a,h.S().session['ACC:ex52']);
    const old=JSON.stringify(h.S().session['ACC:ex52'][current]);
    extra(h,{reps:10+k,load:0});
    const next=h.ctx.bvomBwExtraSetIndices(a,h.S().session['ACC:ex52']).find(i=>i!==current);
    if(next==null||JSON.stringify(h.S().session['ACC:ex52'][current])!==old||!remove(current)){good=false;break}
    current=next;
   }
   const remaining=h.ctx.bvomBwExtraSetIndices(a,h.S().session['ACC:ex52']);
   const survivor=JSON.stringify(h.S().session['ACC:ex52'][current]);
   const slot=h.ctx.bvomBwNextExtraSetIndex(a);
   if(good)extra(h,{reps:19,load:2.5,rpe:8.5});
   const final=h.S().session['ACC:ex52']||{},all=h.ctx.bvomBwExtraSetIndices(a,final);
   const pass=good&&remaining.length===1&&slot>=3&&slot!==current&&all.length===2&&final[slot]?.reps===19&&final[slot]?.load===2.5&&JSON.stringify(final[current])===survivor&&a.sets===3;
   results.push({mode,pass,slot,current,retained:all.length});
  }
  return ok(results.every(x=>x.pass),JSON.stringify(results));
 });
 test('BW-EXTRA-M020-FULL-CAP','CONTROL','Exactly 30 retained extras block the 31st; removing one frees capacity without erasing History candidates',()=>{
  const {h,a}=fixture(),ids=[];
  for(let n=0;n<30;n++){
   extra(h,{reps:n+1,load:n%2?1.25:0});
   const now=h.ctx.bvomBwExtraSetIndices(a,h.S().session['ACC:ex52']);
   ids.push(now.length);
   if(now.length!==n+1)break;
  }
  const complete=ids.length===30&&ids.every((x,i)=>x===i+1);
  const before=JSON.stringify(h.S().session['ACC:ex52']||{});
  h.ctx.bvomBwAddExtraSet(a.id);
  const refused=JSON.stringify(h.S().session['ACC:ex52']||{})===before&&h.ctx.bvomBwExtraSetIndices(a,h.S().session['ACC:ex52']).length===30&&(!h.lastOverlay()||h.lastOverlay().removed);
  h.ctx.bvomBwAccessoryModal(a.id,13);const rm=h.lastOverlay();rm.querySelector('[data-remove]').onclick();
  const survivor=JSON.stringify(h.S().session['ACC:ex52'][32]),free=h.ctx.bvomBwNextExtraSetIndex(a);
  extra(h,{reps:42,load:0});
  const ss=h.S().session['ACC:ex52']||{};
  return ok(complete&&refused&&free===13&&ss[13]?.reps===42&&JSON.stringify(ss[32])===survivor&&h.ctx.bvomBwExtraSetIndices(a,ss).length===30&&a.sets===3,JSON.stringify({complete,refused,free,count:h.ctx.bvomBwExtraSetIndices(a,ss).length}));
 });
};

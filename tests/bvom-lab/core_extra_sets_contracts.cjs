'use strict';
module.exports=({test,ok,H,build})=>{
 const assert=require('node:assert/strict'),clone=x=>JSON.parse(JSON.stringify(x));
 function boot(mode='lprpt',day){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().programMode=mode;h.S().day=day||(mode==='hlm'?'H':mode==='fourday'?'2':'A');h.S().accessoryList=[];h.S().gppList=[];h.ev('ensureHLM();save()');return h}
 function extra(h,n='Squat',load=999,reps=99,key){for(const o of h.overlays())if(!o.removed)o.remove();key?assert.equal(h.ctx.bvomCoreExtraSetModal(n,key),true):assert.equal(h.ctx.bvomCoreAddExtraSet(n),true);const o=h.lastOverlay();o.querySelector('[data-load]').value=String(load);o.querySelector('[data-reps]').value=String(reps);o.querySelector('[data-save]').onclick();assert.equal(o.removed,true);return h.ctx.bvomCoreExtraKeys(n).at(-1)}
 const progression=h=>clone({weights:h.S().weights,attempts:h.S().attempts,core:h.S().core,hlm:h.S().hlm,processed:h.S().processed||{},pending:h.S().pendingCloseMissChoice});
 function record(h,n,scenario){for(let i=0;i<h.ctx.getSetPlan(n).length;i++){const q=h.ctx.getSetPlan(n)[i];h.reps.push(scenario==='fail'?(i===0?0:q.target):scenario==='close'&&i===1?q.target-1:q.target);h.ctx.tapSet(n,i)}}
 test('CORE-EXTRAS-PROGRESSION','DEFECT','Identical prescribed results produce identical LP/RPT, HLM and 4-Day progression with extras before/after',()=>{
  let count=0;
  for(const [mode,days] of [['lprpt',['A','B']],['hlm',['H','L','M']],['fourday',['1','2','3','4']]])for(const day of days)for(const rpt of [false,true])for(const scenario of ['success','fail','close'])for(const attempts of [0,2]){
   const a=boot(mode,day),b=boot(mode,day);for(const h of [a,b]){for(const [n] of h.ctx.program()){h.S().core[n].mode=rpt?'rpt':'straight';h.S().attempts[n]=attempts;if(h.S().hlm.failCount)h.S().hlm.failCount[n]=attempts;}h.ev('save()')}
   const lifts=clone(a.ctx.program()).map(x=>x[0]);for(const n of lifts){extra(b,n);assert.deepEqual(clone(b.ctx.getSetPlan(n)),clone(a.ctx.getSetPlan(n)));assert.equal(b.ctx.coreResult(n).complete,false);record(a,n,scenario);record(b,n,scenario);extra(b,n,1234,123);assert.deepEqual(clone(b.ctx.coreResult(n)),clone(a.ctx.coreResult(n)));}
   assert.deepEqual(progression(b),progression(a));H.finish(a);H.finish(b);assert.deepEqual(progression(b),progression(a));assert.equal(b.S().history.length,a.S().history.length);for(const n of lifts)assert.equal(b.ctx.bvomCoreExtraKeys(n).length,0);count++;
  }return ok(true,count+' paired full-workout journeys including success/failure/close-miss and third-failure boundaries');
 });
 test('CORE-EXTRAS-DECISION-BRANCHES','DEFECT','Both third-failure/close-miss choices, terminal RPT reset and HLM doubles are isolated',()=>{
  let count=0;
  for(const mode of ['lprpt','hlm','fourday'])for(const level of mode==='lprpt'?[-1,0,4]:[5,2])for(const pick of ['L','R']){
   const a=boot(mode),b=boot(mode),n='Squat';
   for(const h of [a,b]){h.S().attempts[n]=2;h.S().core[n].mode=level===-1?'straight':'rpt';h.S().core[n].rptLevel=mode==='lprpt'?Math.max(0,level):0;if(mode!=='lprpt'){h.S().hlm.rep[n]=level;h.S().hlm.failCount[n]=2;}h.choices=Array(30).fill(pick);h.ctx.bvomWeightModal=(_name,_weight,save)=>save(80);h.ev('save()')}
   extra(b,n);record(a,n,'fail');record(b,n,'fail');assert.deepEqual(progression(b),progression(a));assert.deepEqual(clone(b.ctx.getSetPlan(n)),clone(a.ctx.getSetPlan(n)));assert.deepEqual(b.log.filter(x=>x[0]==='choice'),a.log.filter(x=>x[0]==='choice'));count++;
  }
  for(const pick of ['L','R']){const a=boot(),b=boot();for(const h of [a,b]){h.S().core.Squat.mode='rpt';h.S().attempts.Squat=1;h.choices=Array(30).fill(pick);h.ev('save()')}extra(b);record(a,'Squat','close');record(b,'Squat','close');assert.deepEqual(progression(b),progression(a));count++}
  return ok(true,count+' paired explicit decisions, including user-selected terminal weight reset');
 });
 test('CORE-EXTRAS-LIFECYCLE','DEFECT','Multiple extras edit/remove, volume, incomplete Finish, History, reload and completed cloud payload',()=>{
  for(const mode of ['lprpt','hlm','fourday']){
   let h=boot(mode);const before=progression(h);extra(h,'Squat',83.75,7);extra(h,'Squat',91,3);assert.deepEqual(progression(h),before);assert.equal(h.ctx.bvomWorkoutVolume(),859.25);assert.equal(h.ctx.coreResult('Squat').complete,false);
   const ls=h.ls,ss=h.ctx.sessionStorage;h=H.boot(build,{ls,ss,supabase:null,online:false});assert.equal(h.ctx.bvomCoreExtraKeys('Squat').length,2);assert.equal(h.ctx.bvomWorkoutVolume(),859.25);
   extra(h,'Squat',85,8,'EXTRA:0');h.ctx.bvomCoreExtraSetModal('Squat','EXTRA:1');h.lastOverlay().querySelector('[data-remove]').onclick();assert.equal(h.ctx.bvomWorkoutVolume(),680);
   // Correction of prescribed work must not remove extras or let extras fill holes.
   h.ctx.tapSet('Squat',0);h.ctx.tapSet('Squat',0);assert.equal(h.ctx.bvomCoreExtraKeys('Squat').length,1);assert.equal(h.ctx.coreResult('Squat').complete,false);
   H.finish(h);assert.equal(h.S().history.length,1);const rec=h.S().history[0];assert.equal(rec.incomplete,true);assert.equal(rec.session.Squat['EXTRA:0'].load,85);assert.equal(rec.session.Squat['EXTRA:0'].extra,true);assert.match(h.ctx.bvomHistorySetText(rec.session.Squat['EXTRA:0'],'kg'),/EXTRA SET/);
   const payload=clone(h.ctx.bvomCloudPayload());assert.deepEqual(payload.history,clone(h.S().history));assert.deepEqual(payload.session,{});const portable=JSON.parse(JSON.stringify({app:'BVOM',version:'3.0.1',data:payload}));assert.deepEqual(portable.data.history,payload.history);
  }return ok(true,'all three programmes preserve actuals without prescribed completion');
 });
 test('CORE-EXTRAS-SAFETY','DEFECT','Validation, stale callbacks, failed saves/removal and final-set lifecycle cleanup',()=>{
  for(const [load,reps] of [['',5],[0,5],['Infinity',5],[50,''],[50,1.5],[50,-1]]){const h=boot();h.ctx.bvomCoreAddExtraSet('Squat');const o=h.lastOverlay(),raw=h.ls.getItem('bvom_data');o.querySelector('[data-load]').value=String(load);o.querySelector('[data-reps]').value=String(reps);o.querySelector('[data-save]').onclick();assert.equal(h.ls.getItem('bvom_data'),raw);assert.equal(h.ctx.bvomCoreExtraKeys('Squat').length,0)}
  for(const action of ['save','remove']){const h=boot();if(action==='remove')extra(h);h.ctx.bvomCoreExtraSetModal('Squat',action==='remove'?'EXTRA:0':'EXTRA:1');const o=h.lastOverlay(),raw=h.ls.getItem('bvom_data'),mem=clone(h.S()),put=h.ls.setItem;o.querySelector('[data-load]').value='100';o.querySelector('[data-reps]').value='5';h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('quota');put(k,v)};o.querySelector('[data-'+action+']').onclick();assert.equal(h.ls.getItem('bvom_data'),raw);assert.deepEqual(clone(h.S()),mem)}
  for(const change of ['raw','unit','account','session']){const h=boot();h.ctx.bvomCoreAddExtraSet('Squat');const o=h.lastOverlay();o.querySelector('[data-load]').value='100';o.querySelector('[data-reps]').value='5';if(change==='raw')h.ls.setItem('bvom_data',h.ls.getItem('bvom_data')+' ');if(change==='unit')h.S().unit='lb';if(change==='account')h.ls.setItem('bvom_data_owner','other');if(change==='session')h.S().session={};const raw=h.ls.getItem('bvom_data');o.querySelector('[data-save]').onclick();assert.equal(h.ls.getItem('bvom_data'),raw);assert.equal(h.ctx.bvomCoreExtraKeys('Squat').length,0)}
  const h=boot();extra(h);h.ctx.bvomCoreExtraSetModal('Squat','EXTRA:0');h.lastOverlay().querySelector('[data-remove]').onclick();assert.equal(h.ctx.bvomStateWorkoutActive(h.S()),false);assert.equal(h.S().workoutStartedAt,null);return ok(true,'atomic saves and existing ownership fences retained');
 });
 test('CORE-EXTRAS-RECOVERY-UNITS','DEFECT','Interrupted extras recover to incomplete History once; unit roundtrip and missing-last-set isolation',()=>H.withClock(c=>{
  for(const mode of ['lprpt','hlm','fourday']){
   const h=boot(mode);h.ev("bvomCloud.user={id:'dummy'};window.__bvomAuthUserId='dummy';bvomEntitlement.record={status:'complimentary',user_id:'dummy'}");h.ls.setItem('bvom_data_owner','dummy');h.ctx.showApp();
   extra(h,'Squat',83.75,7);h.ctx.changeUnits('lb',true);h.ctx.changeUnits('kg',true);assert.equal(h.S().session.Squat['EXTRA:0'].load,83.75);
   const before=progression(h),day=h.S().day;c.advance(3600000);assert.equal(h.ctx.bvomRecoveryCheck(),true);assert.equal(h.S().history.length,1);assert.equal(h.S().history[0].incomplete,true);assert.equal(h.S().history[0].volume,586.25);assert.equal(h.S().history[0].session.Squat['EXTRA:0'].extra,true);assert.equal(h.S().day,day);assert.deepEqual(progression(h),before);h.ctx.bvomRecoveryCheck();assert.equal(h.S().history.length,1);
   const z=boot(mode),n=z.ctx.program()[0][0];for(let i=0;i<z.ctx.getSetPlan(n).length-1;i++)z.ctx.tapSet(n,i);extra(z,n);assert.equal(z.ctx.coreResult(n).complete,false);assert.equal(!!z.S().processed[n],false);
  }return ok(true,'existing inactivity recovery retains extra-only work; missing final prescribed set still required');
 }));
 test('CORE-EXTRAS-PENDING-DRIVER','DEFECT','Extras before a queued Heavy increase cannot consume or bypass the driver activation',()=>{
  const h=boot('hlm');h.S().hlm.nextHeavy.Squat=110;h.ev('save()');extra(h);assert.equal(h.S().hlm.nextHeavy.Squat,110);assert.equal(h.ctx.corePrescription('Squat').driver,110);h.ctx.tapSet('Squat',0);assert.equal(h.S().hlm.nextHeavy.Squat,null);assert.equal(h.S().hlm.driver.Squat,110);return ok(true,'Heavy activation remains prescribed-set driven');
 });
};

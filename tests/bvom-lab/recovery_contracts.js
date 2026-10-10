'use strict';
module.exports=({test,ok,H,build})=>{
 const clone=x=>JSON.parse(JSON.stringify(x)),read=h=>JSON.parse(h.ls.getItem('bvom_data'));
 const boot=()=>{const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().accessoryList=[];h.S().gppList=[];h.ev('save()');return h};
 const open=h=>{h.ev("bvomCloud.user={id:'dummy'};window.__bvomAuthUserId='dummy';bvomEntitlement.record={status:'complimentary',user_id:'dummy'}");h.ls.setItem('bvom_data_owner','dummy');h.ctx.showApp();};
 const expire=(h,c)=>{c.advance(3600000);return h.ctx.bvomRecoveryCheck()};
 test('F70-MEANINGFUL-ACTIVITY-CLOCK','DEFECT','Committed sets/corrections/warm-ups/GPP reset inactivity; passive saves/rest timer and no-op settings do not',()=>H.withClock(c=>{
  const h=boot();open(h);h.ctx.tapSet('Squat',0);let last=read(h).workoutLastActivityAt;const start=h.S().workoutStartedAt;
  c.advance(3599000);h.ctx.startTimer();h.ctx.renderAll();h.ev('save()');if(read(h).workoutLastActivityAt!==last)return ok(false,'passive clock reset');
  h.ctx.tapSet('Squat',1);if(read(h).workoutLastActivityAt!==c.now())return ok(false,'59m59s interaction did not reset');
  for(let i=0;i<3;i++){c.advance(3500000);h.reps.push(i+1);h.ctx.tapSet('Squat',0);if(read(h).workoutLastActivityAt!==c.now()||read(h).history.length)return ok(false,'long active workout expired')}
  c.advance(1000);h.ctx.completeWarmup('Squat',0,3,H.mkEl?H.mkEl():{classList:{add(){},remove(){}}});if(read(h).workoutLastActivityAt!==c.now())return ok(false,'warmup');
  h.S().gppList=[{id:'erg',name:'Erg',metrics:{time:true},planned:{timeSeconds:60},assignment:'Both'}];h.ev('save()');c.advance(1000);h.ctx.bvomStartGppTimer('erg');const running=read(h).workoutLastActivityAt;c.advance(1000);h.ctx.bvomPauseGppTimer('erg');return ok(running===c.now()-1000&&read(h).workoutLastActivityAt===c.now()&&h.S().workoutStartedAt===start,'long workout + rest-independent durable clock');
 }));
 test('F71-INCOMPLETE-EXPIRY-PROGRAMS','DEFECT','One atomic incomplete record preserves actuals/metadata/earned state without consuming program sessions or advancing days',()=>H.withClock(c=>{
  const out=[];for(const mode of ['lprpt','hlm','fourday','free','bb','onramp']){
   const h=boot();if(mode==='bb'||mode==='onramp'){H.bbStart(h,{onramp:mode==='onramp'});if(mode==='bb')H.bbSet(h,'machine_chest_press',0,{reps:7});else H.orSet(h,'machine_chest_press',0,{load:60,reps:7})}
   else if(mode==='free'){h.ctx.chooseProgramMode('free');h.S().freeTraining.days[0].compounds=[{lift:'Squat',style:'straight',weight:60,sets:3,reps:5}];h.ctx.bvomFtSetModal('Squat',0);const o=h.lastOverlay();o.querySelector('[data-load]').value='60';o.querySelector('[data-s]').onclick()}
   else{if(mode!=='lprpt'){h.choices.push('R');h.ctx.chooseProgramMode(mode)}h.ctx.tapSet('Squat',0)}
   h.S().workoutNote='dummy note';h.ev('save()');open(h);const before=clone(h.S()),raw=h.ls.getItem('bvom_data');c.advance(3599000);h.ctx.bvomRecoveryCheck();const boundary=h.ls.getItem('bvom_data')===raw;c.advance(1000);const finished=h.ctx.bvomRecoveryCheck(),d=read(h);h.ctx.bvomRecoveryCheck();
   out.push({mode,pass:boundary&&finished&&d.history.length===1&&d.history[0].incomplete&&d.history[0].note==='dummy note'&&d.day===before.day&&JSON.stringify(d.weights)===JSON.stringify(before.weights)&&JSON.stringify(d.bodybuilding)===JSON.stringify(before.bodybuilding)&&(!d.bodybuilding||d.bodybuilding.completedSessions===before.bodybuilding.completedSessions)&&(!d.bodybuilding?.onramp||d.bodybuilding.onramp.sessionsCompleted===before.bodybuilding.onramp.sessionsCompleted)&&(!d.hlm||JSON.stringify(d.hlm.nextHeavy)===JSON.stringify(before.hlm.nextHeavy))&&JSON.stringify(d.history[0].session)===(mode==='free'?JSON.stringify({Squat:before.freeTrainingSession.Squat.sets.reduce((a,r,i)=>{if(r)a[i]=r;return a},{})}):JSON.stringify(before.session))&&read(h).history.length===1});
  }return ok(out.every(x=>x.pass),JSON.stringify(out));
 }));
 test('F72-EXPIRY-PENDING-GPP-HOLD','DEFECT','Unresolved LP/HLM choices and running/paused/unentered GPP results survive expiry unchanged',()=>H.withClock(c=>{
  const out=[];for(const kind of ['lp','hlm','running','paused','stopped']){const h=boot();h.ctx.tapSet('Squat',0);
   if(kind==='lp'){h.S().pendingCloseMissChoice={lift:'Bench Press',weight:70,increment:2.5}}
   else if(kind==='hlm')h.S().hlm.pendingRepChoice={lift:'Squat'};
   else{h.S().gppList=[{id:'erg',name:'Erg',metrics:{time:true,distance:true},planned:{timeSeconds:60},assignment:'Both'}];h.S().gppSession={erg:{started:true,timing:{status:kind,startedAt:c.now(),accumulatedMs:0},actual:{}}}}
   h.ev('save()');h.ctx.bvomChoiceModal=()=>{};open(h);const before=h.ls.getItem('bvom_data');expire(h,c);out.push({kind,pass:h.ls.getItem('bvom_data')===before&&read(h).history.length===0});
  }return ok(out.every(x=>x.pass),JSON.stringify(out));
 }));
 test('F73-LOCK-AND-ACCOUNT-FENCING','DEFECT','Denied/unavailable exclusive locks, changed accounts and changed owner marker cannot publish training',()=>{
  const out=[];for(const locks of [null,{request:(_n,_o,cb)=>{cb(null);return Promise.resolve()}}]){const a=boot();a.ctx.tapSet('Squat',0);const raw=a.ls.getItem('bvom_data'),b=H.boot(build,{ls:a.ls,ss:a.ctx.sessionStorage,supabase:null,locks});const memory=JSON.stringify(b.S());b.ctx.tapSet('Squat',1);const result=b.ev('save({durable:true})');out.push(result===false&&a.ls.getItem('bvom_data')===raw&&JSON.stringify(b.S())===memory)}
  for(const change of ['account','owner']){const h=boot();open(h);h.ctx.tapSet('Squat',0);const raw=h.ls.getItem('bvom_data');if(change==='account')h.ev("bvomCloud.user={id:'other'}");else h.ls.setItem('bvom_workout_tab_owner','other');h.ctx.tapSet('Squat',1);out.push(h.ev('save({durable:true})')===false&&h.ls.getItem('bvom_data')===raw)}return ok(out.every(Boolean),JSON.stringify(out));
 });
 test('F74-EXPIRY-SAVE-FAILURE-ROLLBACK','DEFECT','Rejected incomplete transition retains exact live data/timestamp and no phantom History success',()=>H.withClock(c=>{
  const h=boot();open(h);h.ctx.tapSet('Squat',0);const raw=h.ls.getItem('bvom_data'),before=clone(h.S()),put=h.ls.setItem;
  h.ls.setItem=(k,v)=>{if(k==='bvom_data')throw Error('synthetic quota');put(k,v)};const finished=expire(h,c);h.ls.setItem=put;
  return ok(!finished&&h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===JSON.stringify(before)&&read(h).history.length===0,'exact rollback');
 }));
 test('F75-LEGACY-AND-CLOCK-GRACE','DEFECT','Missing/invalid/backwards timestamps receive durable grace; zero recorded work never creates History',()=>H.withClock(c=>{
  const out=[];for(const value of [undefined,null,'bad',NaN,c.now()+900000]){const h=boot();h.ctx.tapSet('Squat',0);h.S().workoutLastActivityAt=value;h.ev('save({recovery:true})');open(h);out.push(read(h).history.length===0&&read(h).workoutLastActivityAt===c.now());}
  const h=boot();open(h);h.ctx.tapSet('Squat',0);c.advance(-300000);h.ctx.bvomRecoveryCheck();out.push(read(h).history.length===0&&read(h).workoutLastActivityAt===c.now());
  const z=boot();z.S().workoutStartedAt=c.now();z.S().workoutLastActivityAt=c.now();z.ev('save({recovery:true})');open(z);expire(z,c);out.push(read(z).history.length===0&&!!read(z).workoutStartedAt);
  return ok(out.every(Boolean),JSON.stringify(out));
 }));
 test('F76-UNCOORDINATED-LEGACY-FAIL-CLOSED','DEFECT','Unknown old-version ownership cannot be upgraded on age or matching duplicated tab ID; live metadata excluded from cloud',()=>{
  const h=boot();h.ctx.tapSet('Squat',0);delete h.S().workoutOwnershipVersion;const legacy=JSON.stringify(h.S());h.ls.setItem('bvom_data',legacy);const b=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null});open(b);b.ctx.tapSet('Squat',1);const result=b.ev('save({durable:true})');const cloud=h.ctx.bvomCloudPayload();return ok(result===false&&h.ls.getItem('bvom_data')===legacy&&!('workoutOwnershipVersion'in cloud)&&!('workoutLastActivityAt'in cloud),'legacy preserved; cloud boundary');
 });
};

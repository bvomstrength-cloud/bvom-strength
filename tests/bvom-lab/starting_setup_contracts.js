'use strict';
module.exports=({test,ok,H,build})=>{
 const clone=x=>JSON.parse(JSON.stringify(x)),read=h=>JSON.parse(h.ls.getItem('bvom_data'));
 function open(h){h.ev("bvomCloud.user={id:'setup-dummy'};window.__bvomAuthUserId='setup-dummy';bvomEntitlement.record={status:'complimentary',user_id:'setup-dummy'}");h.ls.setItem('bvom_data_owner','setup-dummy');h.ctx.showApp();}
 function journey(mode='hlm',both=false){
  const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.choices.push('R');h.ctx.chooseProgramMode(mode);h.S().accessoryList=[];h.S().gppList=[];h.ev('save()');open(h);
  h.ctx.bvomChoiceModal=(title,body,l,r,onL,onR)=>{h.dialog={title,body,l,r,onL,onR};if(/DROP TO/.test(r))onR();};
  let sets=0;
  for(let w=0;w<12;w++){
   h.ctx.switchDay(mode==='fourday'?'1':'H');
   for(const [n] of h.ctx.program())for(let i=0;i<h.ctx.getSetPlan(n).length;i++){
    const q=h.ctx.getSetPlan(n)[i];h.reps.push((n==='Bench Press'||both&&n==='Squat')&&i===2?0:q.target);h.ctx.tapSet(n,i);sets++;
   }
   if(w<11){h.ctx.finishWorkout();const saved=h.lastOverlay();saved.querySelector('[data-ok]').onclick?.();}
  }
  h.setCount=sets;return h;
 }
 function request(h){h.ctx.bvomChoiceModal=h.realChoiceModal;h.dialog.onR();const o=h.lastOverlay();o.querySelector('[data-r]').onclick?.();return o;}
 function reload(h){const r=H.boot(build,{ls:h.ls,ss:h.ctx.sessionStorage,supabase:null,online:false});r.ctx.bvomChoiceModal=(title,body,l,right,onL,onR)=>{r.dialog={title,body,l,r:right,onL,onR}};open(r);return r;}
 test('F77-DEFERRED-SETUP-GENUINE-TERMINAL','DEFECT','Twelve authentic Heavy workouts reach doubles; request is durable, reloadable and cancelable without selecting BATTLE ON',()=>{
  const h=journey(),before=clone(h.S()),raw=h.ls.getItem('bvom_data');
  if(h.S().hlm.rep['Bench Press']!==2||h.S().hlm.failCount['Bench Press']!==3||h.setCount!==156)return ok(false,'authentic terminal provenance');
  h.ctx.bvomChoiceModal=h.realChoiceModal;h.dialog.onR();const initial=h.lastOverlay();if(typeof initial.querySelector('[data-l]').onclick!=='function')return ok(false,'RUN SETUP is blocked by FINISH WORKOUT FIRST instead of offering deferred confirmation');initial.querySelector('[data-l]').onclick();if(h.ls.getItem('bvom_data')!==raw)return ok(false,'initial Cancel changed training');
  h.dialog.onR();const confirm=h.lastOverlay();confirm.querySelector('[data-r]').onclick();const d=read(h);
  if(!d.setupAfterFinish)return ok(false,'RUN SETUP did not persist a deferred intent');
  const r=reload(h),persisted=read(r),unchanged=JSON.stringify(d.session)===JSON.stringify(before.session)&&d.configured&&JSON.stringify(d.hlm)===JSON.stringify(before.hlm)&&d.history.length===11;
  const saved=clone(persisted);r.ctx.bvomCancelDeferredSetup();const canceled=read(r);
  return ok(unchanged&&!!persisted.setupAfterFinish&&!canceled.setupAfterFinish&&JSON.stringify(canceled.hlm.pendingRepChoice)===JSON.stringify(saved.hlm.pendingRepChoice),`sets=${h.setCount}; History=11; durable reload + cancel`);
 });
 test('F78-DEFERRED-CLOUD-BOUNDARY','DEFECT','Effective Custom/BB wrappers exclude only local intent symmetrically while History, weights and pending choices remain cloud data',()=>{
  const h=journey();request(h);const local=read(h);if(!local.setupAfterFinish)return ok(false,'no local intent');
  const cloud=h.ctx.bvomCloudPayload(),old=clone(local);delete old.setupAfterFinish;
  const fp=x=>h.ctx.bvomCloudComparableFingerprint(x),same=fp(local)===fp(old)&&fp(old)===fp({...old,setupAfterFinish:{foreign:true}});
  const history=clone(old);history.history[0].note='real changed note';const weights=clone(old);weights.weights.Squat+=2.5;const pending=clone(old);pending.hlm.pendingRepChoice.current=3;
  const source=JSON.stringify(local);h.ctx.bvomCloudNormalizeForCompare(local);
  return ok(!('setupAfterFinish'in cloud)&&same&&fp(history)!==fp(old)&&fp(weights)!==fp(old)&&fp(pending)!==fp(old)&&JSON.stringify(cloud.history)===JSON.stringify(local.history)&&JSON.stringify(cloud.hlm.pendingRepChoice)===JSON.stringify(local.hlm.pendingRepChoice)&&source===JSON.stringify(local),'both compare inputs; absent field; real changes; source neutral');
 });
 function savedOffer(h){h.ctx.finishWorkout();const ack=h.lastOverlay();ack.querySelector('[data-ok]').onclick?.();return h.lastOverlay();}
 function draft(h){const offer=savedOffer(h);offer.querySelector('[data-r]').onclick?.();h.ctx.bvomEntitlementStartTrial=async()=>true;return h;}
 test('F79-DEFERRED-FINISH-AND-DRAFT','DEFECT','HLM and Four-Day Finish save exactly one actual History, then offer a cancelable draft and consume the decision once on valid commit',async()=>{
  const out=[];for(const mode of ['hlm','fourday']){
   const h=journey(mode);request(h);const session=clone(h.S().session),beforeHistory=h.S().history.length,offer=savedOffer(h),d=read(h);
   if(!d.setupAfterFinish?.finishedRecord)return ok(false,mode+': no durable Finish intent');
   const finished=d.history.length===beforeHistory+1&&JSON.stringify(d.history.at(-1).session)===JSON.stringify(session)&&!d.history.at(-1).incomplete&&!h.ev('bvomStateWorkoutActive(state)')&&(mode!=='fourday'||d.day==='2');
   offer.querySelector('[data-l]').onclick();const raw=h.ls.getItem('bvom_data');h.ctx.finishWorkout();h.ctx.tapSet('Squat',0);const blocked=h.ls.getItem('bvom_data')===raw;h.ctx.bvomOfferDeferredSetup();h.lastOverlay().querySelector('[data-r]').onclick();
   h.ctx.bvomDeferredDraftWeight('Squat',-1);h.ctx.bvomEntitlementStartTrial=async()=>true;
   const invalid=await h.ctx.bvomCommitDeferredDraft(),neutral=blocked&&invalid===false&&h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===raw;
   h.ctx.bvomDeferredDraftCancel();h.ctx.bvomOfferDeferredSetup();h.lastOverlay().querySelector('[data-r]').onclick();h.ctx.bvomDeferredDraftWeight('Squat',60);h.ctx.bvomDeferredDraftWeight('Bench Press',40);
   const result=await h.ctx.bvomCommitDeferredDraft(),committed=read(h),again=await h.ctx.bvomCommitDeferredDraft();
   const r=reload(h);out.push({mode,finished,neutral,result,again,history:committed.history.length,rep:committed.hlm.rep,weight:committed.weights.Squat,pass:finished&&neutral&&result===true&&again===false&&committed.history.length===12&&!committed.setupAfterFinish&&!committed.hlm.pendingRepChoice&&committed.hlm.rep.Squat===5&&committed.hlm.rep['Bench Press']===5&&committed.weights.Squat===60&&JSON.stringify(read(r).history)===JSON.stringify(committed.history)});
  }return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F80-DEFERRED-SAVE-FAILURES','DEFECT','Intent, Finish and new setup reject failed writes; postcommit owner cleanup keeps one durable History and stops the window',async()=>{
  const out=[];for(const at of ['intent','finish','postcommit','setup']){
   const h=journey();if(at!=='intent')request(h);if(at==='setup')draft(h);
   const raw=h.ls.getItem('bvom_data'),memory=JSON.stringify(h.S()),count=read(h).history.length,put=h.ls.setItem,remove=h.ls.removeItem;
   h.ls.setItem=(k,v)=>{if(at!=='postcommit'&&k==='bvom_data')throw Error('synthetic quota');put(k,v)};
   h.ls.removeItem=k=>{if(at==='postcommit'&&k==='bvom_workout_tab_owner')throw Error('synthetic owner cleanup');remove(k)};
   if(at==='intent')request(h);else if(at==='setup')await h.ctx.bvomCommitDeferredDraft();else h.ctx.finishWorkout();
   h.ls.setItem=put;h.ls.removeItem=remove;const stored=read(h),failure=h.overlays().some(o=>o.id==='bvomLocalSaveFailureOverlay'||o.id==='bvomPostCommitOwnerFailureOverlay');
   const beforeReload=at==='postcommit'?stored.history.length===count+1&&JSON.stringify(h.S())===h.ls.getItem('bvom_data')&&!h.ev('bvomStateWorkoutActive(state)')&&failure:h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===memory&&failure;
   const r=reload(h);if(at==='postcommit'||at==='finish')r.ctx.finishWorkout();out.push({at,beforeReload,pass:beforeReload&&(at==='postcommit'?read(r).history.length===count+1:at==='finish'?read(r).history.length===count+1:read(r).history.length===count)});
  }return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F81-DEFERRED-DRAFT-OPTIONS-AND-AWAIT','DEFECT','All five programs stay available; draft edits/reload/cancel and changed input or owner during entitlement await cannot publish',async()=>{
  const h=journey();request(h);draft(h);const raw=h.ls.getItem('bvom_data'),history=clone(read(h).history),checks=[];
  for(const mode of ['lprpt','hlm','fourday','free','bodybuilding']){h.ctx.bvomDeferredDraftMode(mode);checks.push(h.ls.getItem('bvom_data')===raw&&JSON.stringify(h.S())===raw)}
  h.ctx.bvomDeferredDraftMode('hlm');h.ctx.bvomDeferredDraftRatios(80,'female');checks.push(h.ls.getItem('bvom_data')===raw);h.ctx.bvomDeferredDraftCancel();checks.push(h.ls.getItem('bvom_data')===raw);
  const r=reload(h);checks.push(JSON.stringify(read(r).history)===JSON.stringify(history)&&r.ev('bvomDeferredDraft')===null&&read(r).configured);
  r.ctx.bvomOpenDeferredDraft();let resolve;r.ctx.bvomEntitlementStartTrial=()=>new Promise(f=>{resolve=f});const pending=r.ctx.bvomCommitDeferredDraft();r.ctx.bvomDeferredDraftWeight('Squat',NaN);resolve(true);checks.push(await pending===false&&r.ls.getItem('bvom_data')===raw);
  r.ctx.bvomDeferredDraftWeight('Squat',60);const second=r.ctx.bvomCommitDeferredDraft();r.ls.setItem('bvom_data_owner','other');resolve(true);checks.push(await second===false&&r.ls.getItem('bvom_data')===raw);
  return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('F82-DEFERRED-CORRECTION-AND-COLLISION','DEFECT','Terminal correction withdraws obsolete intent with lift isolation; a second genuine terminal driver cannot overwrite the first',()=>{
  const h=journey();request(h);const squat=clone(h.S().hlm.nextHeavy.Squat),history=h.S().history.length;
  const plan=h.ctx.getSetPlan('Bench Press');h.reps.push(plan[2].target);h.ctx.tapSet('Bench Press',2);const corrected=read(h);
  const neutral=!corrected.setupAfterFinish&&!corrected.hlm.pendingRepChoice&&corrected.hlm.nextHeavy.Squat===squat&&corrected.history.length===history;
  // Both drivers traverse 5→4→3→2 through authentic recorded failures.
  const c=journey('hlm',true),first=clone(c.S().hlm.pendingRepChoice);c.ctx.bvomChoiceModal=c.realChoiceModal;c.ctx.__bvomHlmRepChoiceOpen=false;c.ctx.bvomPresentPendingHlmRepChoice();const terminal=c.lastOverlay();terminal.querySelector('[data-r]').onclick();c.lastOverlay().querySelector('[data-r]').onclick();
  const raw=c.ls.getItem('bvom_data');c.ctx.finishWorkout();const held=c.ls.getItem('bvom_data')===raw&&JSON.stringify(read(c).hlm.pendingRepChoice)===JSON.stringify(first)&&!read(c).processed['Bench Press'];
  c.ctx.bvomCancelDeferredSetup();const battle=c.lastOverlay();battle.querySelector('[data-l]').onclick();const next=read(c);
  return ok(neutral&&held&&first?.lift==='Squat'&&next.hlm.pendingRepChoice?.lift==='Bench Press'&&next.hlm.failCount['Bench Press']===3&&next.hlm.failCount.Squat===0,JSON.stringify({neutral,held,first,next:next.hlm.pendingRepChoice,fail:next.hlm.failCount,processed:next.processed}));
 });
 test('F83-DEFERRED-OWNERSHIP-FENCES','DEFECT','Late request, second tab, changed account, stale blob and stored-vs-memory activity all fail closed',()=>{
  const checks=[];
  for(const change of ['owner','account','stale']){
   const h=journey();h.ctx.bvomChoiceModal=h.realChoiceModal;h.dialog.onR();const confirm=h.lastOverlay(),memory=JSON.stringify(h.S());
   if(change==='owner')h.ls.setItem('bvom_workout_tab_owner','foreign');else if(change==='account')h.ev("bvomCloud.user={id:'other'}");else h.ls.setItem('bvom_data',h.ls.getItem('bvom_data')+' ');
   const raw=h.ls.getItem('bvom_data');confirm.querySelector('[data-r]').onclick();checks.push(raw===h.ls.getItem('bvom_data')&&memory===JSON.stringify(h.S())&&!read(h).setupAfterFinish);
  }
  const h=journey();request(h);const raw=h.ls.getItem('bvom_data'),b=H.boot(build,{ls:h.ls,ss:H.memStore({bvom_tab_id:'other-document'}),supabase:null,online:false,locks:{request:(_n,_o,cb)=>{cb(null);return Promise.resolve()}}}),memory=JSON.stringify(b.S());b.ctx.bvomCancelDeferredSetup();b.ctx.finishWorkout();checks.push(raw===h.ls.getItem('bvom_data')&&memory===JSON.stringify(b.S()));
  // Stored active while memory looks idle cannot continue into setup.
  h.S().session={};h.S().workoutStartedAt=null;checks.push(h.ctx.bvomOpenDeferredDraft()===false&&h.ls.getItem('bvom_data')===raw);
  return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 test('F84-DEFERRED-INGRESS-AND-RECONCILIATION','DEFECT','Cloud ingress cannot import transient intent; unrelated writes/reconnect preserve local intent and genuine completed History changes',async()=>{
  const h=journey();request(h);const intent=clone(read(h).setupAfterFinish);h.S().timerSound=false;h.ev('save()');const durable=JSON.stringify(read(h).setupAfterFinish)===JSON.stringify(intent),remote=clone(read(h));
  const accepted=h.ctx.bvomCloudValidData(remote),clean=!('setupAfterFinish'in remote)&&!!remote.hlm.pendingRepChoice;
  savedOffer(h);const completed=read(h),payload=h.ctx.bvomCloudPayload(),prior=clone(payload);prior.history.pop();
  const fp=x=>h.ctx.bvomCloudComparableFingerprint(x),reconnect=fp(payload)===fp(completed)&&fp(prior)!==fp(completed)&&payload.history.length===12&&!payload.setupAfterFinish;
  await Promise.resolve();await Promise.resolve();
  let mockRemote=clone(prior),uploads=0;
  h.ctx.bvomCloudLatest=async()=>({data:{id:'mock-cloud-row',data:clone(mockRemote)},error:null});
  h.ctx.bvomCloudClient=()=>({from:()=>({update:({data})=>{mockRemote=clone(data);uploads++;const query={eq:()=>query,select:()=>query,single:async()=>({data:{id:'mock-cloud-row'},error:null})};return query}})});
  h.ctx.__bvomCloudBooted=true;h.ev('bvomCloud.offlineLocalAccess=false;bvomCloud.deferWorkoutCommit=false');h.ev('bvomCloud.workoutBaselineFingerprint='+JSON.stringify(fp(prior)));
  await h.ctx.bvomCloudAssessSync();const reconciled=h.ev('bvomCloud.syncReady&&!bvomCloud.conflict');await h.ctx.bvomCloudAutoSave();
  const uploaded=uploads===1&&mockRemote.history.length===12&&!mockRemote.setupAfterFinish&&JSON.stringify(read(h).history)===JSON.stringify(completed.history);
  h.ev('bvomCloud.pendingAuto=false');h.ctx.bvomCancelDeferredSetup();const noUnearnedUpload=!h.ev('bvomCloud.pendingAuto')&&uploads===1;
  h.S().history[0].note='legitimate local History edit';h.ev('save()');const scheduled=h.ev('bvomCloud.pendingAuto');await h.ctx.bvomCloudAutoSave();const realUpdate=scheduled&&uploads===2&&mockRemote.history[0].note==='legitimate local History edit';
  const foreign=H.boot(build,{ls:H.memStore({'bvom_data':JSON.stringify(completed),'bvom_data_owner':'another-account'}),ss:h.ctx.sessionStorage,supabase:null,online:false});
  const reset=reload(h);reset.S().programMode='lprpt';reset.ev('save()');
  return ok(durable&&accepted&&clean&&reconnect&&reconciled&&uploaded&&noUnearnedUpload&&realUpdate&&!foreign.S().setupAfterFinish&&!read(reset).setupAfterFinish,JSON.stringify({durable,accepted,clean,reconnect,reconciled,uploaded,noUnearnedUpload,realUpdate,uploads,cloudError:h.ev('bvomCloud.message')}));
 });
 test('F85-DEFERRED-EN-JA-AND-INCOMPLETE','DEFECT','Both languages explain defer/reset/cancel; incomplete Finish requires explicit consent and preserves real RPE without invented GPP',()=>{
  const checks=[];for(const lang of ['en','ja']){
   const h=journey();h.ctx.changeLanguage(lang);h.ctx.bvomChoiceModal=h.realChoiceModal;h.dialog.onR();const confirm=h.lastOverlay();checks.push(lang==='en'?/Finish this workout first/.test(confirm.innerHTML):/先にこのワークアウト/.test(confirm.innerHTML));confirm.querySelector('[data-r]').onclick();
   // Correcting the independently successful Squat set leaves the Bench request intact,
   // but deletes dependent work and therefore needs the existing incomplete consent.
   h.reps.push(0);h.ctx.tapSet('Squat',0);const before=clone(h.S()),raw=h.ls.getItem('bvom_data');let consent;
   h.ctx.bvomIncompleteConfirm=(yes,no)=>{consent={yes,no}};h.ctx.finishWorkout();checks.push(h.ls.getItem('bvom_data')===raw&&!!consent);consent.no();checks.push(h.ls.getItem('bvom_data')===raw);h.ctx.finishWorkout();consent.yes();const ack=h.lastOverlay(),d=read(h);ack.querySelector('[data-ok]').onclick();const offer=h.lastOverlay();
   checks.push(d.history.at(-1).incomplete&&d.history.length===12&&JSON.stringify(d.history.at(-1).session)===JSON.stringify(before.session)&&d.history.at(-1).session['Bench Press'][2].rpe===8&&(d.history.at(-1).gpp||[]).length===0);
   checks.push(lang==='en'?/BOTH Squat and Bench/.test(offer.innerHTML):/スクワットとベンチ両方/.test(offer.innerHTML));
  }return ok(checks.every(Boolean),JSON.stringify(checks));
 });
 return {journey};
};

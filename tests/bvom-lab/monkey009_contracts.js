'use strict';
// Real application callbacks; only platform/storage/service responses are synthetic.
module.exports=function({test,ok,H,build,configureLP,ownershipPair,readOnlyNotice}){
 const boot=(ls,id)=>H.boot(build,{ls,ss:H.memStore({bvom_tab_id:id}),supabase:null,online:false});
 const capture=h=>{h.ctx.bvomChoiceModal=h.realChoiceModal};
 const snap=h=>({memory:JSON.stringify(h.S()),raw:h.ls.getItem('bvom_data'),owner:h.ls.getItem('bvom_workout_tab_owner')});
 const unchanged=(h,s)=>JSON.stringify(snap(h))===JSON.stringify(s);
 const warning=h=>h.overlays().some(o=>/bvomWorkoutReadOnlyOverlay|bvomLocalStaleOverlay|bvomLocalSaveFailureOverlay|bvomPostCommitOwnerFailureOverlay/.test(o.id||'')&&!o.removed);
 const restoreDialog=h=>{let reader;h.ctx.FileReader=function(){reader=this;this.readAsText=()=>{}};const backup=JSON.parse(JSON.stringify(h.S()));backup.weights.Squat=20;h.ctx.importBackupFile({files:[{}],value:'backup.json'});return()=>{reader.result=JSON.stringify({data:backup});reader.onload();return h.lastOverlay()}};
 test('F58-DELAYED-BACKUP-COMMIT','DEFECT','Backup file-read and confirmation recheck latest two-tab training before replacing bytes',()=>{
  const out=[];
  for(const phase of ['read','confirm','control']){
   const ls=H.memStore(),a=boot(ls,'A');configureLP(a);capture(a);const ready=restoreDialog(a);let dialog;if(phase!=='read')dialog=ready();
   if(phase!=='control'){const b=boot(ls,'B');b.reps.push(5);b.ctx.tapSet('Squat',0);const before=snap(a);if(phase==='read')dialog=ready();if(/RESTORE BACKUP\?/.test(dialog.innerHTML))dialog.querySelector('[data-r]').onclick();out.push({phase,pass:unchanged(a,before)&&warning(a)&&!a.log.some(x=>x[0]==='reload')&&JSON.parse(ls.getItem('bvom_data')).session.Squat[0].reps===5});}
   else{dialog.querySelector('[data-r]').onclick();out.push({phase,pass:JSON.parse(ls.getItem('bvom_data')).weights.Squat===20&&a.log.filter(x=>x[0]==='reload').length===1&&!!ls.getItem('bvom_pre_restore')});}
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F59-DEFERRED-MUTATION-COMMIT','DEFECT','Actual History/Custom accessory/GPP confirmations reject changed ownership without leakage or false success',()=>{
  const out=[];
  for(const action of ['history','accessory','gpp','intermediate','setup']){
   const ls=H.memStore(),a=boot(ls,'A');configureLP(a);a.S().history=[{date:'2026-10-01',day:'A',session:{}}];
   if(['accessory','gpp'].includes(action)){a.ctx.chooseProgramMode('free');const assignment={assignment:'__FREE__',hlmAssignment:'__FREE__',fourDayAssignment:'__FREE__',freeAssignment:String(a.ctx.bvomFtDayId())};a.S().accessoryList=[{id:'acc',name:'Curl',weight:20,...assignment}];a.S().gppList=[{id:'gpp',name:'Erg',metrics:{time:true},planned:{timeSeconds:60},...assignment}];}
   a.reps.push(5);a.ctx.tapSet('Squat',0);a.ev('save()');capture(a);
   if(action==='history')a.ctx.deleteHistoryWorkout(0);
   if(action==='accessory')a.ctx.removeAccessory('acc');
   if(action==='gpp')a.ctx.removeGpp('gpp');
   if(action==='intermediate')a.ctx.chooseProgramMode('hlm');
   if(action==='setup'){a.S().session={};a.S().workoutStartedAt=null;a.ev('save()');a.ctx.bvomStartingSetupModal();}
   const dialog=a.lastOverlay();ls.setItem('bvom_workout_tab_owner','foreign');if(action==='setup'){const p=JSON.parse(ls.getItem('bvom_data'));p.session.Squat={0:{reps:5,load:100}};ls.setItem('bvom_data',JSON.stringify(p));}
   const before=snap(a);dialog.querySelector(action==='setup'?'[data-r]':'[data-r]').onclick();const rejected=unchanged(a,before)&&warning(a)&&!a.overlays().some(o=>/WORKOUT DELETED/.test(o.innerHTML));
   // Artificial restoration of the permission marker tests leakage, not takeover.
   ls.setItem('bvom_workout_tab_owner','A');a.ctx.completeWarmup('Squat',0,3,{classList:{add(){},remove(){}}});const persisted=JSON.parse(ls.getItem('bvom_data'));out.push({action,pass:rejected&&(action!=='accessory'||persisted.accessoryList.some(x=>x.id==='acc'))&&(action!=='gpp'||persisted.gppList.some(x=>x.id==='gpp'))});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F60-POSTCOMMIT-OWNER-FAILURE','DEFECT','A successful blob write remains committed when owner bookkeeping fails; failure warning blocks subsequent work',()=>{
  const out=[];
  for(const pick of ['onL','onR']){
   const {a,ls}=ownershipPair();a.S().attempts['Bench Press']=1;a.ev('save()');ls.removeItem('bvom_workout_tab_owner');const put=ls.setItem,trace=[];
   ls.setItem=(k,v)=>{if(k==='bvom_workout_tab_owner'){trace.push({key:k,failed:true,...snap(a)});throw Error('owner key only');}put(k,v);trace.push({key:k,...snap(a)});};
   const result=a.dialog[pick]();ls.setItem=put;const p=JSON.parse(ls.getItem('bvom_data')),committed=p.weights['Bench Press']===(pick==='onR'?47.5:45)&&p.attempts['Bench Press']===(pick==='onR'?0:2)&&!p.pendingCloseMissChoice;
   const consistent=JSON.stringify(a.S())===ls.getItem('bvom_data'),before=snap(a);a.ctx.tapSet('Squat',0);const blocked=unchanged(a,before)&&warning(a);const reloaded=H.boot(build,{ls,ss:a.ctx.sessionStorage,supabase:null,online:false});
   out.push({pick,result,consistent,blocked,pass:result===true&&committed&&consistent&&blocked&&!reloaded.S().pendingCloseMissChoice&&reloaded.S().weights['Bench Press']===p.weights['Bench Press']&&trace.every(x=>x.memory===x.raw)&&trace.some(x=>x.failed&&JSON.parse(x.raw).pendingCloseMissChoice===undefined)});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F61-PENDING-CREATION-DURABILITY','DEFECT','Final-set processing and required LP/HLM/4-Day choice persist together or reload resumes from recorded unprocessed work',()=>{
  const out=[];
  for(const mode of ['lprpt','hlm','fourday']){
   const ls=H.memStore(),a=boot(ls,'A');configureLP(a,{Squat:60,'Bench Press':45,'Prone Row':40,'Overhead Press':30,Deadlift:75});
   let lift='Bench Press';if(mode==='lprpt'){a.S().core[lift].mode='rpt';a.S().attempts[lift]=2;}else{a.choices.push('R');a.ctx.chooseProgramMode(mode);lift=mode==='hlm'?'Squat':'Bench Press';a.S().hlm.failCount[lift]=2;}
   a.ev('save()');a.ctx.bvomChoiceModal=(t,b,l,r,onL,onR)=>{a.dialog={onL,onR}};
   // LP close miss; intermediate heavy miss followed by rescue.
   if(mode==='lprpt'){a.reps.push(5,5);a.ctx.tapSet(lift,0);a.ctx.tapSet(lift,1);}else{a.reps.push(5,5,4,5);for(let i=0;i<4;i++)a.ctx.tapSet(lift,i);}
   const put=ls.setItem;let failed=false;const trace=[];ls.setItem=(k,v)=>{if(k==='bvom_data'){const d=JSON.parse(v);if(!failed&&(d.pendingCloseMissChoice||d.hlm?.pendingRepChoice)){failed=true;throw Error('pending creation only');}}put(k,v);if(k==='bvom_data')trace.push(JSON.parse(v));};
   a.reps.push(6);a.ctx.tapSet(lift,mode==='lprpt'?2:4);ls.setItem=put;
   const saved=JSON.parse(ls.getItem('bvom_data')),coherent=!!(saved.pendingCloseMissChoice||saved.hlm?.pendingRepChoice)||!saved.processed?.[lift];
   const fresh=H.boot(build,{ls,ss:a.ctx.sessionStorage,supabase:null,online:false});fresh.ctx.bvomChoiceModal=(t,b,l,r,onL,onR)=>{fresh.dialog={onL,onR}};fresh.ctx.renderAll();
   const pending=mode==='lprpt'?fresh.S().pendingCloseMissChoice:fresh.S().hlm?.pendingRepChoice;let once=false;
   if(pending&&fresh.dialog){fresh.dialog.onR();const p=JSON.parse(ls.getItem('bvom_data'));fresh.ctx.renderAll();const again=H.boot(build,{ls,ss:fresh.ctx.sessionStorage,supabase:null,online:false});once=mode==='lprpt'?p.weights[lift]===47.5&&again.S().weights[lift]===47.5&&!again.S().pendingCloseMissChoice:p.hlm.rep[lift]===4&&again.S().hlm.rep[lift]===4&&!again.S().hlm.pendingRepChoice;}
   out.push({mode,failed,coherent,pending:!!pending,once,pass:failed&&coherent&&once&&Object.keys(saved.session[lift]).length===(mode==='lprpt'?3:5)&&trace.every(d=>!d.processed?.[lift]||!!(d.pendingCloseMissChoice||d.hlm?.pendingRepChoice))});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F62-DELAYED-CLOUD-AND-SETUP','DEFECT','Mocked cloud confirmation and setup entitlement await recheck data, account and access at commit',async()=>{
  const out=[];
  for(const change of ['workout','account','entitlement','control']){
   const ls=H.memStore(),a=boot(ls,'A');configureLP(a);a.ev("bvomCloud.user={id:'synthetic-user'};window.__bvomAuthUserId='synthetic-user';bvomEntitlement.record={status:'subscriber',user_id:'synthetic-user'}");ls.setItem('bvom_data_owner','synthetic-user');a.ev('save()');capture(a);
   const data=JSON.parse(JSON.stringify(a.S()));data.weights.Squat=20;const q={select(){return this},eq(){return this},order(){return this},async limit(){return {data:[{id:'synthetic-row',data}],error:null}}};a.ctx.bvomCloudClient=()=>({from:()=>q});await a.ctx.bvomCloudRestore();const dialog=a.lastOverlay();
   if(change==='workout'){const b=boot(ls,'B');b.reps.push(5);b.ctx.tapSet('Squat',0);}
   if(change==='account')a.ev("bvomCloud.user={id:'other-user'}");
   if(change==='entitlement')a.ev("bvomEntitlement.record={status:'expired',user_id:'synthetic-user'}");
   const before=snap(a);dialog.querySelector('[data-r]').onclick();out.push({change,pass:change==='control'?JSON.parse(ls.getItem('bvom_data')).weights.Squat===20&&a.log.some(x=>x[0]==='reload'):unchanged(a,before)&&!a.log.some(x=>x[0]==='reload')&&(warning(a)||a.overlays().some(o=>/RESTORE STOPPED/.test(o.innerHTML))||/BVOM ACCESS/.test(a.els['#authgate'].innerHTML))});
  }
  const ls=H.memStore(),a=boot(ls,'A');configureLP(a);a.ev("bvomCloud.user={id:'synthetic-user'}");let resolve;a.ctx.bvomEntitlementStartTrial=()=>new Promise(r=>resolve=r);const setup=a.ctx.completeSetup();const b=boot(ls,'B');b.reps.push(5);b.ctx.tapSet('Squat',0);const before=snap(a);resolve(true);await setup;out.push({change:'setup-await',pass:unchanged(a,before)&&warning(a)});
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F63-STORAGE-ORDER-AND-NESTED-CHOICE','DEFECT','Quota, fresh acquisition/cleanup, foreign postcommit owner and nested attempt 2 to 3 remain coherent',()=>{
  const out=[];
  // A first real save acquires a marker; an unsuccessful first save does not.
  for(const fail of [false,true]){const ls=H.memStore(),a=boot(ls,'A');configureLP(a);const raw=ls.getItem('bvom_data'),put=ls.setItem;ls.setItem=(k,v)=>{if(fail&&k==='bvom_data')throw Error('quota');return put(k,v)};a.ctx.tapSet('Squat',0);ls.setItem=put;out.push({case:'fresh-'+fail,pass:fail?ls.getItem('bvom_data')===raw&&!ls.getItem('bvom_workout_tab_owner'):JSON.parse(ls.getItem('bvom_data')).session.Squat[0].reps===5&&ls.getItem('bvom_workout_tab_owner')==='A'});if(!fail){a.S().session={};a.S().workoutStartedAt=null;a.ev('save()');out.push({case:'cleanup',pass:!ls.getItem('bvom_workout_tab_owner')});}}
  for(const failure of ['quota','foreign-postcommit']){const {a,ls}=ownershipPair();ls.removeItem('bvom_workout_tab_owner');const before=snap(a),put=ls.setItem;ls.setItem=(k,v)=>{if(k==='bvom_data'&&failure==='quota')throw Error('quota');put(k,v);if(k==='bvom_data'&&failure==='foreign-postcommit')put('bvom_workout_tab_owner','foreign')};const result=a.dialog.onR();ls.setItem=put;out.push({case:failure,pass:failure==='quota'?result===false&&unchanged(a,before)&&warning(a):result===true&&JSON.stringify(a.S())===ls.getItem('bvom_data')&&ls.getItem('bvom_workout_tab_owner')==='foreign'&&warning(a)});}
  {const {a,ls}=ownershipPair();a.S().session={};a.S().workoutStartedAt=null;delete a.S().pendingCloseMissChoice;const remove=ls.removeItem;ls.removeItem=k=>{if(k==='bvom_workout_tab_owner')throw Error('cleanup key only');remove(k)};const result=a.ev('save({durable:true})');ls.removeItem=remove;out.push({case:'postcommit-cleanup-failure',pass:result===true&&JSON.stringify(a.S())===ls.getItem('bvom_data')&&ls.getItem('bvom_workout_tab_owner')==='owner-A'&&warning(a)});}
  const {a,ls}=ownershipPair();a.S().attempts['Bench Press']=2;a.ev('save()');capture(a);a.ctx.__bvomCloseMissChoiceOpen=false;a.ctx.bvomPresentPendingCloseMissChoice();a.lastOverlay().querySelector('[data-l]').onclick();const nested=a.lastOverlay(),p=JSON.parse(ls.getItem('bvom_data'));const before=snap(a);ls.setItem('bvom_workout_tab_owner','foreign');const foreign=snap(a);nested.querySelector('[data-r]').onclick();out.push({case:'nested-2-to-3',pass:p.attempts['Bench Press']===3&&!p.pendingCloseMissChoice&&unchanged(a,foreign)&&warning(a)&&before.memory===foreign.memory});
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F64-ASSIGNED-TIMER-SOUND-GUARD','DEFECT','Assigned timer-sound handler rejects secondary mutation and restores displayed checkbox',()=>{
  const {b}=ownershipPair();b.ctx.renderSettings();const card=b.els['#settings'].children.at(-1),input=card.querySelector('input'),before=snap(b);input.checked=false;input.onchange({target:input});return ok(unchanged(b,before)&&input.checked===true&&warning(b),'memory/blob/owner and displayed toggle unchanged');
 });
};

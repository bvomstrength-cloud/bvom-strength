'use strict';
module.exports=function({test,ok,H,build,configureLP}){
 const boot=(ls,id='A')=>H.boot(build,{ls,ss:H.memStore({bvom_tab_id:id}),supabase:null,online:false});
 const snap=h=>JSON.stringify({storage:[...h.ls._map],memory:h.S(),auth:h.ev('[window.__bvomAuthUserId,bvomCloud.user?.id||null]')});
 const reload=h=>h.log.some(x=>x[0]==='reload');
 const status=h=>h.overlays().filter(o=>!o.removed).map(o=>o.innerHTML).join(' ');
 async function begin(h){await h.ctx.eraseAll();const o=h.lastOverlay();o.querySelector('[data-i]').value='RESET';o.querySelector('[data-i]').oninput();return {o,go:()=>o.querySelector('[data-e]').onclick()};}
 test('F65-ERASE-STALE-AWAIT','DEFECT','Erase continuation refuses changed training, owner, account and unreadable storage on resolve/reject',async()=>{
  const out=[];
  for(const outcome of ['resolve','reject'])for(const change of ['workout','idle-blob','marker','account','data-owner','read-error','memory','auth-event']){
   const ls=H.memStore(),a=boot(ls);configureLP(a);let resolve,reject;
   a.ctx.bvomCloudClient=()=>({auth:{signOut:()=>new Promise((r,j)=>{resolve=r;reject=j})}});
   const d=await begin(a),pending=d.go();let b;
   if(change==='workout'){b=boot(ls,'B');b.reps.push(5);b.ctx.tapSet('Squat',0);}
   if(change==='idle-blob'){const p=JSON.parse(ls.getItem('bvom_data'));p.weights.Squat=123;ls.setItem('bvom_data',JSON.stringify(p));}
   if(change==='marker')ls.setItem('bvom_workout_tab_owner','foreign');
   if(change==='account')a.ev("bvomCloud.user={id:'other'};window.__bvomAuthUserId='other'");
   if(change==='data-owner')ls.setItem('bvom_data_owner','other');
   if(change==='memory')a.S().weights.Squat=123;
   if(change==='auth-event'){a.ctx.bvomEraseAuthEvent?.('SIGNED_IN',null,{id:'other'});a.ctx.bvomEraseAuthEvent?.('SIGNED_OUT','other',null);}
   const before=snap(a),bm=b&&JSON.stringify(b.S()),get=ls.getItem;
   if(change==='read-error')ls.getItem=k=>{if(k==='bvom_data')throw Error('read denied');return get(k)};
   outcome==='resolve'?resolve({error:null}):reject(Error('synthetic signout failure'));await pending;ls.getItem=get;
   const preserved=snap(a)===before&&!reload(a)&&(!b||JSON.stringify(b.S())===bm);
   const fresh=boot(H.memStore(Object.fromEntries(ls._map)),'B');
   out.push({outcome,change,preserved,warning:/ERASE STOPPED/.test(status(a)),fresh:change!=='workout'||fresh.S().session.Squat?.[0]?.reps===5});
  }
  return ok(out.every(x=>x.preserved&&x.warning&&x.fresh),JSON.stringify(out));
 });
 test('F66-ERASE-CANCEL-AWAIT','DEFECT','Actual Cancel invalidates local deletion during signout, including repeated confirmation and rejection',async()=>{
  const out=[];
  for(const outcome of ['resolve','reject']){
   const ls=H.memStore(),a=boot(ls);configureLP(a);let resolve,reject,calls=0,shared;
   a.ctx.bvomCloudClient=()=>({auth:{signOut:()=>{calls++;return shared||(shared=new Promise((r,j)=>{resolve=r;reject=j}))}}});
   const before=snap(a),d=await begin(a),p=d.go();const again=d.go();d.o.querySelector('[data-c]').onclick();
   outcome==='resolve'?resolve({error:null}):reject(Error('signout failed'));await p;await again;
   out.push({outcome,preserved:snap(a)===before&&!reload(a),once:calls===1,honest:/LOCAL ERASE CANCELLED/.test(status(a))&&/sign-out/i.test(status(a))});
  }
  return ok(out.every(x=>x.preserved&&x.once&&x.honest),JSON.stringify(out));
 });
 test('F67-HISTORY-EXACT-TARGET','DEFECT','Overlapping confirmations, changed notes, duplicate records and reorder cannot delete a different target',()=>{
  const out=[];
  for(const change of ['overlap','note','duplicate','reorder','control','owner','stale-blob','replacement']){
   const ls=H.memStore(),a=boot(ls);configureLP(a);a.ctx.bvomChoiceModal=a.realChoiceModal;
   const first={date:'2026-10-01',day:'A',session:{},note:'first'},second={date:'2026-10-02',day:'B',session:{},note:'second'};
   a.S().history=[first,second];if(change==='duplicate')a.S().history=[first,JSON.parse(JSON.stringify(first))];a.ev('save()');
   a.ctx.deleteHistoryWorkout(0);const older=a.lastOverlay();
   if(change==='overlap'){a.ctx.deleteHistoryWorkout(0);a.lastOverlay().querySelector('[data-r]').onclick();}
   if(change==='note'){a.ctx.bvomSessionNoteModal=(initial,save)=>save('edited');a.ctx.editHistoryNote(0);}
   if(change==='replacement'){a.S().history=JSON.parse(JSON.stringify(a.S().history));a.ev('save()');}
   if(change==='reorder'){a.S().history.reverse();a.ev('save()');}
   if(change==='owner'){a.reps.push(5);a.ctx.tapSet('Squat',0);ls.setItem('bvom_workout_tab_owner','foreign');}
   if(change==='stale-blob'){const p=JSON.parse(ls.getItem('bvom_data'));p.weights.Squat=123;ls.setItem('bvom_data',JSON.stringify(p));}
   const before=snap(a),successBefore=(status(a).match(/WORKOUT DELETED/g)||[]).length;older.querySelector('[data-r]').onclick();
   const legitimate=change==='control'||change==='reorder';
   out.push({change,pass:legitimate?a.S().history.length===1&&a.S().history[0].note==='second':snap(a)===before&&(status(a).match(/WORKOUT DELETED/g)||[]).length===successBefore});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F68-ERASE-LEGITIMATE-CONTROLS','DEFECT','Uncontested offline/signed-in erase, expected auth event, preconfirm Cancel and fresh explicit confirmation',async()=>{
  const out=[];
  for(const mode of ['offline','signed-in','auth-event','error-result','pre-cancel','fresh']){
   const ls=H.memStore(),a=boot(ls);configureLP(a);let calls=0,resolve;
   if(mode==='signed-in'||mode==='auth-event')a.ev("bvomCloud.user={id:'user-A'};window.__bvomAuthUserId='user-A'");
   if(mode!=='offline')a.ctx.bvomCloudClient=()=>({auth:{signOut:async()=>{calls++;if(mode==='auth-event'){a.ctx.bvomEraseAuthEvent('SIGNED_OUT','user-A',null);a.ev('bvomCloud.user=null;window.__bvomAuthUserId=null;bvomCloud.offlineLocalAccess=false;bvomCloud.accountSwitchDeferred=false')}if(mode==='fresh'&&calls===1)return new Promise(r=>resolve=r);return {error:mode==='error-result'?{message:'synthetic error'}:null}}}});
   if(mode==='pre-cancel'){await a.ctx.eraseAll();const before=snap(a);a.lastOverlay().querySelector('[data-c]').onclick();out.push({mode,pass:snap(a)===before&&!calls&&!reload(a)});continue}
   const d=await begin(a),p=d.go();
   if(mode==='fresh'){const data=JSON.parse(ls.getItem('bvom_data'));data.weights.Squat=125;ls.setItem('bvom_data',JSON.stringify(data));resolve({error:null});await p;const kept=!!ls.getItem('bvom_data')&&!reload(a);const fresh=boot(ls,'A');await fresh.ctx.eraseAll();const next=fresh.lastOverlay();await next.querySelector('[data-e]').onclick();const needsReset=!!ls.getItem('bvom_data')&&!reload(fresh);next.querySelector('[data-i]').value='RESET';await next.querySelector('[data-e]').onclick();out.push({mode,pass:kept&&needsReset&&!ls.getItem('bvom_data')&&reload(fresh)});continue}
   await p;out.push({mode,pass:!ls.getItem('bvom_data')&&!ls.getItem('bvom_workout_tab_owner')&&reload(a)&&calls===(mode==='offline'?0:1)&&d.o.querySelector('[data-c]').onclick===null});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
 test('F69-ERASE-NATIVE-AUTH-CALLBACK','DEFECT','Actual mocked auth listener handles expected signout and rejects changed-account event even after return',async()=>{
  const out=[];
  for(const changed of [false,true]){
   const ls=H.memStore(),net={online:true},sup=H.mockSupabase({net}),a=await H.launch(build,{ls,net,supabase:sup});configureLP(a);let resolve;
   sup.createClient().auth.signOut=()=>new Promise(r=>resolve=r);
   const d=await begin(a),p=d.go();
   if(changed){sup._emitAuth('SIGNED_IN',{user:{id:'other'}});sup._emitAuth('SIGNED_IN',{user:{id:'user-1'}});}
   sup._emitAuth('SIGNED_OUT');const raw=ls.getItem('bvom_data');resolve({error:null});await p;
   out.push({changed,pass:changed?ls.getItem('bvom_data')===raw&&!reload(a)&&/ERASE STOPPED/.test(status(a)):!ls.getItem('bvom_data')&&reload(a)});
  }
  return ok(out.every(x=>x.pass),JSON.stringify(out));
 });
};

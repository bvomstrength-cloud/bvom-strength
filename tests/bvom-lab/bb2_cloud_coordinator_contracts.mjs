// Dormant BB2 sync coordinator: real sidecar protocol, in-memory authenticated
// database and exact BVOM local save adapters. No real cloud account is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createBB2CloudCoordinator,
  validateBB2PortableCatalogue } from '../../bb2/cloud-coordinator.mjs';
import { createBB2CloudSidecar,
  validateBB2CloudSidecar } from '../../bb2/cloud-sidecar.mjs';
import * as core from '../../bb2/browser-core.mjs';
const require=createRequire(import.meta.url);
const H=require('./lib/bvom_harness');
const root=new URL('../..',import.meta.url).pathname;
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const copy=x=>JSON.parse(JSON.stringify(x));
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS:',name)};

function fakeDatabase(){
 const server={row:null,readCount:0,writeCount:0,loseReply:false,
  failBeforeWrite:false};
 function client(authOwner){return {from(table){
  assert.equal(table,'bvom_cloud_state');
  let operation='read',values,fields='user_id,revision,data_version,state',filters=[];
  const match=row=>row&&filters.every(([key,value])=>row[key]===value);
  const q={
   select(next){fields=next;return q},
   eq(key,value){filters.push([key,value]);return q},
   insert(input){operation='insert';values=input;return q},
   update(input){operation='update';values=input;return q},
   async maybeSingle(){
    if(operation==='read'){
     server.readCount++;
     const row=server.row?.user_id===authOwner&&match(server.row)?server.row:null;
     return {data:row?Object.fromEntries(fields.split(',').map(k=>[k,copy(row[k])])):null,error:null};
    }
    if(server.failBeforeWrite){server.failBeforeWrite=false;
     return {data:null,error:{code:'NETWORK',message:'write never reached database'}};}
    if(authOwner!==values?.user_id&&operation==='insert')
     return {data:null,error:{code:'42501',message:'owner RLS denied'}};
    if(operation==='insert'){
     if(server.row)return {data:null,error:{code:'23505',message:'unique owner'}};
     server.row=copy(values);
    }else{
     if(server.row?.user_id!==authOwner||!match(server.row))
      return {data:null,error:null};
     Object.assign(server.row,copy(values));
    }
    server.writeCount++;
    if(server.loseReply){server.loseReply=false;return {data:null,error:Error('reply lost')}}
    return {data:Object.fromEntries(fields.split(',').map(k=>[k,copy(server.row[k])])),error:null};
   }
  };return q;
 }};}
 return {server,client};
}

const safe=()=>({authUserId:owner,cloudUserId:owner,localOwnerId:owner,
 appVisible:true,entitlementAllowed:true,documentLockOwned:true,
 documentLockState:'owned',legacyRecoveryBlocked:false,tabOwnerCompatible:true,
 accountSwitchDeferred:false,recoveryBusy:false,localPersistenceHealthy:true,
 localBlobUnchanged:true,legacyWorkoutActive:false,cloudConflict:false,
 bb2WriterEnabled:true,multiDeviceFenceVerified:true});

function device(db,{bb2=null,enabled=true}={}){
 let state={token:1,bb2:copy(bb2)},failed=false,backupFailed=false,
  backups=[],app=safe(),request=0;
 const session=createBB2CloudCoordinator({client:db.client(owner),ownerId:owner,
  readAppSnapshot:()=>enabled?app:{...app,bb2WriterEnabled:false},
  readLocal:()=>({ownerId:owner,token:String(state.token),bb2:copy(state.bb2)}),
  commitLocal:(expected,next,{backupBeforeReplace=false}={})=>{
   if(failed||expected!==String(state.token)||backupBeforeReplace&&backupFailed)return false;
   if(backupBeforeReplace)backups.push(copy(state.bb2));
   state={token:state.token+1,bb2:copy(next)};return true;
  },makeRequestId:()=>`req-${++request}`});
 return {session,get:()=>copy(state.bb2),set(next){state={token:state.token+1,bb2:copy(next)}},
  failSave(value){failed=value},failBackup(value){backupFailed=value},
  backups:()=>copy(backups),setApp(next){app=next}};
}

const db=fakeDatabase();
await check('portable Start replays entered-weight provenance, refusing forged DERIVED sources',async()=>{
 const setup=core.createBB2Setup({catalogueVersion:1}),opening=core.createBB2Opening({
  ownerId:owner,blockId:'provenance-start'});
 const slots=core.getBB2TemplatePrescription(setup,'upper_a').slots.map(s=>({
  roleSlotId:s.roleSlotId,exerciseId:s.exerciseId,sets:s.sets,floor:s.floor,
  ceiling:s.ceiling,equipment:s.equipment,...(s.equipment==='loaded'?{
   plannedG:60000,plannedOrigin:{value:'60',unit:'kg'},
   incrementG:2500,incrementOrigin:{value:'2.5',unit:'kg'}}:{
   variation:s.exerciseId,assistance:'none'})}));
 const start={type:'WORKOUT_STARTED',eventId:'valid-start',commitOrdinal:1,
  blockId:opening.blockId,sessionId:'started',templateId:'upper_a',
  kind:'NORMAL',slots};
 assert.equal(validateBB2PortableCatalogue(setup,[start],{opening}),true);
 const forged=copy(start);
 forged.slots[0].plannedOrigin={kind:'DERIVED',sourceEventId:'never-earned'};
 assert.throws(()=>validateBB2PortableCatalogue(setup,[forged],{opening}),
  /BB2 Start/,'a real-user import cannot mint unearned progression provenance');
});
await check('non-catalogue swap cannot enter imported, sidecar or restored BB2 history',async()=>{
 const setup=core.createBB2Setup({catalogueVersion:1}),opening=core.createBB2Opening({ownerId:owner,
  blockId:'invalid-swap'});
 const swap={type:'EXERCISE_SWAPPED',eventId:'swap:1',commitOrdinal:1,
  blockId:opening.blockId,templateId:'upper_a',roleSlotId:'flat_press',
  exerciseId:'dumbbell_flat_press'};
 const tx=core.BB2_BROWSER_MODULES.ledger.commitBB2Transaction(opening,[],[swap],{
  ownerId:owner,blockId:opening.blockId,expectedHead:0,
  foldRulesVersion:opening.foldRulesVersion,sealRevision:0,activeWorkout:false});
 assert.equal(validateBB2PortableCatalogue(setup,tx.events,{opening}),true,
  'historical legitimate swaps remain valid even if current setup differs');
 const forged=tx.events.map(event=>({...event,exerciseId:'not_a_catalogue_exercise'}));
 assert.throws(()=>validateBB2PortableCatalogue(setup,forged,{opening}),/non-catalogue/);
 const wrongRole=tx.events.map(event=>({...event,roleSlotId:'unknown_role'}));
 assert.throws(()=>validateBB2PortableCatalogue(setup,wrongRole,{opening}),/non-catalogue/);
 const bb2={setup,opening,events:forged,sealedBlocks:[]};
 assert.throws(()=>createBB2CloudSidecar({ownerId:owner,bb2,
  previousRevision:null,requestId:'invalid-swap'}),/non-catalogue swap/);
 const valid=createBB2CloudSidecar({ownerId:owner,
  bb2:{...bb2,events:tx.events},previousRevision:null,requestId:'valid-swap'});
 assert.equal(validateBB2CloudSidecar(valid,owner).revision,1);
 assert.throws(()=>validateBB2CloudSidecar({ ...valid,
  snapshot:{...valid.snapshot,events:forged}},owner),/non-catalogue swap/);
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 h.ctx.__bb2CatalogueForTest=core;
 h.ctx.__bb2PortableCatalogueForTest={validateBB2PortableCatalogue};
 h.ev('bvomBb2PreviewModule=__bb2CatalogueForTest');
 await assert.rejects(h.ctx.bvomBb2ValidatePortableJournal(bb2,owner),
  /non-catalogue/,'BVOM restore rejects forged swaps');
});
const first=device(db,{bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
 opening:core.createBB2Opening({ownerId:owner,blockId:'portable-cloud'}),
 events:[],sealedBlocks:[],selectedProgram:true}});

await check('first owner upload durably stages intent, commits once and retains baseline',async()=>{
 const result=await first.session.upload();
 assert.equal(result.status,'committed');
 assert.equal(db.server.row.revision,1);
 assert.equal(db.server.writeCount,1);
 assert.equal(first.get().cloudSync.pending,null);
 assert.equal(first.get().cloudSync.baseline.revision,1);
 assert.equal(db.server.row.state.snapshot.selectedProgram,undefined);
 assert.equal((await first.session.upload()).status,'up_to_date');
 assert.equal(db.server.writeCount,1);
});

const second=device(db);
await check('second same-owner device downloads verified training without legacy fields',async()=>{
 assert.equal((await second.session.downloadIfEmpty()).status,'downloaded');
 assert.equal(second.get().opening.blockId,'portable-cloud');
 assert.equal(second.get().selectedProgram,false);
 assert.equal(second.get().cloudSync.baseline.revision,1);
 assert.equal((await second.session.downloadIfEmpty()).status,'local_data_present');
});

await check('divergent device history is retained locally and refused by server revision',async()=>{
 const change=first.get();change.setup.optionalUpperBCurls=true;first.set(change);
 assert.equal((await first.session.upload()).status,'committed');
 assert.equal(db.server.row.revision,2);
 const stale=second.get();stale.setup.optionalUpperBCurls=false;stale.selectedProgram=true;
 second.set(stale);
 assert.equal((await second.session.upload()).status,'conflict');
 assert.equal(second.get().cloudSync.baseline.revision,1);
 assert.equal(second.get().selectedProgram,true);
 assert.equal(db.server.row.revision,2);
});

await check('lost cloud response reconciles without duplicate upload or credit',async()=>{
 const change=first.get();change.setup.optionalUpperBCurls=false;first.set(change);
 db.server.loseReply=true;
 assert.equal((await first.session.upload()).status,'committed');
 assert.equal(db.server.row.revision,3);
 assert.equal(db.server.writeCount,3);
 assert.equal(first.get().cloudSync.pending,null);
});

await check('unchanged populated devices safely adopt newer remote revisions in both directions',async()=>{
 const shared=fakeDatabase();
 const phone=device(shared,{bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
  opening:core.createBB2Opening({ownerId:owner,blockId:'handoff'}),
  events:[],sealedBlocks:[],selectedProgram:true}});
 const tablet=device(shared);
 assert.equal((await phone.session.upload()).status,'committed');
 assert.equal((await tablet.session.downloadIfEmpty()).status,'downloaded');
 const next=phone.get();next.setup.optionalUpperBCurls=true;phone.set(next);
 assert.equal((await phone.session.upload()).status,'committed');
 assert.equal((await tablet.session.refreshIfUnchanged()).status,'downloaded');
 assert.equal(tablet.get().setup.optionalUpperBCurls,true);
 assert.equal(tablet.get().cloudSync.baseline.revision,2);
 assert.equal(tablet.get().selectedProgram,false,'device-only programme choice survives');
 const offline=tablet.get();offline.setup.optionalUpperBCurls=false;tablet.set(offline);
 assert.equal((await tablet.session.refreshIfUnchanged()).status,'local_unsynced');
 assert.equal((await tablet.session.upload()).status,'committed');
 assert.equal(shared.server.row.revision,3);
 assert.equal((await phone.session.refreshIfUnchanged()).status,'downloaded');
 assert.equal(phone.get().selectedProgram,true);
 assert.equal(phone.get().cloudSync.baseline.revision,3);
});

await check('concurrent divergent BB2 edits remain local and cannot be fast-forwarded',async()=>{
 const shared=fakeDatabase();
 const phone=device(shared,{bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
  opening:core.createBB2Opening({ownerId:owner,blockId:'diverge'}),
  events:[],sealedBlocks:[]}}),tablet=device(shared);
 assert.equal((await phone.session.upload()).status,'committed');
 assert.equal((await tablet.session.downloadIfEmpty()).status,'downloaded');
 const remote=phone.get();remote.setup.optionalUpperBCurls=true;phone.set(remote);
 assert.equal((await phone.session.upload()).status,'committed');
 const local=tablet.get();local.setup.selections['upper_a|flat_press']='dumbbell_flat_press';
 tablet.set(local);
 assert.equal((await tablet.session.refreshIfUnchanged()).status,'conflict');
 assert.equal((await tablet.session.upload()).status,'conflict');
 assert.equal(tablet.get().setup.selections['upper_a|flat_press'],'dumbbell_flat_press');
 assert.equal(tablet.get().cloudSync.baseline.revision,1);
 assert.equal(shared.server.row.revision,2);
 tablet.failBackup(true);
 assert.equal((await tablet.session.useCloudCopyConfirmed()).status,'blocked');
 assert.equal(tablet.get().cloudSync.baseline.revision,1);
 assert.equal(tablet.backups().length,0);
 tablet.failBackup(false);
 assert.equal((await tablet.session.useCloudCopyConfirmed()).status,'downloaded');
 assert.equal(tablet.backups().length,1,'full pre-replacement state was kept');
 assert.equal(tablet.backups()[0].setup.selections['upper_a|flat_press'],
  'dumbbell_flat_press');
 assert.equal(tablet.get().setup.optionalUpperBCurls,true);
 assert.equal(tablet.get().cloudSync.baseline.revision,2);
});

await check('verified owner can download first-run setup without opening the training host',async()=>{
 const shared=fakeDatabase(),source=device(shared,{bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
  opening:null,events:[],sealedBlocks:[]}});
 assert.equal((await source.session.upload()).status,'committed');
 const fresh=device(shared);fresh.setApp({...safe(),appVisible:false,setupVisible:true});
 assert.equal((await fresh.session.downloadIfEmpty()).status,'downloaded');
 assert.equal(fresh.get().cloudSync.baseline.revision,1);
 fresh.setApp({...safe(),appVisible:false,setupVisible:true,bb2EditorOpen:true});
 assert.equal((await fresh.session.refreshIfUnchanged()).status,'blocked');
 fresh.setApp({...safe(),appVisible:false,setupVisible:false});
 assert.equal((await fresh.session.refreshIfUnchanged()).status,'blocked');
});

await check('offline edits replace an uncommitted pending request after remote recheck',async()=>{
 const offlineDb=fakeDatabase(),offline=device(offlineDb,{bb2:{
  setup:core.createBB2Setup({catalogueVersion:1}),opening:core.createBB2Opening({ownerId:owner,
   blockId:'offline-retry'}),events:[],sealedBlocks:[]}});
 offlineDb.server.failBeforeWrite=true;
 assert.equal((await offline.session.upload()).status,'uncertain');
 const abandoned=offline.get().cloudSync.pending.requestId;
 assert.equal(offlineDb.server.row,null);
 const newer=offline.get();newer.setup.optionalUpperBCurls=true;
 offline.set(newer);
 assert.equal((await offline.session.upload()).status,'committed');
 assert.equal(offlineDb.server.row.revision,1);
 assert.equal(offlineDb.server.row.state.snapshot.setup.optionalUpperBCurls,true);
 assert.notEqual(offlineDb.server.row.state.requestId,abandoned);
 assert.equal(offline.get().cloudSync.pending,null);
});
await check('pending conflict allows confirmed cloud recovery only after durable local backup',async()=>{
 const shared=fakeDatabase(),phone=device(shared,{bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
  opening:core.createBB2Opening({ownerId:owner,blockId:'pending-conflict'}),
  events:[],sealedBlocks:[]}}),tablet=device(shared);
 assert.equal((await phone.session.upload()).status,'committed');
 assert.equal((await tablet.session.downloadIfEmpty()).status,'downloaded');
 const local=tablet.get();local.setup.optionalUpperBCurls=true;tablet.set(local);
 shared.server.failBeforeWrite=true;
 assert.equal((await tablet.session.upload()).status,'conflict',
  'the uncommitted request stays pending when reconciliation sees the old baseline');
 const pending=tablet.get().cloudSync.pending;
 assert.ok(pending,'uncertain upload has a durable intent');
 const remote=phone.get();remote.setup.selections['upper_a|flat_press']='dumbbell_flat_press';
 phone.set(remote);
 assert.equal((await phone.session.upload()).status,'committed');
 assert.equal((await tablet.session.upload()).status,'conflict');
 tablet.failBackup(true);
 assert.equal((await tablet.session.useCloudCopyConfirmed()).status,'blocked');
 assert.deepEqual(tablet.get().cloudSync.pending,pending,
  'failed recovery backup retains pending local intent');
 tablet.failBackup(false);
 assert.equal((await tablet.session.useCloudCopyConfirmed()).status,'downloaded');
 assert.equal(tablet.backups().length,1);
 assert.deepEqual(tablet.backups()[0].cloudSync.pending,pending,
  'one-step backup contains the complete uncertain local request');
 assert.equal(tablet.backups()[0].setup.optionalUpperBCurls,true);
 assert.equal(tablet.get().setup.selections['upper_a|flat_press'],'dumbbell_flat_press');
 assert.equal(tablet.get().cloudSync.pending,null);
 assert.equal(tablet.get().cloudSync.baseline.revision,2);
});

await check('failed local intent write prevents every cloud mutation',async()=>{
 const change=first.get();change.setup.optionalUpperBCurls=true;first.set(change);
 first.failSave(true);
 const count=db.server.writeCount;
 assert.equal((await first.session.upload()).status,'blocked');
 assert.equal(db.server.writeCount,count);
 assert.equal(first.get().cloudSync.pending,null);
 first.failSave(false);
});

await check('disabled real-account rollout fence stops read and write before I/O',async()=>{
 const blocked=device(db,{bb2:first.get(),enabled:false}),count=db.server.readCount;
 assert.equal((await blocked.session.upload()).status,'blocked');
 assert.equal((await blocked.session.downloadIfEmpty()).status,'blocked');
 assert.equal(db.server.readCount,count);
});

await check('real BVOM document adapter preserves legacy isolation and enables revisioned sync',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 const initial=JSON.stringify(h.ctx.bvomCloudPayload());
 let bridge;
 h.ctx.__bb2CloudCoordinatorForTest={createBB2CloudCoordinator:opts=>{bridge=opts;return {upload(){},downloadIfEmpty(){}}}};
 h.ev('bvomBb2CloudCoordinatorModule=__bb2CloudCoordinatorForTest;'+
  'bvomCloud.user={id:"'+owner+'"};window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");bvomEntitlementAccessDecision=()=>({allowed:true})');
 await h.ctx.bvomBb2CreateDormantCloudCoordinator();
 assert.equal(bridge.readAppSnapshot().bb2WriterEnabled,true);
 assert.equal(bridge.readAppSnapshot().multiDeviceFenceVerified,true);
 const before=bridge.readLocal();
 assert.equal(before.bb2,null);
 const bb2={setup:core.createBB2Setup({catalogueVersion:1}),opening:core.createBB2Opening({
  ownerId:owner,blockId:'bridge-local'}),events:[],sealedBlocks:[]};
 assert.equal(bridge.commitLocal(before.token,bb2),true);
 assert.equal(bridge.readLocal().bb2.opening.blockId,'bridge-local');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),initial);
 assert.equal(bridge.commitLocal(before.token,bb2),false,
  'a stale BVOM document token cannot commit another copy');
 const replaceFrom=bridge.readLocal();
 const originalSetItem=h.ls.setItem;
 h.ls.setItem=(key,value)=>{
  if(key==='bvom_pre_cloud_restore')throw Error('quota exhausted');
  return originalSetItem(key,value);
 };
 assert.equal(bridge.commitLocal(replaceFrom.token,{...bb2,selectedProgram:true},
  {backupBeforeReplace:true}),false,'missing recovery backup blocks replacement');
 assert.equal(bridge.readLocal().bb2.selectedProgram,undefined);
 h.ls.setItem=originalSetItem;
 assert.equal(bridge.commitLocal(replaceFrom.token,{...bb2,selectedProgram:true},
  {backupBeforeReplace:true}),true);
 assert.equal(JSON.parse(h.ls.getItem('bvom_pre_cloud_restore')).bb2.opening.blockId,
  'bridge-local','the existing complete BVOM recovery document is retained');
});
await check('A to B to A preserves owner-scoped BB2 across ordinary account cloud loads',async()=>{
 const seeded=H.boot(H.loadBuild(root));H.configureLP(seeded);
 const base=JSON.parse(seeded.ls.getItem('bvom_data'));
 const a={...base,history:[{id:'a'}],
  bb2:{setup:core.createBB2Setup({catalogueVersion:1}),opening:core.createBB2Opening({ownerId:owner,
   blockId:'owner-a-history'}),events:[],sealedBlocks:[]}};
 const b={...base,history:[{id:'b'}]};
 const storage=H.memStore({bvom_data:JSON.stringify(a),bvom_data_owner:owner});
 const h=H.boot(H.loadBuild(root),{ls:storage});
 h.ev('bvomWindowLockOwned=true');
 assert.equal(h.ctx.bvomReplaceLocalForAccount(other,b),true);
 assert.equal(JSON.parse(storage.getItem('bvom_data')).bb2,undefined);
 assert.equal(JSON.parse(storage.getItem('bvom_account_switch_backup_owner_'+owner))
  .data.bb2.opening.blockId,'owner-a-history');
 const aCloud={...base,history:[{id:'a-cloud'}]};
 assert.equal(h.ctx.bvomReplaceLocalForAccount(owner,aCloud),true);
 const returned=JSON.parse(storage.getItem('bvom_data'));
 assert.equal(storage.getItem('bvom_data_owner'),owner);
 assert.equal(returned.bb2.opening.blockId,'owner-a-history');
 assert.equal(returned.history[0].id,'a-cloud',
  'legacy fields still use latest account cloud document');
 assert.equal(JSON.parse(storage.getItem('bvom_account_switch_backup_owner_'+other))
  .data.history[0].id,'b','B retains its own separate archive');
 assert.equal(h.ctx.bvomReplaceLocalForAccount(other,null),true);
 assert.equal(JSON.parse(storage.getItem('bvom_data')).history[0].id,'b');
 assert.equal(h.ctx.bvomReplaceLocalForAccount(owner,null),true);
 assert.equal(JSON.parse(storage.getItem('bvom_data')).bb2.opening.blockId,
  'owner-a-history','repeat switches never erase A training');
});
await check('Erase Everything removes every account archive and cannot resurrect erased BB2',async()=>{
 const seed=H.boot(H.loadBuild(root));H.configureLP(seed);
 const base=JSON.parse(seed.ls.getItem('bvom_data'));
 const journal={setup:core.createBB2Setup({catalogueVersion:1}),opening:core.createBB2Opening({
  ownerId:owner,blockId:'erased-private-bb2'}),events:[],sealedBlocks:[]};
 const storage=H.memStore({
  bvom_data:JSON.stringify({...base,bb2:journal}),bvom_data_owner:owner,
  ['bvom_account_switch_backup_owner_'+owner]:JSON.stringify({owner_id:owner,
   data:{...base,bb2:journal}}),
  ['bvom_account_switch_backup_owner_'+other]:JSON.stringify({owner_id:other,
   data:base})});
 const h=H.boot(H.loadBuild(root),{ls:storage});H.configureLP(h);
 await h.ctx.eraseAll();
 const overlay=h.lastOverlay(),input=overlay.querySelector('[data-i]');
 input.value='RESET';input.oninput();
 await overlay.querySelector('[data-e]').onclick();
 for(const key of ['bvom_data','bvom_data_owner',
  'bvom_account_switch_backup_owner_'+owner,
  'bvom_account_switch_backup_owner_'+other])
  assert.equal(storage.getItem(key),null,`Erase Everything must remove ${key}`);
 const reopened=H.boot(H.loadBuild(root),{ls:storage});
 reopened.ev('bvomWindowLockOwned=true');
 assert.equal(reopened.ctx.bvomReplaceLocalForAccount(owner,null),true);
 assert.equal(JSON.parse(storage.getItem('bvom_data'))?.bb2,undefined,
  'reopening the erased account cannot resurrect removed BB2');
});
await check('failed owner-archive deletion cannot report a successful Erase Everything',async()=>{
 const seed=H.boot(H.loadBuild(root));H.configureLP(seed);
 const base=JSON.parse(seed.ls.getItem('bvom_data'));
 const archiveKey='bvom_account_switch_backup_owner_'+owner;
 const original={...base,bb2:{setup:core.createBB2Setup({catalogueVersion:1}),
  opening:core.createBB2Opening({ownerId:owner,blockId:'private-unremoved'}),
  events:[],sealedBlocks:[]}};
 const storage=H.memStore({bvom_data:JSON.stringify(original),bvom_data_owner:owner,
  [archiveKey]:JSON.stringify({owner_id:owner,data:original})});
 const h=H.boot(H.loadBuild(root),{ls:storage});H.configureLP(h);
 const remove=storage.removeItem;
 storage.removeItem=key=>{if(key===archiveKey)throw Error('browser denied archive deletion');return remove(key)};
 await h.ctx.eraseAll();
 const overlay=h.lastOverlay(),input=overlay.querySelector('[data-i]');
 input.value='RESET';input.oninput();await overlay.querySelector('[data-e]').onclick();
 assert.equal(storage.getItem('bvom_data'),JSON.stringify(original),
  'failed archive removal leaves the original training document intact');
 assert.notEqual(storage.getItem(archiveKey),null,'undeleted archive is acknowledged');
 assert.equal(h.log.some(entry=>entry[0]==='reload'),false,
  'failed erasure does not claim success by reloading');
 assert.match(h.lastOverlay().innerHTML,/ERASE INCOMPLETE/,
  'user sees an honest incomplete-erasure warning');
});
await check('account archive quota failure stops replacement and keeps sole BB2 document',async()=>{
 const seeded=H.boot(H.loadBuild(root));H.configureLP(seeded);
 const original={...JSON.parse(seeded.ls.getItem('bvom_data')),
  bb2:{marker:'unuploaded-local-training'}};
 const storage=H.memStore({bvom_data:JSON.stringify(original),bvom_data_owner:owner});
 const h=H.boot(H.loadBuild(root),{ls:storage});
 h.ev('bvomWindowLockOwned=true');
 const setItem=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key==='bvom_account_switch_backup_owner_'+owner)
   throw Error('quota exhausted');
  return setItem(key,value);
 };
 assert.equal(h.ctx.bvomReplaceLocalForAccount(other,{configured:true}),false);
 assert.equal(storage.getItem('bvom_data'),JSON.stringify(original));
 assert.equal(storage.getItem('bvom_data_owner'),owner);
 assert.equal(storage.getItem('bvom_account_switch_backup_owner_'+owner),null);
});
await check('account owner-marker failure rolls back the original document',async()=>{
 const seeded=H.boot(H.loadBuild(root));H.configureLP(seeded);
 const original={...JSON.parse(seeded.ls.getItem('bvom_data')),
  bb2:{marker:'never-lose-unsynced-data'}};
 const storage=H.memStore({bvom_data:JSON.stringify(original),bvom_data_owner:owner});
 const h=H.boot(H.loadBuild(root),{ls:storage});h.ev('bvomWindowLockOwned=true');
 const setItem=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key==='bvom_data_owner'&&value===other)throw Error('owner tag unavailable');
  return setItem(key,value);
 };
 assert.equal(h.ctx.bvomReplaceLocalForAccount(other,{...original,bb2:undefined}),false);
 assert.equal(storage.getItem('bvom_data'),JSON.stringify(original));
 assert.equal(storage.getItem('bvom_data_owner'),owner);
 assert.equal(JSON.parse(storage.getItem('bvom_account_switch_backup_owner_'+owner))
  .data.bb2.marker,'never-lose-unsynced-data');
});

await check('real BVOM adapter enables isolated local Auth only behind localhost preview',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 let adapter;
 h.ctx.__bb2CloudCoordinatorForTest={createBB2CloudCoordinator:opts=>{
  adapter=opts;return {upload(){},downloadIfEmpty(){}}}};
 h.ev('bvomBb2CloudCoordinatorModule=__bb2CloudCoordinatorForTest;'+
  'bvomCloud.user={id:"'+owner+'"};window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");bvomEntitlementAccessDecision=()=>({allowed:true})');
 const authClient={supabaseUrl:'http://127.0.0.1:54321',
  auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}};
 h.ctx.location.origin='https://app.bvomstrength.com';
 h.ctx.location.search='?bb2Preview=1';
 await assert.rejects(h.ctx.bvomBb2CreateDormantCloudCoordinator({
  isolatedClient:authClient}),/non-local client or preview/);
 h.ctx.location.origin='http://127.0.0.1:8000';
 await assert.rejects(h.ctx.bvomBb2CreateDormantCloudCoordinator({
  isolatedClient:{...authClient,supabaseUrl:'https://hkteienxwdsjncchuvnz.supabase.co'}}),
  /non-local client or preview/,'a real production Supabase client is refused');
 await assert.rejects(h.ctx.bvomBb2CreateDormantCloudCoordinator({
  isolatedClient:{...authClient,auth:{getUser:async()=>({
   data:{user:{id:other}},error:null})}}}),/authenticated owner differs/);
 await h.ctx.bvomBb2CreateDormantCloudCoordinator({isolatedClient:authClient});
 assert.equal(adapter.client,authClient,'the test receives only the isolated client');
 assert.equal(adapter.readAppSnapshot().bb2WriterEnabled,true);
 assert.equal(adapter.readAppSnapshot().multiDeviceFenceVerified,true);
 assert.equal(adapter.readAppSnapshot().authUserId,owner);
 assert.equal(adapter.readAppSnapshot().cloudUserId,owner);
});

await check('normal signed-in BVOM registers its revisioned coordinator and revokes it',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 let options,networkCalls=0;
 h.ctx.__bb2CloudCoordinatorForTest={createBB2CloudCoordinator:opts=>{
  options=opts;return {upload(){networkCalls++},downloadIfEmpty(){networkCalls++;return {status:'empty'}}};
 }};
 h.ev('bvomBb2CloudCoordinatorModule=__bb2CloudCoordinatorForTest;'+
  'bvomCloud.client={supabaseUrl:"https://production.example.invalid"};'+
  'bvomCloud.user={id:"'+owner+'"};window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");bvomCloud.offlineLocalAccess=false');
 assert.equal(await h.ctx.bvomBb2ConnectSignedInAccount(),true);
 assert.equal(options.readAppSnapshot().bb2WriterEnabled,true);
 assert.equal(options.readAppSnapshot().multiDeviceFenceVerified,true);
 assert.equal(networkCalls,1,'signed-in account checks its BB2 cloud record');
 assert.equal(h.ev('bvomBb2AccountBinding?.ownerId'),owner);
 h.ctx.bvomBb2AccountDisconnect();
 assert.equal(h.ev('bvomBb2AccountBinding'),null);
});

await check('BVOM account lifecycle catches offline changes and reports conflicts without upload',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 h.ctx.location.origin='http://127.0.0.1:8000';
 h.ctx.location.search='?bb2Preview=1';
 const calls=[];
 h.ctx.__bb2AccountTest={
  downloadIfEmpty:async()=>{calls.push('check');return {status:'local_data_present'}},
  refreshIfUnchanged:async()=>{calls.push('refresh');return {status:'local_unsynced'}},
  upload:async()=>{calls.push('upload');return {status:'committed'}}
 };
 h.ev('bvomBb2AccountBinding={isolated:true,ownerId:"'+owner+'",'+
  'coordinator:__bb2AccountTest,lastUpload:null,lastDownload:null,syncing:false,resync:false}');
 await h.ctx.bvomBb2AccountSyncNow();
 assert.deepEqual(calls,['check','refresh','upload']);
 assert.equal(h.ev('bvomBb2AccountBinding.lastUpload.status'),'committed');
 h.ctx.__bb2AccountTest.refreshIfUnchanged=async()=>{
  calls.push('conflict');return {status:'conflict'};
 };
 calls.length=0;
 await h.ctx.bvomBb2AccountSyncNow();
 assert.deepEqual(calls,['check','conflict']);
 assert.equal(h.ev('bvomBb2AccountStatus()'),'conflict');
 assert.equal(h.ev('bvomBb2DormantAccountSnapshot().bb2WriterEnabled'),true);
});

console.log(`BB2 cloud coordinator: ${passed}/${passed} PASS (mock transport; authenticated proof runs separately)`);

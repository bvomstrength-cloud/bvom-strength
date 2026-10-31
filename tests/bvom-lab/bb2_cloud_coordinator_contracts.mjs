// Dormant BB2 sync coordinator: real sidecar protocol, in-memory authenticated
// database and exact BVOM local save adapters. No real cloud account is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createBB2CloudCoordinator,
  validateBB2PortableCatalogue } from '../../bb2/cloud-coordinator.mjs';
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
 let state={token:1,bb2:copy(bb2)},failed=false,app=safe(),request=0;
 const session=createBB2CloudCoordinator({client:db.client(owner),ownerId:owner,
  readAppSnapshot:()=>enabled?app:{...app,bb2WriterEnabled:false},
  readLocal:()=>({ownerId:owner,token:String(state.token),bb2:copy(state.bb2)}),
  commitLocal:(expected,next)=>{
   if(failed||expected!==String(state.token))return false;
   state={token:state.token+1,bb2:copy(next)};return true;
  },makeRequestId:()=>`req-${++request}`});
 return {session,get:()=>copy(state.bb2),set(next){state={token:state.token+1,bb2:copy(next)}},
  failSave(value){failed=value},setApp(next){app=next}};
}

const db=fakeDatabase();
await check('portable Start replays entered-weight provenance, refusing forged DERIVED sources',async()=>{
 const setup=core.createBB2Setup(),opening=core.createBB2Opening({
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
const first=device(db,{bb2:{setup:core.createBB2Setup(),
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

await check('offline edits replace an uncommitted pending request after remote recheck',async()=>{
 const offlineDb=fakeDatabase(),offline=device(offlineDb,{bb2:{
  setup:core.createBB2Setup(),opening:core.createBB2Opening({ownerId:owner,
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

await check('real BVOM local document adapter preserves cloud exclusion and flags OFF',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 const initial=JSON.stringify(h.ctx.bvomCloudPayload());
 let bridge;
 h.ctx.__bb2CloudCoordinatorForTest={createBB2CloudCoordinator:opts=>{bridge=opts;return {upload(){},downloadIfEmpty(){}}}};
 h.ev('bvomBb2CloudCoordinatorModule=__bb2CloudCoordinatorForTest;'+
  'bvomCloud.user={id:"'+owner+'"};window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");bvomEntitlementAccessDecision=()=>({allowed:true})');
 await h.ctx.bvomBb2CreateDormantCloudCoordinator();
 assert.equal(bridge.readAppSnapshot().bb2WriterEnabled,false);
 assert.equal(bridge.readAppSnapshot().multiDeviceFenceVerified,false);
 const before=bridge.readLocal();
 assert.equal(before.bb2,null);
 const bb2={setup:core.createBB2Setup(),opening:core.createBB2Opening({
  ownerId:owner,blockId:'bridge-local'}),events:[],sealedBlocks:[]};
 assert.equal(bridge.commitLocal(before.token,bb2),true);
 assert.equal(bridge.readLocal().bb2.opening.blockId,'bridge-local');
 assert.equal(h.ctx.bvomCloudPayload().bb2,undefined);
 assert.equal(JSON.stringify(h.ctx.bvomCloudPayload()),initial);
 assert.equal(bridge.commitLocal(before.token,bb2),false,
  'a stale BVOM document token cannot commit another copy');
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

await check('normal signed-in BVOM registers an inert production coordinator and revokes it',async()=>{
 const h=H.boot(H.loadBuild(root));H.configureLP(h);
 let options,networkCalls=0;
 h.ctx.__bb2CloudCoordinatorForTest={createBB2CloudCoordinator:opts=>{
  options=opts;return {upload(){networkCalls++},downloadIfEmpty(){networkCalls++}};
 }};
 h.ev('bvomBb2CloudCoordinatorModule=__bb2CloudCoordinatorForTest;'+
  'bvomCloud.client={supabaseUrl:"https://production.example.invalid"};'+
  'bvomCloud.user={id:"'+owner+'"};window.__bvomAuthUserId="'+owner+'";'+
  'bvomSetLocalOwnerId("'+owner+'");bvomCloud.offlineLocalAccess=false');
 assert.equal(await h.ctx.bvomBb2ConnectSignedInAccount(),true);
 assert.equal(options.readAppSnapshot().bb2WriterEnabled,false);
 assert.equal(options.readAppSnapshot().multiDeviceFenceVerified,false);
 assert.equal(networkCalls,0,'production account registration has no BB2 cloud I/O');
 assert.equal(h.ev('bvomBb2AccountBinding?.ownerId'),owner);
 h.ctx.bvomBb2AccountDisconnect();
 assert.equal(h.ev('bvomBb2AccountBinding'),null);
});

console.log(`BB2 cloud coordinator: ${passed}/${passed} PASS (mock only, rollout OFF)`);

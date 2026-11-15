'use strict';
const crypto=require('node:crypto');
// Real GoTrue authentication + PostgREST + PostgreSQL, loopback ONLY. Routes
// hold outgoing RPCs before the server; responses and app logic are untouched.
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js'),P=require('./platform.cjs'),{profiles}=require('./monkeys.cjs');
const config=JSON.parse(fs.readFileSync('/tmp/bvom-audit-local-status.json'));
if(config.API_URL!=='http://127.0.0.1:54321')throw Error('Disposable loopback backend required');
const output=path.join(P.out,'cloud-race.json'),checks=[],network=[],owners=[],contexts=[];let platform;
function eq(label,actual,expected){a.deepEqual(actual,expected,label);checks.push({label,pass:true,actual,expected})}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function bounded(p){let id;try{return await Promise.race([p,new Promise((_,reject)=>{id=setTimeout(()=>reject(Error('Cloud race barrier timed out')),20000)})])}finally{clearTimeout(id)}}
const click=(p,fn)=>p.locator('[onclick='+JSON.stringify(fn)+']').first().evaluate(e=>e.click());
async function complete(p,mode,note,variant){
 await P.settle(p);await P.tab(p,'workout');
 if(['lprpt','hlm','fourday'].includes(mode)){
  const names=await p.evaluate(()=>program().map(x=>x[0]));
  for(const name of names)for(let i=0;i<await p.evaluate(n=>getSetPlan(n).length,name);i++){
   const q=await p.evaluate(({name,i})=>getSetPlan(name)[i],{name,i});await click(p,"tapSet('"+name+"',"+i+")");await P.rep(p,q.target);await P.settle(p);
  }
 }else if(mode==='bodybuilding'){
  const ids=await p.evaluate(()=>bvomBbSlotsForDay(bvomBbDay()).map(s=>state.bodybuilding.selections[s]));
  for(const id of ids){const rx=await p.evaluate(id=>bvomBbPrescription(id),id);for(let i=0;i<rx.sets.length;i++){
   await click(p,"bvomBbSetModal('"+id+"',"+i+")");await p.locator('.bvomModalOverlay [data-reps]').fill(String(rx.sets[i].type==='top'?(variant?7:8):rx.sets[i].maxReps));await p.locator('.bvomModalOverlay [data-save]').click();await P.settle(p);
  }}
 }else{
  for(let i=0;i<3;i++){await click(p,"bvomFtSetModal('Squat',"+i+",false)");await p.locator('.bvomModalOverlay [data-load]').fill(variant?'63.75':'61.25');await P.rep(p,5)}
 }
 await P.finish(p,note);const h=(await P.stored(p)).history.at(-1);eq('Actual Finish completed '+mode+'/'+variant,!!h.incomplete,false);eq('History saved note '+mode,h.note,note);return h;
}
async function status(p){return p.evaluate(()=>({owner:bvomCloud.user?.id,syncReady:bvomCloud.syncReady,conflict:bvomCloud.conflict,error:bvomCloud.error,message:bvomCloud.message}))}
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function main(){platform=await P.start();try{
 for(const profile of profiles.filter(x=>x.mode!=='bb2')){
  const email='repair-'+profile.mode+'-'+Date.now()+'@example.invalid',password='Disposable-Monkey-304!';
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw made.error;const owner=made.data.user.id;owners.push(owner);const seed=P.fixture({...profile,lang:'en'});
  const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  const remote=async()=>{const r=await client.from('bvom_data').select('id,data,legacy_revision').eq('user_id',owner).order('created_at',{ascending:false}).order('id',{ascending:false});if(r.error)throw r.error;return r.data};
  async function device(name){const d=await platform.device({...profile,name,lang:'en'},{owner,data:seed,localCloud:{url:config.API_URL,key:config.ANON_KEY}});contexts.push(d.context);await d.page.evaluate(async({email,password})=>{const r=await bvomCloudClient().auth.signInWithPassword({email,password});if(r.error)throw r.error},{email,password});await d.page.waitForFunction(id=>window.__bvomAuthUserId===id&&bvomCloud.user?.id===id&&!bvomCloud.offlineLocalAccess&&!bvomCloud.assessing,owner);return d}
  const A=await device('Race-A-'+profile.mode);await A.page.waitForFunction(()=>bvomCloud.cloudExists&&bvomCloud.syncReady&&!bvomCloud.busy);
  const B=await device('Race-B-'+profile.mode);await B.page.waitForFunction(()=>bvomCloud.cloudExists&&bvomCloud.syncReady&&!bvomCloud.conflict&&!bvomCloud.busy);
  const baseline=(await remote())[0],held=[];eq('One remote row '+profile.mode,(await remote()).length,1);
  for(const [device,d]of [['A',A],['B',B]]){
   const hold={arrived:deferred(),release:deferred(),done:deferred(),device};held.push(hold);
   await d.context.route('**/rest/v1/rpc/bvom_legacy_cloud_commit_v1',async route=>{
    const body=route.request().postDataJSON(),entry={programme:profile.mode,device,expectedRevision:body.p_expected_revision,notes:body.p_data.history.map(x=>x.note)};
    hold.body=body;network.push(entry);hold.arrived.resolve();await hold.release.promise;
    const response=await route.fetch();entry.http=response.status();entry.response=await response.json();await route.fulfill({response});hold.done.resolve();
   });
  }
  const noteA='Completed '+profile.mode+' device A',noteB='Completed '+profile.mode+' device B';
  const ha=await complete(A.page,profile.mode,noteA,0);await bounded(held[0].arrived.promise);
  const hb=await complete(B.page,profile.mode,noteB,1);await bounded(held[1].arrived.promise);
  eq('Both uploads used same revision '+profile.mode,held.map(x=>x.body.p_expected_revision),[baseline.legacy_revision,baseline.legacy_revision]);
  eq('Remote unchanged while both uploads pending '+profile.mode,(await remote())[0].data.history,[]);
  held[0].release.resolve();await bounded(held[0].done.promise);await A.page.waitForFunction(()=>!bvomCloud.busy);
  held[1].release.resolve();await bounded(held[1].done.promise);await B.page.waitForFunction(()=>bvomCloud.conflict&&!bvomCloud.syncReady&&!bvomCloud.busy);
  const row=(await remote())[0];eq('Server preserves winner '+profile.mode,row.data.history,[ha]);eq('Revision advances once '+profile.mode,row.legacy_revision,baseline.legacy_revision+1);
  const loser=await status(B.page);eq('Loser explicitly conflicted '+profile.mode,[loser.syncReady,loser.conflict,loser.error],[false,true,false]);eq('Loser recovery guidance '+profile.mode,/export|backup/i.test(loser.message),true);
  eq('Loser local History intact '+profile.mode,(await P.stored(B.page)).history,[hb]);
  const stale=await client.rpc('bvom_legacy_cloud_commit_v1',held[1].body);eq('Server rejects stale retry '+profile.mode,stale.data,{status:'conflict'});
  const repeat=await client.rpc('bvom_legacy_cloud_commit_v1',held[0].body);eq('Lost acknowledgement idempotency '+profile.mode,[repeat.data.status,repeat.data.replayed],['committed',true]);
  const changed=await client.rpc('bvom_legacy_cloud_commit_v1',{...held[0].body,p_data:held[1].body.p_data});eq('Request id cannot authorize different payload '+profile.mode,changed.data,{status:'conflict'});
  await B.context.setOffline(true);await B.page.evaluate(()=>bvomCloudAutoSave());await B.context.setOffline(false);await B.page.evaluate(()=>bvomCloudAutoSave());eq('Offline reconnect cannot overwrite winner '+profile.mode,(await remote())[0].data.history,[ha]);
  await P.tab(B.page,'settings');const dl=B.page.waitForEvent('download');await click(B.page,'exportBackup()');await (await dl).saveAs(path.join(P.out,'loser-'+profile.mode+'.json'));
  const backup=JSON.parse(fs.readFileSync(path.join(P.out,'loser-'+profile.mode+'.json')));eq('Losing device export retains History '+profile.mode,(backup.data||backup).history,[hb]);
  await B.page.screenshot({path:path.join(P.out,'screenshots','cloud-conflict-'+profile.mode+'.png'),fullPage:true});
  // Actual legacy v3.0.3's unconditional endpoints must now fail closed too.
  const oldPatch=await client.from('bvom_data').update({data:held[1].body.p_data}).eq('id',row.id).select('id');eq('Old client PATCH forbidden '+profile.mode,oldPatch.error?.code,'42501');
  const oldInsert=await client.from('bvom_data').insert({user_id:owner,data:held[1].body.p_data});eq('Old client INSERT forbidden '+profile.mode,oldInsert.error?.code,'42501');
  eq('Legacy attempts preserve remote '+profile.mode,(await remote())[0].data.history,[ha]);
  const C=await device('Race-C-'+profile.mode);await C.page.waitForFunction(()=>bvomCloud.conflict&&!bvomCloud.assessing);
  const notice=C.page.locator('#bvomCloudConflictOverlay [data-settings]');if(await notice.count())await notice.click();
  await P.tab(C.page,'settings');await click(C.page,'bvomCloudRestore()');await C.page.locator('.bvomModalOverlay [data-r]').waitFor();
  await Promise.all([C.page.waitForEvent('load'),C.page.locator('.bvomModalOverlay [data-r]').click()]);await P.ready(C.page);
  eq('Receiving authenticated device restores winner History '+profile.mode,(await P.stored(C.page)).history,[ha]);
  eq('Restore creates no remote duplicate '+profile.mode,(await remote())[0].data.history,[ha]);await C.context.close();
  await A.context.close();await B.context.close();console.log('PASS real authenticated race',profile.mode);
 }
 // Another real authenticated account cannot read or write the victims.
 const stranger=await admin.auth.admin.createUser({email:'stranger-'+Date.now()+'@example.invalid',password:'Disposable-Stranger-304!',email_confirm:true});if(stranger.error)throw stranger.error;owners.push(stranger.data.user.id);
 const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await c.auth.signInWithPassword({email:stranger.data.user.email,password:'Disposable-Stranger-304!'});
 const foreign=await c.from('bvom_data').select('id,data').eq('user_id',owners[0]);eq('RLS account isolation',foreign.data,[]);
 const forged=await c.rpc('bvom_legacy_cloud_commit_v1',{p_owner_id:owners[0],p_expected_id:null,p_expected_revision:0,p_data:{history:[]},p_request_id:crypto.randomUUID()});eq('RPC owner cannot be forged',forged.error?.code,'42501');
 console.log('PASS',checks.length,'real authenticated cloud assertions');
}finally{fs.writeFileSync(output,JSON.stringify({backend:'Disposable loopback PostgreSQL 17 / real GoTrue / real PostgREST',checks,total:checks.length,network,owners},null,2));for(const c of contexts)await c.close().catch(()=>{});await platform.close()}}
main().catch(error=>{console.error(error);process.exitCode=1});

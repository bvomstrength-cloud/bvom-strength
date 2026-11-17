'use strict';
const fs=require('node:fs'),path=require('node:path'),{createClient}=require('@supabase/supabase-js'),P=require('./platform.cjs');const{profiles}=require('./monkeys.cjs');
async function main(){
 const status=JSON.parse(fs.readFileSync('/tmp/bvom-audit-local-status.json'));if(status.API_URL!=='http://127.0.0.1:54321')throw Error('Only isolated loopback allowed');
 const platform=await P.start(),e=new P.Evidence('CloudLegacy',{endpoint:'loopback only',services:'real GoTrue v2.197.0 / PostgREST v16.5 / Postgres17'}),contexts=[];
 const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const email='fresh-legacy-'+Date.now()+'@example.invalid',password='Disposable-Audit-303!';const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;const id=u.data.user.id;
 const reader=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await reader.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 const baseline=P.fixture(profiles[0]);
 async function device(name){const d=await platform.device({...profiles[0],name,width:360},{owner:id,data:baseline,localCloud:{url:status.API_URL,key:status.ANON_KEY}});contexts.push(d.context);await d.page.evaluate(async({email,password})=>{const r=await bvomCloudClient().auth.signInWithPassword({email,password});if(r.error)throw r.error;},{email,password});await d.page.waitForFunction(id=>window.__bvomAuthUserId===id&&bvomCloud.user?.id===id&&!bvomCloud.offlineLocalAccess,id);e.check(name+' identity derived from real Auth',await d.page.evaluate(()=>bvomCloud.user.id),id);return d;}
 const remote=async()=>{const r=await reader.from('bvom_data').select('id,data').eq('user_id',id).order('created_at',{ascending:false});if(r.error)throw r.error;return r.data;};
 const click=async(p,fn)=>{await P.tab(p,'settings');await p.locator('[onclick='+JSON.stringify(fn)+']').first().click();};
 try{
  const a=await device('DeviceA'),A=a.page;await click(A,'bvomCloudSaveNow()');await A.waitForFunction(()=>!bvomCloud.busy&&bvomCloud.cloudExists);e.check('initial one remote document',(await remote()).length,1);
  const b=await device('DeviceB'),B=b.page;await P.settle(B);await B.waitForFunction(()=>bvomCloud.syncReady&&!bvomCloud.conflict);
  // Both actual app instances legitimately start from the same verified cloud baseline.
  for(const [p,reps]of [[A,5],[B,4]]){await P.tab(p,'workout');await p.locator('button[onclick="tapSet(\'Squat\',0)"]').click();await P.rep(p,reps);e.stats.setSaves++;e.action('record-set',{device:p===A?'A':'B',lift:'Squat',index:0,reps,load:60});}
  const before=await remote();await click(A,'bvomCloudSaveNow()');await A.waitForFunction(()=>!bvomCloud.busy);e.check('active-workout sync excludes live work',(await remote()),before);await click(A,'bvomCloudRestore()');await A.waitForFunction(()=>!bvomCloud.busy);e.check('active restore cannot erase live actuals',(await P.stored(A)).session.Squat[0].reps,5);
  // Delay delivery of two REAL completed read responses. This simulates an
  // ordinary network race; no response body or database value is manufactured.
  let enabled=true,waiting=[],reads=0,readDevices=new Set(),writes=[];let release;const released=new Promise(r=>release=r);
  const capture=device=>async route=>{
   const method=route.request().method();
   if(method==='POST'&&route.request().url().includes('/rpc/bvom_legacy_cloud_commit_v1')){
    const body=route.request().postDataJSON(),response=await route.fetch();writes.push({device,status:response.status(),outcome:(await response.json()).status,url:route.request().url(),notes:body.p_data?.history?.map(h=>h.note),reps:body.p_data?.history?.map(h=>h.session.Squat[0].reps)});e.action('real-cloud-write',writes.at(-1));return route.fulfill({response});
   }
   if(!enabled||method!=='GET'||readDevices.has(device))return route.continue();
   const response=await route.fetch(),body=await response.json();reads++;readDevices.add(device);waiting.push({device,status:response.status(),notes:body[0]?.data?.history?.map(h=>h.note)});e.action('real-cloud-baseline-read',waiting.at(-1));
   if(readDevices.size===2){enabled=false;release();}await released;await route.fulfill({response});
  };
  const previousA=await A.evaluate(()=>bvomCloud.lastAutoSaved?.getTime()||0),previousB=await B.evaluate(()=>bvomCloud.lastAutoSaved?.getTime()||0);
  await a.context.route('**/rest/v1/bvom_data*',capture('A'));await b.context.route('**/rest/v1/bvom_data*',capture('B'));await a.context.route('**/rest/v1/rpc/bvom_legacy_cloud_commit_v1',capture('A'));await b.context.route('**/rest/v1/rpc/bvom_legacy_cloud_commit_v1',capture('B'));
  await Promise.all([P.finish(A,'Actual competing device A',{incomplete:true}),P.finish(B,'Actual competing device B',{incomplete:true})]);
  await Promise.all([A.waitForFunction(prev=>bvomCloud.conflict||(bvomCloud.lastAutoSaved?.getTime()||0)>prev,previousA),B.waitForFunction(prev=>bvomCloud.conflict||(bvomCloud.lastAutoSaved?.getTime()||0)>prev,previousB)]);
  const r=await remote(),localA=await P.stored(A),localB=await P.stored(B),cloudA=await A.evaluate(()=>({syncReady:bvomCloud.syncReady,conflict:bvomCloud.conflict,message:bvomCloud.message})),cloudB=await B.evaluate(()=>({syncReady:bvomCloud.syncReady,conflict:bvomCloud.conflict,message:bvomCloud.message}));
  e.check('one remote document remains',r.length,1);e.check('A local workout survives',localA.history.length,1);e.check('B local workout survives',localB.history.length,1);
  const remoteNotes=r[0].data.history.map(h=>h.note),bothPreserved=remoteNotes.includes('Actual competing device A')&&remoteNotes.includes('Actual competing device B'),conflictVisible=cloudA.conflict||cloudB.conflict;
  e.check('competing writes retain both remotely or surface a losing conflict',bothPreserved||conflictVisible,true,{remoteNotes,cloudA,cloudB,reads});
  const evidence={networkBarrier:{reads,waiting:JSON.parse(JSON.stringify(waiting)),writes:JSON.parse(JSON.stringify(writes))},localA,localB,remote:r,cloudA,cloudB};
  fs.writeFileSync(path.join(e.path,'competing-documents.json'),JSON.stringify(evidence,null,2));
  e.check('both real baseline reads were empty',waiting.map(x=>x.notes),[[],[]]);e.check('two real conditional requests executed',writes.map(x=>x.status),[200,200]);e.check('server permits exactly one conditional winner',writes.map(x=>x.outcome).sort(),['committed','conflict']);e.stats.sessions=2;e.stats.incomplete=2;e.stats.retainedSets=2;
  for(const[p,name]of [[A,'device-a'],[B,'device-b']]){await P.tab(p,'settings');const dl=p.waitForEvent('download');await p.locator('button[onclick="exportBackup()"]').click();const download=await dl;await download.saveAs(path.join(e.path,name+'-preserved-local-backup.json'));}
  const c=await device('ReceivingDevice'),C=c.page;await C.waitForFunction(()=>bvomCloud.conflict||bvomCloud.syncReady);if(await C.evaluate(()=>bvomCloud.conflict)){const settings=C.locator('#bvomCloudConflictOverlay [data-settings]');await settings.waitFor();await settings.click();}await P.settle(C);await click(C,'bvomCloudRestore()');await C.locator('.bvomModalOverlay [data-r]').waitFor();await Promise.all([C.waitForEvent('load'),C.locator('.bvomModalOverlay [data-r]').click()]);await P.ready(C);const received=await P.stored(C);e.check('receiving device reflects committed remote History',received.history,r[0].data.history);
  fs.writeFileSync(path.join(e.path,'competing-documents.json'),JSON.stringify({...evidence,received},null,2));await A.screenshot({path:path.join(P.out,'screenshots/legacy-cloud-device-a.png'),fullPage:true});await B.screenshot({path:path.join(P.out,'screenshots/legacy-cloud-device-b.png'),fullPage:true});
  console.log('RESULT',JSON.stringify({stats:e.stats,remoteNotes,cloudA,cloudB,reads}));
 }finally{e.write();if(e.stats.failedAssertions)process.exitCode=1;for(const c of contexts)await c.close();await platform.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

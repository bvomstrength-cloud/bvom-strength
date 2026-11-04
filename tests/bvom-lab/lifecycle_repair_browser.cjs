const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');const root=process.env.BVOM_APP_ROOT||path.resolve(__dirname,'../..'),H=require(path.join(__dirname,'lib/bvom_harness')),build=H.loadBuild(root);
const out=[];function fixture(mode){const h=H.boot(build,{supabase:null,online:false});H.configureLP(h);h.S().accessoryList=[];h.S().gppList=[];if(mode==='bb1'||mode==='onramp')H.bbStart(h,{onramp:mode==='onramp'});else if(mode==='free'){h.S().programMode='free';h.S().day='1';h.S().freeTraining={selectedDay:1,nextDayId:2,days:[{id:'ft1',compounds:[{lift:'Squat',weight:60,sets:3,reps:5,style:'straight'}]}]};h.ev('bvomFtEnsure();save()')}else if(mode!=='lprpt'){h.S().programMode=mode;h.S().day=mode==='hlm'?'H':'1';h.ev('ensureHLM();save()')}return JSON.parse(JSON.stringify(h.S()))}
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://local').pathname;if(p==='/seed')return res.end('<html>seed</html>');if(p.startsWith('/vendor/'))return res.end('/* no external service */');const f=path.join(root,p==='/'?'index.html':p);if(!fs.existsSync(f)) {res.statusCode=404;return res.end()}res.setHeader('Content-Type',/\.m?js$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f))});
let browser,origin;
async function boot(data){const c=await browser.newContext({serviceWorkers:'block'});c.setDefaultTimeout(6500);await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await c.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));const p=await c.newPage();p.on('pageerror',e=>console.error('PAGE',e.message));await p.goto(origin+'/seed');await p.evaluate(d=>{localStorage.setItem('bvom_data',JSON.stringify(d));localStorage.setItem('bvom_data_owner','audit-owner');localStorage.setItem('bvom_entitlement_cache_audit-owner',JSON.stringify({userId:'audit-owner',verifiedAt:new Date().toISOString(),record:{user_id:'audit-owner',status:'complimentary'}}))},data);await p.goto(origin+'/index.html');await ready(p);return {c,p}}
async function ready(p){await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockState!=='starting')}
async function snap(p){return p.evaluate(()=>({active:bvomStateWorkoutActive(state),cloud:bvomCloudWorkoutActive(),stored:bvomStoredWorkoutActive(),started:state.workoutStartedAt||null,activity:bvomSessionHasActivity(),legacy:bvomRecoveryLegacyBlocked,session:state.session,custom:state.freeTrainingSession,bb2:state.bb2,history:state.history.length}))}
async function guards(p){return p.evaluate(async()=>{document.querySelectorAll('.bvomModalOverlay').forEach(e=>e.remove());let reads=0;const old=bvomCloudClient,offline=bvomCloud.offlineLocalAccess;bvomCloud.offlineLocalAccess=false;bvomCloudClient=()=>({from(){reads++;const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[],error:null})};return q}});await bvomCloudRestore();const message=bvomCloud.message;bvomCloudClient=old;bvomCloud.offlineLocalAccess=offline;const commit=bvomRestoreCommitAllowed(bvomRestoreToken());document.querySelectorAll('.bvomModalOverlay').forEach(e=>e.remove());importBackupFile({value:'x',files:[]});const fileBlocked=[...document.querySelectorAll('.bvomModalOverlay')].some(e=>e.textContent.includes('FINISH WORKOUT FIRST'));document.querySelectorAll('.bvomModalOverlay').forEach(e=>e.remove());return {reads,message,commit,fileBlocked}})}
async function reload(p){await p.reload();await ready(p)}
async function record(p,mode){if(['lprpt','hlm','fourday'].includes(mode)){await p.evaluate(()=>tapSet(program()[0][0],0));await p.locator('.bvomModalOverlay [data-ok]').click()}else if(mode==='free'){await p.evaluate(()=>bvomFtSetModal('Squat',0));await p.locator('.bvomModalOverlay [data-s]').click()}else{await p.evaluate(on=>{const slots=on?bvomBbOnRampSlots(bvomBbOnRampDay()):bvomBbSlotsForDay(bvomBbDay());const id=state.bodybuilding.selections[slots[0]];on?bvomBbOnRampSetModal(id,0):bvomBbSetModal(id,0)},mode==='onramp');if(mode==='onramp'){await p.locator('.bvomModalOverlay [data-load]').fill('60');await p.locator('.bvomModalOverlay [data-inc]').fill('2.5')}await p.locator('.bvomModalOverlay [data-save]').click()}}
async function finishFull(p,mode){
 await p.evaluate(mode=>{
  document.querySelectorAll('.bvomModalOverlay').forEach(e=>e.remove());
  if(['lprpt','hlm','fourday'].includes(mode)){
   for(const [n] of program())for(let i=0;i<getSetPlan(n).length;i++){
    tapSet(n,i);document.querySelector('.bvomModalOverlay [data-ok]').click();
   }
  }else if(mode==='free')for(let i=0;i<3;i++){bvomFtSetModal('Squat',i);document.querySelector('.bvomModalOverlay [data-s]').click()}
  else{
   const on=mode==='onramp',slots=on?bvomBbOnRampSlots(bvomBbOnRampDay()):bvomBbSlotsForDay(bvomBbDay());
   for(const slot of slots){const id=state.bodybuilding.selections[slot],count=on?bvomBbOnRampSetCount(id):bvomBbPrescription(id).sets.length;
    for(let i=0;i<count;i++){
     on?bvomBbOnRampSetModal(id,i):bvomBbSetModal(id,i);
     const o=[...document.querySelectorAll('.bvomModalOverlay')].at(-1);
     if(on){if(o.querySelector('[data-load]'))o.querySelector('[data-load]').value='60';if(o.querySelector('[data-inc]'))o.querySelector('[data-inc]').value='2.5'}
     o.querySelector('[data-save]').click();
    }
   }
  }
 },mode);
 await p.evaluate(()=>{document.querySelectorAll('.bvomModalOverlay').forEach(e=>e.remove());finishWorkout()});
 
 if(await p.locator('.bvomModalOverlay [data-finish]').count())await p.locator('.bvomModalOverlay [data-finish]').click();
 if(mode!=='onramp')await p.locator('.bvomModalOverlay [data-save]').click();
 if(await p.locator('.bvomModalOverlay [data-ok]').count())await p.locator('.bvomModalOverlay [data-ok]').click();
 await p.evaluate(()=>{activateTab('settings');activateTab('workout')});await reload(p);
 const s=await snap(p);assert.equal(s.active,false);assert.equal(s.history,1);assert.equal((await guards(p)).reads,1);return s;
}

let passed=0;const log=message=>{passed++;console.log('PASS '+message)};
const raw=p=>p.evaluate(()=>localStorage.getItem('bvom_data'));
async function remove(p,mode,index=0){if(mode==='free'){await p.evaluate(i=>bvomFtSetModal('Squat',i),index);await p.locator('.bvomModalOverlay [data-r]').click()}else{await p.evaluate(i=>bvomBbSetModal(state.bodybuilding.selections[bvomBbSlotsForDay(bvomBbDay())[0]],i),index);await p.locator('.bvomModalOverlay [data-remove]').click()}}
async function secondSet(p,mode){if(mode==='free'){await p.evaluate(()=>bvomFtSetModal('Squat',1));await p.locator('.bvomModalOverlay [data-s]').click()}else{await p.evaluate(()=>bvomBbSetModal(state.bodybuilding.selections[bvomBbSlotsForDay(bvomBbDay())[0]],1));await p.locator('.bvomModalOverlay [data-save]').click()}}
async function bb2Start(p){await p.evaluate(()=>showSetup());await p.locator('#setup [data-bb2-preview]').click();await p.waitForSelector('#setup [data-bb2-start]');for(const el of await p.locator('#setup [data-bb2-load]').all())await el.fill('60');for(const el of await p.locator('#setup [data-bb2-inc]').all())await el.fill('2.5');await p.locator('#setup [data-bb2-start]').click();await p.waitForSelector('#workout [data-bb2-set]:enabled')}
async function bb2Record(p,key){await p.locator('#workout [data-bb2-set="'+key+'"]').click();await p.locator('.bvomModalOverlay [data-bb2-reps="'+key+'"]').fill('12');await p.locator('.bvomModalOverlay [data-save]').click()}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
 if(!process.argv.includes('--bb2')){
 for(const mode of ['lprpt','hlm','fourday','free','bb1','onramp']){
  let {c,p}=await boot(fixture(mode));await p.evaluate(()=>{activateTab('workout');activateTab('settings')});await reload(p);assert.equal((await snap(p)).active,false);assert.equal((await guards(p)).reads,1);log(mode+' open/away/reload idle; restore guard allows');
  await record(p,mode);const before=await snap(p);await reload(p);const after=await snap(p);assert.equal(after.active,true);assert.deepEqual(after.session,before.session);assert.deepEqual(after.custom,before.custom);const g=await guards(p);assert.equal(g.reads,0);assert.equal(g.commit,false);assert.equal(g.fileBlocked,true);log(mode+' genuine set/reload preserved; cloud and file restore blocked');await c.close();
  ({c,p}=await boot(fixture(mode)));await finishFull(p,mode);log(mode+' normal Finish/reopen/reload idle');await c.close();
  const stale=fixture(mode);stale.workoutStartedAt=Date.now();stale.workoutOwnershipVersion=1;const fingerprint=JSON.stringify(stale.history),weights=JSON.stringify(stale.weights),bb=JSON.stringify(stale.bodybuilding);
  ({c,p}=await boot(stale));assert.equal((await snap(p)).active,false);assert.equal(JSON.stringify((await p.evaluate(()=>state.history))),fingerprint);assert.equal(await p.evaluate(()=>JSON.stringify(state.weights)),weights);assert.equal(await p.evaluate(()=>JSON.stringify(state.bodybuilding)),bb);assert.equal((await guards(p)).reads,1);await reload(p);assert.equal((await snap(p)).active,false);log(mode+' fresh timestamp-only remnant cleans without age/history/progression change');await c.close();
 }
 for(const mode of ['free','bb1']){
  const {c,p}=await boot(fixture(mode));await record(p,mode);await secondSet(p,mode);await remove(p,mode,1);await reload(p);assert.equal((await snap(p)).active,true);assert.equal((await guards(p)).reads,0);log(mode+' one of two removed: remaining set protected');
  await p.evaluate(()=>{window.lifecycleWrites=[];const put=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='bvom_data')lifecycleWrites.push(JSON.parse(v));return put.call(this,k,v)}});
  await remove(p,mode);const writes=await p.evaluate(()=>lifecycleWrites);assert.equal(writes.length,1);assert.equal(writes[0].workoutStartedAt,null);assert.equal(await p.evaluate(()=>bvomStateWorkoutActive(lifecycleWrites[0])),false);await reload(p);assert.equal((await snap(p)).active,false);assert.equal((await guards(p)).reads,1);log(mode+' final removal+timestamp cleanup atomically durable in one write');await c.close();
  const b=await boot(fixture(mode));await record(b.p,mode);const before=await raw(b.p);await b.p.evaluate(()=>{const put=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='bvom_data')throw new DOMException('quota','QuotaExceededError');return put.call(this,k,v)}});await remove(b.p,mode);assert.equal(await raw(b.p),before);assert.equal((await snap(b.p)).active,true);log(mode+' failed final removal preserves bytes/work');await b.c.close();
 }
 for(const kind of ['zero','single','gpp','pending','snapshot','draft','legacy','unknown-row']){
  const d=fixture('free');d.workoutStartedAt=Date.now();d.workoutOwnershipVersion=1;
  if(kind==='zero'){d.workoutStartedAt=null;d.freeTrainingSession={Squat:{sets:[{reps:0,load:60}]}}}
  if(kind==='single'){d.workoutStartedAt=null;d.freeTrainingSession={Squat:{sets:[],single:{reps:0,load:60}}}}
  if(kind==='gpp'){d.gppList=[{id:'walk',name:'Walk',metrics:{time:true},planned:{timeSeconds:60},freeAssignment:'ft1'}];d.gppSession={walk:{started:true,status:'paused'}}}
  if(kind==='pending')d.pendingCloseMissChoice={lift:'Squat'};
  if(kind==='snapshot')d.processedSnapshots={Squat:{weight:60}};
  if(kind==='draft')d.freeTrainingDraft=[{lift:'Squat',weight:999,sets:3,reps:5,style:'straight'}];
  if(kind==='legacy')delete d.workoutOwnershipVersion;
  if(kind==='unknown-row')d.session={Squat:{0:{futureData:true}}};
  const {c,p}=await boot(d);assert.equal((await snap(p)).active,true);assert.equal((await guards(p)).reads,0);if(kind==='legacy'){assert.equal((await snap(p)).legacy,true);const before=await raw(p);assert.equal(await p.evaluate(()=>bvomLegacyArchiveCommit()),true);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('bvom_legacy_workout_before_archive')).raw),before);assert.equal((await snap(p)).history,0)}log(kind+' remains protected; legacy explicit archive unchanged');await c.close();
 }
 }
 // Native second window cannot mutate the owner's session, even with a cancel API call.
 const {c,p}=await boot(fixture('lprpt'));await p.evaluate(()=>showSetup());await p.locator('#setup [data-bb2-preview]').click();await p.waitForSelector('#setup [data-bb2-save]');await p.locator('#setup [data-bb2-save]').click();await p.locator('#setup [data-bb2-back]').click();await p.evaluate(()=>{activateTab('workout');activateTab('settings')});await reload(p);assert.equal((await snap(p)).active,false);log('BB2 setup/open/reload stays idle');
 await bb2Start(p);const b0=await snap(p);await reload(p);assert.equal((await guards(p)).reads,0);assert.equal((await snap(p)).bb2.activeSessionId,b0.bb2.activeSessionId);assert.equal(await p.evaluate(()=>bvomBb2FinishFromControls()),false);
 const q=await c.newPage();await q.goto(origin+'/index.html');await ready(q);const ownerRaw=await raw(p);assert.equal(await q.evaluate(()=>bvomWindowLockOwned),false);assert.equal(await q.evaluate(()=>bvomBb2Discard()),false);assert.equal(await q.evaluate(()=>bvomRecoveryCheck()),false);assert.equal(await raw(p),ownerRaw);await q.close();log('secondary native tab cannot recover/cancel active owner session');
 const prior=await p.evaluate(()=>{const b=state.bb2,x=bvomBb2PreviewModule.foldBB2Block(b.opening,b.events);return {history:x.history,progress:x.progress,quotas:x.quotas}});
 await p.locator('#workout [data-bb2-cancel-workout]').click();assert.equal(await p.evaluate(()=>bvomBb2CancelWorkout()),false);assert.equal(await p.locator('.bvomModalOverlay').count(),1);await p.locator('.bvomModalOverlay [data-l]').click();assert.equal(await raw(p),ownerRaw);log('BB2 Cancel confirmation required; cancel-dialog double tap rejected');
 await p.locator('#workout [data-bb2-cancel-workout]').click();await p.locator('.bvomModalOverlay [data-r]').click();assert.equal((await snap(p)).active,false);const after=await p.evaluate(()=>{const b=state.bb2,x=bvomBb2PreviewModule.foldBB2Block(b.opening,b.events);return {history:x.history,progress:x.progress,quotas:x.quotas}});assert.deepEqual(after,prior);assert.equal((await snap(p)).history,0);await p.evaluate(async()=>bvomBb2ValidatePortableJournal(JSON.parse(JSON.stringify(state.bb2)),bvomLocalOwnerId()));const exported=await p.evaluate(()=>exportBackup());assert.notEqual(exported,false);log('BB2 empty Cancel has valid portable tombstone, no history/progression/credit; export accepted');
 await p.evaluate(()=>activateTab('settings'));const portable=await raw(p);
 await p.locator('#settings input[type=file]').setInputFiles({name:'cancelled-bb2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'BVOM',version:'3.0.1',data:JSON.parse(portable)}))});
 await p.waitForSelector('.bvomModalOverlay [data-r]');assert.match(await p.locator('.bvomModalOverlay').textContent(),/RESTORE BACKUP/);await p.locator('.bvomModalOverlay [data-l]').click();assert.equal(await raw(p),portable);log('BB2 discard tombstone accepted by real file-import validation and confirmation');
 await bb2Start(p);assert.equal(await p.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId).templateId),'upper_a');log('same BB2 workout can restart after Cancel');
 await p.locator('#workout [data-bb2-cancel-workout]').click();await p.evaluate(()=>{const o=document.querySelector('.bvomModalOverlay');window.staleCancelConfirm=o.querySelector('[data-r]').onclick;o.remove();bvomBb2SetModal(0,0)});const key='0|0';await p.locator('.bvomModalOverlay [data-bb2-reps="'+key+'"]').fill('1');await p.locator('.bvomModalOverlay [data-save]').click();const actualRaw=await raw(p);assert.equal(await p.locator('#workout [data-bb2-cancel-workout]').count(),0);assert.equal(await p.evaluate(()=>bvomBb2Discard()),false);await p.evaluate(()=>staleCancelConfirm());assert.equal(await raw(p),actualRaw);await reload(p);assert.equal((await snap(p)).active,true);assert.equal((await guards(p)).reads,0);log('genuine BB2 set hides Cancel, rejects direct/stale confirmation; reload preserves work');
 const keys=await p.locator('#workout [data-bb2-set]').evaluateAll(es=>es.map(e=>e.dataset.bb2Set));for(const k of keys.slice(1))await bb2Record(p,k);await p.evaluate(()=>finishWorkout());await p.locator('.bvomModalOverlay [data-save]').click();await p.locator('.bvomModalOverlay [data-ok]').click();await reload(p);assert.equal((await snap(p)).active,false);assert.equal((await guards(p)).reads,1);log('BB2 normal Finish/reopen idle');
 // Stale legacy timestamp may coexist with an idle BB2 historical ledger: preserve it exactly.
 const idle=await p.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));idle.workoutStartedAt=Date.now();idle.workoutOwnershipVersion=1;await c.close();const b=await boot(idle);assert.equal((await snap(b.p)).active,false);assert.deepEqual((await snap(b.p)).bb2,idle.bb2);log('idle BB2 orphan cleanup preserves entire ledger');await b.c.close();
 // Commit-time guard must protect durable work even when memory is stale/empty.
 const z=await boot(fixture('lprpt'));const protections=await z.p.evaluate(()=>{const token=bvomRestoreToken(),doc=JSON.parse(localStorage.getItem(BVOM_DATA_KEY));doc.session={Squat:{0:{reps:0,load:60}}};localStorage.setItem(BVOM_DATA_KEY,JSON.stringify(doc));return {stored:bvomStoredWorkoutActive(),restore:bvomRestoreCommitAllowed(token),clean:bvomRecoveryCheck()}});assert.deepEqual(protections,{stored:true,restore:false,clean:false});log('stale memory cannot bypass persisted-work restore/recovery guards');await z.c.close();
 console.log('RESULT '+passed+' focused browser scenarios passed');
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// REAL BVOM HTML/DOM/callbacks and browser locks/storage; only account/network/clock are fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),build=H.loadBuild(root);
const fixture=()=>{const h=H.boot(build,{supabase:null,online:false});H.configureLP(h,{Squat:60,'Bench Press':45,'Prone Row':40,'Overhead Press':30,Deadlift:75});h.S().accessoryList=[];h.S().gppList=[];h.ev('save()');return JSON.parse(JSON.stringify(h.S()))};
const tests=[],test=(name,fn)=>tests.push({name,fn});
let browser,origin;
async function setup(data=fixture(),options={}){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(({now,noLocks})=>{
  window.testNow=now;const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[window.testNow]))}static now(){return window.testNow}};
  Object.defineProperty(navigator,'onLine',{get:()=>false});
  if(noLocks)Object.defineProperty(navigator,'locks',{value:undefined});
 },{now:Date.now(),noLocks:options.noLocks||false});
 const seed=await context.newPage();await seed.goto(origin+'/seed');
 await seed.evaluate(d=>{localStorage.setItem('bvom_data',JSON.stringify(d));localStorage.setItem('bvom_data_owner','dummy-owner');localStorage.setItem('bvom_entitlement_cache_dummy-owner',JSON.stringify({userId:'dummy-owner',verifiedAt:new Date().toISOString(),record:{user_id:'dummy-owner',status:'complimentary'}}))},data);
 await seed.close();const a=await open(context);return {context,a};
}
async function open(context,id){const p=await context.newPage();if(id)await p.addInitScript(id=>sessionStorage.setItem('bvom_tab_id',id),id);await p.goto(origin+'/index.html');await p.waitForSelector('#app:not(.hidden)');await p.waitForTimeout(100);return p;}
const raw=p=>p.evaluate(()=>localStorage.getItem('bvom_data'));
const saved=async p=>JSON.parse(await raw(p));
async function record(p,lift,i,reps=5){await p.evaluate(({lift,i})=>tapSet(lift,i),{lift,i});const o=p.locator('.bvomModalOverlay').last();let current=Number(await o.locator('[data-v]').textContent());while(current>reps){await o.locator('[data-m]').click();current--}while(current<reps){await o.locator('[data-p]').click();current++}await o.locator('[data-ok]').click();assert.equal((await saved(p)).session[lift][i].reps,reps);}
async function tick(p,ms){await p.evaluate(ms=>window.testNow+=ms,ms);}
test('real close/reopen preserves squat + bench and allows new work',async()=>{
 const {context,a}=await setup();try{
  await record(a,'Squat',0);await record(a,'Bench Press',0);const before=await saved(a);await a.close();const b=await open(context);await tick(b,5*60000);
  assert.deepEqual((await saved(b)).session,before.session);assert.equal((await saved(b)).history.length,0);await record(b,'Squat',1);
  await b.reload();await b.waitForSelector('#app:not(.hidden)');await record(b,'Squat',2);
 }finally{await context.close()}
});
test('duplicate session identity cannot write with A live/background/frozen after 65 minutes',async()=>{
 const {context,a}=await setup();try{
  await record(a,'Squat',0);const id=await a.evaluate(()=>sessionStorage.getItem('bvom_tab_id'));const b=await open(context,id);const before=await raw(a);
  await b.bringToFront();const cdp=await context.newCDPSession(a);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
  await tick(b,65*60000);await b.evaluate(()=>{tapSet('Squat',1);completeWarmup('Squat',0,3,document.createElement('button'));finishWorkout();save({durable:true})});
  assert.equal(await raw(b),before);await cdp.send('Page.setWebLifecycleState',{state:'active'});await record(a,'Squat',1);
 }finally{await context.close()}
});
test('60 minute boundary, passive renders and exactly one incomplete record',async()=>{
 const {context,a}=await setup();try{
  await record(a,'Squat',0);const before=await saved(a);await tick(a,3599000);await a.evaluate(()=>{renderAll();bvomRecoveryCheck()});assert.equal((await saved(a)).history.length,0);
  await tick(a,1000);await a.evaluate(()=>bvomRecoveryCheck());const d=await saved(a);assert.equal(d.history.length,1);assert.equal(d.history[0].incomplete,true);assert.deepEqual(d.history[0].session,before.session);assert.deepEqual(d.weights,before.weights);assert.deepEqual(d.session,{});
  await a.reload();await a.waitForSelector('#app:not(.hidden)');assert.equal((await saved(a)).history.length,1);
 }finally{await context.close()}
});
test('pending decision survives expired close/reopen and blocked B answer',async()=>{
 const d=fixture();d.core['Bench Press'].mode='rpt';const {context,a}=await setup(d);try{
  await record(a,'Bench Press',0);await record(a,'Bench Press',1);await a.evaluate(()=>tapSet('Bench Press',2));const modal=a.locator('.bvomModalOverlay').last();await modal.locator('[data-m]').click();await modal.locator('[data-m]').click();await modal.locator('[data-ok]').click();
  const before=await saved(a);assert.ok(before.pendingCloseMissChoice);const b=await open(context);const rawBefore=await raw(a);await b.evaluate(()=>{bvomPresentPendingCloseMissChoice();completeWarmup('Squat',0,3,document.createElement('button'))});assert.equal(await raw(b),rawBefore);await b.close();await a.close();const c=await open(context);await tick(c,65*60000);await c.evaluate(()=>bvomRecoveryCheck());const held=await saved(c);assert.deepEqual(held.pendingCloseMissChoice,before.pendingCloseMissChoice);assert.deepEqual(held.session,before.session);assert.equal(held.history.length,0);
 }finally{await context.close()}
});
test('missing Web Locks fails closed without writes',async()=>{
 const d=fixture();d.session.Squat={0:{reps:5,load:60,index:0}};d.workoutStartedAt=Date.now()-300000;const {context,a}=await setup(d,{noLocks:true});try{const before=await raw(a);await a.evaluate(()=>{tapSet('Squat',1);save({durable:true});finishWorkout()});assert.equal(await raw(a),before);assert.ok(await a.locator('#bvomWorkoutReadOnlyOverlay').count())}finally{await context.close()}
});
(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/seed'){res.end('<!doctype html>seed');return}if(url.pathname.startsWith('/vendor/')){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('// External service stub: library unavailable; verified dummy offline owner only.');return}const f=path.join(root,url.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return}res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'image/png','Cache-Control':'no-store'});res.end(fs.readFileSync(f))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 let failed=0;try{browser=await chromium.launch({headless:true});for(const t of tests){try{await t.fn();console.log('PASS:',t.name)}catch(e){failed++;console.error('FAIL:',t.name,e.stack)}}}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}console.log(`BVOM application browser checks: ${tests.length-failed}/${tests.length} PASS`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// Issue #55 — Monkey 021: actual BVOM application in phone-width Chromium.
// Purely local fixtures, fake offline entitlement, and no external services.
// Uses REAL HTML, callbacks, native DOM, browser storage and Web Locks.
// Does not rely on Node VM emulation for the interactions under test.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),build=H.loadBuild(root);
const started=Date.now();
let checks=0;const pass=s=>{console.log('PASS M021: '+s);checks++};

function fixture({onramp=false,lang='en'}={}){
 const h=H.boot(build);H.bbStart(h,{onramp});
 const s=h.S(),b=s.bodybuilding;
 b.selections.A1='barbell_bench_press';b.selections.A2='high_bar_squat';b.selections.A3='barbell_row';
 b.selections.B2='romanian_deadlift';b.selections.B4='bulgarian_split_squat';
 s.language=lang;s.accessoryList=[];s.gppList=[];
 const loads={barbell_bench_press:85,high_bar_squat:100,barbell_row:50,romanian_deadlift:100,bulgarian_split_squat:20};
 for(const [id,load] of Object.entries(loads)){
  const p=b.progression[id]||(b.progression[id]={});Object.assign(p,{load,topLoad:load,increment:2.5,calibrated:true});
 }
 if(onramp){
  for(const id of Object.values(b.selections)){
   const e=h.ctx.bvomBbOnRampEx(id);e.state='CONFIRMED';
   e.load=loads[id]||50;e.increment=2.5;
  }
 }
 h.ev('save()');return JSON.parse(JSON.stringify(s));
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/seed'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>BVOM isolated test seed</title>');return}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Cache-Control':'no-store','Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':'application/octet-stream'});
 res.end(fs.readFileSync(file));
});
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
const raw=page=>page.evaluate(()=>localStorage.getItem('bvom_data'));
const wait=async page=>{await page.waitForSelector('#app:not(.hidden)',{timeout:15000});await page.waitForTimeout(150)};
let browser,origin;

async function openScenario(data){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:375,height:812},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 context.setDefaultTimeout(8000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 const seed=await context.newPage();await seed.goto(origin+'/seed');
 await seed.evaluate(d=>{
  localStorage.setItem('bvom_data',JSON.stringify(d));localStorage.setItem('bvom_data_owner','monkey021');
  localStorage.setItem('bvom_entitlement_cache_monkey021',JSON.stringify({userId:'monkey021',verifiedAt:new Date().toISOString(),record:{user_id:'monkey021',status:'complimentary'}}));
 },data);
 await seed.close();
 const page=await context.newPage();const exceptions=[];
 page.on('pageerror',e=>exceptions.push(e.message));
 await page.goto(origin+'/index.html');await wait(page);
 return {context,page,exceptions};
}
async function beginWarm(page){await page.evaluate(()=>activateTab('warmup'));await page.locator('#warmup:not(.hidden)').waitFor()}
async function cardNames(page,surface){
 return page.locator('#'+surface+' > .exercise .exname').allTextContents();
}
async function testMain(lang){
 const {context,page,exceptions}=await openScenario(fixture({lang}));
 try{
  await beginWarm(page);
  const squat=page.locator('#warm-bb-A2'),buttons=squat.locator('button.set');
  assert.equal(await buttons.count(),6,'100 kg high-bar squat should present six engine warm-ups');
  const warm=await squat.textContent();
  assert.match(warm,/20 kg × 5/);assert.match(warm,/40 kg × 5/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'375px warm-up screen must not overflow horizontally');
  assert.equal(await page.evaluate(()=>bvomSessionHasActivity()),false,'unrecorded warm-ups must not count as actual training');
  await buttons.nth(0).click();
  let d=await read(page),key=Object.keys(d.warmupDone||{}).find(x=>x.includes('|A2|high_bar_squat'));
  assert.ok(key,'must store session-scoped squat mark');assert.equal(d.warmupDone[key].done['0'],true);
  assert.ok(d.timerStart>0,'rest timer must start on warm-up tap');
  assert.equal(d.workoutStartedAt,null);assert.equal(d.history.length,0);
  assert.equal(Object.keys(d.session).length,0,'no working sets recorded');
  assert.equal(await page.locator('#timerbar').evaluate(n=>n.classList.contains('idle')),false);
  pass(lang+' 375px squat tick and timer, no false workout activity');
  await buttons.nth(1).click();d=await read(page);
  assert.equal(d.warmupDone[key].done['1'],true,'duplicate empty-bar sets remain separately tickable');
  pass(lang+' duplicate opening sets are distinct');

  await page.evaluate(()=>activateTab('workout'));
  await page.locator('#workout #work-bb-A2 .bvomOrderArrow').first().click();
  let ordered=await cardNames(page,'workout');
  assert.match(ordered[0],/Squat/,'order arrow must move squat before bench');
  await beginWarm(page);ordered=await cardNames(page,'warmup');
  assert.match(ordered[0],/Squat/,'warm-up cards must follow changed workout order');
  assert.equal(await page.locator('#warm-bb-A2 button.set.done').count(),2,'marks survive exercise reorder');
  pass(lang+' real exercise arrows preserve warm-up order and marks');
  await page.reload();await wait(page);await beginWarm(page);
  assert.equal(await page.locator('#warm-bb-A2 button.set.done').count(),2,'completed warm-up ticks must survive actual browser reload');
  d=await read(page);assert.ok(Object.keys(d.warmupDone).some(k=>k.includes('|A2|high_bar_squat')));
  pass(lang+' reload restores exact same-session ticks');

  const count=await page.locator('#warm-bb-A2 button.set').count();
  await page.locator('#warm-bb-A2 button.set').nth(count-1).click();
  await page.locator('#workout:not(.hidden)').waitFor();
  assert.equal(await page.locator('#workout #work-bb-A2').count(),1,'final warm-up must navigate to real exercise');
  assert.equal(await page.evaluate(()=>bvomSessionHasActivity()),false,'last warm-up alone must not create training activity');
  pass(lang+' last tick navigates to matching squat workout card');
  await page.locator('#workout #work-bb-A2 button.set').first().click();
  const modal=page.locator('.bvomModalOverlay').last();
  await modal.locator('[data-load]').fill('100');
  await modal.locator('[data-reps]').fill('8');
  await modal.locator('[data-save]').click();
  d=await read(page);
  assert.equal(d.session['BB:high_bar_squat']['0'].reps,8);
  assert.ok(d.workoutStartedAt>0);
  assert.equal(d.history.length,0);
  pass(lang+' actual working set records separately after warm-up');

  const secondary=await context.newPage();await secondary.goto(origin+'/index.html');await wait(secondary);
  const previous=await raw(page);
  await secondary.evaluate(()=>activateTab('warmup'));
  await secondary.locator('#warm-bb-A2 button.set').nth(2).click();
  assert.equal(await raw(page),previous,'secondary tab must not write to shared data');
  await secondary.close();
  pass(lang+' second browser tab blocked from recording warm-up');

  // Fail storage on an actual DOM tap: reject marker AND rest-time change.
  await page.evaluate(()=>{
   window.monkey21OriginalSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(key==='bvom_data')throw new DOMException('Monkey021 quota','QuotaExceededError');
    return window.monkey21OriginalSetItem.call(this,key,value);
   };
  });
  await beginWarm(page);const before=await raw(page);
  await page.locator('#warm-bb-A2 button.set').nth(2).click();
  const after=await raw(page);assert.equal(after,before,'failed storage must leave persisted blob unchanged');
  assert.equal(await page.locator('#warm-bb-A2 button.set.done').count(),3,'failed tap cannot show an extra completed tick');
  assert.ok(await page.locator('#bvomLocalSaveFailureOverlay').count()||await page.locator('#bvomPostCommitOwnerFailureOverlay').count(),'failed persistence must visibly stop unsafe continuation');
  pass(lang+' real browser quota rejection cannot falsely tick warm-up');

  assert.deepEqual(exceptions,[],'no uncaught browser JS errors');
 }finally{await context.close()}
}
async function testOnRamp(){
 const {context,page,exceptions}=await openScenario(fixture({onramp:true}));
 try{
  await beginWarm(page);let info=await page.locator('#warmup').textContent();
  assert.match(info,/Start very easy/);assert.ok(!/\d+ kg × \d+/.test(info),'On-Ramp must not invent numerical warm-up loads');
  assert.equal(await page.locator('#warmup button.set').count(),0,'On-Ramp prep has no numeric checkmarks');
  await page.locator('#warmup button').filter({hasText:'START REST TIMER'}).first().click();
  let d=await read(page);assert.ok(d.timerStart>0);assert.equal(d.workoutStartedAt,null);
  assert.equal(Object.keys(d.session).length,0);assert.equal(d.bodybuilding.onramp.status,'active');
  pass('On-Ramp confirmed calibration stays qualitative; rest timer does not record work');
  await page.evaluate(()=>activateTab('workout'));
  await page.locator('#workout button').filter({hasText:'START 8-WEEK BLOCK NOW'}).click();
  d=await read(page);assert.equal(d.bodybuilding.onramp.status,'handed_off');
  assert.equal(d.bodybuilding.completedSessions,0);
  assert.equal(Object.keys(d.session).length,0);
  await beginWarm(page);
  assert.equal(await page.locator('#warm-bb-A2 button.set').count(),6,'handoff should enable numeric strength-style squat warm-up');
  assert.equal(await page.locator('#warmup').textContent().then(s=>s.includes('Start very easy')),false);
  pass('real On-Ramp handoff enables known-load main-block engine without stale ticks');
  assert.deepEqual(exceptions,[]);
 }finally{await context.close()}
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  await testMain('en');await testMain('ja');await testOnRamp();
  console.log('MONKEY 021 PASS '+checks+' checks; isolated real Chromium, no live data; '+(Date.now()-started)+'ms');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error('MONKEY 021 FAIL',e);process.exitCode=1});

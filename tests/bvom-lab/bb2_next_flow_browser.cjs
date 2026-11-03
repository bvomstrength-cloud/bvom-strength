'use strict';
// Synthetic counterpart of the reported Android backup, never the owner's data.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),fixture={} ;
const output=process.env.BB2_ANDROID_OUTPUT||path.join(os.tmpdir(),'bb2-android-acceptance');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/seed'){res.end('<html></html>');return}const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file===path.join(root,'index.html')&&process.env.BB2_ANDROID_APP_HTML?process.env.BB2_ANDROID_APP_HTML:file))});
let context,page;const errors=[];
async function boot(origin,seed=false,blockModule=false){context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'bvom-android-next-')),{headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||undefined,args:process.env.BVOM_CHROMIUM_PATH?['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']:['--no-sandbox'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true});context.setDefaultTimeout(15000);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());if(blockModule)await context.route('**/bb2/browser-core.mjs',r=>r.abort());await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-02T09:00:00Z'));if(seed){await page.goto(origin+'/seed');await page.evaluate(f=>{const id=f.data.bb2.opening.ownerId;localStorage.setItem('bvom_data',JSON.stringify(f.data));localStorage.setItem('bvom_data_owner',id);localStorage.setItem('bvom_entitlement_cache_'+id,JSON.stringify({userId:id,verifiedAt:new Date().toISOString(),record:{user_id:id,status:'complimentary'}}));},fixture);}await page.goto(origin+'/index.html');await page.waitForSelector('#app:not(.hidden)');await page.waitForFunction(()=>bvomWindowLockOwned);}
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
const tab=name=>page.locator('.tab[data-tab="'+name+'"]').click();
const history=count=>require('./lib/bb2_mobile_history.cjs')(page,count);
async function record(i,j,reps){await page.locator('[data-bb2-set="'+i+'|'+j+'"]').click();await page.locator('.bvomModalOverlay [data-bb2-reps]').fill(String(reps));await page.locator('.bvomModalOverlay [data-save]').click();await page.locator('.bvomModalOverlay').waitFor({state:'detached'});}
async function finish(){await page.locator('#timerbar .finish').click();await page.locator('.bvomModalOverlay [data-note]').fill('Inline flow proof');await page.locator('.bvomModalOverlay [data-save]').click();await page.locator('.bvomModalOverlay [data-ok]').click();}
const current=()=>page.evaluate(()=>state.bb2.events.find(e=>e.type==='WORKOUT_STARTED'&&e.sessionId===state.bb2.activeSessionId));
(async()=>{fixture.data=await require('./fixtures/bb2-next-flow.cjs')();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const width of [360,390]){console.log('Mobile width',width);
  await boot(origin,true);await page.bringToFront();page.on('console',m=>{if(m.type()==='error')console.error(m.text())});await page.setViewportSize({width,height:844});await page.waitForSelector('[data-bb2-start-next]');
  assert.match(await page.locator('#workout').textContent(),/Upper A/);const before=await stored();
  const choices=page.locator('#workout > .toprow .choiceRow .choice');
  assert.deepEqual(await choices.allTextContents(),['1','2','3','4']);
  assert.equal(await page.locator('[data-bb2-start-next]').evaluate(e=>e.classList.contains('wide')),false);
  assert.equal(await page.locator('#workout > .notice').count(),0);
  assert.ok(!(await page.locator('#workout').textContent()).includes('Previous recorded exercise (reference only)'));
  const oldToken=await page.locator('[data-bb2-start-next]').getAttribute('data-bb2-preview-token');
  for(const n of ['2','3','4','1']){
   await choices.getByText(n,{exact:true}).click();
   assert.equal(await page.locator('#workout > .toprow .choice.on').textContent(),n);
   assert.deepEqual(await stored(),before,'day selection never mutates data, credits or progression');
  }
  assert.equal(await page.evaluate(t=>bvomBb2StartNext(t),oldToken),false,'a previously selected preview cannot start');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no mobile horizontal overflow');

  assert.equal(before.bb2.activeSessionId,null);assert.equal(before.timerStart,null);assert.match(await page.locator('#workout .exercise').first().locator('.setload').first().textContent(),/62\.5 kg/);
  assert.equal(await page.locator('#timerbar').isVisible(),false,'no active timer controls before Start');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'next-preview-'+width+'.png')});
  await page.evaluate(()=>{renderWorkout();renderWorkout()});assert.deepEqual((await stored()).bb2,before.bb2,'preview is read-only');
  await tab('history');await page.waitForSelector('#history [data-bb2-history]');const past=page.locator('#history > [data-bb2-history]').first();await past.locator('.histSummary').click();await past.getByRole('button',{name:'ADD NOTE',exact:true}).click();await page.locator('.bvomModalOverlay [data-note]').fill('Preview refresh after History note');await page.locator('.bvomModalOverlay [data-save]').click();await tab('workout');assert.equal((await stored()).bb2.activeSessionId,null);
  await page.locator('[data-bb2-edit-save="0"]').click();await page.locator('.bvomModalOverlay [data-bb-weight]').fill('64');await page.locator('.bvomModalOverlay [data-bb-increment]').fill('1');await page.locator('.bvomModalOverlay [data-save]').click();
  assert.equal((await stored()).bb2.activeSessionId,null,'editing next weight does not start a session');assert.match(await page.locator('#workout .exercise').first().locator('.setload').first().textContent(),/64 kg/);
  console.log('PASS preview/manual weight without Start');await page.locator('[data-bb2-start-next]').click();let start=await current();assert.equal(start.templateId,'upper_a');assert.equal(await page.locator('#timerbar').isVisible(),true);
  assert.equal(await page.locator('#workout > .toprow .choice:disabled').count(),4);
  assert.equal(await page.evaluate(()=>bvomBb2SelectWorkout('2')),false,'active session day is immutable');
  await page.evaluate(()=>{
   window.__updateMessages=0;
   const worker={state:'installed',postMessage(){window.__updateMessages++},addEventListener(){}};
   bvomShowServiceWorkerUpdate({waiting:worker});
   document.querySelector('[data-bvom-update]').click();
  });
  assert.equal(await page.locator('#bvomUpdateBanner').isVisible(),false,'pending update is deferred during active training');
  await page.locator('.bvomModalOverlay [data-ok]').click();
  assert.equal(await page.evaluate(()=>{bvomSwUpdateBusy=true;sessionStorage.setItem(BVOM_SW_UPDATE_FLAG,'1');return bvomSwFinishRequestedReload()}),false,'an activation race cannot reload active training');
  assert.equal(await page.evaluate(()=>window.__updateMessages),0,'no worker takeover requested during training');

  for(const[i,s]of start.slots.entries())for(let j=0;j<s.sets;j++)await record(i,j,s.ceiling);await finish();
  assert.equal(await page.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events).progress['upper_a|flat_press|bench_press'].loadG),65000,'ordinary weighted success progresses automatically');
  assert.equal(await page.locator('#bvomUpdateBanner').isVisible(),true,'deferred notification returns after Finish');
  await page.evaluate(()=>{bvomSwPendingUpdate=null;document.getElementById('bvomUpdateBanner').remove()});
  assert.equal(await page.locator('#workout > .toprow .choice.on').textContent(),'2','Finish clears manual preview selection');
  assert.match(await page.locator('#workout').textContent(),/Lower A/);assert.equal(await page.locator('#workout [data-bb2-pending]').count(),1);
  await page.locator('[data-bb2-start-next]').click();start=await current();assert.equal(start.templateId,'lower_a');
  const bw=start.slots.findIndex(s=>s.equipment==='bodyweight');assert.equal(await page.locator('[data-bb2-set="'+bw+'|0"]').isDisabled(),true);
  assert.equal(await page.evaluate(i=>bvomBb2SetModal(i,0),bw),false,'direct modal API cannot bypass unresolved prescription');
  for(const[i,s]of start.slots.entries())if(i!==bw)for(let j=0;j<s.sets;j++)await record(i,j,s.floor);
  const active=start.sessionId,raw=(await stored()).bb2.events;
  await page.reload();await page.waitForSelector('#app:not(.hidden)');await page.waitForSelector('#workout [data-bb2-pending]');assert.equal((await stored()).bb2.activeSessionId,active);assert.deepEqual((await stored()).bb2.events,raw);
  const card=page.locator('#workout .exercise').filter({has:page.locator('[data-bb2-pending]')});
  if(width===360)await card.locator('[data-bb2-pending] summary').click();
  if(width===360){await card.locator('[data-bb2-choice-assist]').fill('medium band');await card.locator('[data-bb2-choice-added]').fill('1.25');await card.locator('[data-bb2-choice-difficulty]').click();}else await card.locator('[data-bb2-choice-hold]').click();
  await page.waitForSelector('[data-bb2-set="'+bw+'|0"]:not([disabled])');
  assert.equal((await stored()).bb2.events.at(-1).type,'EXERCISE_READY');
  for(let j=0;j<start.slots[bw].sets;j++)await record(bw,j,start.slots[bw].floor);await finish();
  assert.match(await page.locator('#workout').textContent(),/Upper B/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS inline exercise flow',width);const saved=await stored();assert.equal(saved.history.length,before.history.length);assert.equal(saved.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,6);assert.deepEqual(saved.bb2.events.slice(0,before.bb2.events.length),before.bb2.events);
  await page.screenshot({path:path.join(output,'next-flow-'+width+'.png')});
  await tab('settings');const download=page.waitForEvent('download');await page.locator('#settings button[onclick="exportBackup()"]').click();const bytes=fs.readFileSync(await(await download).path());
  await page.locator('#settings input[type="file"]').setInputFiles({name:'next-flow.json',mimeType:'application/json',buffer:bytes});const reload=page.waitForEvent('domcontentloaded');await page.locator('.bvomModalOverlay [data-r]').click();await reload;await page.waitForSelector('#app:not(.hidden)');await page.waitForSelector('[data-bb2-start-next]');assert.deepEqual((await stored()).bb2.events,saved.bb2.events);
  await context.close();context=null;
  // Start an explicitly selected, out-of-order day through the same compact control.
  await boot(origin,true);await page.bringToFront();await page.setViewportSize({width,height:844});
  await page.waitForSelector('[data-bb2-start-next]');
  const unselected=await stored();
  await page.locator('#workout > .toprow .choice').getByText('3',{exact:true}).click();
  assert.deepEqual(await stored(),unselected);
  await page.screenshot({path:path.join(output,'numbered-selector-'+width+'.png')});
  await page.locator('[data-bb2-start-next]').click();start=await current();assert.equal(start.templateId,'upper_b');
  for(const button of await page.locator('#workout [data-bb2-choice-hold]').all())await button.click();
  for(const[i,s]of start.slots.entries())for(let j=0;j<s.sets;j++)await record(i,j,s.floor);
  await finish();assert.equal(await page.locator('#workout > .toprow .choice.on').textContent(),'4','selected completion schedules its following day');
  const projection=await page.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));
  assert.equal(projection.quotas.upper_b,2);assert.equal(projection.quotas.lower_a,1,'unselected day earns no credit');
  console.log('PASS out-of-order selected Start, exact credit and next day',width);
  await context.close();context=null;
  const standard=fixture.data;fixture.data=await require('./fixtures/bb2-capped-day.cjs')();
  await boot(origin,true);fixture.data=standard;await page.bringToFront();await page.setViewportSize({width,height:844});
  await page.waitForSelector('[data-bb2-start-next]');
  const cappedBefore=await stored();
  await page.locator('#workout > .toprow .choice').getByText('1',{exact:true}).click();
  assert.equal(await page.locator('[data-bb2-start-next]').isDisabled(),true);
  assert.ok(await page.locator('[data-bb2-start-next]').evaluate(e=>Number(getComputedStyle(e).opacity)<.5),'capped Start is visibly disabled');
  assert.match(await page.locator('#bb2-day-cap').textContent(),/8\/8 block credits/);
  assert.equal(await page.locator('[data-bb2-open-extra]').isVisible(),true);
  assert.deepEqual(await stored(),cappedBefore,'viewing a capped day is read-only');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'capped-day-'+width+'.png')});
  const cappedToken=await page.locator('[data-bb2-start-next]').getAttribute('data-bb2-preview-token');
  await page.locator('#workout > .toprow .choice').getByText('2',{exact:true}).click();
  assert.equal(await page.locator('[data-bb2-start-next]').isEnabled(),true);
  assert.equal(await page.evaluate(t=>bvomBb2OpenExtraWorkout(t),cappedToken),false,'stale capped preview cannot open another day’s Extra form');
  assert.equal(await page.locator('#bb2-day-cap').count(),0);
  await page.locator('#workout > .toprow .choice').getByText('1',{exact:true}).click();
  await page.locator('[data-bb2-open-extra]').click();await page.waitForSelector('#setup [data-bb2-kind="EXTRA_NORMAL"].on');
  assert.equal(await page.locator('#setup [data-bb2-day="upper_a"].on').count(),1);
  assert.deepEqual(await stored(),cappedBefore,'opening existing Extra Normal options writes nothing');
  await page.locator('#setup [data-bb2-start]').click();start=await current();assert.equal(start.templateId,'upper_a');assert.equal(start.kind,'EXTRA_NORMAL');
  assert.equal(await page.evaluate(()=>bvomBb2OpenExtraWorkout(bvomBb2NextToken())),false,'active session cannot open Extra options');
  for(const[i,s]of start.slots.entries())for(let j=0;j<s.sets;j++)await record(i,j,s.floor);
  await finish();const cappedAfter=await stored();
  assert.equal(cappedAfter.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,cappedBefore.bb2.events.filter(e=>e.type==='CREDIT_GRANTED').length,'Extra Normal earns no duplicate credit');
  assert.equal(await page.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events).quotas.upper_a),8);
  console.log('PASS capped day explanation, unchanged selector, existing Extra Normal Start/Finish without another credit',width);
  await context.close();context=null;
 }
 assert.deepEqual(errors,[]);console.log('PASS actual 360/390 next Upper A, automatic weights, explicit Start, inline Nordic choice after other sets, blocked APIs, interrupted reload and downloaded backup/restore');
}catch(e){console.error(e);if(page)await page.screenshot({path:path.join(output,'next-flow-failure.png'),fullPage:true}).catch(()=>{});throw e}finally{if(context)await context.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});

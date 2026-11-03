'use strict';
// Synthetic counterpart of the reported Android backup, never the owner's data.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),fixture={} ;
const output=process.env.BB2_ANDROID_OUTPUT||path.join(os.tmpdir(),'bb2-android-acceptance');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/seed'){res.end('<html></html>');return}const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file===path.join(root,'index.html')&&process.env.BB2_ANDROID_APP_HTML?process.env.BB2_ANDROID_APP_HTML:file))});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-android-history-'));let context,page;const errors=[];
async function boot(origin,seed=false,blockModule=false){context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.BVOM_CHROMIUM_PATH||undefined,args:process.env.BVOM_CHROMIUM_PATH?['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']:['--no-sandbox'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true});context.setDefaultTimeout(15000);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());if(blockModule)await context.route('**/bb2/browser-core.mjs',r=>r.abort());await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-02T09:00:00Z'));if(seed){await page.goto(origin+'/seed');await page.evaluate(f=>{const id=f.data.bb2.opening.ownerId;localStorage.setItem('bvom_data',JSON.stringify(f.data));localStorage.setItem('bvom_data_owner',id);localStorage.setItem('bvom_entitlement_cache_'+id,JSON.stringify({userId:id,verifiedAt:new Date().toISOString(),record:{user_id:id,status:'complimentary'}}));},fixture);}await page.goto(origin+'/index.html');await page.waitForSelector('#app:not(.hidden)');await page.waitForFunction(()=>bvomWindowLockOwned);}
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bvom_data')));
const tab=name=>page.locator('.tab[data-tab="'+name+'"]').click();
const history=count=>require('./lib/bb2_mobile_history.cjs')(page,count);
(async()=>{fixture.data=await require('./fixtures/bb2-lower-b-history.cjs')();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
 await boot(origin,true);await history(18);const before=await stored();
 const original=await page.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));
 for(const width of [360,390]){
  await page.setViewportSize({width,height:844});
  const bb2=page.locator('#history > [data-bb2-history]').first(),bb1=page.locator('#history > [data-history-index="16"]');
  for(const card of [bb1,bb2]){
   if(await card.locator('.histSummary').getAttribute('aria-expanded')==='true')await card.locator('.histSummary').click();
   assert.equal((await card.textContent()).match(/Duration: 1:07/g)?.length,1,'collapsed duration occurs once');
   await card.locator('.histSummary').click();
   assert.equal((await card.textContent()).match(/Duration: 1:07/g)?.length,1,'expanded duration occurs once');
   assert.match(await card.textContent(),/Volume: 3240 kg/);
   for(const name of ['ADD NOTE','SHARE WORKOUT','DELETE WORKOUT'])assert.equal(await card.getByRole('button',{name,exact:true}).isVisible(),true);
  }
  const text=await bb2.textContent();assert.match(text,/9\/9 prescribed sets/);assert.match(text,/Hanging Knee Raise/);assert.ok(!text.includes('hanging_knee_raise'));assert.ok(!text.includes(' · none'));assert.equal(text.match(/Actual bodyweight 40 kg/g)?.length,1);
  assert.match(await bb2.locator('.histLift').filter({hasText:'Hanging Knee Raise'}).textContent(),/BW × 10 · BW × 10/);
  assert.match(text,/external load only/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await bb2.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'history-lower-b-'+width+'.png')});
  await bb2.getByRole('button',{name:'EDIT SETS',exact:true}).click();const modal=page.locator('[data-history-correction]');assert.equal(await modal.locator('[data-actual-bodyweight-kg]').count(),2);assert.equal(await modal.locator('[data-actual-bodyweight-kg]').first().inputValue(),'40');assert.match(await modal.textContent(),/hanging_knee_raise.*none/);await modal.locator('[data-close]').click();
  await bb2.locator('.histSummary').click();assert.equal(await bb2.locator('.histDetails').count(),0);
 }
 assert.deepEqual((await stored()).bb2,before.bb2,'display and inspection never write canonical data');
 await page.reload();await page.waitForSelector('#app:not(.hidden)');await history(18);const bb2=page.locator('#history > [data-bb2-history]').first();await bb2.locator('.histSummary').click();assert.match(await bb2.textContent(),/Volume: 3240 kg/);
 const after=await page.evaluate(()=>bvomBb2PreviewModule.foldBB2Block(state.bb2.opening,state.bb2.events));assert.deepEqual(after,original);assert.deepEqual(errors,[]);
 console.log('PASS actual Lower B 9/9, 1:07, 40 kg BW at 360/390: BB1 volume parity, single duration, clean summaries, details/controls, collapse/reload and unchanged journal/progression/credits');
}catch(e){if(page)await page.screenshot({path:path.join(output,'history-display-failure.png'),fullPage:true}).catch(()=>{});throw e}finally{if(context)await context.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});

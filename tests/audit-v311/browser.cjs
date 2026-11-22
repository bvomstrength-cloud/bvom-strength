'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('../bvom-lab/lib/bvom_harness');

const root = path.resolve(__dirname, '../..');
const app = H.boot(H.loadBuild(root));
H.configureLP(app);
const fixture = JSON.parse(app.ls.getItem('bvom_data'));
const today = new Date().toISOString();
const legacy = {
 date: today, day: 'B', program: 'lprpt', incomplete: true, unit: 'kg', duration: '18:32',
 session: { 'Overhead Press': {0:{load:30,reps:5}}, Deadlift:{0:{load:100,reps:5}} }
};
const newer = {
 ...legacy,
 session:{...legacy.session,'ACC:custom':{0:{load:15,reps:8}}},
 exerciseMeta:{
  'Overhead Press':{id:'core.overhead_press',name:'Overhead Press'},
  Deadlift:{id:'core.deadlift',name:'Deadlift'},
  'ACC:custom':{id:'accessory.custom',name:'Lat Pulldown'}
 }
};
Object.assign(fixture,{day:'B',language:'ja',history:[legacy,newer]});

(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/seed'){res.setHeader('Content-Type','text/html');return res.end('<html></html>');}
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  const mime=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream';
  res.setHeader('Content-Type',mime);res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.BVOM_CHROMIUM_PATH,args:['--no-sandbox']});
 try{
  async function context(locale){
   const ctx=await browser.newContext({locale,viewport:{width:320,height:844},isMobile:true,hasTouch:true});
   await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   return ctx;
  }
  for(const [locale,language] of [['ja-JP','ja'],['en-GB','en']]){
   const ctx=await context(locale), page=await ctx.newPage();await page.goto(origin);
   await page.waitForSelector('#authgate:not(.hidden)');
   await page.waitForFunction(()=>bvomWindowLockOwned);
   const initialData=await page.evaluate(()=>localStorage.getItem('bvom_data'));
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   assert.match(await page.locator('#authgate').innerText(),language==='ja'?/初めての方はこちら/:/NEW USER/);
   await page.locator('#authgate [onclick*="Choose"]').first().click();
   await page.locator('#bvomAuthGateEmail').fill('audit@example.invalid');
   await page.locator('[data-auth-language="'+(language==='ja'?'en':'ja')+'"]').click();
   assert.equal(await page.locator('#bvomAuthGateEmail').inputValue(),'audit@example.invalid');
   await page.evaluate(()=>{
    bvomAuthGate.email='audit@example.invalid';bvomAuthGate.codeSent=true;
    bvomRenderAuthGate();
   });
   await page.locator('#bvomAuthGateCode').fill('123456');
   await page.locator('[data-auth-language="'+language+'"]').click();
   assert.equal(await page.locator('#bvomAuthGateCode').inputValue(),'123456');
   assert.match(await page.locator('#authgate').innerText(),/audit@example.invalid/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('bvom_data')),initialData);
   await ctx.close();
  }
  console.log('PASS fresh JA/EN gate, email and verification draft across switching');

  const ctx=await context('ja-JP');
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(origin+'/seed');
  await page.evaluate(data=>{
   const owner='v311-test-owner';
   localStorage.setItem('bvom_data',JSON.stringify(data));
   localStorage.setItem('bvom_data_owner',owner);
   localStorage.setItem('bvom_entitlement_cache_'+owner,JSON.stringify({userId:owner,verifiedAt:new Date().toISOString(),record:{user_id:owner,status:'complimentary'}}));
  },fixture);
  await page.goto(origin);
  await page.waitForSelector('#app:not(.hidden)');
  await page.waitForFunction(()=>bvomWindowLockOwned&&!!navigator.serviceWorker.controller);
  const tab=name=>page.locator('.tab[data-tab="'+name+'"]').click();
  const raw=()=>page.evaluate(()=>localStorage.getItem('bvom_data'));
  await tab('history');
  for(const width of [320,390,430]){
   await page.setViewportSize({width,height:844});
   const row=page.locator('#history [data-history-index]').first(),summary=row.locator('.histSummary');
   if(await summary.getAttribute('aria-expanded')==='false')await summary.click();
   assert.match(await row.innerText(),/未完了[\s\S]*18:32[\s\S]*オーバーヘッドプレス[\s\S]*デッドリフト[\s\S]*Lat Pulldown/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  const shares=await page.evaluate(()=>state.history.map(bvomShareWorkoutText));
  for(const share of shares)assert.match(share,/オーバーヘッドプレス[\s\S]*デッドリフト/);
  assert.match(shares[1],/Lat Pulldown/);
  await tab('settings');
  await page.evaluate(()=>bvomShowServiceWorkerUpdate({waiting:{}}));
  const banner=page.locator('#bvomUpdateBanner');
  assert.match(await banner.innerText(),/更新して再読み込み/);
  await page.getByRole('button',{name:'English',exact:true}).click();
  assert.match(await banner.innerText(),/UPDATE & RELOAD/);
  await page.getByRole('button',{name:'日本語',exact:true}).click();
  assert.match(await banner.innerText(),/更新して再読み込み/);
  await tab('workout');
  const press=page.getByRole('button',{name:/オーバーヘッドプレス.*ワークセット 1.*未記録/}).first();
  await press.click();
  const dialog=page.getByRole('dialog',{name:/オーバーヘッドプレス · 第1セット/});
  assert.equal(await dialog.count(),1);
  await page.keyboard.press('Tab');
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.ok(await press.evaluate(el=>el===document.activeElement));
  await press.click();await dialog.getByRole('button',{name:'OK',exact:true}).click();
  assert.equal(await banner.isVisible(),false);
  const logged=await raw();
  await tab('settings');await page.getByRole('button',{name:'English',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await raw(),logged);
  await page.getByRole('button',{name:'日本語',exact:true}).click();
  assert.equal(await raw(),logged);
  await ctx.setOffline(true);await page.reload();
  await page.waitForSelector('#app:not(.hidden)');
  assert.equal(await page.locator('html').getAttribute('lang'),'ja');
  assert.deepEqual(JSON.parse(await raw()).session,JSON.parse(logged).session);
  assert.deepEqual(errors,[]);
  console.log('PASS legacy/metadata History and shares, custom name, dialog focus, 320/390/430, active switch and offline storage');
  await ctx.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

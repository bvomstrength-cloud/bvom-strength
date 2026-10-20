'use strict';
// Native Chromium controlled SW upgrade: v2.9.15 -> candidate, no fake worker events.
// Intentionally fails on old code which re-registers under a new query-string URL.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),
 http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const roots=[path.resolve('.bvom-production-v2915'),path.resolve('.')];
const targetSource=fs.readFileSync(path.resolve('index.html'),'utf8');
const targetBuild=targetSource.match(/const BVOM_BUILD='([^']+)'/)?.[1];
assert.ok(targetBuild,'target application build marker must exist');
let version=0,browser,server;
const contentType=n=>n.endsWith('.js')?'application/javascript':n.endsWith('.html')||n==='index.html'?'text/html':n.endsWith('.json')?'application/json':n.endsWith('.svg')?'image/svg+xml':n.endsWith('.png')?'image/png':'text/plain';
(async()=>{
 server=http.createServer((req,res)=>{
  const n=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'')||'index.html';
  if(n.includes('..')){res.writeHead(400);res.end();return}
  const full=path.join(roots[version],n);
  if(!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end('missing '+n);return}
  res.writeHead(200,{'Content-Type':contentType(n),'Cache-Control':'no-store'});
  res.end(fs.readFileSync(full));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'allow'});
  const page=await context.newPage();
  await page.goto(origin+'/index.html');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.includes('2.9.15'),null,{timeout:15000});
  assert.ok((await page.locator('header').textContent()).includes('2.9.15'),'initial controlled version');
  version=1;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
  await page.locator('#bvomUpdateBanner [data-bvom-update]').waitFor({state:'visible',timeout:15000});
  await page.locator('#bvomUpdateBanner [data-bvom-update]').click();
  await page.waitForFunction(()=>document.querySelector('header')?.textContent.includes(targetBuild),null,{timeout:15000});
  await page.waitForTimeout(1700);
  const after=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return{
   build:document.querySelector('header')?.textContent,
   banner:document.getElementById('bvomUpdateBanner')?.style.display,
   waiting:r?.waiting?.scriptURL||null,
   active:r?.active?.scriptURL||null,
   controller:navigator.serviceWorker.controller?.scriptURL||null,
   regs:(await navigator.serviceWorker.getRegistrations()).length
  }});
  assert.equal(after.waiting,null,'a second SW registration must not queue another update');
  assert.ok(after.banner!=='flex','a second update banner must not appear');
  assert.equal(after.regs,1,'single scope registration');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('header')?.textContent.includes(targetBuild));
  assert.equal(await page.locator('#bvomUpdateBanner').count(),0,'reloaded current shell remains update-free');
  console.log('PASS native Chromium: one tap 2.9.15 to '+targetBuild+', fresh shell, no second update prompt',after);
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});

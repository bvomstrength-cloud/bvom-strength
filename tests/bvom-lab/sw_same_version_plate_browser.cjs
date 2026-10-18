'use strict';
// Regression: earlier v2.9.16 -> revised v2.9.16 must install a NEW SW
// despite identical public BUILD text. Tests native Chromium cache and prompt.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),
 http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const roots=[path.resolve('.bvom-v2916-before-plates'),path.resolve('.')];
let revision=0,server,browser;
const mime=n=>n.endsWith('.js')?'application/javascript':n.endsWith('.html')||n==='index.html'?'text/html':n.endsWith('.json')?'application/json':'application/octet-stream';
(async()=>{
 server=http.createServer((req,res)=>{
  const n=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'')||'index.html';
  if(n.includes('..')){res.writeHead(400);res.end();return}
  const file=path.join(roots[revision],n);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('missing');return}
  res.writeHead(200,{'Content-Type':mime(n),'Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({serviceWorkers:'allow'}),page=await ctx.newPage();
  const url='http://127.0.0.1:'+server.address().port+'/index.html';
  await page.goto(url);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await page.evaluate(()=>typeof bvomBbWarmPlateText),'undefined','prior v2.9.16 must not already have plate maths');
  const old=await page.evaluate(async()=>{
   const r=await navigator.serviceWorker.getRegistration();
   return {active:r?.active?.scriptURL,cache:await caches.keys()};
  });
  assert.ok(old.cache.includes('bvom-2.9.16'),'first test build installed original cache');
  revision=1;
  await page.evaluate(async()=>{
   const r=await navigator.serviceWorker.getRegistration();
   await r.update();
  });
  await page.locator('#bvomUpdateBanner [data-bvom-update]').waitFor({state:'visible',timeout:15000});
  await page.locator('#bvomUpdateBanner [data-bvom-update]').click();
  await page.waitForFunction(()=>typeof bvomBbWarmPlateText==='function',null,{timeout:15000});
  const after=await page.evaluate(async()=>{
   const r=await navigator.serviceWorker.getRegistration();
   return {build:document.querySelector('header')?.textContent,waiting:r?.waiting?.scriptURL||null,
    caches:await caches.keys(),functionPresent:typeof bvomBbWarmPlateText==='function',
    plates:bvomBbWarmPlateText('high_bar_squat',102.5),banner:document.getElementById('bvomUpdateBanner')?.style.display};
  });
  assert.equal(after.waiting,null,'no duplicate waiting worker');
  assert.ok(after.functionPresent&&after.plates.includes('per side'),'revised app shell loaded from new SW cache');
  assert.ok(after.caches.includes('bvom-2.9.16-plates1'),'new revision-specific precache exists');
  assert.ok(!after.caches.includes('bvom-2.9.16'),'old precache replaced');
  assert.ok(after.banner!=='flex','no second prompt');
  await page.reload();
  assert.equal(await page.evaluate(()=>typeof bvomBbWarmPlateText),'function','new app persists after reload');
  console.log('PASS SAME-VERSION UPGRADE: original v2.9.16 -> plate-math v2.9.16, native Chromium one tap, new precache, no data clearing or second prompt');
  await ctx.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});

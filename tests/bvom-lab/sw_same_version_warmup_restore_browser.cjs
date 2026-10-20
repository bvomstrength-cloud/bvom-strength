'use strict';
// Real Chromium upgrade of the two previously distributed v2.9.16 test builds
// to the CURRENT release candidate must preserve data, the weight editor,
// guidance-only warm-ups, and one-tap service-worker behaviour.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
 http=require('node:http'),{chromium}=require('playwright');
const candidateBuild=fs.readFileSync(path.resolve('index.html'),'utf8').match(/const BVOM_BUILD='([^']+)'/)?.[1];
const candidateCache=fs.readFileSync(path.resolve('sw.js'),'utf8').match(/const CACHE = '([^']+)'/)?.[1];
assert.ok(candidateBuild&&candidateCache,'candidate version/cache markers');
const oldRoots=[
 {name:'initial v2.9.16',dir:'.bvom-v2916-first',cache:'bvom-2.9.16',hadPlate:false},
 {name:'v2.9.16 plate-math test',dir:'.bvom-v2916-plates1',cache:'bvom-2.9.16-plates1',hadPlate:true}
];
let source=0,browser,server;
const mime=n=>n.endsWith('.js')?'application/javascript':n.endsWith('.html')?'text/html':n.endsWith('.json')?'application/json':'application/octet-stream';
(async()=>{
 server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const n=pathname.replace(/^\/+/,'')||'index.html';
  if(n.includes('..')){res.writeHead(400);res.end();return}
  const full=path.join(source===2?path.resolve('.'):path.resolve(oldRoots[source].dir),n);
  if(!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end('missing '+n);return}
  res.writeHead(200,{'Content-Type':mime(n),'Cache-Control':'no-store'});res.end(fs.readFileSync(full));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch({headless:true});
  for(let i=0;i<oldRoots.length;i++){
   const old=oldRoots[i];source=i;
   const context=await browser.newContext({serviceWorkers:'allow'});
   const page=await context.newPage();
   await page.goto(origin+'/index.html');
   await page.evaluate(()=>navigator.serviceWorker.ready);
   await page.reload();
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
   const installed=await page.evaluate(async()=>({
     caches:await caches.keys(),hasPlate:typeof bvomBbWarmPlateText==='function',
     hasWeightEditor:typeof bvomBbEditWorkingWeight==='function'
   }));
   assert.equal(installed.hasPlate,old.hadPlate,'old plate-maths behaviour');
   assert.ok(installed.hasWeightEditor,'already-shipped v2.9.16 weight editor');
   assert.ok(installed.caches.includes(old.cache),'old service-worker cache');
   await page.evaluate(()=>{localStorage.setItem('bvom-test-preserve','intact');window.__beforeUpgradeMarker='old'});
   source=2;
   await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
   await page.locator('#bvomUpdateBanner [data-bvom-update]').waitFor({state:'visible',timeout:15000});
   await page.locator('#bvomUpdateBanner [data-bvom-update]').click();
   await page.waitForFunction(()=>window.__beforeUpgradeMarker!=='old',null,{timeout:15000});
   await page.waitForFunction(async(expected)=> (await caches.keys()).includes(expected),candidateCache,{timeout:15000});
   await page.waitForTimeout(1200);
   const updated=await page.evaluate(async()=>{
    const r=await navigator.serviceWorker.getRegistration();
    return {caches:await caches.keys(),waiting:r?.waiting?.scriptURL||null,
      hasPlate:typeof bvomBbWarmPlateText==='function',
      hasWeightEditor:typeof bvomBbEditWorkingWeight==='function',
      sentinel:localStorage.getItem('bvom-test-preserve'),
      banner:document.getElementById('bvomUpdateBanner')?.style.display,
      build:document.querySelector('header')?.textContent};
   });
   assert.equal(updated.hasPlate,false,'no Bodybuilding plate calculation after rollback');
   assert.equal(updated.hasWeightEditor,true,'working-weight edit preserved');
   assert.equal(updated.sentinel,'intact','local storage preserved');
   assert.ok(updated.caches.includes(candidateCache),'new worker precache');
   assert.ok(!updated.caches.includes(old.cache),'old cache removed after activation');
   assert.equal(updated.waiting,null,'no second waiting worker');
   assert.ok(updated.banner!=='flex','no second update banner');
   assert.ok(updated.build.includes(candidateBuild),'public build matches release candidate');
   await page.reload();
   assert.equal(await page.evaluate(()=>typeof bvomBbWarmPlateText),'undefined','plate math absent after another reload');
   console.log('PASS native Chromium '+old.name+' -> guidance-only '+candidateBuild+': one tap, fresh cache, weight editor retained, no plate math or data loss');
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});

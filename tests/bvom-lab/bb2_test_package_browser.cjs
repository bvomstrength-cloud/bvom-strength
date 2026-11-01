'use strict';
// Browser proof of the actual packaged candidate, including automatic test entry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const {packageBB2Test}=require('../../scripts/package-bb2-test.cjs');
const H=require('./lib/bvom_harness');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bb2-pack-browser-'));
(async()=>{
 let browser;
 try{
  const output=path.join(temp,'site');packageBB2Test({sourceSha:'1234567890abcdef1234567890abcdef12345678',output,zipFile:path.join(temp,'test.zip')});
  const h=H.boot(H.loadBuild(root));H.configureLP(h);const fixture=JSON.parse(h.ls.getItem('bvom_data'));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  context.setDefaultTimeout(10000);
  const allowed=new Set(['bb2-package-proof.netlify.app','app.bvomstrength.com']);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(!allowed.has(u.hostname))return route.abort();
   if(u.pathname==='/seed')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Disposable test data</title>'});
   const file=path.resolve(output,'.'+(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream',body:fs.readFileSync(file)});
  });
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const host of allowed){
   const origin='https://'+host;await page.goto(origin+'/seed');
   await page.evaluate(data=>{
    localStorage.setItem('bvom_data',JSON.stringify(data));localStorage.setItem('bvom_data_owner','bb2-package-owner');
    localStorage.setItem('bvom_entitlement_cache_bb2-package-owner',JSON.stringify({userId:'bb2-package-owner',verifiedAt:new Date().toISOString(),record:{user_id:'bb2-package-owner',status:'complimentary'}}));
   },fixture);
   await page.goto(origin+'/index.html');await page.waitForSelector('#app:not(.hidden)');
   await page.evaluate(()=>showSetup());
   if(host==='app.bvomstrength.com'){
    assert.equal(await page.locator('#setup [data-bb2-preview]').count(),0,'even a marked package stays disabled on production host');continue;
   }
   assert.match(page.url(),/bb2Preview=1/,'package opens BB2 without a hand-edited URL');
   await page.locator('#setup [data-bb2-preview]').click();await page.waitForSelector('#setup [data-bb2-template]');
   for(const [day,count] of Object.entries({upper_a:10,lower_a:10,upper_b:13,lower_b:9}))
    assert.match(await page.locator('#setup [data-bb2-template="'+day+'"]').textContent(),new RegExp(count+' working sets'));
   for(const selector of ['[data-bb2-curls-a]','[data-bb2-curls]'])await page.locator('#setup '+selector).click();
   assert.match(await page.locator('#setup [data-bb2-template="upper_a"]').textContent(),/12 working sets/);
   assert.match(await page.locator('#setup [data-bb2-template="upper_b"]').textContent(),/15 working sets/);
   await page.locator('#setup [data-bb2-save]').click();await page.reload();await page.waitForSelector('#app:not(.hidden)');
   await page.evaluate(()=>showSetup());await page.locator('#setup [data-bb2-preview]').click();
   await page.waitForSelector('#setup [data-bb2-start]');
   assert.equal(await page.locator('#setup [data-bb2-curls-a]').isChecked(),true);
   assert.equal(await page.locator('#setup [data-bb2-curls]').isChecked(),true);
   assert.equal(await page.evaluate(()=>bvomCloudPayload().bb2),undefined,'package excludes BB2 training from legacy cloud');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS actual BB2 packaged mobile browser: 42-set plan, independent curls, offline reload, cloud exclusion and production-host refusal');
 }finally{if(browser)await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

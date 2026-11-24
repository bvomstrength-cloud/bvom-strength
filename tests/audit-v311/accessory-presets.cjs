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
Object.assign(fixture,{day:'B',language:'ja',history:[]});

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
   const ctx=await browser.newContext({locale,viewport:{width:320,height:844},acceptDownloads:true,isMobile:true,hasTouch:true});
   await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   return ctx;
  }
  async function scenario(mode, preset, text='Biceps Curl'){
   const ctx=await context('ja-JP');
   await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
   const p=await ctx.newPage();await p.goto(origin+'/seed');
   await p.evaluate(({fixture,mode})=>{
    const id='accessory-audit-owner';
    const d={...fixture,programMode:mode,day:mode==='hlm'?'H':mode==='fourday'?'1':'B'};
    if(mode==='bodybuilding'){
     d.day='A';d.bodybuilding.status='active';d.bodybuilding.startedAt='2026-11-22T00:00:00Z';
    }
    localStorage.setItem('bvom_data',JSON.stringify(d));
    localStorage.setItem('bvom_data_owner',id);
    localStorage.setItem('bvom_entitlement_cache_'+id,JSON.stringify({userId:id,verifiedAt:new Date().toISOString(),record:{user_id:id,status:'complimentary'}}));
   },{fixture,mode});
   await p.goto(origin);await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned);
   await p.evaluate(()=>openAccessoryBuilder());
   const selection=p.locator('#accName');
   const picker=await selection.locator('option').evaluateAll((options,name)=>options.find(o=>o.value===name)?.textContent,text);
   await selection.selectOption(preset?text:'Custom');
   if(!preset)await p.locator('#accCustom').fill(text);
   await p.locator('#accEquipment').selectOption('machine');
   if(mode==='lprpt')await p.locator('#accAssign').selectOption('Both');
   await p.evaluate(()=>{newAccessoryId=()=> 'acc_audit_identity';document.querySelector('#accSave').click()});
   if(mode==='lprpt'&&text==='Biceps Curl'){
    for(let i=0;i<3;i++){
     await p.evaluate(i=>tapAccessory('acc_audit_identity',i),i);
     await p.locator('.bvomModalOverlay [data-ok]').click();
    }
    await p.evaluate(()=>finishWorkout());
    await p.locator('.bvomModalOverlay [data-finish],.bvomModalOverlay [data-r]').click();
    await p.locator('.bvomModalOverlay [data-save]').click();
    const actual=await p.evaluate(()=>state.history.at(-1));
    assert.equal(actual.incomplete,true);
    assert.equal(actual.volume,480);
    assert.equal(!!actual.exerciseMeta['ACC:acc_audit_identity'].accessoryPresetId,preset);
    await p.locator('.bvomModalOverlay [data-ok]').click();
   }
   const evidence=await p.evaluate(({preset,picker,text})=>{
    const accessory=state.accessoryList[0],key='ACC:'+accessory.id;
    const session={[key]:{0:{load:12.5,reps:10},1:{load:12,reps:10},2:{load:12,reps:10}}};
    const record={date:new Date().toISOString(),day:state.day,program:state.programMode,unit:'kg',duration:'9:16',volume:4477.5,session,accessoryNames:{[accessory.id]:accessory.name},exerciseMeta:bvomHistoryExerciseMeta(session)};
    state.history=[record];save({localOnly:true});renderAll();activateTab('history');
    document.querySelector('#history .histSummary').click();
    const raw=localStorage.getItem('bvom_data'),payload=JSON.stringify(bvomCloudPayload());
    const samples=[];
    for(const lang of ['ja','en','ja']){
     changeLanguage(lang);
     if(!document.querySelector('#history .histLift'))document.querySelector('#history .histSummary').click();
     const expected=lang==='ja'&&preset?picker:text;
     const active=[...document.querySelectorAll('#workout .exname')].some(e=>e.textContent===expected);
     samples.push({
      lang:bvomLocale(),expected,history:document.querySelector('#history .histLift').textContent,
      active,share:bvomShareWorkoutText(record).split('\n').find(l=>l===expected),
      rawUnchanged:raw===localStorage.getItem('bvom_data'),
      payloadUnchanged:payload===JSON.stringify(bvomCloudPayload())
     });
     if(document.documentElement.scrollWidth>innerWidth)throw Error('320px overflow');
    }
    const cloud=JSON.parse(payload);
    return {accessory,meta:record.exerciseMeta[key],cloudAccessory:cloud.accessoryList[0],cloudHistory:cloud.history[0].exerciseMeta[key],samples};
   },{preset,picker,text});
   assert.ok(evidence.samples.every(x=>x.history.includes(x.expected)&&x.share===x.expected&&x.active&&x.rawUnchanged&&x.payloadUnchanged));
   assert.equal(evidence.accessory.name,text);
   assert.equal(evidence.meta.name,text);
   assert.equal(!!evidence.accessory.accessoryPresetId,preset);
   assert.equal(evidence.accessory.accessoryPresetId,evidence.meta.accessoryPresetId);
   if(mode==='lprpt'&&text==='Biceps Curl'){
    for(const width of [320,390,430]){
     await p.setViewportSize({width,height:844});
     for(const language of ['en','ja']){
      assert.equal(await p.evaluate(language=>{changeLanguage(language);return bvomLocale()},language),language);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.ok((await p.locator('#history').textContent()).includes(language==='ja'&&preset?picker:text));
     }
    }
    const download=p.waitForEvent('download');
    await p.evaluate(()=>exportBackup());
    const file=await download,backup=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
    assert.deepEqual(backup.data.accessoryList[0],evidence.accessory);
    const expected=backup.data.history[0];
    const legacy={...expected,exerciseMeta:undefined};
    backup.data.history.push(legacy);
    await p.evaluate(()=>{activateTab('settings')});
    await p.locator('#settings input[type=file]').setInputFiles({name:'legacy-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await p.locator('.bvomModalOverlay [data-r]').click();
    await p.waitForLoadState();await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned);
    assert.deepEqual(await p.evaluate(()=>state.history[0]),expected);
    assert.ok((await p.evaluate(()=>bvomShareWorkoutText(state.history[0]))).split('\n').includes(preset?picker:text));
    assert.ok((await p.evaluate(()=>bvomShareWorkoutText(state.history[1]))).split('\n').includes(text));
    await p.evaluate(()=>{
     const payload=bvomCloudPayload();
     bvomCloud.offlineLocalAccess=false;
     bvomCloud.client={from(){
      const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[{data:payload}]})};
      return q;
     }};
    });
    await p.evaluate(()=>bvomCloudRestore());
    await p.locator('.bvomModalOverlay [data-r]').click();
    await p.waitForLoadState();await p.waitForSelector('#app:not(.hidden)');await p.waitForFunction(()=>bvomWindowLockOwned);
    assert.deepEqual(await p.evaluate(()=>state.history[0]),expected);
    assert.ok((await p.evaluate(()=>bvomShareWorkoutText(state.history[0]))).split('\n').includes(preset?picker:text));
    assert.ok((await p.evaluate(()=>bvomShareWorkoutText(state.history[1]))).split('\n').includes(text));
    await p.evaluate(()=>openAccessoryBuilder('acc_audit_identity'));
    assert.equal(await p.locator('#accName').inputValue(),preset?text:'Custom');
    if(preset){
     await p.locator('#accName').selectOption('Custom');
     await p.locator('#accCustom').fill(text);
     await p.locator('#accSave').click();
     assert.equal(await p.evaluate(()=>state.accessoryList[0].accessoryPresetId),undefined);
     assert.ok((await p.evaluate(()=>bvomShareWorkoutText(state.history[0]))).split('\n').includes(picker));
    }
    console.log('PASS file/cloud restore and independent legacy History',preset?'preset':'custom','EN/JA at 320/390/430');
   }
   await ctx.close();
   return {picker,...evidence};
  }
  for(const mode of ['lprpt','hlm','fourday','bodybuilding']){
   const selected=await scenario(mode,true),typed=await scenario(mode,false);
   const withoutPreset=({accessoryPresetId,...fields})=>fields;
   assert.deepEqual(withoutPreset(selected.accessory),withoutPreset(typed.accessory));
   assert.deepEqual(withoutPreset(selected.meta),withoutPreset(typed.meta));
   assert.deepEqual(withoutPreset(selected.cloudAccessory),withoutPreset(typed.cloudAccessory));
   assert.deepEqual(withoutPreset(selected.cloudHistory),withoutPreset(typed.cloudHistory));
   console.log('PASS',mode,selected.samples.map(s=>s.share).join(' / '),'| custom',typed.samples.map(s=>s.share).join(' / '));
  }
  for(const name of ['Lat Pulldown','Dumbbell Row']){
   const selected=await scenario('lprpt',true,name),typed=await scenario('lprpt',false,name);
   assert.notEqual(selected.samples[0].share,typed.samples[0].share);console.log('PASS preset/custom collision',name);
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

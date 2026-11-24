'use strict';
const assert=require('node:assert/strict');
const P=require('../monkey-v304/platform.cjs');
const O=require('./oracle.cjs');

const names=['Squat','Bench Press','Prone Row'];
const owner={id:'e2e-audit-owner',email:'audit@example.invalid'};
const originalWeights={Squat:110,'Bench Press':80,'Prone Row':80};
const drops={Squat:10,'Bench Press':5,'Prone Row':5};
const seeded=profile=>{
 const state=P.fixture(profile);
 for(const n of names)Object.assign(state.core[n],{mode:'straight',drop:drops[n]});
 return state;
};
const profile=width=>({name:'E2E',mode:'lprpt',width,weights:{...originalWeights,'Overhead Press':45,Deadlift:120}});
const parseRows=(card)=>card.locator('.setwrap').evaluateAll(elements=>elements.map(element=>{
 const m=element.querySelector('.setload').textContent.match(/^([\d.]+)×(\d+)(\+?)/);
 return [Number(m[1]),Number(m[2]),Boolean(m[3]),element.querySelector('.extraLabel')?.textContent==='RPT'];
}));
const card=(page,lift)=>page.locator('#work-'+lift.replace(/\W/g,''));
const dialog=page=>page.locator('.bvomModalOverlay').last();
const entry=(page,lift,index)=>card(page,lift).locator(`button[onclick="tapSet('${lift}',${index})"]`);
async function edit(page,lift,sets,reps){
 await P.tab(page,'workout');
 await card(page,lift).locator('.weight').click();
 await dialog(page).locator('[data-fixed-sets]').fill(String(sets));
 await dialog(page).locator('[data-fixed-reps]').fill(String(reps));
 await dialog(page).locator('[data-s]').evaluate(el=>{el.click();el.click()});
}
async function record(page,lift,index,reps){
 await P.settle(page);
 await P.tab(page,'workout');
 await entry(page,lift,index).click();
 await P.rep(page,reps);
}

// Disposable transport attached to real browser contexts. Every external origin
// is rejected. Both devices execute the actual Settings backup and restore code.
async function cloudDevice(platform,transport,width){
 const context=await platform.browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 context.setDefaultTimeout(7000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===platform.origin?route.continue():route.abort());
 await context.exposeBinding('__auditCloud',(_source,{table,verb,value})=>{
  if(table!=='bvom_data')return {data:[],error:null};
  if(verb==='insert'||verb==='update'){
   transport.row={id:1,created_at:'2026-01-01T00:00:00Z',data:value.data};
   return {data:{id:1},error:null};
  }
  return {data:transport.row?[transport.row]:[],error:null};
 });
 await context.route('**/vendor/supabase-js-*.js',route=>route.fulfill({contentType:'text/javascript',body:`
   window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:${JSON.stringify(owner)},access_token:'audit-only'}}}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    rpc:async()=>({data:[{status:'complimentary',user_id:${JSON.stringify(owner.id)}}],error:null}),
    from(table){
     let verb='read',value;
     const query=new Proxy({},{get(_,key){
      if(key==='then')return (resolve,reject)=>window.__auditCloud({table,verb,value}).then(resolve,reject);
      if(key==='insert'||key==='update')return input=>{verb=key;value=input;return query};
      return ()=>query;
     }});
     return query;
    }
   })};`}));
 const page=await context.newPage();
 await page.goto(platform.origin+'/seed');
 await page.evaluate(({data,id})=>{
  localStorage.setItem('bvom_data',JSON.stringify(data));
  localStorage.setItem('bvom_data_owner',id);
 },{data:seeded(profile(width)),id:owner.id});
 await page.goto(platform.origin);
 await P.ready(page);
 await page.waitForFunction(()=>bvomCloud.startupState==='VERIFIED'&&!bvomCloud.assessing);
 return {page,context};
}

async function control(platform){
 const transport={row:null};
 const first=await cloudDevice(platform,transport,390);
 try{
  const {page}=first;
  await edit(page,'Bench Press',3,6);
  await edit(page,'Squat',3,8);
  await edit(page,'Squat',3,5);
  const configured=await P.stored(page);
  assert.deepEqual(configured.fixedWorkingSets.lprpt['Bench Press'],{sets:3,reps:6});
  assert.equal(configured.fixedWorkingSets.lprpt.Squat,undefined);
  assert.equal(configured.fixedWorkingSets.lprpt['Prone Row'],undefined);
  for(const [index,delta] of [[0,0],[1,1]]){
   for(const [lift,reps] of [['Prone Row',5],['Bench Press',6],['Squat',5]])await record(page,lift,index,reps-delta);
  }
  const expected={
   'Prone Row':[[80,5,5],[80,4,5],[75,5,5]],
   'Bench Press':[[80,6,6],[80,5,6],[75,6,6]],
   Squat:[[110,5,5],[110,4,5],[100,5,5]]
  };
  for(const [lift,sets] of Object.entries(expected)){
   assert.deepEqual((await parseRows(card(page,lift))).at(-1),[sets[2][0],sets[2][2],true,true],lift);
  }
  await page.reload();await P.ready(page);await page.waitForFunction(()=>bvomCloud.startupState==='VERIFIED');
  for(const [lift,sets] of Object.entries(expected)){
   assert.deepEqual((await parseRows(card(page,lift))).at(-1),[sets[2][0],sets[2][2],true,true],lift);
   await record(page,lift,2,sets[2][1]);
  }
  await P.finish(page,'Three Android controls');
  const stored=await P.stored(page);
  assert.equal(stored.history.length,1);
  for(const [lift,sets] of Object.entries(expected))
   assert.deepEqual(Object.values(stored.history[0].session[lift]).map(set=>[set.load,set.reps,set.target]),sets);
  assert.deepEqual(Object.fromEntries(names.map(n=>[n,stored.weights[n]])),originalWeights);
  if(await page.locator('#bvomCloudConflictOverlay [data-settings]').count())await page.locator('#bvomCloudConflictOverlay [data-settings]').click();
  await P.tab(page,'settings');
  await page.locator('[onclick="bvomCloudSaveNow()"]').click();
  await page.waitForFunction(()=>!bvomCloud.busy&&!bvomCloud.error);
  assert.equal(transport.row.data.history.length,1);
  assert.deepEqual(transport.row.data.history,stored.history);
  const second=await cloudDevice(platform,transport,430);
  try{
   if(await second.page.locator('#bvomCloudConflictOverlay [data-settings]').count())await second.page.locator('#bvomCloudConflictOverlay [data-settings]').click();
   await P.tab(second.page,'settings');
   await second.page.locator('[onclick="bvomCloudRestore()"]').click();
   const confirmation=dialog(second.page);
   await confirmation.getByRole('heading',{name:/restore from bvom cloud/i}).waitFor();
   await Promise.all([second.page.waitForEvent('load'),confirmation.locator('[data-r]').click()]);
   await P.ready(second.page);
   const restored=await P.stored(second.page);
   assert.deepEqual(restored.history,stored.history);
   assert.deepEqual(restored.fixedWorkingSets,stored.fixedWorkingSets);
   await P.tab(second.page,'history');
   assert.match(await second.page.locator('#history').innerText(),/Three Android controls/);
  }finally{await second.context.close()}
  console.log('PASS all three Android controls through UI, persisted configuration, reload, History, cloud write and explicit restore on device two');
 }finally{await first.context.close()}
}

async function randomRuns(platform,width,seed){
 const roll=O.random(seed);
 let actions=0,checks=0;
 const count=Number(process.env.BVOM_BROWSER_WORKOUTS??8);
 for(let run=0;run<count;run++){
  const {page,context}=await platform.device(profile(width),{data:seeded(profile(width))});
  try{
   const lifts={};
   for(const [index,name] of names.entries()){
    const policy=(run+index)%3;
    const sets=roll(1,5),reps=roll(2,10);
    lifts[name]={sets:3,reps:5,weight:originalWeights[name],drop:drops[name],grid:2.5,actual:[],edited:false};
    if(policy!==0){
     await edit(page,name,sets===3&&reps===5?4:sets,reps);
     if(policy===2)await edit(page,name,3,5);
     else Object.assign(lifts[name],{sets:sets===3&&reps===5?4:sets,reps,edited:true});
    }
    lifts[name].miss=roll(-1,lifts[name].sets-1);
   }
   let next;
   while((next=names.filter(name=>lifts[name].actual.length<O.rows(lifts[name]).length)).length){
    const name=next[roll(0,next.length-1)],lift=lifts[name],i=lift.actual.length,[load,target]=O.rows(lift)[i];
    const reps=i===lift.miss?roll(0,target-1):i>lift.miss&&lift.miss>=0&&i<lift.sets&&roll(0,3)===0?0:target;
    await record(page,name,i,reps);
    lift.actual.push({load,target,reps});actions++;
    for(const n of names){
     const expected=O.rows(lifts[n]).map(([load,reps,amrap,rpt],i)=>[lifts[n].actual[i]?.load??load,reps,amrap,rpt]);
     assert.deepEqual(await parseRows(card(page,n)),expected,`${seed}/${run}/${name}/${i} → ${n}`);checks++;
    }
    if(run%2===0&&i===0&&name==='Squat'){await page.reload();await P.ready(page);}
   }
   await P.finish(page,'Seed '+seed+' run '+run);
   const saved=await P.stored(page);
   assert.equal(saved.history.length,1);
   for(const name of names){
    const rows=Object.values(saved.history[0].session[name]).map(({target,load,reps})=>({target,load,reps}));
    assert.deepEqual(rows,lifts[name].actual);
    assert.equal(saved.weights[name],lifts[name].weight+(O.result(lifts[name])==='increase'?2.5:0));
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }finally{await context.close()}
 }
 console.log(JSON.stringify({width,seed,workouts:count,liftSequences:count*3,actions,checks}));
}

async function staleEditors(platform){
 const {page,context}=await platform.device(profile(390),{data:seeded(profile(390))});
 try{
  // Deliberately keep both real DOM dialogs to simulate a re-entrant weight
  // action. Dispatching a click on the card bypasses the overlay hit-test.
  await card(page,'Squat').locator('.weight').evaluate(el=>{el.click();el.click()});
  const dialogs=page.locator('.bvomModalOverlay');
  await dialogs.nth(0).locator('[data-fixed-sets]').fill('5');
  await dialogs.nth(0).locator('[data-fixed-reps]').fill('3');
  await dialogs.nth(1).locator('[data-fixed-reps]').fill('8');
  await dialogs.nth(1).locator('[data-s]').click();
  const before=await P.stored(page);
  assert.deepEqual(before.fixedWorkingSets.lprpt.Squat,{sets:3,reps:8});
  await dialogs.nth(0).locator('[data-s]').click();
  assert.deepEqual((await P.stored(page)).fixedWorkingSets,before.fixedWorkingSets,
   'a stale weight/prescription modal must not overwrite the newer save');
  console.log('PASS re-entrant stale weight/prescription dialog');
 }finally{await context.close()}
}

async function lifecycleAttacks(platform){
 const data=seeded(profile(390));
 data.weights.Squat=62.5;
 const {page,context}=await platform.device(profile(390),{data});
 try{
  await edit(page,'Prone Row',1,1);
  await record(page,'Prone Row',0,1);
  assert.equal((await P.stored(page)).weights['Prone Row'],82.5);
  await entry(page,'Prone Row',0).click();
  await dialog(page).locator('[data-c]').click();
  const cleared=await P.stored(page);
  assert.equal(cleared.weights['Prone Row'],80);
  assert.equal(cleared.workoutStartedAt,null);
  await edit(page,'Prone Row',1,8);
  await record(page,'Prone Row',0,8);
  await card(page,'Prone Row').locator('.weight').click();
  await dialog(page).locator('[data-w]').fill('100');
  await dialog(page).locator('[data-s]').click();
  const changed=await P.stored(page);
  assert.equal(changed.session['Prone Row'][0].load,80);
  assert.equal(changed.weights['Prone Row'],100);
  assert.match(await card(page,'Prone Row').innerText(),/BELOW CURRENT LOAD/);
  await entry(page,'Prone Row',0).click();
  await dialog(page).locator('[data-c]').click();
  await edit(page,'Squat',2,8);
  await record(page,'Squat',0,8);
  await P.tab(page,'settings');
  await page.locator("button[onclick=\"changeUnits('lb')\"]").click();
  await dialog(page).locator('[data-change]').click();
  await P.tab(page,'workout');
  const first=(await P.stored(page)).session.Squat[0];
  assert.ok(first.load>137&&first.load<138);
  await record(page,'Squat',1,8);
  assert.equal((await P.stored(page)).weights.Squat,145);
  await P.tab(page,'settings');
  await page.locator("button[onclick=\"changeUnits('kg')\"]").click();
  await dialog(page).locator('[data-change]').click();
  await P.tab(page,'workout');
  assert.equal((await P.stored(page)).session.Squat[0].load,62.5);
  // A rep dialog opened under a different live prescription may no longer save.
  await entry(page,'Bench Press',0).evaluate(el=>el.click());
  await card(page,'Bench Press').locator('.weight').evaluate(el=>el.click());
  await dialog(page).locator('[data-fixed-reps]').fill('8');
  await dialog(page).locator('[data-s]').click();
  await dialog(page).locator('[data-ok]').click();
  assert.equal((await P.stored(page)).session['Bench Press'][0],undefined);
  // Partial workout survives true browser reload, then double Finish is idempotent.
  await page.reload();await P.ready(page);
  assert.equal((await P.stored(page)).session.Squat[0].reps,8);
  await P.tab(page,'workout');
  await page.locator('#timerbar .finish').evaluate(button=>{button.click();button.click()});
  assert.equal(await page.locator('.bvomModalOverlay [data-finish]').count(),1);
  await dialog(page).locator('[data-finish]').click();
  await dialog(page).locator('[data-note]').fill('Audit repeated Finish');
  await dialog(page).locator('[data-save]').evaluate(el=>{el.click();el.click()});
  await P.settle(page);
  assert.equal((await P.stored(page)).history.length,1);
  console.log('PASS browser unit round-trip, stale rep entry, reload and repeated Finish');
 }finally{await context.close()}
}
async function main(){
 const platform=await P.start();
 try{
  if(process.argv[2]==='stale')return await staleEditors(platform);
  if(process.argv[2]!=='random'){await control(platform);await staleEditors(platform);await lifecycleAttacks(platform);}
  if(process.argv[2]!=='control'){
   const outcomes=await Promise.allSettled([[320,713320],[390,713390],[430,713430]].map(args=>randomRuns(platform,...args)));
   for(const outcome of outcomes)if(outcome.status==='rejected')throw outcome.reason;
  }
 }finally{await platform.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});

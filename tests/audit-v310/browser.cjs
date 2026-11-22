'use strict';

const assert=require('node:assert/strict');
const P=require('../monkey-v304/platform.cjs');
const O=require('./oracle.cjs');

async function main(){
 const server=await P.start();
 const cases=[];
 try{
  for(const [width,seed] of [[320,311320],[390,311390],[430,311430]]){
   const roll=O.random(seed);
   const {page,context}=await server.device({name:'Audit',mode:'lprpt',width});
   try{
    const card=lift=>page.locator('#work-'+lift.replace(/\W/g,''));
    const dialog=()=>page.locator('.bvomModalOverlay').last();
    const row=(lift,index)=>card(lift).locator(`button[onclick="tapSet('${lift}',${index})"]`);
    const begin=async lift=>{
     await P.tab(page,'workout');
     await card(lift).locator('.weight').click();
    };
    const raw=()=>page.evaluate(()=>localStorage.getItem('bvom_data'));
    await begin('Squat');
    for(const invalid of ['0','-3','1.5','','21','abc']){
     const field=dialog().locator('[data-fixed-sets]');
     if(invalid==='abc')await field.evaluate(el=>{el.value='abc'});
     else await field.fill(invalid);
     const before=await raw();
     await dialog().locator('[data-s]').click();
     assert.equal(await raw(),before);
     assert.ok(await dialog().locator('[role="alert"]').isVisible());
    }
    await dialog().locator('[data-fixed-sets]').fill('3');
    for(const invalid of ['0','-1','2.5','','51']){
     await dialog().locator('[data-fixed-reps]').fill(invalid);
     const before=await raw();
     await dialog().locator('[data-s]').click();
     assert.equal(await raw(),before);
    }
    await dialog().locator('[data-c]').click();
    for(let i=0;i<8;i++){
     const lift=i%2?'Prone Row':'Squat',sets=roll(1,7),reps=roll(2,12);
     await begin(lift);
     await dialog().locator('[data-fixed-sets]').fill(String(sets));
     await dialog().locator('[data-fixed-reps]').fill(String(reps));
     await dialog().locator('[data-s]').evaluate(el=>{el.click();el.click()});
     await P.tab(page,'workout');
     await row(lift,sets-1).waitFor();
     await row(lift,0).click();
     await P.rep(page,reps);
     const before=JSON.parse(await raw());
     assert.ok(before.session[lift][0]);
     if(i%2===0){await page.reload();await P.ready(page)}
     await P.tab(page,'workout');
     await row(lift,0).click();
     await dialog().locator('[data-c]').click();
     assert.equal(JSON.parse(await raw()).session[lift][0],undefined);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     cases.push({width,seed,index:i,lift,sets,reps});
    }
    await begin('Squat');
    await dialog().locator('[data-fixed-sets]').fill('1');
    await dialog().locator('[data-fixed-reps]').fill('1');
    await dialog().locator('[data-s]').click();
    await P.tab(page,'workout');
    await row('Squat',0).click();
    await P.rep(page,1);
    await P.tab(page,'workout');
    await row('Squat',0).click();
    await dialog().locator('[data-c]').click();
    assert.equal(JSON.parse(await raw()).workoutStartedAt,null);
    await row('Squat',0).click();
    await P.rep(page,1);
    await P.tab(page,'workout');
    await page.locator('#timerbar .finish').evaluate(el=>{el.click();el.click()});
    assert.equal(await page.locator('.bvomModalOverlay [data-finish]').count(),1);
    await dialog().locator('[data-finish]').click();
    await dialog().locator('[data-note]').fill('Audit '+seed);
    await dialog().locator('[data-save]').evaluate(el=>{el.click();el.click()});
    await P.settle(page);
    assert.equal(JSON.parse(await raw()).history.length,1);
    console.log('PASS',width,seed,'8 mobile sequences, 11 invalid submissions');
   } finally {await context.close()}
  }
 } finally {await server.close()}
 console.log(JSON.stringify({browserSequences:cases.length,invalidSubmissions:33,cases}));
}
main().catch(error=>{console.error(error);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict');
const P=require('../monkey-v304/platform.cjs');
async function main(){
 const server=await P.start();
 try{
  for(const [lift,weight,edits,target,recovery] of [
   ['Prone Row',80,[],5,[75,5]],['Bench Press',80,[6],6,[75,6]],['Squat',110,[8,5],5,[100,5]]
  ]){
   const {page,context}=await server.device({name:'Straight recovery',mode:'lprpt',width:390});
   try{
    await page.evaluate(({lift,weight})=>{cfg(lift).mode='straight';state.weights[lift]=weight;save();renderAll()},{lift,weight});
    const card=page.locator('#work-'+lift.replace(/\W/g,''));
    const modal=()=>page.locator('.bvomModalOverlay').last();
    for(const reps of edits){
     await P.tab(page,'workout');
     await card.locator('.weight').click();
     await modal().locator('[data-fixed-reps]').fill(String(reps));
     await modal().locator('[data-s]').click();
    }
    for(const [i,reps] of [[0,target],[1,target-1]]){
     await card.locator(`button[onclick="tapSet('${lift}',${i})"]`).click();
     await P.rep(page,reps);
    }
    await page.reload();await P.ready(page);await P.tab(page,'workout');
    const third=card.locator('.setwrap').nth(2);
    assert.equal((await third.locator('.setload').textContent()).trim(),recovery.join('×')+'+');
    assert.equal((await third.locator('.extraLabel').textContent()).trim(),'RPT');
    await third.locator('button').click();await P.rep(page,recovery[1]);
    await P.finish(page,'Straight recovery acceptance',{incomplete:true});
    const history=(await P.stored(page)).history.at(-1).session[lift][2];
    assert.deepEqual([history.load,history.reps],recovery);
    console.log('PASS Android-width browser',lift,recovery);
   }finally{await context.close()}
  }
 }finally{await server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

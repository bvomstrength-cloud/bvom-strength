'use strict';
const assert=require('node:assert/strict');
// Restore can initially display legacy Workout while the BB2 module loads.
// Enter History to request its module, then select it after initialization.
module.exports=async function mobileHistory(page,count){
 const tab=()=>page.locator('.tab[data-tab="history"]').click();
 await tab();
 await page.waitForFunction(()=>!!bvomBb2PreviewModule&&bvomWindowLockOwned);
 await tab();await page.evaluate(()=>scrollTo(0,0));
 const cards=page.locator('#history > .histCard'),first=cards.first();
 await first.waitFor({state:'visible'});
 assert.equal(await cards.count(),count,'canonical BB2 and legacy rows share the normal History list');
 assert.notEqual(await first.getAttribute('data-bb2-history'),null,'latest completed BB2 workout is first, not below all legacy workouts');
 const rect=await first.evaluate(e=>{const r=e.getBoundingClientRect();return {y:r.y,height:r.height}});
 assert.ok(rect.height>0&&rect.y>=0&&rect.y<844,'latest BB2 workout is reachable in the initial mobile History viewport');
};

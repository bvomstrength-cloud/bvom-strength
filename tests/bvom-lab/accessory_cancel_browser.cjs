'use strict';

const assert = require('node:assert/strict');
const P = require('../monkey-v304/platform.cjs');

async function run() {
  const server = await P.start();
  try {
    for (const width of [320, 390, 430]) {
      const profile = {name: 'Cancel' + width, mode: 'lprpt', width};
      const data = P.fixture(profile);
      data.accessoryList = [
        {id:'loaded',name:'Curl',assignment:'Both',equipment:'dumbbell',style:'straight',sets:3,reps:5,weight:20,increment:2.5},
        {id:'bw',name:'Push-up',assignment:'Both',equipment:'bodyweight',resistance:'unloaded',style:'straight',sets:3,reps:5,weight:0,increment:2.5}
      ];
      data.gppList = [{id:'carry',name:'Carries',assignment:'Both',metrics:{sets:true,reps:true,load:true},planned:{sets:3,reps:5,load:20}}];
      const {page, context} = await server.device(profile, {data});
      await P.tab(page, 'workout');
      const modal = page.locator('.bvomModalOverlay').last();
      const tap = async (fn, id, index) => {
        const button = page.locator(`[onclick="${fn}('${id}',${index})"]`).first();
        await button.tap();
        await modal.waitFor();
      };
      for (const [fn,id,key,save,cancel] of [
        ['tapAccessory','loaded','ACC:loaded',null,'[data-c]'],
        ['tapAccessory','bw','ACC:bw','[data-save]','[data-cancel]'],
        ['bvomGppSetModal','carry',null,'[data-s]','[data-c]'],
        ['tapSet','Squat','Squat',null,'[data-c]']
      ].filter(([, id]) => !process.env.BVOM_CANCEL_CASE || process.env.BVOM_CANCEL_CASE === id)) {
        const rows = state => key ? state.session[key] : state.gppSession[id].sets;
        for (const i of [0,1]) {
          await tap(fn,id,i);
          if (id==='bw') await modal.locator('[data-rpe]').fill('8');
          if (save) await modal.locator(save).tap(); else await P.rep(page,5);
          await modal.waitFor({state:'hidden'});
        }
        const recorded = rows(await P.stored(page));
        assert.equal(recorded[0].reps,5,id);
        assert.equal(recorded[1].reps,5,id);
        await tap(fn,id,2);
        await modal.locator(cancel).tap();
        assert.deepEqual(rows(await P.stored(page)),recorded,id + ' unrecorded Cancel');
        await tap(fn,id,0);
        await modal.locator(cancel).tap();
        await page.reload();
        await P.ready(page);
        const after = rows(await P.stored(page));
        assert.equal(after[0] ?? null,null,id + ' recorded Cancel');
        assert.deepEqual(after[1],recorded[1],id + ' sibling after reload');
      }
      console.log('PASS accessory, GPP and main-lift browser Cancel at',width);
      await context.close();
    }
  } finally {
    await server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';

const assert = require('node:assert/strict');
const P = require('../monkey-v304/platform.cjs');

async function main() {
  const server = await P.start();
  try {
    for (const [mode, width] of [['lprpt', 320], ['free', 390]]) {
      const { page, context } = await server.device({ name: 'Fixed', mode, width });
      try {
        const core = mode === 'lprpt';
        const read = () => P.stored(page);
        const details = page.locator('[data-core-lift-settings="Squat"]');
        const modal = page.locator('.bvomModalOverlay').last();
        const edit = async (sets, reps, weight) => {
          await P.tab(page, 'workout');
          await page.locator('#work-Squat .weight').click();
          await modal.locator('[data-fixed-sets]').fill(String(sets));
          await modal.locator('[data-fixed-reps]').fill(String(reps));
          if (weight) await modal.locator('[data-w]').fill(String(weight));
          await modal.locator('[data-s]').click();
        };
        const row = i => page.locator(`#work-Squat button[onclick="${core ? `tapSet('Squat',${i})` : `bvomFtSetModal('Squat',${i},false)`}"]`);
        const records = data => core ? data.session.Squat : data.freeTrainingSession.Squat.sets;

        if (core) {
          await P.tab(page, 'settings');
          const advanced = page.locator('#settings [data-settings-group="training"]:not([open]) > summary');
          if (await advanced.count()) await advanced.click();
          await details.locator('summary').click();
          assert.equal(await details.locator('[data-fixed-sets]').inputValue(), '3');
          assert.equal(await details.locator('[data-fixed-reps]').inputValue(), '5');
          const before = await read();
          await details.locator('[data-fixed-sets]').fill('2.5');
          await details.locator('button[onclick="saveLiftSettings(\'Squat\')"]').click();
          assert.ok(await details.locator('[role="alert"]').isVisible());
          assert.deepEqual(await read(), before);
          await details.locator('[data-fixed-sets]').fill('3');
          await details.locator('[data-fixed-reps]').fill('8');
          await details.locator('button[onclick="saveLiftSettings(\'Squat\')"]').click();
          assert.deepEqual((await read()).fixedWorkingSets.lprpt.Squat,{sets:3,reps:8});
          await P.settle(page);
        }
        await edit(4, 9, 65);
        await P.tab(page, 'workout');
        assert.equal(await row(3).count(), 1);
        for (const i of [0, 1]) {
          await row(i).click();
          await P.rep(page, 9);
        }
        const recorded = records(await read());
        await edit(1, 9);
        await page.reload();
        await P.ready(page);
        assert.deepEqual(records(await read()), recorded);
        assert.ok(await row(1).count(), 'retained actual remains visible');

        await edit(5, 3);
        await P.tab(page,'workout');
        assert.equal(await row(4).count(), 1);
        assert.deepEqual(records(await read()), recorded);
        const add = page.locator('#work-Squat button').filter({hasText:'ADD EXTRA SET'});
        await add.click();
        if(core)await modal.locator('[data-save]').click();
        else await P.rep(page, 2);
        assert.equal(Object.values(records(await read())).filter(Boolean).length, 3);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await P.finish(page, 'Fixed edit acceptance', {incomplete:core});
        const finished=await read();
        assert.equal(finished.history.at(-1).session.Squat[1].reps, 9);
        assert.equal(finished.history.at(-1).session.Squat[1].load, 65);
        console.log('PASS', mode, 'mobile fixed fields, actuals, extras, History and reload');
      } finally {
        await context.close();
      }
    }
    const {page,context}=await server.device({name:'RPT',mode:'lprpt',width:390});
    try{
      await page.evaluate(()=>{cfg('Squat').mode='rpt';cfg('Squat').drop=10;save();renderAll()});
      await P.tab(page,'workout');
      await page.locator('#work-Squat .weight').click();
      const modal=page.locator('.bvomModalOverlay').last();
      await modal.locator('[data-fixed-sets]').fill('4');
      await modal.locator('[data-fixed-reps]').fill('7');
      await modal.locator('[data-w]').fill('100');
      await modal.locator('[data-s]').click();
      const set=i=>page.locator(`#work-Squat button[onclick="tapSet('Squat',${i})"]`);
      for(const [i,reps] of [[0,7],[1,5]]){
        await set(i).click();
        await P.rep(page,reps);
      }
      await page.reload();
      await P.ready(page);
      await P.tab(page,'workout');
      await set(2).click();
      assert.match(await modal.locator('.sub').textContent(),/90 kg.*6/);
      await P.rep(page,6);
      await set(3).click();
      assert.match(await modal.locator('.sub').textContent(),/80 kg.*8/);
      await P.rep(page,8);
      assert.match(await modal.textContent(),/close miss/i);
      const actual=(await P.stored(page)).session.Squat[2];
      assert.deepEqual([actual.load,actual.reps,actual.target],[90,6,6]);
      console.log('PASS RPT mobile 4×7 actual-derived recovery, reload and close-miss decision');
    }finally{
      await context.close();
    }
  } finally {
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

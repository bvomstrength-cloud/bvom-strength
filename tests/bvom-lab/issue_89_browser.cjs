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
  } finally {
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

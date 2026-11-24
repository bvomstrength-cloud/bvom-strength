'use strict';

const assert = require('node:assert/strict');
const platform = require('../monkey-v304/platform.cjs');

async function main() {
  const server = await platform.start();
  try {
    for (const mode of ['lprpt', 'hlm', 'fourday', 'free', 'bodybuilding']) {
      const { page, context } = await server.device({ name: 'Issue87', mode });
      try {
        const core = !['free', 'bodybuilding'].includes(mode);
        const lift = core ? await page.evaluate(() => program()[0][0]) : 'Squat';
        const slots = await page.evaluate(({ mode, lift }) => {
          if (mode === 'free') return ["bvomFtSetModal('Squat',0,false)", "bvomFtSetModal('Squat',1,false)"];
          if (mode === 'bodybuilding') {
            const id = state.bodybuilding.selections[bvomBbSlotsForDay(bvomBbDay())[0]];
            return [`bvomBbSetModal('${id}',0)`, `bvomBbSetModal('${id}',1)`];
          }
          return [`tapSet('${lift}',0)`, `tapSet('${lift}',1)`];
        }, { mode, lift });
        const open = async slot => {
          await platform.tab(page, 'workout');
          await page.locator('[onclick=' + JSON.stringify(slot) + ']').click();
        };
        const cancel = page.locator('.bvomModalOverlay [data-c],.bvomModalOverlay [data-cancel]');
        const initial = await platform.stored(page);
        await open(slots[0]);
        await cancel.click();
        assert.deepEqual(await platform.stored(page), initial, mode + ' unrecorded Cancel');

        if (core) {
          for (let i = 0; i < await page.evaluate(lift => getSetPlan(lift).length, lift); i++) {
            await open(`tapSet('${lift}',${i})`);
            await platform.rep(page, await page.evaluate(({ lift, i }) => getSetPlan(lift)[i].target, { lift, i }));
          }
          assert.equal((await platform.stored(page)).processed[lift], true);
        } else {
          for (const slot of slots) {
            await open(slot);
            const record = page.locator('.bvomModalOverlay [data-save],.bvomModalOverlay [data-s]');
            await record.click();
          }
        }
        const records = data => mode === 'free' ? data.freeTrainingSession.Squat.sets :
          mode === 'bodybuilding' ? Object.values(data.session).find(sets => sets[1]?.reps !== undefined) :
          data.session[lift];
        const recorded = await platform.stored(page);
        assert.ok(records(recorded)[0]);
        assert.ok(records(recorded)[1]);
        await open(slots[0]);
        await cancel.click();
        await page.reload();
        await platform.ready(page);
        const undone = await platform.stored(page);
        assert.equal(records(undone)[0] ?? null, null);
        for (const [i, actual] of Object.entries(records(recorded))) {
          if (i !== '0') assert.deepEqual(records(undone)[i], actual);
        }
        assert.deepEqual(undone.history, recorded.history);
        if (core) {
          assert.equal(undone.processed[lift], false);
          assert.equal(undone.weights[lift], initial.weights[lift]);
          assert.equal(undone.hlm.nextHeavy[lift], initial.hlm.nextHeavy[lift]);
        }
        console.log('PASS', mode, 'mobile Cancel, preserved sets and reload');
      } finally {
        await context.close();
      }
    }
    for (const selected of ['bb1', 'bb2']) {
      for (const target of ['lprpt', 'free', 'hlm', 'fourday']) {
        const { page, context } = await server.device({ name: 'Issue87', mode: 'bodybuilding' });
        try {
          if (selected === 'bb2') await page.evaluate(async () => {
            const module = await import('./bb2/browser-core.mjs');
            state.bb2 = { selectedProgram: true, setup: module.createBB2Setup() };
            save();
          });
          const original = await platform.stored(page);
          await platform.tab(page, 'settings');
          await page.locator('#settings [onclick="bvomStartingSetupModal()"]').click();
          await page.locator('.bvomModalOverlay [data-r]').click();
          await page.waitForSelector('#setup:not(.hidden)');
          const choice = target === 'free' ? '[data-ft-program]' : `[onclick="chooseProgramMode('${target}')"]`;
          await page.locator('#setup ' + choice).click();
          if (['hlm', 'fourday'].includes(target)) await page.locator('.bvomModalOverlay [data-r]').click();
          const switched = await platform.stored(page);
          assert.equal(switched.programMode, target);
          assert.deepEqual(switched.weights, original.weights);
          assert.deepEqual(switched.history, original.history);
          assert.deepEqual(switched.bodybuilding, original.bodybuilding);
          console.log('PASS', selected, 'startup chooser to', target);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const P = require('../monkey-v304/platform.cjs');
const rdl = 'Romanian Deadlift', rdlCard = '#work-RomanianDeadlift';
const themes = ['classic', 'bee', 'cherry', 'coastal'];
const profile = { name: 'LP-RDL', mode: 'lprpt', width: 390 };
const initial = P.fixture(profile);
initial.history = [{ date: new Date().toISOString(), unit: 'kg', program: 'lprpt', day: 'A',
  incomplete: false, weights: { Squat: 102.5 }, session: { Squat: { 0: { load: 100, reps: 5, target: 5 } } } }];
initial.weights.Squat = 102.5;
initial.weights.Deadlift = 145;
initial.core['Overhead Press'].mode = 'straight';
for (const key of ['weights', 'core', 'barByLift', 'plateMode']) delete initial[key][rdl];

const clickSet = async (page, lift, index, reps) => {
  await P.tab(page, 'workout');
  await page.locator('[onclick=' + JSON.stringify("tapSet('" + lift + "'," + index + ')') + ']').click();
  await P.rep(page, reps);
};
const labelFor = lang => lang === 'ja' ? 'ルーマニアンデッドリフト' : rdl;

(async () => {
  const server = await P.start();
  try {
    const { page } = await server.device(profile, { data: initial });
    assert.equal((await P.stored(page)).weights[rdl], 100);
    assert.equal(await page.locator('header').textContent().then(text => text.includes('3.2.0')), true);
    await page.locator('#workout [onclick="switchDay(\'B\')"]').click();
    assert.deepEqual(await page.locator('#workout > .exercise').evaluateAll(cards => cards.map(card => card.id)),
      ['work-RomanianDeadlift', 'work-Deadlift', 'work-OverheadPress']);
    await P.tab(page, 'settings');
    await page.locator('#settings [data-settings-group="training"] > summary').click();
    const settings = page.locator('[data-core-lift-settings="RomanianDeadlift"]');
    await settings.locator('summary').click();
    await page.locator('#modeRomanianDeadlift').selectOption('rpt');
    assert.match(await page.locator('#levelRomanianDeadlift').textContent(), /8 \/ 9 \/ 11\+/);
    await settings.locator('[onclick="saveLiftSettings(\'Romanian Deadlift\')"]').click();
    await P.settle(page);

    await P.tab(page, 'warmup');
    const native = page.locator('#warm-Deadlift .warmrow button');
    assert.equal(await native.count(), 5);
    assert.match(await page.locator('#warm-RomanianDeadlift .warmrow').first().textContent(), /20×5/);
    await clickSet(page, rdl, 0, 8);
    await clickSet(page, rdl, 1, 9);
    await clickSet(page, rdl, 2, 11);
    assert.equal(await page.locator('.tab.on').getAttribute('data-tab'), 'warmup');
    assert.equal(await native.count(), 3);
    await native.first().click();
    assert.match(await native.first().getAttribute('class'), /done/);
    await page.reload();
    await P.ready(page);
    await P.tab(page, 'warmup');
    assert.match(await native.first().getAttribute('class'), /done/);
    await clickSet(page, 'Deadlift', 0, 5);
    for (let i = 0; i < 5; i++) await clickSet(page, 'Overhead Press', i, 5);
    await P.finish(page, 'Independent RDL browser proof');
    const saved = await P.stored(page);
    const record = saved.history.at(-1);
    assert.deepEqual(saved.pbs[rdl].load, 100);
    assert.equal(record.exerciseMeta[rdl].id, 'core.romanian_deadlift');
    assert.equal(record.session[rdl][2].load, 80);
    assert.equal(record.volume, 800 + 810 + 880 + 725 + 750);

    await P.tab(page, 'settings');
    const oldBackup = Buffer.from(JSON.stringify({ app: 'BVOM', version: '3.1.3', data: initial }));
    await page.locator('#settings input[type=file]').setInputFiles({
      name: 'v3.1.3.json', mimeType: 'application/json', buffer: oldBackup
    });
    await Promise.all([page.waitForEvent('load'), page.locator('.bvomModalOverlay [data-r]').click()]);
    await P.ready(page);
    assert.equal((await P.stored(page)).weights[rdl], 100);
    assert.deepEqual((await P.stored(page)).history, initial.history);
    await page.locator('#workout [onclick="switchDay(\'B\')"]').click();

    let variants = 0;
    for (const width of [320, 390, 430]) for (const lang of ['en', 'ja']) for (const theme of themes) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ lang, theme }) => {
        state.language = lang;
        state.theme = theme;
        bvomApplyTheme();
        renderAll();
      }, { lang, theme });
      assert.equal(await page.locator('html').getAttribute('data-bvom-theme'), theme);
      const label = labelFor(lang);
      for (const [tab, selector] of [
        ['workout', rdlCard + ' .exname'],
        ['warmup', '#warm-RomanianDeadlift .exname'],
        ['settings', '[data-core-lift-settings="RomanianDeadlift"] summary'],
        ['history', '#history .historyGrid'],
        ['info', '#info']
      ]) {
        await P.tab(page, tab);
        assert.ok((await page.locator(selector).textContent()).includes(label), theme + '/' + lang + '/' + tab);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${width}px ${lang} ${theme} ${tab} overflow=${overflow}`);
      }
      assert.ok((await page.locator('#info').textContent()).includes('B–A–B'));
      if (width === 390 && theme === 'bee') await page.screenshot({ path: path.join(P.out, 'screenshots', 'rdl-info-' + lang + '.png') });
      await page.evaluate(() => { state.configured = false; showSetup(); });
      assert.equal(await page.locator('#setup .startw[data-name="Romanian Deadlift"]').count(), 1);
      assert.ok((await page.locator('#setup').textContent()).includes(label));
      await page.evaluate(() => { state.configured = true; showApp(); });
      variants++;
    }

    // Exercise both first-run weight inputs without requiring a live account.
    await page.evaluate(() => {
      state.configured = false;
      state.setupMode = 'manual';
      delete state.weights['Romanian Deadlift'];
      showSetup();
    });
    const squat = page.locator('#setup .startw[data-name="Squat"]');
    const startRdl = page.locator('#setup .startw[data-name="Romanian Deadlift"]');
    await squat.fill('65');
    assert.equal(await startRdl.inputValue(), '65');
    await startRdl.fill('50');
    await squat.fill('75');
    assert.equal(await startRdl.inputValue(), '50');
    await page.evaluate(() => { state.setupMode = 'guided'; showSetup(); });
    await squat.fill('70');
    assert.equal(await startRdl.inputValue(), '70');
    console.log(`PASS ${variants} theme × language × mobile-width variants, RPT PB, actual handoff ticks and fresh/legacy Setup`);
  } finally { await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

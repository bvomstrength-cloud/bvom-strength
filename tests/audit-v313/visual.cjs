'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const returningFixture = require('../bvom-lab/fixtures/bb2-next-flow.cjs');

const baseline = path.resolve(process.argv[2] || '.bvom-v312-baseline');
const candidate = path.resolve(process.argv[3] || '.');
const out = process.env.BVOM_UI_AUDIT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'bvom-v313-visual-'));
const palettes = {
  classic: ['rgb(255, 255, 255)', 'rgb(217, 30, 24)'],
  bee: ['rgb(23, 23, 23)', 'rgb(255, 212, 0)'],
  cherry: ['rgb(255, 250, 251)', 'rgb(217, 95, 123)'],
  coastal: ['rgb(251, 254, 255)', 'rgb(22, 135, 181)'],
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serve(root) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/seed') return res.end('<!doctype html>');
    const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
}

async function seed(browser, origin, data, theme, language, width, height = 844) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date('2026-11-02T09:00:00Z'));
  await page.goto(origin + '/seed');
  await page.evaluate(({ data, theme, language }) => {
    const id = data.bb2.opening.ownerId;
    localStorage.setItem('bvom_data', JSON.stringify({ ...data, theme, language }));
    localStorage.setItem('bvom_display_language', language);
    localStorage.setItem('bvom_data_owner', id);
    localStorage.setItem('bvom_entitlement_cache_' + id, JSON.stringify({
      userId: id, verifiedAt: new Date().toISOString(), record: { user_id: id, status: 'complimentary' },
    }));
  }, { data, theme, language });
  await page.goto(origin);
  await page.waitForFunction(() => bvomWindowLockOwned);
  await page.locator('[data-bb2-start-next]').waitFor();
  return { context, page };
}

const tab = async (page, name) => {
  await page.locator('.tab[data-tab="' + name + '"]').click();
  await page.evaluate(() => scrollTo(0, 0));
};
const stored = page => page.evaluate(() => localStorage.getItem('bvom_data'));
const layout = (page, root, action) => page.locator(root).evaluate((el, action) => {
  const current = el.getBoundingClientRect();
  const target = el.querySelector(action)?.getBoundingClientRect();
  return {
    contentPx: Math.round(current.height),
    firstViewportPx: Math.round(Math.max(0, Math.min(current.bottom, innerHeight) - Math.max(0, current.top))),
    scrollToActionPx: target ? Math.max(0, Math.round(target.bottom - innerHeight)) : null,
  };
}, action);
const overflow = (page, width) => page.evaluate(width =>
  document.documentElement.scrollWidth <= width && innerWidth === width, width);
const copy = page => page.locator('#info').evaluate(el => {
  const content = s => s.replace(/\s+/g, ' ').trim();
  return {
    paragraphs: [...el.querySelectorAll('p')].map(p => content(p.textContent)).sort(),
    links: [...el.querySelectorAll('a[href]:not([href^="#info-"])')].map(a => [a.getAttribute('href'), content(a.textContent)]).sort(),
  };
});

async function dialogStyle(dialog, expected) {
  const result = await dialog.evaluate(el => {
    const luminance = color => {
      const rgb = color.startsWith('color(srgb ') ? color.match(/[\d.]+/g).map(Number) :
        color.match(/[\d.]+/g).slice(0, 3).map(n => Number(n) / 255);
      return rgb.slice(0, 3).map(c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4))
        .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    };
    const contrast = (a, b) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0] + .05) / (values[1] + .05);
    };
    const surface = getComputedStyle(el);
    const primary = el.querySelector('.primary:not(:disabled)');
    const input = [...el.querySelectorAll('input:not([type=checkbox]),select,textarea')].find(x => x.getClientRects().length);
    const first = el.querySelector('button');
    const secondary = el.querySelector('.sub,.small');
    const validate = el.querySelector('[role=alert]:not([hidden])');
    const field = input && getComputedStyle(input);
    const button = primary && getComputedStyle(primary);
    const error = validate && getComputedStyle(validate);
    const disabled = el.querySelector('button:disabled');
    const disabledStyle = disabled && getComputedStyle(disabled);
    return {
      background: surface.backgroundColor,
      accent: button?.backgroundColor,
      text: contrast(surface.color, surface.backgroundColor),
      primary: button && contrast(button.color, button.backgroundColor),
      muted: secondary && contrast(getComputedStyle(secondary).color, surface.backgroundColor),
      input: field && contrast(field.color, field.backgroundColor),
      inputBoundary: field && contrast(field.borderColor, field.backgroundColor),
      error: error && contrast(error.color, error.backgroundColor),
      disabled: disabledStyle && contrast(disabledStyle.color, disabledStyle.backgroundColor),
      target: first?.getBoundingClientRect().height,
      fits: el.scrollWidth <= el.clientWidth + 1,
    };
  });
  if (expected) {
    assert.equal(result.background, expected[0]);
    if (result.accent) assert.equal(result.accent, expected[1]);
    for (const key of ['text', 'primary', 'muted', 'input', 'error', 'disabled']) {
      if (result[key] != null) assert.ok(result[key] >= 4.5, key + ' contrast ' + result[key]);
    }
    if (result.inputBoundary != null) assert.ok(result.inputBoundary >= 3, 'input boundary ' + result.inputBoundary);
    if (result.target) assert.ok(result.target >= 44, 'dialog target ' + result.target);
    assert.ok(result.fits, 'dialog should fit without horizontal scrolling');
  }
  return result;
}

async function inspect(browser, origin, data, dimension, check) {
  const { theme, language, width } = dimension;
  const { context, page } = await seed(browser, origin, data, theme, language, width);
  const expected = check ? palettes[theme] : null;
  const screenshot = (surface, allThemes = false) => width === 390 && language === 'en' && (allThemes || theme === 'classic') ?
    page.screenshot({ path: path.join(out, (check ? 'after' : 'before') + '-' + surface + '-' + theme + '.png') }) : undefined;
  const dialog = () => page.locator('.bvomModalOverlay .bvomModal,.beeCoachOverlay .beeCoach').last();
  const results = {};
  try {
    await tab(page, 'info');
    results.info = await layout(page, '#info', check ? '.bvomInfoIndex a[href="#info-bb2"]' : '[data-bb2-programme-info]');
    results.content = await copy(page);
    await screenshot('info');
    if (check) {
      for (const link of await page.locator('#info .bvomInfoIndex a').all()) {
        const href = await link.getAttribute('href');
        await link.click();
        const section = page.locator(href);
        assert.equal(await section.getAttribute('open'), '');
        assert.ok(await section.locator('summary').evaluate(el => document.activeElement === el));
        await section.locator('summary').press('Space');
        assert.equal(await section.getAttribute('open'), null);
        await page.evaluate(() => scrollTo(0, 0));
      }
      assert.ok(await overflow(page, width), 'Info width');
    }
    await tab(page, 'settings');
    const setup = page.locator('#settings [onclick="bvomStartingSetupModal()"]');
    results.settings = await layout(page, '#settings', '[onclick="bvomStartingSetupModal()"]');
    results.backup = await layout(page, '#settings', '[onclick="exportBackup()"]');
    await screenshot('settings');
    const pounds = page.locator('#settings [onclick="changeUnits(\'lb\')"]');
    let raw = await stored(page);
    await pounds.click();
    await dialog().waitFor();
    results.confirmation = await dialogStyle(dialog(), expected);
    await screenshot('dialog', true);
    if (check) {
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-change')), '');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-c')), '');
      await page.keyboard.press('Escape');
      assert.ok(await pounds.evaluate(el => el === document.activeElement));
      assert.equal(await stored(page), raw, 'cancel units preserves all data');
      assert.ok(await overflow(page, width), 'Settings width');
      const erase = page.locator('#settings [data-settings-group="erase"]');
      await erase.locator('summary').click();
      await erase.locator('[onclick="eraseAll()"]').click();
      const typed = dialog().locator('[data-i]'), confirm = dialog().locator('[data-e]');
      assert.ok(await confirm.isDisabled());
      await typed.fill('reset');
      assert.ok(await confirm.isDisabled());
      const resetCaseStyle = await dialogStyle(dialog(), expected);
      await typed.fill('RESET');
      assert.ok(await confirm.isEnabled());
      assert.notEqual(await confirm.evaluate(el => getComputedStyle(el).backgroundColor), expected[1]);
      await page.keyboard.press('Escape');
      assert.equal(await stored(page), raw, 'destructive cancel preserves all data');
      results.disabledContrast = resetCaseStyle.disabled;
    } else await dialog().locator('[data-c]').click();
    if (check && width === 390) {
      const preferences = page.locator('[data-settings-group="theme"]');
      const alternate = theme === 'bee' ? 'classic' : 'bee';
      await preferences.locator('summary').click();
      await preferences.locator('button[onclick="bvomSetTheme(\'' + alternate + '\')"]').click();
      await pounds.click();
      await dialogStyle(dialog(), palettes[alternate]);
      await page.keyboard.press('Escape');
      await preferences.locator('button[onclick="bvomSetTheme(\'' + theme + '\')"]').click();
      await page.reload();
      await page.waitForFunction(() => bvomWindowLockOwned);
      await tab(page, 'settings');
      await pounds.click();
      await dialogStyle(dialog(), expected);
      await page.keyboard.press('Escape');
      raw = await stored(page);
    }
    await setup.click();
    results.settingsBeforeStartingSetup = await page.evaluate(() => scrollY);
    await dialog().locator('[data-c]').click();
    assert.equal(await stored(page), raw);

    await tab(page, 'workout');
    await page.locator('[data-bb2-next-workout]').click();
    await page.locator('#setup [data-bb2-start]').waitFor();
    results.bb2 = await layout(page, '#setup', '[data-bb2-start]');
    await screenshot('bb2');
    if (check) {
      assert.equal(await page.locator('[data-bb2-catalogue]').getAttribute('open'), null);
      assert.ok(await overflow(page, width), 'BB2 options width');
      const first = page.locator('[data-bb2-exercise]').first();
      assert.equal(await first.getAttribute('open'), null);
      await first.locator('summary').click();
      assert.ok(await first.locator('[data-bb2-load]').isDisabled());
      assert.ok(await first.locator('[data-bb2-load]').isVisible());
      await first.locator('summary').click();
      await page.locator('[data-bb2-kind="RECOVERY"]').click();
      assert.ok(await page.locator('[data-bb2-exercise][open]').count(), 'review required for recovery');
      assert.equal(await stored(page), raw, 'BB2 review and recovery selection write nothing');
      await page.locator('[data-bb2-back]').click();

      await page.evaluate(() => openGppBuilder());
      await dialog().locator('[data-s]').click();
      await dialog().locator('[data-form-error]').waitFor();
      assert.equal(await dialog().locator('[data-name]').getAttribute('aria-invalid'), 'true');
      results.validation = await dialogStyle(dialog(), expected);
      await screenshot('validation', true);
      await page.keyboard.press('Escape');
      await page.evaluate(() => openAccessoryBuilder());
      await dialog().waitFor();
      await dialogStyle(dialog(), expected);
      await page.keyboard.press('Escape');

      await tab(page, 'workout');
      await page.locator('[data-bb2-start-next]').click();
      await page.locator('[data-bb2-set="0|0"]').click();
      await dialog().waitFor();
      await dialogStyle(dialog(), expected);
      await dialog().locator('[data-close],[data-cancel]').first().click();
    }
    return results;
  } finally {
    await context.close();
  }
}

async function shortStartingSetup(browser, origin, data) {
  const results = [];
  for (const [width, height, position] of [[320, 520, 'top'], [390, 410, 'bottom'], [430, 330, 'focused-field']]) {
    const { context, page } = await seed(browser, origin, data, 'coastal', 'ja', width, height);
    try {
      await tab(page, 'settings');
      if (position === 'bottom') await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      if (position === 'focused-field') {
        // Chromium's headless phone emulation cannot invoke an OS keyboard.
        // Focus the Settings form control before reducing the visual space.
        const training = page.locator('#settings [data-settings-group="training"]');
        await training.locator(':scope > summary').click();
        await training.locator('details > summary').first().click();
        const input = training.locator('input[type=number]:visible').first();
        await input.focus();
        assert.ok(await input.evaluate(el => document.activeElement === el));
        await page.setViewportSize({ width, height: 290 });
      }
      const prior = await page.evaluate(() => scrollY);
      const settings = page.locator('#settings [onclick="bvomStartingSetupModal()"]');
      await settings.evaluate(button => button.click());
      await page.locator('.bvomModalOverlay [data-r]').click();
      const view = await page.locator('#setup .setupProgramPicker').evaluate(el => ({
        scroll: scrollY, top: el.getBoundingClientRect().top,
        buttonBottom: el.querySelector('button').getBoundingClientRect().bottom,
        height: visualViewport.height, focused: el.contains(document.activeElement),
      }));
      assert.equal(view.scroll, 0);
      assert.ok(view.top >= 0 && view.buttonBottom <= view.height && view.focused);
      await page.locator('#setup .setupProgramPicker [onclick="chooseProgramMode(\'lprpt\')"]').click();
      assert.ok(await page.locator('#setup [data-setup-next]').evaluate(el =>
        el.contains(document.activeElement) && el.getBoundingClientRect().top < visualViewport.height));
      results.push({ width, height, position, prior, view });
    } finally {
      await context.close();
    }
  }
  fs.writeFileSync(path.join(out, 'starting-setup-short-viewports.json'), JSON.stringify(results, null, 2) + '\n');
  console.log('PASS Starting Setup at three short heights and multiple Settings scroll positions');
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.match(fs.readFileSync(path.join(baseline, 'index.html'), 'utf8'), /const BVOM_BUILD='3\.1\.2'/);
  const roots = await Promise.all([serve(baseline), serve(candidate)]);
  const browser = await chromium.launch({ executablePath: process.env.BVOM_CHROMIUM_PATH, args: ['--no-sandbox'] });
  const data = await returningFixture();
  const rows = [];
  try {
    for (const theme of Object.keys(palettes)) {
      for (const language of ['en', 'ja']) {
        for (const width of [320, 390, 430]) {
          const dimension = { theme, language, width };
          const [before, after] = await Promise.all([
            inspect(browser, roots[0].origin, data, dimension, false),
            inspect(browser, roots[1].origin, data, dimension, true),
          ]).catch(error => { throw new Error(JSON.stringify(dimension), { cause: error }); });
          assert.deepEqual(after.content, before.content, 'all approved paragraphs and links survive');
          delete after.content;
          delete before.content;
          rows.push({ ...dimension, before, after });
          fs.writeFileSync(path.join(out, 'visual-matrix.json'), JSON.stringify(rows, null, 2) + '\n');
          console.log('PASS', theme, language, width);
        }
      }
    }
    await shortStartingSetup(browser, roots[1].origin, data);
  } finally {
    await browser.close();
    await Promise.all(roots.map(({ server }) => new Promise(resolve => server.close(resolve))));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

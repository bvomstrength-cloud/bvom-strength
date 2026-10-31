'use strict';
// Real Chromium test of the dormant BB2 browser-host adapter. It serves only a
// fixture page and this new module, never the production BVOM app or cloud.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const source = path.resolve(__dirname, '../../bb2/browser-host.mjs');
const server = http.createServer((req, res) => {
  if (req.url === '/bb2/browser-host.mjs') {
    res.writeHead(200, { 'Content-Type': 'text/javascript',
      'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(source));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Isolated BB2 writer fixture</title>');
  }
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let browser, context, origin;
async function open(owner = 'owner-1') {
  const page = await context.newPage();
  await page.goto(origin + '/');
  await page.evaluate(async id => {
    window.testAuth = id;
    window.testLocal = id;
    window.testCanWrite = true;
    const { createBB2BrowserHost } = await import('/bb2/browser-host.mjs');
    window.bb2Host = createBB2BrowserHost({ runtime: window, ownerId: id,
      getAuthenticatedOwnerId: () => window.testAuth,
      getLocalOwnerId: () => window.testLocal,
      canWrite: () => window.testCanWrite });
  }, owner);
  return page;
}
const write = (page, value) => page.evaluate(async value => {
  const h = window.bb2Host;
  await h.withExclusiveLock(h.key, () => h.storage.setItem(h.key, value));
}, value);
const raw = page => page.evaluate(() => localStorage.getItem(window.bb2Host.key));

test('two real tabs: competing writer denied, handoff commits without clobbering', async () => {
  const a = await open(), b = await open();
  try {
    await a.evaluate(() => {
      const h = window.bb2Host;
      window.holding = h.withExclusiveLock(h.key, async () => {
        window.entered = true;
        await new Promise(resolve => { window.release = resolve; });
        h.storage.setItem(h.key, 'first');
      });
    });
    await a.waitForFunction(() => window.entered === true);
    const refused = await b.evaluate(async () => {
      const h = window.bb2Host;
      try { await h.withExclusiveLock(h.key, () => h.storage.setItem(h.key, 'stale'));
        return 'ERROR: competing write succeeded'; }
      catch (error) { return error.message; }
    });
    assert.match(refused, /another BB2 tab owns/);
    assert.equal(await raw(b), null);
    await a.evaluate(() => window.release());
    await a.evaluate(() => window.holding);
    assert.equal(await raw(b), 'first');
    await write(b, 'second');
    assert.equal(await raw(a), 'second');
    assert.equal(await a.evaluate(() => localStorage.getItem('bvom_data')), null);
  } finally { await a.close(); await b.close(); }
});

test('authentication and local owner changes block reads and in-flight writes', async () => {
  const a = await open();
  try {
    await write(a, 'preserved');
    const verdicts = await a.evaluate(async () => {
      const h = window.bb2Host;
      window.testAuth = 'other-owner';
      let read, write;
      try { h.storage.getItem(h.key); } catch (error) { read = error.message; }
      window.testAuth = 'owner-1';
      try {
        await h.withExclusiveLock(h.key, () => {
          window.testLocal = 'other-owner';
          h.storage.setItem(h.key, 'forged');
        });
      } catch (error) { write = error.message; }
      window.testLocal = 'owner-1';
      return { read, write };
    });
    assert.match(verdicts.read, /owner changed/);
    assert.match(verdicts.write, /owner changed/);
    assert.equal(await raw(a), 'preserved');
  } finally { await a.close(); }
});

test('unsupported browser and disabled writer refuse without fallback', async () => {
  const a = await open();
  try {
    const before = await raw(a);
    const results = await a.evaluate(async () => {
      const h = window.bb2Host;
      let disabled, unsupported, direct;
      window.testCanWrite = false;
      try { await h.withExclusiveLock(h.key, () => h.storage.setItem(h.key, 'bad')); }
      catch (error) { disabled = error.message; }
      window.testCanWrite = true;
      try { h.storage.setItem(h.key, 'bad'); } catch (error) { direct = error.message; }
      const { createBB2BrowserHost } = await import('/bb2/browser-host.mjs');
      const noLocks = createBB2BrowserHost({ runtime: {
        localStorage: window.localStorage, navigator: {} }, ownerId: 'owner-1',
      getAuthenticatedOwnerId: () => window.testAuth,
      getLocalOwnerId: () => window.testLocal,
      canWrite: () => true });
      try { await noLocks.withExclusiveLock(noLocks.key, () => {}); }
      catch (error) { unsupported = error.message; }
      return { disabled, direct, unsupported };
    });
    assert.match(results.disabled, /writer disabled/);
    assert.match(results.direct, /without exclusive/);
    assert.match(results.unsupported, /Web Locks unavailable/);
    assert.equal(await raw(a), before);
  } finally { await a.close(); }
});

test('real page close releases a lock and offline local writing remains possible', async () => {
  const a = await open(), b = await open();
  try {
    await a.evaluate(() => {
      const h = window.bb2Host;
      window.holding = h.withExclusiveLock(h.key, () => {
        window.entered = true;
        return new Promise(() => {}); // Simulate an interrupted tab.
      });
    });
    await a.waitForFunction(() => window.entered === true);
    await a.close();
    await context.setOffline(true);
    let succeeded = false;
    for (let i = 0; i < 20 && !succeeded; i++) {
      try { await write(b, 'offline-saved'); succeeded = true; }
      catch (error) {
        if (!/another BB2 tab owns/.test(error.message)) throw error;
        await b.waitForTimeout(100);
      }
    }
    assert.equal(succeeded, true);
    assert.equal(await raw(b), 'offline-saved');
    await context.setOffline(false);
    await b.reload();
    assert.equal(await b.evaluate(() => localStorage.getItem(
      'bvom.bb2.local.v1.owner-1')), 'offline-saved');
  } finally {
    await context.setOffline(false);
    if (!a.isClosed()) await a.close();
    await b.close();
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  let failures = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    context = await browser.newContext({ serviceWorkers: 'block' });
    for (const [name, run] of tests) {
      try { await run(); console.log('PASS:', name); }
      catch (error) { failures++; console.error('FAIL:', name, error.stack); }
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`BB2 Stage (ii) Chromium Web Locks: ${tests.length - failures}/${tests.length} PASS`);
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });

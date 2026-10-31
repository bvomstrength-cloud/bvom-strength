#!/usr/bin/env node
'use strict';
// BB2-only deterministic, dependency-free static CJS -> browser ES module.
// A closed source manifest prevents accidental bundling of Node, app, cloud,
// runtime or legacy BVOM imports. No eval or runtime fetch/compilation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'bb2', 'browser-core.mjs');
const modules = Object.freeze([
  'ledger.cjs', 'catalogue.cjs', 'start.cjs', 'restore.cjs', 'local-store.cjs'
]);
const allowed = new Set(modules.map(file => './' + file));

function inspectImports(file, source) {
  const imports = [...source.matchAll(/\brequire\s*\(([^)]*)\)/gs)];
  for (const [, argument] of imports) {
    const match = /^(['"])(\.\/[a-z-]+\.cjs)\1$/.exec(argument.trim());
    if (!match || !allowed.has(match[2])) {
      throw Error(`BB2 browser: unexpected or dynamic require in ${file}`);
    }
  }
  if (/\bimport\s*(?:\(|[{'"*])/.test(source) || /\b(?:eval|Function)\s*\(/.test(source)) {
    throw Error(`BB2 browser: unsupported runtime module/eval in ${file}`);
  }
  return imports.length;
}

function buildBundle() {
  const fingerprint = crypto.createHash('sha256');
  const chunks = [];
  for (const file of modules) {
    const source = fs.readFileSync(path.join(root, 'bb2', file), 'utf8');
    inspectImports(file, source);
    fingerprint.update(file, 'utf8').update('\0').update(source, 'utf8').update('\0');
    chunks.push(`factories[${JSON.stringify('./' + file)}] = function (module, exports, require) {\n${source.trimEnd()}\n};`);
  }
  const sha256 = fingerprint.digest('hex');
  const text = [
    '/* GENERATED BB2 browser core — no direct edits. */',
    '/* Source fingerprint SHA-256: ' + sha256 + ' */',
    '/* Regenerate: node scripts/build-bb2-browser.cjs */',
    '/* Import has no app, storage, network or clock side effects. */',
    'const factories = Object.create(null);',
    ...chunks,
    'const cache = Object.create(null);',
    'function load(id) {',
    '  if (!Object.hasOwn(factories, id)) throw Error("BB2 browser: unknown module " + id);',
    '  if (Object.hasOwn(cache, id)) return cache[id].exports;',
    '  const module = { exports: {} };',
    '  cache[id] = module;',
    '  factories[id](module, module.exports, load);',
    '  return module.exports;',
    '}',
    'export const BB2_BROWSER_SOURCE_SHA256 = ' + JSON.stringify(sha256) + ';',
    'export const BB2_BROWSER_MODULES = Object.freeze({',
    '  ledger: Object.freeze(load("./ledger.cjs")),',
    '  catalogue: Object.freeze(load("./catalogue.cjs")),',
    '  start: Object.freeze(load("./start.cjs")),',
    '  restore: Object.freeze(load("./restore.cjs")),',
    '  localStore: Object.freeze(load("./local-store.cjs"))',
    '});',
    'export const createBB2LocalStore = BB2_BROWSER_MODULES.localStore.createBB2LocalStore;',
    'export const createBB2Setup = BB2_BROWSER_MODULES.catalogue.createBB2Setup;',
    'export const validateBB2Setup = BB2_BROWSER_MODULES.catalogue.validateBB2Setup;',
    'export const setBB2OptionalCurls = BB2_BROWSER_MODULES.catalogue.setBB2OptionalCurls;',
    'export const getBB2TemplatePrescription = BB2_BROWSER_MODULES.catalogue.getBB2TemplatePrescription;',
    'export const createBB2Opening = BB2_BROWSER_MODULES.ledger.createBB2Opening;',
    'export const foldBB2Block = BB2_BROWSER_MODULES.ledger.foldBB2Block;',
    'export const planBB2Finish = BB2_BROWSER_MODULES.ledger.planBB2Finish;',
    'export const validateBB2RestoredBlock = BB2_BROWSER_MODULES.restore.validateBB2RestoredBlock;',
    'export const bb2FinishRevisionKey = BB2_BROWSER_MODULES.restore.bb2FinishRevisionKey;',
    ''
  ].join('\n');
  return { sha256, text };
}

if (require.main === module) {
  const generated = buildBundle();
  if (process.argv[2] === '--check') {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated.text) {
      console.error('BB2 browser module is stale: regenerate before committing.');
      process.exitCode = 1;
    } else console.log('PASS: BB2 browser bundle matches closed source and ' + generated.sha256);
  } else if (process.argv.length === 2) {
    fs.writeFileSync(output, generated.text);
    console.log('Generated bb2/browser-core.mjs: ' + generated.sha256);
  } else {
    console.error('Usage: node scripts/build-bb2-browser.cjs [--check]');
    process.exitCode = 2;
  }
}

module.exports = { modules, inspectImports, buildBundle };

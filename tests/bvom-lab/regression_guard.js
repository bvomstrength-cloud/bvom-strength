#!/usr/bin/env node
'use strict';
// BVOM STATIC / PACKAGING tier. These checks are deliberately textual or structural.
// They do NOT protect live behaviour — that is behaviour_guard.js's job.
// Usage: node regression_guard.js <extracted-build-dir>
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {extractAppScript}=require('./lib/bvom_harness');
const target=process.argv[2];if(!target){console.error('Usage: node regression_guard.js <extracted-build-dir>');process.exit(2)}
let pass=0,fail=0;const t=(name,cond,detail='')=>{if(cond){console.log('PASS  '+name);pass++}else{console.log('FAIL  '+name+(detail?' — '+detail:''));fail++}};
const exists=f=>fs.existsSync(path.join(target,f)),read=f=>fs.readFileSync(path.join(target,f),'utf8');
const compiles=(src,name)=>{try{new vm.Script(src,{filename:name});return ''}catch(e){return e.message}};

// --- Packaging / loadability
const REQUIRED=['index.html','sw.js','manifest.json','i18n/en.js','i18n/ja.js','icon-192.png','icon-512.png','vendor/supabase-js-2.117.3.js'];
const missing=REQUIRED.filter(f=>!exists(f));t('Required release files present',!missing.length,missing.join(', '));
if(missing.includes('index.html')){console.log(`\nRESULT: ${pass} passed, ${fail+1} failed`);process.exit(1)}
const html=read('index.html'),sw=exists('sw.js')?read('sw.js'):'';
let app='';try{app=extractAppScript(html)}catch(e){}
t('Inline application script found',!!app);
{const e=compiles(app,'index.html#app');t('Inline application script compiles',!e,e)}
for(const f of ['i18n/en.js','i18n/ja.js','sw.js','vendor/supabase-js-2.117.3.js'])if(exists(f)){const e=compiles(read(f),f);t(`${f} compiles`,!e,e)}
if(exists('admin.html')){const s=read('admin.html'),m=s.match(/<script>([\s\S]*?)<\/script>/);const e=m?compiles(m[1],'admin.html'):'no inline script';t('admin.html inline script compiles',!e,e)}
let manifest=null;try{manifest=JSON.parse(read('manifest.json'))}catch(e){}
t('manifest.json parses with name, start_url, scope, display',!!(manifest&&manifest.name&&manifest.start_url&&manifest.scope&&manifest.display));
{const bad=(manifest?.icons||[]).map(i=>i.src).filter(s=>!exists(s));t('manifest icons exist',manifest&&manifest.icons?.length&&!bad.length,bad.join(', '))}
{const core=((sw.match(/const CORE\s*=\s*\[([\s\S]*?)\]/)||[])[1]||'').match(/'([^']+)'/g)?.map(x=>x.slice(1,-1).replace(/^\.\//,''))||[];
 const bad=core.filter(f=>{const clean=f.split('?')[0].split('#')[0];return clean&&!exists(clean)});t('Service-worker CORE cache list resolves to shipped files',core.length>0&&!bad.length,bad.join(', '))}
{const all=[];(function walk(d,rel=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;e.isDirectory()?walk(path.join(d,e.name),r):all.push(r)}})(target);
 const stray=all.filter(f=>/(^|\/)(__MACOSX|node_modules|\.DS_Store)|\.(bak|orig|tmp|map|log)$|~$|(copy|mirror|debug|backup)[^/]*$/i.test(f));
 t('No accidental debug/backup/mirror files in release',!stray.length,stray.join(', '))}
t('SW repeat navigation is cache-first for the known-good shell',
  /request\.mode\s*===\s*['"]navigate['"][\s\S]{0,1800}caches\.match\(['"]\.\/index\.html['"]\)/.test(sw)&&
  !/request\.mode\s*===\s*['"]navigate['"][\s\S]{0,700}respondWith\(fetch\(event\.request\)/.test(sw));
t('SW updates do not auto-skip-waiting during install',
  !/addEventListener\(['"]install['"][\s\S]{0,1200}skipWaiting\s*\(/.test(sw));
t('Page reload on controllerchange requires an explicit update request',
  html.includes('bvom-update-reload-requested')&&!html.includes('bvom-controller-reload'));
t('Supabase browser client is pinned, same-origin and precached',
  html.includes('<script src="./vendor/supabase-js-2.117.3.js"></script>')&&
  !html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')&&
  sw.includes("'./vendor/supabase-js-2.117.3.js'"));
if(exists('vendor/supabase-js-2.117.3.js')){
 const vendor=read('vendor/supabase-js-2.117.3.js');
 t('Vendored Supabase JS 2.117.3 matches approved SHA-256',
   crypto.createHash('sha256').update(vendor).digest('hex')==='d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3');
}

// --- Build/cache identifiers (textual contract; carried from v5)
const header=(html.match(/BEST VERSION OF MYSELF · v([0-9.]+(?: BB DEV [0-9.]+)?)/i)||[])[1];
const build=(html.match(/BVOM_BUILD\s*=\s*['"]([^'"]+)['"]/i)||[])[1];
const swq=(html.match(/sw\.js\?v=([^'"&<]+)/i)||[])[1];
const cache=(sw.match(/const CACHE\s*=\s*['"]bvom-([^'"]+)['"]/i)||[])[1];
const docTitle=(html.match(/<title>\s*BVOM Strength v([^<]+)<\/title>/i)||[])[1]?.trim();
t('Build identifiers all present',!!header&&!!build&&!!swq&&!!cache);
t('Build identifiers agree (header, BVOM_BUILD, sw.js?v=, SW cache)',header?.replace(/ BB DEV /i,'-bb-dev').toLowerCase()===build?.toLowerCase()&&build===swq&&swq===cache,JSON.stringify({header,build,swq,cache}));
t('Browser document title matches BVOM_BUILD',!!docTitle&&docTitle===build,JSON.stringify({docTitle,build}));


// --- v2.8.3 maintenance contracts
const en=exists('i18n/en.js')?read('i18n/en.js'):'';
const ja=exists('i18n/ja.js')?read('i18n/ja.js'):'';
t('End-road copy no longer advertises HLM/4-Day as future features',!en.includes('future BVOM programming options')&&!ja.includes('今後のBVOMプログラム候補'));
t('End-road intermediate modal offers a Starting Setup route',html.includes('function bvomIntermediateProgramModal()')&&html.includes("OPEN STARTING SETUP")&&html.includes('()=>bvomStartingSetupModal()'));
{
 const hash12=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,12);
 const expected={en:hash12(en),ja:hash12(ja)};
 const indexTokens={
  en:(html.match(/\.\/i18n\/en\.js\?v=([^\"'&<]+)/)||[])[1],
  ja:(html.match(/\.\/i18n\/ja\.js\?v=([^\"'&<]+)/)||[])[1]
 };
 const swTokens={
  en:(sw.match(/\.\/i18n\/en\.js\?v=([^'\"]+)/)||[])[1],
  ja:(sw.match(/\.\/i18n\/ja\.js\?v=([^'\"]+)/)||[])[1]
 };
 t('Locale cache-busters match locale content hashes in index and SW CORE',
   indexTokens.en===expected.en&&indexTokens.ja===expected.ja&&swTokens.en===expected.en&&swTokens.ja===expected.ja,
   JSON.stringify({expected,indexTokens,swTokens}));
}
t('SW shell cache write failure does not discard fresh navigation response',sw.includes("cache.put('./index.html', copy).catch(() => {})"));

// --- Contractual Info wording (textual by nature)
t('EN Info: Bodybuilding — 8-Week Training Block',html.includes('Bodybuilding — 8-Week Training Block'));
t('JA Info: ボディビルディング — 8週間トレーニングブロック',html.includes('ボディビルディング — 8週間トレーニングブロック'));
t('EN mentions the optional On-Ramp',html.includes('On-Ramp'));
t('JA mentions the On-Ramp (オンランプ)',html.includes('オンランプ'));
t('RPE wording not falsely expanded to Bodybuilding numeric RPE',!/(RPE is recorded per working set[^<]{0,250}Bodybuilding)/i.test(html));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);

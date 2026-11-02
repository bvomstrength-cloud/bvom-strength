#!/usr/bin/env node
'use strict';
// Assemble a reviewable PR73 candidate. This never uploads or deploys anything.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const FILES=Object.freeze(['index.html','admin.html','sw.js','manifest.json',
 'icon-192.png','icon-512.png','og-image.png','theme-bee-v23c.svg',
 'theme-cherry-v23f.svg','theme-coastal-v23f.svg','i18n/en.js','i18n/ja.js',
 'vendor/supabase-js-2.117.3.js','bb2/browser-core.mjs','bb2/browser-host.mjs',
 'bb2/app-session.mjs','bb2/cloud-sidecar.mjs','bb2/cloud-coordinator.mjs']);
function packageBB2Test({sourceSha,output,zipFile,root=ROOT}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('A full source commit SHA is required');
 output=path.resolve(output);zipFile=path.resolve(zipFile);
 if(fs.existsSync(output))throw Error('Test output already exists; use a fresh directory');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const build=html.match(/BVOM_BUILD='([0-9.]+)'/)?.[1];
 const originalSw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 if(!build||!originalSw.includes("const BUILD = '"+build+"';"))throw Error('Build versions disagree');
 const generated=require('./build-bb2-browser.cjs').buildBundle();
 if(fs.readFileSync(path.join(root,'bb2/browser-core.mjs'),'utf8')!==generated.text)throw Error('Stale BB2 bundle');
 fs.mkdirSync(output,{recursive:true});
 for(const name of FILES){const dest=path.join(output,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,name),dest)}
 const marker=`<script data-bb2-test-build>window.__BVOM_BB2_TEST_BUILD=${JSON.stringify({pr:73,source:sourceSha})};
if(location.hostname.endsWith('.netlify.app')||location.hostname==='localhost'||location.hostname==='127.0.0.1'){
 const testUrl=new URL(location.href);testUrl.searchParams.set('bb2Preview','1');history.replaceState(null,'',testUrl);
}</script>`;
 if(!html.includes('<head>'))throw Error('Cannot place the test-build marker');
 fs.writeFileSync(path.join(output,'index.html'),html.replace('<head>','<head>\n'+marker));
 const cache='bvom-'+build+'-pr73-'+sourceSha.slice(0,12);
 const sw=originalSw.replace(/^const CACHE = '[^']+';$/m,"const CACHE = '"+cache+"';");
 if(sw===originalSw)throw Error('Cannot set the isolated test cache');
 fs.writeFileSync(path.join(output,'sw.js'),sw);
 const note=`BVOM BB2 TEST BUILD — PR #73 — NOT PRODUCTION\nSource: ${sourceSha}\nApp baseline: ${build}\nTest cache: ${cache}\n\nUnzip and upload the CONTENTS to a separate disposable *.netlify.app test site.\nBB2 is enabled automatically only in this marked build on that test hostname, or localhost.\nDo not upload to app.bvomstrength.com or replace the production site.\nSign in with a disposable test account; the existing account backend is used.\nBB2 saves locally and in exported backups; completed training and preferences sync through the revision-protected BVOM account transport. Never use production user credentials for testing.\n\nFresh BB2 setup: core sets 10 / 10 / 13 / 9 (42).\nUpper A optional curls: +2 sets; Upper B optional curls: +2 sets, independently.\nWith both enabled: 12 / 10 / 15 / 9 (46); Finish minimums 9 / 7 / 11 / 7.\nFriday: front squat, RDL, calves, abdominal work. No Friday Nordic curls.\nOlder preview setups retain their original catalogue. Use a fresh test account for the new setup.\n\nCheck setup, working loads/increments, warm-up, set recording, Finish, History,\noffline reload, switching programmes and Export Backup before approving release.\nNothing in this ZIP deploys or merges the PR.\n`;
 fs.writeFileSync(path.join(output,'NETLIFY-TEST-BUILD.txt'),note);
 fs.mkdirSync(path.dirname(zipFile),{recursive:true});
 cp.execFileSync('python3',['-c',`import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(root.rglob('*')):\n  if p.is_file(): z.write(p,p.relative_to(root).as_posix())\nwith zipfile.ZipFile(sys.argv[2]) as z:\n assert z.testzip() is None\n`,output,zipFile]);
 return {sourceSha,build,cache,output,zipFile,files:[...FILES,'NETLIFY-TEST-BUILD.txt']};
}
if(require.main===module){
 const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
 if(!args.includes('--source-sha')||!args.includes('--output')||!args.includes('--zip'))throw Error('Use --source-sha SHA --output DIR --zip FILE');
 console.log(JSON.stringify(packageBB2Test({sourceSha:get('--source-sha'),output:get('--output'),zipFile:get('--zip')}),null,2));
}
module.exports={packageBB2Test,FILES};

#!/usr/bin/env node
'use strict';
// Committed source only; creates a separate-site review artifact, never deploys.
// Production backend credentials are replaced in BOTH entry points. A hosted
// test backend is deliberately not invented or provisioned by this packager.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {FILES}=require('./package-bb2-test.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const forbidden=new Set(['hkteienxwdsjncchuvnz.supabase.co','eyockhubhkbacnmprahj.supabase.co']);
function packageMonkeyTest({sourceSha,output,zipFile,cloudUrl='',cloudKey='',root=path.resolve(__dirname,'..')}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Full committed source SHA required');
 output=path.resolve(output);zipFile=path.resolve(zipFile);if(fs.existsSync(output)||fs.existsSync(zipFile))throw Error('Fresh output paths required');
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
 if(git('rev-parse',sourceSha+'^{commit}').toString().trim()!==sourceSha)throw Error('Commit identity mismatch');
 let configured=!!cloudUrl;if(configured){const url=new URL(cloudUrl);if(url.protocol!=='https:'||forbidden.has(url.hostname)||!url.hostname.endsWith('.supabase.co'))throw Error('Explicit isolated HTTPS Supabase project required; production and unrelated existing projects forbidden');if(!cloudKey||cloudKey.startsWith('sb_secret_'))throw Error('Isolated publishable/anon key required; never package a service key');
  if(cloudKey.split('.').length===3){const claims=JSON.parse(Buffer.from(cloudKey.split('.')[1],'base64url'));if(claims.role!=='anon')throw Error('Only anon JWT keys may be packaged')}
 }else if(cloudKey)throw Error('Cloud URL and key must be supplied together');
 const source=new Map(FILES.map(f=>[f,git('show',sourceSha+':'+f)])),sourceHashes=Object.fromEntries([...source].map(([f,b])=>[f,sha(b)]));
 const build='3.0.4',cache='bvom-'+build+'-monkey-test-'+sourceSha.slice(0,12),files=new Map(source);
 if(!source.get('index.html').includes(Buffer.from("const BVOM_BUILD='3.0.4'"))||!source.get('sw.js').includes(Buffer.from("const BUILD = '3.0.4';")))throw Error('Expected coherent v3.0.4 source');
 // Placeholder fails closed. Configure a disposable hosted backend and rebuild
 // with --cloud-url / --cloud-key after the separately reviewed SQL migration.
 const endpoint=cloudUrl||'https://isolated-monkey-backend.invalid',key=cloudKey||'isolated-test-cloud-not-configured';
 for(const f of ['index.html','admin.html']){
  let text=source.get(f).toString();
  text=text.replace(/const BVOM_SUPABASE_URL='[^']+';/,"const BVOM_SUPABASE_URL="+JSON.stringify(endpoint)+';')
   .replace(/const BVOM_SUPABASE_KEY='[^']+';/,"const BVOM_SUPABASE_KEY="+JSON.stringify(key)+';');
  if(/hkteienxwdsjncchuvnz\.supabase\.co|sb_publishable_73S6/.test(text))throw Error('Production backend reference remains');
  if(f==='index.html')text=text.replace('<title>BVOM Strength v3.0.4</title>','<title>BVOM Strength v3.0.4 — MONKEY TEST</title>')
   .replace('BEST VERSION OF MYSELF · v3.0.4','v3.0.4 · MONKEY TEST — NOT PRODUCTION')
   .replace('<head>','<head>\n<script data-monkey-test-build>window.__BVOM_MONKEY_TEST_BUILD='+JSON.stringify({sourceSha,build,cloudConfigured:configured})+';</script>');
  files.set(f,Buffer.from(text));
 }
 files.set('sw.js',Buffer.from(source.get('sw.js').toString().replace(/^const CACHE = '[^']+';$/m,"const CACHE = '"+cache+"';")));
 const metadata={sourceSha,build,cache,status:configured?'ISOLATED TEST ONLY':'HOLD — HOSTED ISOLATED CLOUD NOT CONFIGURED',cloudConfigured:configured,cloudUrl:endpoint,sourceHashes,
  transformations:{'index.html':'Test title/header/marker; isolated cloud endpoint/key','admin.html':'Isolated cloud endpoint/key','sw.js':'Commit-specific test cache'},
  manifestIdentityUnchanged:sha(files.get('manifest.json'))===sourceHashes['manifest.json']};
 files.set('SOURCE.json',Buffer.from(JSON.stringify(metadata,null,2)+'\n'));
 files.set('NETLIFY-TEST-BUILD.txt',Buffer.from('BVOM v3.0.4 — MONKEY TEST ONLY\nSource: '+sourceSha+'\nStatus: '+metadata.status+'\n\nUpload CONTENTS to a new disposable Netlify test site only. Never use the production site.\nNo merge, deployment or production SQL is authorized.\n\n'+(configured?'Configured isolated backend: '+endpoint+'\nUse disposable test accounts only.\n':'This review ZIP intentionally has no usable cloud backend. Fresh authenticated setup is unavailable.\nProvision an isolated Supabase project, apply the reviewed migration there, and REBUILD with\n--cloud-url https://ISOLATED.supabase.co --cloud-key ISOLATED_PUBLISHABLE_OR_ANON_KEY.\nDo not substitute the production backend or the unrelated LEAKwise project.\n')+'\nFollow docs/v3.0.4-cloud-rollout.md in the source branch. Native physical PWA acceptance and\nhosted isolation/rollout approval remain release gates. The manifest identity is unchanged.\n'));
 fs.mkdirSync(output,{recursive:true});for(const [f,b]of files){fs.mkdirSync(path.dirname(path.join(output,f)),{recursive:true});fs.writeFileSync(path.join(output,f),b)}
 fs.mkdirSync(path.dirname(zipFile),{recursive:true});
 const epoch=git('show','-s','--format=%ct',sourceSha).toString().trim();
 cp.execFileSync('python3',['-c',`import sys,pathlib,zipfile,datetime
root=pathlib.Path(sys.argv[1]);stamp=datetime.datetime.fromtimestamp(int(sys.argv[3]),datetime.timezone.utc).timetuple()[:6]
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   i=zipfile.ZipInfo(p.relative_to(root).as_posix(),stamp);i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,p.read_bytes())
with zipfile.ZipFile(sys.argv[2]) as z: assert z.testzip() is None
`,output,zipFile,epoch]);
 const result={...metadata,zipFile,zipSha256:sha(fs.readFileSync(zipFile)),packagedHashes:Object.fromEntries([...files].map(([f,b])=>[f,sha(b)]))};fs.writeFileSync(zipFile+'.manifest.json',JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;const r=packageMonkeyTest({sourceSha:get('--source-sha'),output:get('--output'),zipFile:get('--zip'),cloudUrl:get('--cloud-url'),cloudKey:get('--cloud-key')});console.log(JSON.stringify({sourceSha:r.sourceSha,status:r.status,zipFile:r.zipFile,zipSha256:r.zipSha256},null,2))}
module.exports={packageMonkeyTest};

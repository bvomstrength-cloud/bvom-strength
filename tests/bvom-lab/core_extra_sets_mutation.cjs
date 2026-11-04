'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mutations=[
 ['extra fills a missing prescribed set','CORE-EXTRAS-PROGRESSION',"function coreResult(n){\n const plan=getSetPlan(n)","function coreResult(n){\n const extra=Object.values(state.session[n]||{}).find(x=>x?.extra);if(extra&&!state.session[n][0])state.session[n][0]=extra;\n const plan=getSetPlan(n)"],
 ['extra changes failure count','CORE-EXTRAS-PROGRESSION','ss[key]={load,reps,extra:true};','ss[key]={load,reps,extra:true};state.attempts[n]=0;'],
 ['extra hides queued Heavy driver','CORE-EXTRAS-PENDING-DRIVER',"const hasCurrent=Object.keys(state.session?.[n]||{}).some(k=>/^\\d+$/.test(k))","const hasCurrent=!!Object.keys(state.session?.[n]||{}).length"],
 ['prescribed correction erases extras','CORE-EXTRAS-LIFECYCLE','if(Number.isInteger(idx)&&idx>i)delete ss[k]','if(k.startsWith(\'EXTRA:\')||(Number.isInteger(idx)&&idx>i))delete ss[k]'],
];
for(const [name,id,from,to]of mutations){assert.ok(html.includes(from),'stale mutation '+name);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bvom-extra-mutant-'));try{fs.mkdirSync(path.join(dir,'i18n'));for(const f of ['en.js','ja.js'])fs.copyFileSync(path.join(root,'i18n',f),path.join(dir,'i18n',f));fs.writeFileSync(path.join(dir,'index.html'),html.slice(0,html.lastIndexOf(from))+to+html.slice(html.lastIndexOf(from)+from.length));const r=cp.spawnSync(process.execPath,[path.join(__dirname,'behaviour_guard.js'),dir,'--only='+id,'--json'],{encoding:'utf8'});assert.equal(r.status,1,'mutation survived: '+name+' '+r.stderr);assert.ok(r.stdout.trim(),'mutation test did not return results: '+r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.length,1);assert.equal(result[0].pass,false);console.log('KILLED '+name)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
console.log('RESULT 4/4 extra-set mutations killed');

'use strict';
// Optional LOCAL dummy-only Android field test. Never deploy this server or use real backups.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const H=require('./lib/bvom_harness'),root=path.resolve(__dirname,'../..');
const port=Number(process.argv[2]||33331);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use an unused port between 1024 and 65535');
const h=H.boot(H.loadBuild(root),{supabase:null,online:false});H.configureLP(h,{Squat:60,'Bench Press':45,'Prone Row':40,'Overhead Press':30,Deadlift:75});
h.S().accessoryList=[];h.S().gppList=[{id:'dummy-erg',name:'Dummy erg',assignment:'Both',hlmAssignment:'Any',fourDayAssignment:'Any',metrics:{time:true},planned:{timeSeconds:60}}];h.S().core['Bench Press'].mode='rpt';h.ev('save()');
const data=JSON.stringify(h.S()).replace(/</g,'\\u003c');
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'";
const init=`<!doctype html><meta name="viewport" content="width=device-width"><title>BVOM DUMMY TEST ONLY</title><h2>BVOM isolated dummy workout test</h2><p>No real accounts, backups or services. This loopback origin is separate from production. External connections are blocked.</p><button id="start">Create dummy workout profile</button><p id="status"></p><p><a href="/index.html">Continue existing dummy test</a></p><script>
document.getElementById('start').onclick=()=>{
 if(localStorage.getItem('bvom_data')){document.getElementById('status').textContent='Data already exists on this origin. Nothing replaced. Continue your existing dummy test, or choose another unused port. Never clear or replace real data.';return}
 localStorage.setItem('bvom_data',JSON.stringify(${data}));localStorage.setItem('bvom_data_owner','dummy-phone-owner');localStorage.setItem('bvom_entitlement_cache_dummy-phone-owner',JSON.stringify({userId:'dummy-phone-owner',verifiedAt:new Date().toISOString(),record:{user_id:'dummy-phone-owner',status:'complimentary'}}));location.href='/index.html';
};</script>`;
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store');
 if(pathname==='/__dummy__'){res.setHeader('Content-Type','text/html');res.end(init);return}
 if(pathname.startsWith('/vendor/')){res.setHeader('Content-Type','text/javascript');res.end('// TEST ONLY: Supabase unavailable. Verified dummy local owner; no external services.');return}
 const f=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type',f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.svg')?'image/svg+xml':'image/png');res.end(fs.readFileSync(f));
}).listen(port,'127.0.0.1',()=>console.log(`LOCAL DUMMY ONLY: http://localhost:${port}/__dummy__\nAndroid USB: adb reverse tcp:${port} tcp:${port}\nNo deployment; external accounts/services blocked. Ctrl-C stops the server.`));

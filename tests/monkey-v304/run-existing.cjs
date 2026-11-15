'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.BVOM_MONKEY_OUT||path.join(root,'artifacts/monkey-v304/existing'));
fs.mkdirSync(out,{recursive:true});
const suites=[
 ['working_weight_display_browser.cjs'],['core_extra_sets_browser.cjs'],['recovery_browser.cjs'],['lifecycle_repair_browser.cjs'],
 ['bb2_browser_host_browser.cjs'],['bb2_app_session_browser.cjs'],['bb2_integrated_setup_preview_browser.cjs'],
 ['bb2_android_acceptance_browser.cjs'],['bb2_mobile_repairs_browser.cjs'],['bb2_mobile_repairs_browser.cjs','--nordic'],
 ['bb2_shared_interface_browser.cjs'],['bb2_shared_progression_browser.cjs'],['bb2_history_display_browser.cjs'],
 ['bb2_next_flow_browser.cjs'],['bb2_test_package_browser.cjs'],['starting_setup_browser.cjs'],['bodyweight_browser.cjs'],
 ['bodyweight_monkey018.cjs'],['bb_warmup_monkey021.cjs'],['bb_manual_load_browser.cjs'],['sw_same_version_warmup_restore_browser.cjs']
];
const results=[];
for(const [file,...args]of suites){
 const label=file.replace('.cjs','')+(args.length?'-nordic':''),folder=path.join(out,label);fs.mkdirSync(folder,{recursive:true});
 const log=fs.openSync(path.join(out,label+'.log'),'w'),started=Date.now();
 const r=spawnSync(process.execPath,[path.join(root,'tests/bvom-lab',file),...args],{cwd:root,stdio:['ignore',log,log],env:{...process.env,
  NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require',path.join(__dirname,'use-system-chromium.cjs')].filter(Boolean).join(' '),
  BVOM_CHROMIUM_PATH:process.env.BVOM_CHROMIUM_PATH||'/usr/bin/chromium',BB2_ANDROID_OUTPUT:folder},timeout:300000});fs.closeSync(log);
 results.push({file,args,exitCode:r.status,error:r.error?.message||null,durationMs:Date.now()-started,pass:r.status===0});
 console.log(r.status===0?'PASS':'FAIL',label);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}
if(results.some(r=>!r.pass))process.exitCode=1;

'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('./platform.cjs');const{profiles}=require('./monkeys.cjs');
async function main(){const platform=await P.start(),e=new P.Evidence('Mobile',{widths:[320,360,390,430],languages:['en','ja']}),errors=[];let cases=0;
 try{for(const width of [320,360,390,430])for(const lang of ['en','ja'])for(const profile of profiles){
  const state=JSON.parse(fs.readFileSync(path.join(P.out,profile.name.toLowerCase(),'week-04.json'))).state;
  const d=await platform.device({...profile,width},{data:state}),p=d.page;const context={width,lang,name:profile.name,mode:profile.mode};
  try{await P.tab(p,'settings');await p.locator('button[onclick="changeLanguage(\''+lang+'\')"]').first().click();await P.settle(p);
   for(const view of ['workout','warmup','history','settings']){
    await P.tab(p,view);const metrics=await p.evaluate(view=>{
     const root=document.querySelector('#'+view),vw=innerWidth,visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
     const controls=[...root.querySelectorAll('button,input,select,textarea')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {text:(el.textContent||el.getAttribute('aria-label')||el.id||el.tagName).trim().slice(0,100),x:r.x,right:r.right,width:r.width,height:r.height,overflow:el.scrollWidth>el.clientWidth+1};});
     return {documentWidth:document.documentElement.scrollWidth,viewport:vw,offscreenControls:controls.filter(x=>x.x<-.5||x.right>vw+.5),clippedControlText:controls.filter(x=>x.overflow),smallControls:controls.filter(x=>x.width<24||x.height<24)};
    },view);
    const ok=e.check('no horizontal viewport overflow',metrics.documentWidth<=width,true,{...context,view});const controls=e.check('all visible controls horizontally reachable',metrics.offscreenControls,[],{...context,view});e.action('viewport-observation',{...context,view,...metrics});
    if(!ok||!controls||metrics.clippedControlText.length)await p.screenshot({path:path.join(P.out,'screenshots','mobile-'+profile.name+'-'+lang+'-'+width+'-'+view+'.png'),fullPage:true});
   }
   // Open an actual recording modal and check its controls at this viewport.
   await P.tab(p,'workout');const modalButton=profile.mode==='bodybuilding'?p.locator('#workout button[onclick^="bvomBbSetModal("]').first():profile.mode==='free'?p.locator('#workout button[onclick^="bvomFtSetModal("]').first():profile.mode==='bb2'?p.locator('#workout [data-bb2-next-workout]'):p.locator('#workout button[onclick^="tapSet("]').first();
   if(await modalButton.count()){await modalButton.click();if(profile.mode==='bb2'){await p.locator('#setup [data-bb2-start]').click();await p.locator('#workout [data-bb2-set]').first().click();}const m=p.locator('.bvomModalOverlay').last();if(await m.count()){
    const bounds=await m.evaluate(el=>{const d=el.querySelector('.bvomModal'),r=d.getBoundingClientRect();return {x:r.x,right:r.right,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};});e.check('recording modal fits width',bounds.x>=0&&bounds.right<=width&&bounds.scrollWidth<=width,true,{...context,bounds});const close=m.locator('[data-c],[data-cancel]').first();if(await close.count())await close.click();
   }}cases++;console.log('EXECUTED',profile.name,lang,width);
  }catch(error){errors.push({...context,error:error.stack});await p.screenshot({path:path.join(P.out,'screenshots','mobile-error-'+profile.name+'-'+lang+'-'+width+'.png'),fullPage:true});}finally{await d.context.close();e.write();}
 }}finally{e.write();fs.writeFileSync(path.join(e.path,'execution.json'),JSON.stringify({cases,errors,stats:e.stats},null,2));if(errors.length||e.stats.failedAssertions)process.exitCode=1;await platform.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});

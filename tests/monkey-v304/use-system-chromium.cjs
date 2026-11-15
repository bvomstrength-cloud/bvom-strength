'use strict';
// Runner adaptation only: use the environment's real Chromium installation.
const {chromium}=require('playwright'),launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,executablePath:'/usr/bin/chromium',args:[...(options?.args||[]),'--no-sandbox']});
const persistent=chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext=(dir,options)=>persistent(dir,{...options,executablePath:'/usr/bin/chromium',
 args:[...(options?.args||[]).filter(x=>!['--single-process','--no-zygote'].includes(x)),'--no-sandbox']});

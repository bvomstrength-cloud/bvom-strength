'use strict';

const assert = require('node:assert/strict');
process.env.BVOM_MONKEY_OUT??=require('node:os').tmpdir();
const P = require('../monkey-v304/platform.cjs');

async function scenario(platform,lang,width) {
 const profile={name:'Accessory and conditioning',mode:'lprpt',lang,width};
 const data=P.fixture(profile);
 data.day='B';
 data.accessoryList=[
  {id:'hidden-acc',name:'A-only accessory',category:'Upper',assignment:'A',equipment:'machine',style:'straight',weight:20,increment:2.5,sets:3,reps:8}
 ];
 data.gppList=[
  {id:'walk',name:'Walk',assignment:'B',metrics:{time:true},planned:{timeSeconds:600}},
  {id:'hidden-gpp',name:'A-only activity',assignment:'A',metrics:{time:true},planned:{timeSeconds:300}},
  {id:'bike',name:'Bike',assignment:'B',metrics:{time:true},planned:{timeSeconds:480}}
 ];
 const {page,context}=await platform.device(profile,{data,owner:'ui-v312'});
 const dialogs=[];
 page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});
 const open=()=>page.locator('#workout button[onclick="openAccessoryBuilder()"]').click();
 const add=async(name,category='Upper')=>{
  await open();
  await page.locator('#accCat').selectOption(category);
  await page.locator('#accName').selectOption('Custom');
  await page.locator('#accCustom').fill(name);
  assert.equal(await page.locator('#accAssign').inputValue(),'B');
  await page.locator('#accEquipment').selectOption('bodyweight');
  assert.equal(await page.locator('#accWorkingWeight').isVisible(),false);
  assert.equal(await page.locator('#accWeight').isVisible(),false);
  return page.locator('.accBuilder');
 };
 const card=id=>page.locator(`#workout [data-optional-id="${id}"]`);
 const order=()=>page.evaluate(()=>[state.accessoryList.map(x=>x.id),state.gppList.map(x=>x.id)]);
 try{
  let form=await add('Nordic Curl','Lower');
  await form.locator('#accBwResistance').fill('Level3');
  await form.locator('summary').click();
  assert.equal(await form.locator('#accWeight').inputValue(),'0');
  assert.equal(await form.locator('#accBwInc').isVisible(),false);
  await form.locator('#accBwEstimate').fill('50');
  await form.locator('#accBwInc').evaluate(field=>{field.value='0'});
  await form.locator('#accSave').click();
  const nordic=(await P.stored(page)).accessoryList.at(-1);
  assert.equal(nordic.weight,0);assert.equal(nordic.increment,0);
  assert.equal(nordic.approximateBodyweight,50);assert.equal(nordic.resistance,'Level3');
  assert.equal(await card(nordic.id).locator('.weight').textContent(),'BW');
  for(const weight of ['0.25','0']){
   await card(nordic.id).locator('[onclick*="openAccessoryBuilder"]').click();
   await page.locator('.accBuilder summary').click();
   await page.locator('#accWeight').fill(weight);
   await page.locator('#accSave').click();
   const edited=(await P.stored(page)).accessoryList.at(-1);
   assert.deepEqual(edited,{...nordic,weight:Number(weight)});
  }

  form=await add('Chin-ups');
  await form.locator('summary').click();
  await form.locator('#accWeight').fill('-1');
  await form.locator('#accSave').click();
  assert.equal(await form.locator('#accWeight').getAttribute('aria-invalid'),'true');
  assert.equal(await form.locator('#accCustom').inputValue(),'Chin-ups');
  const invalid=form.locator('[data-form-error]');
  assert.ok(await invalid.isVisible());
  assert.equal(await invalid.evaluate(el=>el.previousElementSibling.querySelector('input').id),'accWeight');
  await form.locator('#accWeight').fill('2.5');
  await form.locator('#accBwProgress').check();
  assert.ok(await form.locator('#accBwInc').isVisible());
  await form.locator('#accBwInc').fill('0');
  await form.locator('#accSave').click();
  assert.equal(await form.locator('#accBwInc').getAttribute('aria-invalid'),'true');
  await form.locator('#accBwInc').fill('');
  await form.locator('#accSave').click();
  assert.equal(await form.locator('#accBwInc').getAttribute('aria-invalid'),'true');
  await form.locator('#accBwInc').fill('1.25');
  await form.locator('#accSave').click();
  const chin=(await P.stored(page)).accessoryList.at(-1);
  assert.equal(chin.weight,2.5);assert.equal(chin.increment,1.25);assert.equal(chin.bwProgressOptIn,true);
  assert.match(await card(chin.id).locator('.weight').textContent(),/^BW \+ 2.5 kg$/);

  form=await add('Push-ups');
  await form.locator('summary').click();
  await form.locator('#accWeight').fill('');
  await form.locator('#accBwInc').evaluate(field=>{field.value=''});
  await form.locator('#accSave').click();
  const push=(await P.stored(page)).accessoryList.at(-1);
  assert.equal(push.weight,0);assert.equal(push.increment,0);
  assert.equal(push.approximateBodyweight,null);assert.equal(push.resistance,'');

  await page.locator('#workout button[onclick="openGppBuilder()"]').click();
  const gpp=page.locator('.bvomGppBuilder');
  await gpp.locator('[data-s]').click();
  assert.equal(await gpp.locator('[data-name]').getAttribute('aria-invalid'),'true');
  await gpp.locator('[data-name]').fill('Cancelled activity');
  await gpp.locator('[data-metric="sets"]').check();
  await gpp.locator('summary').click();
  await gpp.locator('[data-v="sets"]').fill('0');
  await gpp.locator('[data-s]').click();
  assert.equal(await gpp.locator('[data-v="sets"]').getAttribute('aria-invalid'),'true');
  await gpp.locator('[data-metric="time"]').check();
  assert.equal(await gpp.locator('[data-v="sets"]').inputValue(),'0');
  await gpp.locator('[data-s]').click();
  assert.equal(await gpp.locator('[data-v="sets"]').getAttribute('aria-invalid'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await gpp.count(),0);
  assert.equal((await P.stored(page)).gppList.length,3);

  const main=await page.locator('#workout > .exercise').evaluateAll(cards=>cards.map(x=>x.id));
  await card(chin.id).locator('[data-step="-1"]').click();
  await card('bike').locator('[data-step="-1"]').click();
  const ordered=[[ 'hidden-acc',chin.id,nordic.id,push.id],['bike','hidden-gpp','walk']];
  assert.deepEqual(await order(),ordered);
  assert.deepEqual(await page.locator('#workout > .exercise').evaluateAll(cards=>cards.map(x=>x.id)),main);
  await page.reload();await P.ready(page);
  assert.deepEqual(await order(),ordered);
  assert.equal((await P.stored(page)).accessoryList.find(x=>x.id===nordic.id).increment,0);
  await page.locator('#workout button[onclick="switchDay(\'A\')"]').click();
  assert.ok(await card('hidden-gpp').isVisible());
  assert.ok(await card('hidden-acc').isVisible());
  assert.equal(await card(nordic.id).count(),0);
  await page.locator('#workout button[onclick="switchDay(\'B\')"]').click();

  const press=lang==='ja'?'オーバーヘッドプレス':'Press';
  const lift=page.locator('#work-OverheadPress');
  assert.equal(await lift.locator('.exname').textContent(),press);
  assert.match(await lift.locator('.set').first().getAttribute('aria-label'),new RegExp('^'+press+' ·'));
  await lift.locator('.set').first().click();
  const modal=page.getByRole('dialog',{name:new RegExp('^'+press+' ·')});
  assert.equal(await modal.count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(),0);
  assert.equal(Object.keys(await page.evaluate(()=>state.session['Overhead Press']||{})).length,0);
  assert.deepEqual(dialogs,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS',lang,width,'bodyweight add/edit validation, weighted progression, optional ordering/reload, Press and safe Escape');
 }finally{await context.close()}
}

(async()=>{
 const platform=await P.start();
 try{
  for(const [lang,width] of [['en',320],['ja',390],['en',430]])await scenario(platform,lang,width);
 }finally{await platform.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

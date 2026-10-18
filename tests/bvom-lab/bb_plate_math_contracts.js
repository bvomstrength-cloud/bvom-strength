'use strict';
// Issue #62 follow-up: Bodybuilding free-bar warmup plate maths, actual
// available settings and NO false Smith/landmine/DB machine assumptions.
module.exports=({test,ok,H,build})=>{
 const make=(lang='en')=>{
  const h=H.boot(build);H.bbStart(h);
  h.S().bodybuilding.selections.A2='high_bar_squat';
  h.S().bodybuilding.progression.high_bar_squat={load:102.5,topLoad:102.5,increment:2.5,calibrated:true};
  h.S().language=lang;h.S().bar=20;h.S().barByLift={Squat:20};
  h.S().enabledStandard=[20,10,5,2.5,1.25];h.S().enabledMicro=[];
  h.ev('save()');h.ctx.renderWarm();return h;
 };
 test('BBPLATE-FREEBAR','DEFECT','Free barbell warm-up and working weights display configured per-side plate loading',()=>{
  const h=make(),n=h.ctx.bvomBbWarmPlateText;
  if(typeof n!=='function')return ok(false,'Missing Bodybuilding plate calculator');
  const empty=n('high_bar_squat',20),forty=n('high_bar_squat',40),full=n('high_bar_squat',102.5);
  const html=h.els['#warmup'].innerHTML;
  return ok(empty===h.ctx.bvomT('warmup.emptyBar')&&
   forty.includes('10')&&forty.includes(h.ctx.bvomT('warmup.perSide'))&&
   full.includes('20 + 20 + 1.25')&&full.includes(h.ctx.bvomT('warmup.perSide'))&&
   html.includes(full)&&html.includes(forty)&&!html.includes('warm-up only'),
   JSON.stringify({empty,forty,full,hasInHtml:html.includes(full)}));
 });
 test('BBPLATE-BAR-AND-UNLOADABLE','DEFECT','Respects per-lift 15kg bar and never invents plates when configured inventory cannot load weight',()=>{
  const h=make(),s=h.S();s.barByLift.Squat=15;s.enabledStandard=[20,10,5];
  h.ctx.renderWarm();
  const helper=h.ctx.bvomBbWarmPlateText;
  const fiftyFive=helper('high_bar_squat',55),fifty=helper('high_bar_squat',50);
  return ok(fiftyFive.includes('20')&&fiftyFive.includes(h.ctx.bvomT('warmup.perSide'))&&
    fifty===h.ctx.bvomT('warmup.notLoadable')&&
    helper('high_bar_squat',15)===h.ctx.bvomT('warmup.emptyBar')&&
    helper('high_bar_squat',12)===h.ctx.bvomT('warmup.belowBar'),
    JSON.stringify({fiftyFive,fifty}));
 });
 test('BBPLATE-MICRO-AND-LANG','DEFECT','Configured micro plates appear only when enabled for mapped barbell lift; Japanese uses translated units',()=>{
  const h=make('ja'),s=h.S();s.enabledMicro=[0.5];s.plateMode.Squat='micro';
  const withMicro=h.ctx.bvomBbWarmPlateText('high_bar_squat',101);
  s.plateMode.Squat='standard';
  const standard=h.ctx.bvomBbWarmPlateText('high_bar_squat',101);
  return ok(withMicro.includes('0.5')&&withMicro.includes(h.ctx.bvomT('warmup.perSide'))&&
     standard===h.ctx.bvomT('warmup.notLoadable'),
     JSON.stringify({withMicro,standard}));
 });
 test('BBPLATE-REAL-FREEBAR-ONLY','DEFECT','Never present ordinary-barbell plates for Smith, landmine, dumbbells, cable, or machine',()=>{
  const h=make(),fn=h.ctx.bvomBbWarmPlateText;
  if(typeof fn!=='function')return ok(false,'Missing plate helper');
  const ids=['smith_squat','smith_bench_press','incline_smith_press','landmine_row',
   'hack_squat','leg_press','chest_supported_row','dumbbell_bench_press','chin_up'];
  return ok(ids.every(id=>fn(id,60)==='')&&fn('barbell_row',60).includes(h.ctx.bvomT('warmup.perSide'))&&
    fn('romanian_deadlift',60).includes(h.ctx.bvomT('warmup.perSide')),
    JSON.stringify(ids.map(id=>[id,fn(id,60)])));
 });
 test('BBPLATE-NO-DATA-MUTATION','DEFECT','Warmup plate display is read-only and cannot change History, planned reps, progress or workout count',()=>{
  const h=make(),before=h.ls.getItem('bvom_data');
  h.ctx.bvomBbWarmPlateText('high_bar_squat',102.5);h.ctx.renderWarm();
  return ok(h.ls.getItem('bvom_data')===before&&
   h.S().bodybuilding.completedSessions===0&&h.S().history.length===0,
   'no writes');
 });
};
import test from 'node:test';
import assert from 'node:assert/strict';
import {PresentationStallWatch} from '../src/presentation-stall-watch.mjs';
const active={ready:true,active:true,paused:false,overlay:false};
const sample=(watch,now,decoded,rendered,received,extra={})=>
 watch.observe({...active,now,decoded,rendered,received,...extra});

test('regression: decoder advances 30-60fps while VIDAA always reports rendered=0 - NEVER rebuild',()=>{
 const watch=new PresentationStallWatch();
 for(let i=0;i<100;i++){
  const r=sample(watch,100000+i*4000,100+i*200,0,100+i*600);
  assert.equal(r.action,'none','i='+i);
  if(i>0)assert.equal(r.reason,'render-counter-unverified');
 }
});
test('a previously advancing rendered counter must precede any automatic intervention',()=>{
 const w=new PresentationStallWatch();
 assert.equal(sample(w,100000,100,50,100).action,'none');
 assert.equal(sample(w,104000,200,100,250).action,'none');
 assert.equal(sample(w,108000,320,100,350).action,'none');
 assert.equal(sample(w,112000,450,100,450).action,'none');
 const r=sample(w,116000,550,100,550);
 assert.equal(r.action,'keyframe');
 assert.equal(r.measurable,true);
});
test('brief stall recovers naturally without pause, keyframe or surface replacement',()=>{
 const w=new PresentationStallWatch();
 sample(w,100000,100,2,200);
 sample(w,104000,180,20,300);
 assert.equal(sample(w,108000,220,20,400).action,'none');
 assert.equal(sample(w,112000,270,22,500).action,'none');
 assert.equal(sample(w,116000,320,22,600).action,'none');
});
test('confirmed prolonged stall first requests only a keyframe; surface later if manually enabled',()=>{
 const w=new PresentationStallWatch();
 sample(w,100000,100,50,100);
 sample(w,104000,200,60,300);
 sample(w,108000,300,60,400);
 sample(w,112000,400,60,500);
 assert.equal(sample(w,116000,500,60,600).action,'keyframe');
 w.acknowledgeKeyframe(116000);
 for(let t=120000;t<136000;t+=4000)assert.equal(sample(w,t,500+(t-116000)/20,60,600+(t-116000)/8).action,'none');
 assert.equal(sample(w,136000,1500,60,2500).action,'surface');
 w.acknowledgeSurface(136000);
 // The counter may reset to 0 on newly created DOM VIDEO: do not repair
 assert.equal(sample(w,140000,2000,0,3000).action,'none');
 assert.equal(sample(w,144000,2200,0,3200).action,'none');
 assert.equal(sample(w,148000,2400,0,3400).action,'none');
});
test('paused video, overlay, lost RTP and stats gaps do not count as renderer freezes',()=>{
 const w=new PresentationStallWatch();
 sample(w,100000,100,20,300);
 sample(w,104000,200,40,500);
 assert.equal(sample(w,108000,300,40,600,{overlay:true}).action,'none');
 assert.equal(sample(w,112000,400,40,700,{paused:true}).action,'none');
 assert.equal(sample(w,116000,500,40,700).action,'none');
 assert.equal(sample(w,120000,600,null,850).action,'none');
 assert.equal(sample(w,124000,700,40,900).action,'none');
});
test('a first positive framesRendered value without observed progress is insufficient',()=>{
 const w=new PresentationStallWatch();
 for(let i=0;i<6;i++){
  assert.equal(sample(w,100000+i*4000,100+i*100,12,200+i*200).action,'none');
 }
});

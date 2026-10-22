import test from 'node:test';
import assert from 'node:assert/strict';
import {MetroStartupKeyframePreflight} from '../src/metro-startup-keyframe.mjs';
const sample=(now,freezeCount,extra={})=>({
 metro:true,now,firstVideoAt:1000,freezeCount,decodedDelta:195,
 receivedDelta:2700,videoReadyState:4,connected:true,overlayOpen:false,...extra
});
test('preflight requests at most two keyframes during real Metro startup freezes',()=>{
 const watch=new MetroStartupKeyframePreflight();
 assert.equal(watch.observe(sample(1000,0)),false);
 assert.equal(watch.observe(sample(20000,2)),true);
 assert.equal(watch.observe(sample(28000,2)),false);
 assert.equal(watch.observe(sample(40000,4)),true);
 assert.equal(watch.observe(sample(60000,5)),false);
 assert.equal(watch.requests,2);
});
test('preflight never requests after warmup, during ad first seconds, or without incoming frames',()=>{
 const watch=new MetroStartupKeyframePreflight();
 watch.observe(sample(1000,0));
 for(const changes of [
  {now:7000,freezeCount:1},{now:8000,freezeCount:2,receivedDelta:0},
  {now:9000,freezeCount:3,decodedDelta:0},
  {now:10000,freezeCount:4,connected:false},
  {now:11000,freezeCount:5,overlayOpen:true},
  {now:12000,freezeCount:6,videoReadyState:1},
  {now:121000,freezeCount:7},
 ])assert.equal(watch.observe(sample(changes.now,changes.freezeCount,changes)),false);
 assert.equal(watch.requests,0);
});
test('preflight does not modify other games and resets on new stream',()=>{
 const watch=new MetroStartupKeyframePreflight();
 watch.observe(sample(1000,0));
 assert.equal(watch.observe(sample(20000,2,{metro:false})),false);
 assert.equal(watch.observe(sample(40000,4)),true);
 watch.reset();
 assert.equal(watch.observe(sample(50000,4)),false);
});
test('freeze counter jumps alone are not evidence without decoded frame progress',()=>{
 const watch=new MetroStartupKeyframePreflight();
 watch.observe(sample(1000,0));
 assert.equal(watch.observe(sample(20000,2,{decodedDelta:0})),false);
 assert.equal(watch.observe(sample(26000,2)),false);
 assert.equal(watch.observe(sample(32000,3)),true);
});

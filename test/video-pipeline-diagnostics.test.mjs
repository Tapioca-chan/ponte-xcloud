import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectVideoPipeline} from '../src/video-pipeline-diagnostics.mjs';
test('reports sustained decoding independently from compositor visibility',()=>{
 const x=inspectVideoPipeline({decoded:4413,received:47095},{decoded:4569,received:57250});
 assert.equal(x.decodedDelta,156);
 assert.equal(x.receivedDelta,10155);
 assert.equal(x.hasRenderedMetric,false);
 assert.equal(x.freezeDelta,null);
 assert.equal(x.sourceStillUnverifiable,true);
});
test('reports optional standardized browser freeze counters without inventing them',()=>{
 const x=inspectVideoPipeline(
  {decoded:123,received:555,freezeCount:1,totalFreezesDuration:2.5},
  {decoded:153,received:755,freezeCount:3,totalFreezesDuration:8.5});
 assert.equal(x.freezeDelta,2);
 assert.equal(x.freezeDurationDeltaSec,6);
 assert.equal(x.hasRenderedMetric,true);
});
test('handles missing/reset and malformed counters safely',()=>{
 const x=inspectVideoPipeline({decoded:200,received:150},{decoded:10,received:25});
 assert.equal(x.decodedDelta,null);
 assert.equal(x.receivedDelta,null);
 assert.equal(x.freezeCount,null);
 const z=inspectVideoPipeline(null,{decoded:0,received:0});
 assert.equal(z.decodedDelta,null);
 assert.equal(z.freezeDurationDeltaSec,null);
});

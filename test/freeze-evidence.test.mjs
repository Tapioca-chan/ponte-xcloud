import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFreezeEvidence} from '../src/freeze-evidence.mjs';
const before={at:1000,decoded:100,received:1000,presented:1,currentTime:40};
test('user-reported frozen screen with continuing WebRTC decode suggests native presentation fault',()=>{
 const x=compareFreezeEvidence(before,{at:9100,decoded:350,received:3500,presented:1,currentTime:48});
 assert.equal(x.verdict,'decoding-continues');
 assert.equal(x.decodedRise,250);
 assert.equal(x.presentedRise,0);
 assert.equal(x.elapsedSec,8);
});
test('growing packet count without decoded frames implies decoder stall',()=>{
 assert.equal(compareFreezeEvidence(before,{...before,at:9000,received:1300}).verdict,'decoder-stalled');
});
test('no incoming packets or decoded frames implies transport stall',()=>{
 assert.equal(compareFreezeEvidence(before,{...before,at:9000}).verdict,'transport-stalled');
});
test('missing or reset counters never yield false diagnosis',()=>{
 assert.equal(compareFreezeEvidence(before,{at:9000,decoded:80,received:700}).verdict,'inconclusive');
 assert.equal(compareFreezeEvidence(null,null).verdict,'unavailable');
});
test('small decoded change is inconclusive and frame callback unsupported remains null',()=>{
 assert.equal(compareFreezeEvidence({...before,presented:null},{at:9000,decoded:104,received:1600,presented:null}).verdict,'inconclusive');
});

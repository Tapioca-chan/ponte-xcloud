import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyStreamHealth} from '../src/stream-health.mjs';
test('VIDAA permanently-zero rendered counter is NOT a confirmed stuck screen',()=>{
 const a={decoded:100,received:1000,presented:0,connection:'connected'};
 const b={decoded:300,received:1800,presented:0,connection:'connected'};
 const state=classifyStreamHealth(a,b,6);
 assert.equal(state.kind,'active');
 assert.match(state.reason,/não mensurável/i);
});
test('A formerly advancing renderer stopping while decoding continues is a true presentation-stall risk',()=>{
 const a={decoded:100,received:1000,presented:80,connection:'connected'};
 const b={decoded:300,received:1800,presented:80,connection:'connected'};
 assert.equal(classifyStreamHealth(a,b,6).kind,'presentation-stall');
});
test('Missing counters never invent rendered FPS or presentation failure',()=>{
 const a={decoded:100,received:1000,presented:null,connection:'connected'};
 const b={decoded:300,received:1800,presented:null,connection:'connected'};
 assert.equal(classifyStreamHealth(a,b,6).kind,'active');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {MenuInputEdges,selectMenuTarget} from '../src/menu-input.mjs';
import {classifyStreamHealth} from '../src/stream-health.mjs';
import {compactFrame} from '../src/xbridge-input.mjs';

test('Android home navigation triggers one A/B/Menu action per press',()=>{
 const edges=new MenuInputEdges();
 assert.deepEqual(edges.sample({A:1,Menu:1},1000),['confirm','menu']);
 assert.deepEqual(edges.sample({A:1,Menu:1},1100),[]);
 assert.deepEqual(edges.sample({A:0,B:0,Menu:0},1150),[]);
 assert.deepEqual(edges.sample({B:1},1200),['back']);
 assert.deepEqual(edges.sample({B:1},1250),[]);
});

test('Android DPad and analog stick move across catalog with rate limit',()=>{
 const edges=new MenuInputEdges();
 assert.deepEqual(edges.sample({DPadRight:1},1000),['right']);
 assert.deepEqual(edges.sample({DPadRight:1},1080),[]);
 assert.deepEqual(edges.sample({DPadRight:1},1300),['right']);
 assert.deepEqual(edges.sample({LeftThumbYAxis:-1},1350),['up']);
 edges.release();
 assert.deepEqual(edges.sample({LeftThumbXAxis:-1},1400),['left']);
});

test('Geometry navigation chooses same-row nearest target',()=>{
 const element=(x,y)=>({getBoundingClientRect:()=>({left:x,top:y,width:100,height:100})});
 const a=element(0,0),b=element(140,0),c=element(0,170),d=element(140,170);
 assert.equal(selectMenuTarget([a,b,c,d],a,'right'),b);
 assert.equal(selectMenuTarget([a,b,c,d],a,'down'),c);
 assert.equal(selectMenuTarget([a,b,c,d],d,'left'),c);
 assert.equal(selectMenuTarget([a,b,c,d],b,'down'),d);
});

test('WebRTC telemetry separates frozen video decoding from Xbox game splash',()=>{
 const previous={decoded:100,received:1000,videoWidth:1280,videoHeight:720,connection:'connected'};
 assert.equal(classifyStreamHealth(previous,{...previous,decoded:115,received:1020}).kind,'active');
 assert.equal(classifyStreamHealth(previous,{...previous,received:1030}).kind,'decode-stall');
 assert.equal(classifyStreamHealth(previous,previous,6).kind,'network-stall');
 assert.equal(classifyStreamHealth(previous,{...previous,connection:'failed'}).kind,'network-error');
});


test('WebRTC presentation freeze is detected even with decoded frames rising',()=>{
 const baseline={decoded:400,received:7000,presented:350,videoWidth:1920,videoHeight:1080,connection:'connected'};
 const framesNotPainted={...baseline,decoded:450,received:7500,presented:350};
 assert.equal(classifyStreamHealth(baseline,framesNotPainted).kind,'presentation-stall');
 const advancing={...baseline,decoded:455,received:7560,presented:395};
 assert.equal(classifyStreamHealth(baseline,advancing).kind,'active');
 const unknown={...baseline,presented:null,decoded:410};
 assert.equal(classifyStreamHealth({...baseline,presented:null},unknown).kind,'active');
});

test('Android A button is decoded into the Xbox gamepad frame, not just catalog navigation',()=>{
 const neutral={b:0,t:[0,0],a:[0,0,0,0]};
 const pressed=compactFrame({...neutral,b:1});
 assert.equal(pressed.GamepadIndex,0);
 assert.equal(pressed.A,1);
 assert.equal(pressed.B,0);
 assert.equal(compactFrame(neutral).A,0);
 assert.equal(compactFrame({...neutral,b:1<<9}).Menu,1);
});

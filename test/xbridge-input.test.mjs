import test from 'node:test';
import assert from 'node:assert/strict';
import {compactFrame,acceptsParent} from '../src/xbridge-input.mjs';
import {buttons} from '../src/protocol.mjs';
test('original xBridge packet maps every digital Xbox button',()=>{
 buttons.forEach((key,i)=>{if(i===6||i===7)return;const f=compactFrame({b:1<<i,a:[0,0,0,0],t:[0,0]});assert.equal(f[key],1);assert.equal(Object.values(f).reduce((a,b)=>a+b,0),1);});
});
test('preserves analog triggers, both stick directions and clamps invalid ranges',()=>{
 const f=compactFrame({b:0,a:[-127,127,-500,500],t:[128,255]});
 assert.equal(f.LeftTrigger,128/255);assert.equal(f.RightTrigger,1);
 assert.equal(f.LeftThumbXAxis,-1);assert.equal(f.LeftThumbYAxis,1);
 assert.equal(f.RightThumbXAxis,-1);assert.equal(f.RightThumbYAxis,1);
 assert.ok(Object.values(compactFrame({b:0,a:[NaN,Infinity],t:[undefined,Infinity]})).every(v=>v===0));
 assert.ok(Object.values(compactFrame(null)).every(v=>v===0));
});
test('only the actual same-origin XBridge parent may deliver Xbox input and manual video rescue',()=>{
 const parent={};const site='https://xbridge-hnd9.onrender.com';
 assert.equal(acceptsParent({origin:site,source:parent,data:{type:'xbridge-migrate-video-host'}},parent,site),true);
 assert.equal(acceptsParent({origin:site,source:parent,data:{type:'xbridge-rescue-video'}},parent,site),true);
 assert.equal(acceptsParent({origin:site,source:parent,data:{type:'xbridge-input'}},parent,site),true);
 assert.equal(acceptsParent({origin:'https://xcloud-tv.onrender.com',source:parent},parent,site),false);
 assert.equal(acceptsParent({origin:'https://other.example',source:parent},parent,site),false);
 assert.equal(acceptsParent({origin:site,source:{}},parent,site),false);
 assert.equal(acceptsParent({origin:site,source:parent},parent,undefined),false);
 assert.equal(acceptsParent({origin:'https://other.example',source:parent},parent,'*'),false);
});

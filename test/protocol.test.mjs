import test from 'node:test';import assert from 'node:assert/strict';
import {sanitize,gamepadFrame} from '../src/protocol.mjs';
test('invalid input never propagates NaN or unwanted keys',()=>{const f=sanitize({A:NaN,B:9,LeftThumbXAxis:-6,admin:true});assert.equal(f.A,0);assert.equal(f.B,1);assert.equal(f.LeftThumbXAxis,-1);assert.equal(f.admin,undefined);});
test('nonstandard physical mapping maps buttons and axes',()=>{const f=gamepadFrame({buttons:[{value:1}],axes:[0.03,-0.8]}, {A:{kind:'button',index:0},LeftThumbXAxis:{kind:'axis',index:0},RightThumbYAxis:{kind:'axis',index:1}});assert.equal(f.A,1);assert.equal(f.LeftThumbXAxis,0);assert.equal(f.RightThumbYAxis,-.8);});

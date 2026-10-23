import test from 'node:test';
import assert from 'node:assert/strict';
import {MenuInputEdges} from '../src/menu-input.mjs';

test('Xbox catalog uses all major gamepad buttons as edge-triggered controls',()=>{
 const mapping=[
  ['A','confirm'],['B','back'],['X','library'],['Y','favorites'],
  ['Menu','menu'],['Nexus','menu'],['View','back'],
  ['LeftShoulder','previousTab'],['RightShoulder','nextTab'],
  ['LeftTrigger','recent'],['RightTrigger','library'],
  ['LeftThumb','fullscreen'],['RightThumb','settings']
 ];
 for(const [button,action] of mapping){
  const input=new MenuInputEdges();
  const frame={[button]:1};
  assert.ok(input.sample(frame,100).includes(action),button+' should trigger '+action);
  assert.equal(input.sample(frame,120).length,0,button+' should not repeat while held');
  input.sample({},145);
  assert.ok(input.sample(frame,160).includes(action),button+' should fire again after release');
 }
});
test('both sticks and D-pad can navigate safely, and neutral input is no-op',()=>{
 const e=new MenuInputEdges();
 assert.deepEqual(e.sample({},100),[]);
 assert.ok(e.sample({DPadUp:1},200).includes('up'));
 assert.ok(e.sample({DPadUp:1},210).length===0);
 assert.ok(e.sample({DPadUp:1},400).includes('up'));
 e.release();
 assert.ok(e.sample({LeftThumbXAxis:0.8},100).includes('right'));
 e.release();
 assert.ok(e.sample({RightThumbYAxis:-0.9},100).includes('up'));
 e.release();
 assert.ok(e.sample({RightThumbXAxis:-0.9},100).includes('left'));
});

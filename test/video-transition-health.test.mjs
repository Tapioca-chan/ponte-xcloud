import test from 'node:test';
import assert from 'node:assert/strict';
import {MediaTransitionWatch} from '../src/video-transition-health.mjs';
test('correlates black-plane emptied event with our own reattachment',()=>{
 const w=new MediaTransitionWatch();
 w.noteRepair('automatic',10000);
 assert.deepEqual(w.noteEvent('emptied',10300),{
   kind:'emptied',initiatedByXBridge:true,repairReason:'automatic',ageSinceRepairMs:300
 });
 assert.equal(w.noteEvent('resize',20500).initiatedByXBridge,false);
 assert.equal(w.noteEvent('unknown',20500),null);
});
test('recovers only after sustained browser media waiting and never during preroll buffering',()=>{
 const w=new MediaTransitionWatch();
 w.noteEvent('waiting',1000);
 const base={now:16000,readyState:2,paused:false,hasVideo:true,connected:true,overlayOpen:false,attempts:0,lastAttemptAt:0};
 assert.equal(w.shouldRecoverWait(base),true);
 assert.equal(w.shouldRecoverWait({...base,now:9000}),false);
 assert.equal(w.shouldRecoverWait({...base,readyState:4}),false);
 assert.equal(w.shouldRecoverWait({...base,overlayOpen:true}),false);
 assert.equal(w.shouldRecoverWait({...base,connected:false}),false);
 assert.equal(w.shouldRecoverWait({...base,paused:true}),false);
 assert.equal(w.shouldRecoverWait({...base,attempts:3}),false);
 assert.equal(w.shouldRecoverWait({...base,now:120000,attempts:1,lastAttemptAt:90000}),false);
 w.noteEvent('playing',17000);
 assert.equal(w.shouldRecoverWait({...base,now:50000}),false);
});

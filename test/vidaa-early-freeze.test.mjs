import test from 'node:test';
import assert from 'node:assert/strict';
import {EarlyFreezeRiseWatch} from '../src/vidaa-early-freeze.mjs';
import {shouldStartMetroOpaqueRepair,shouldEscalateMetroOpaqueRepair} from '../src/metro-native-plane-autorepair.mjs';

test('real Render trace has two freeze rises before 60 seconds',()=>{
 const watch=new EarlyFreezeRiseWatch();
 assert.equal(watch.observe({now:1000,freezeCount:0}),0);
 assert.equal(watch.observe({now:20000,freezeCount:2}),1);
 assert.equal(watch.observe({now:40000,freezeCount:2}),1);
 const early=watch.observe({now:59000,freezeCount:4});
 assert.equal(early,2);
 const base={title:'Metro Exodus',nativePlaneUnobservable:true,
  firstVideoAt:1000,now:59000,freezeCount:4,earlyFreezeRises:early,
  hasVideo:true,videoReadyState:4,connection:'connected',
  overlayOpen:false,recoveryBusy:false,enabled:true,
  attempts:0,lastManualRecoveryAt:0,lastSoftRecoveryAt:0};
 assert.equal(shouldStartMetroOpaqueRepair(base),true);
 assert.equal(shouldEscalateMetroOpaqueRepair({...base,now:81000,
  attempts:1,lastSoftRecoveryAt:60000}),true);
});
test('one early event and free ad are not enough for the earlier refresh',()=>{
 const base={title:'Metro Exodus',nativePlaneUnobservable:true,
  firstVideoAt:1000,now:59000,freezeCount:2,earlyFreezeRises:1,
  hasVideo:true,videoReadyState:4,connection:'connected',
  overlayOpen:false,recoveryBusy:false,enabled:true,
  attempts:0,lastManualRecoveryAt:0,lastSoftRecoveryAt:0};
 assert.equal(shouldStartMetroOpaqueRepair(base),false);
 assert.equal(shouldStartMetroOpaqueRepair({...base,now:51000,earlyFreezeRises:2}),true);
 assert.equal(shouldStartMetroOpaqueRepair({...base,now:46000,earlyFreezeRises:2}),false);
 assert.equal(shouldStartMetroOpaqueRepair({...base,title:'Marvel Rivals',earlyFreezeRises:2}),false);
 assert.equal(shouldStartMetroOpaqueRepair({...base,overlayOpen:true,earlyFreezeRises:2}),false);
});
test('evidence expires and frozen stats counter resets do not create false rises',()=>{
 const w=new EarlyFreezeRiseWatch();
 w.observe({now:1000,freezeCount:0});
 w.observe({now:2000,freezeCount:2});
 assert.equal(w.observe({now:110000,freezeCount:2}),0);
 assert.equal(w.observe({now:116000,freezeCount:1}),0);
 assert.equal(w.observe({now:124000,freezeCount:2}),1);
 assert.equal(w.observe({now:130000,freezeCount:null}),0);
});

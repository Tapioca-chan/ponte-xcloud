import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPerformBlindMetroRefresh} from '../src/vidaa-blind-recovery.mjs';
const base={title:'Metro Exodus',enabled:true,firstVideoAt:1000,now:151000,
 attempts:0,unreadableSamples:7,decodedAdvancing:true,
 hasVideo:true,videoReadyState:4,connection:'connected'};
test('VIDAA native-plane maintenance waits until after free xCloud preroll grace',()=>{
 assert.equal(shouldPerformBlindMetroRefresh({...base,now:120999}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,now:121000}),true);
 assert.equal(shouldPerformBlindMetroRefresh(base),true);
});
test('blind maintenance never runs if the screen can be measured or during overlay interactions',()=>{
 assert.equal(shouldPerformBlindMetroRefresh({...base,unreadableSamples:1}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,decodedAdvancing:false}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,overlayOpen:true}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,inFlight:true}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,videoReadyState:1}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,connection:'failed'}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,enabled:false}),false);
});
test('blind maintenance is Metro-only, at most 3 per stream, four minutes apart',()=>{
 assert.equal(shouldPerformBlindMetroRefresh({...base,title:'Marvel Rivals'}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,title:'Metro 2033 Redux'}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,attempts:1,lastAttemptAt:140000}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,attempts:1,lastAttemptAt:0}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,now:340000,attempts:1,lastAttemptAt:100000}),true);
 assert.equal(shouldPerformBlindMetroRefresh({...base,now:340000,attempts:1,lastAttemptAt:100000,lastManualAt:330000}),false);
 assert.equal(shouldPerformBlindMetroRefresh({...base,now:340000,attempts:3,lastAttemptAt:0}),false);
});

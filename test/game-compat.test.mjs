import test from 'node:test';
import assert from 'node:assert/strict';
import {needsXboxDialogCompatibility} from '../src/game-compat.mjs';
import {shouldRebindMetroVideo,shouldAttemptMetroRecovery} from '../src/metro-recovery.mjs';

test('the Xbox system-dialog compatibility experiment is limited to Metro Exodus',()=>{
 assert.equal(needsXboxDialogCompatibility('Metro Exodus'),true);
 assert.equal(needsXboxDialogCompatibility('METRO EXODUS Gold Edition'),true);
 assert.equal(needsXboxDialogCompatibility('Marvel Rivals'),false);
 assert.equal(needsXboxDialogCompatibility('Metro 2033 Redux'),false);
 assert.equal(needsXboxDialogCompatibility('Other game'),false);
 assert.equal(needsXboxDialogCompatibility(undefined),false);
});

test('Metro recovery activates only after sustained decoder/compositor stalls',()=>{
 assert.equal(shouldRebindMetroVideo('Metro Exodus','decode-stall',3,false),true);
 assert.equal(shouldRebindMetroVideo('Metro Exodus','presentation-stall',4,false),true);
 assert.equal(shouldRebindMetroVideo('Metro Exodus','decode-stall',2,false),false);
 assert.equal(shouldRebindMetroVideo('Metro Exodus','decode-stall',5,true),false);
 assert.equal(shouldRebindMetroVideo('Metro Exodus','network-stall',5,false),false);
 assert.equal(shouldRebindMetroVideo('Metro Exodus','active',5,false),false);
 assert.equal(shouldRebindMetroVideo('Marvel Rivals','decode-stall',6,false),false);
});

test('automatic Metro repair can retry after cooldown but never loops endlessly',()=>{
 const base={title:'Metro Exodus',kind:'presentation-stall',consecutiveChecks:2,hasVideo:true,connection:'connected',now:200000};
 assert.equal(shouldAttemptMetroRecovery({...base,attempts:0,lastAttemptAt:0}),true);
 assert.equal(shouldAttemptMetroRecovery({...base,attempts:1,lastAttemptAt:160001}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,attempts:1,lastAttemptAt:139000}),true);
 assert.equal(shouldAttemptMetroRecovery({...base,attempts:2,lastAttemptAt:140000}),true);
 assert.equal(shouldAttemptMetroRecovery({...base,attempts:3,lastAttemptAt:0}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,kind:'network-stall'}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,kind:'active'}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,hasVideo:false}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,connection:'disconnected'}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,title:'Marvel Rivals'}),false);
 assert.equal(shouldAttemptMetroRecovery({...base,consecutiveChecks:1}),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAutoRepairAfterVideoEvidence} from '../src/ongoing-recovery-policy.mjs';
test('repeated WebRTC freezeCount alone cannot keep disrupting playback after native rebind',()=>{
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true,recurringWebRtcFreeze:true}),false);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true,introFreeze:true}),false);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:false,recurringWebRtcFreeze:true}),true);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:false,introFreeze:true}),true);
});
test('genuine stalled video transport and verified visible freeze can still be repaired',()=>{
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true,decodeOrPresentationStall:true}),true);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true,audioActiveVideoStall:true}),true);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true,visualStallConfirmed:true}),true);
 assert.equal(shouldAutoRepairAfterVideoEvidence({alreadyRebound:true}),false);
});
test('matches Render case: a strong rebind at 78s protects against freezeCount-only at 168s',()=>{
 const afterStrong={alreadyRebound:true,recurringWebRtcFreeze:true,
   decodeOrPresentationStall:false,audioActiveVideoStall:false,visualStallConfirmed:false};
 assert.equal(shouldAutoRepairAfterVideoEvidence(afterStrong),false);
});

import {needsXboxDialogCompatibility} from './game-compat.mjs';

// Toshiba VIDAA hides native-plane presentation and canvas readback. This is
// deliberately an EXPERIMENTAL, tightly bounded startup compatibility path:
// one soft refresh followed by at most one strong refresh, never periodic.
// A single freezeCount from Xbox's free preroll can be unrelated to the game,
// so leave a long grace and clearly label the action as preventive.
const supported = a => needsXboxDialogCompatibility(a.title) &&
  a.nativePlaneUnobservable===true &&
  Number.isFinite(a.firstVideoAt)&&a.firstVideoAt>0 &&
  Number.isFinite(a.now)&&a.now>=a.firstVideoAt &&
  Number.isFinite(a.freezeCount)&&a.freezeCount>=1 &&
  a.hasVideo===true && a.videoReadyState>=2 &&
  (a.connection==='connected'||a.connection==='completed') &&
  a.overlayOpen!==true && a.recoveryBusy!==true &&
  a.enabled!==false && !(a.lastManualRecoveryAt>0);

export function shouldStartMetroOpaqueRepair(a){
 if(!supported(a))return false;
 const age=a.now-a.firstVideoAt;
 const earlyEvidence=Number.isInteger(a.earlyFreezeRises) &&
   a.earlyFreezeRises>=2 && age>=50000 && age<=120000;
 return (earlyEvidence || age>=105000 && age<=210000) &&
   a.attempts===0 && !(a.lastSoftRecoveryAt>0);
}
export function shouldEscalateMetroOpaqueRepair(a){
 if(!supported(a))return false;
 const age=a.now-a.firstVideoAt;
 // With at least two independent early freeze increases, the prior soft
 // attempt can be escalated earlier. No timer-only rebind without prior
 // evidence of repeated WebRTC trouble and an actual soft recovery.
 const earlyEvidence=Number.isInteger(a.earlyFreezeRises)&&a.earlyFreezeRises>=2;
 const minAge=earlyEvidence?70000:130000;
 const minSinceSoft=earlyEvidence?20000:25000;
 return age>=minAge && age<=255000 && a.attempts===1 &&
   Number.isFinite(a.lastSoftRecoveryAt)&&a.lastSoftRecoveryAt>0 &&
   a.now-a.lastSoftRecoveryAt>=minSinceSoft &&
   a.now-a.lastSoftRecoveryAt<=105000;
}

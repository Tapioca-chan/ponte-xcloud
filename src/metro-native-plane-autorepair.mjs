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
 return age>=105000 && age<=210000 && a.attempts===0 &&
   !(a.lastSoftRecoveryAt>0);
}
export function shouldEscalateMetroOpaqueRepair(a){
 if(!supported(a))return false;
 const age=a.now-a.firstVideoAt;
 return age>=130000 && age<=255000 && a.attempts===1 &&
   Number.isFinite(a.lastSoftRecoveryAt)&&a.lastSoftRecoveryAt>0 &&
   a.now-a.lastSoftRecoveryAt>=25000 &&
   a.now-a.lastSoftRecoveryAt<=105000;
}

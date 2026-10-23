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


// If another existing evidence-based startup watchdog fires first, prefer
// exactly the same native-surface approach instead of burning the bounded
// attempt on pause/play. The caller must still have established an actual
// WebRTC stall/freeze signal. This is never a periodic blind timer.
export function shouldPreferNativeMetroSurface({
 title,nativePlaneUnobservable=false,visualFrozen=false,presentationStalled=false,
 firstVideoAt=0,now=0,freezeCount=0,hasVideo=false,videoReadyState=0,
 connection='',overlayOpen=false,recoveryBusy=false,alreadyTried=false
}={}){
 const age=now-firstVideoAt;
 // A native plane may still return a few compositor callbacks or readable
 // pixels before becoming stuck. An observed visual stall or three successive
 // decoded-but-not-presented polls is stronger than a lone freezeCount.
 const directPresentationEvidence=visualFrozen===true || presentationStalled===true;
 return needsXboxDialogCompatibility(title) &&
  (nativePlaneUnobservable===true || directPresentationEvidence) &&
  firstVideoAt>0 && age>=45000 && age<=255000 &&
  (directPresentationEvidence || Number.isFinite(freezeCount) && freezeCount>0) &&
  hasVideo===true && videoReadyState>=2 &&
  (connection==='connected'||connection==='completed') &&
  !overlayOpen && !recoveryBusy && !alreadyTried;
}


// A real Toshiba/VIDAA case (2026-10-23) showed a user-confirmed static
// picture while H.264 advanced ~30fps, no compositor callbacks were exposed
// and WebRTC freezeCount remained ZERO. A count-based detector is powerless.
// This is explicitly a *compatibility probe*, never a claim to detect frozen
// pixels. Recreate the native plane at most once during Metro's opening,
// after a long preroll grace, and never during recent gameplay input.
export function shouldProbeMetroOpaqueSurfaceWithoutFreezeCount({
 title='',nativePlaneUnobservable=false,firstVideoAt=0,now=0,
 decodedDelta=null,receivedDelta=null,hasVideo=false,videoReadyState=0,
 videoPaused=false,connection='',overlayOpen=false,recoveryBusy=false,
 attempts=0,alreadyTried=false,lastManualRecoveryAt=0,enabled=true,
 recentMeaningfulInput=false
}={}){
 const age=now-firstVideoAt;
 return needsXboxDialogCompatibility(title) && enabled===true &&
  nativePlaneUnobservable===true &&
  Number.isFinite(firstVideoAt)&&firstVideoAt>0&&Number.isFinite(now) &&
  age>=125000&&age<=235000 &&
  Number.isFinite(decodedDelta)&&decodedDelta>=30 &&
  Number.isFinite(receivedDelta)&&receivedDelta>0 &&
  hasVideo===true&&videoReadyState>=2&&!videoPaused &&
  (connection==='connected'||connection==='completed') &&
  !overlayOpen&&!recoveryBusy&&!alreadyTried&&attempts===0 &&
  !recentMeaningfulInput&&!(lastManualRecoveryAt>0);
}


// Toshiba field trace: replacing the VIDAA surface brought the picture back,
// then the automatic follow-up detached/rebound the SAME MediaStream. A play()
// acceptance does not prove the new physical video plane remains visible.
// Once the first native plane succeeds, prefer stability over speculative
// automatic rebinds. Manual recovery stays available, and other games retain
// their original policies.
export function shouldProtectRecoveredMetroSurface({
 title='',nativeSurfaceRecovered=false
}={}){
 return needsXboxDialogCompatibility(title) && nativeSurfaceRecovered===true;
}


// Observed on VIDAA: native surface repair #1 accepted at 09:31:23,
// a later user-triggered "Nova superfície" accepted at 09:32:43 and
// restored the image. An automatic second rebuild at age 130s did NOT
// restore the TV; require a later game phase closer to the effective manual. A second *native surface* can therefore be a bounded
// fallback, distinct from the harmful automatic srcObject detach/rebind.
// The compositor cannot be observed directly; require two NEW WebRTC freezes
// after repair #1, ongoing decoder/network progress and an idle controller.
// Never interrupt active gameplay, never retry during an overlay, never loop.
export function shouldRetryMetroNativeSurface({
 title='',nativePlaneUnobservable=false,firstVideoAt=0,now=0,
 lastSurfaceAt=0,baselineFreezeCount=null,freezeCount=null,
 autoNativeSurfaceAttempts=0,priorSurfaceSucceeded=false,
 decodedDelta=null,receivedDelta=null,
 hasVideo=false,videoReadyState=0,videoPaused=false,
 connection='',overlayOpen=false,recoveryBusy=false,
 lastManualRecoveryAt=0,enabled=true,recentMeaningfulInput=false
}={}){
 const sinceFirstVideo=now-firstVideoAt;
 const sinceFirstRepair=now-lastSurfaceAt;
 return needsXboxDialogCompatibility(title) && enabled===true &&
  nativePlaneUnobservable===true &&
  priorSurfaceSucceeded===true && autoNativeSurfaceAttempts===1 &&
  Number.isFinite(firstVideoAt)&&firstVideoAt>0 &&
  Number.isFinite(lastSurfaceAt)&&lastSurfaceAt>firstVideoAt &&
  Number.isFinite(now) && sinceFirstVideo>=150000 &&
  sinceFirstVideo<=360000 &&
  sinceFirstRepair>=90000 && sinceFirstRepair<=240000 &&
  Number.isFinite(baselineFreezeCount) && baselineFreezeCount>=0 &&
  Number.isFinite(freezeCount) && freezeCount>=baselineFreezeCount+2 &&
  Number.isFinite(decodedDelta)&&decodedDelta>=30 &&
  Number.isFinite(receivedDelta)&&receivedDelta>0 &&
  hasVideo===true && videoReadyState>=2 && !videoPaused &&
  (connection==='connected'||connection==='completed') &&
  !overlayOpen && !recoveryBusy && !recentMeaningfulInput &&
  !(lastManualRecoveryAt>0);
}

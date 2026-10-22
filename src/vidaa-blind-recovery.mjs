// Fallback for native video planes that VIDAA will not expose to
// requestVideoFrameCallback or canvas readback. This does NOT detect a freeze.
// It performs infrequent, opt-out local media refreshes in Metro Exodus only.
// Xbox free-tier prerolls may last an unpredictable time; avoid early refreshes.
export function shouldPerformBlindMetroRefresh({
  title, enabled=true, now, firstVideoAt, attempts=0,
  lastAttemptAt=0, lastManualAt=0, unreadableSamples=0,
  decodedAdvancing=false, hasVideo=false, videoReadyState=0,
  connection='connected', overlayOpen=false, inFlight=false
}){
 if(!enabled || overlayOpen || inFlight || !hasVideo || videoReadyState<2)return false;
 if(typeof title!=='string'||!/\bmetro\s+exodus\b/i.test(title))return false;
 if(connection!=='connected'&&connection!=='completed')return false;
 if(!Number.isFinite(firstVideoAt)||firstVideoAt<=0||!Number.isFinite(now))return false;
 if(now-firstVideoAt<120000)return false; // free-tier video ad buffer
 if(unreadableSamples<4||!decodedAdvancing)return false;
 if(attempts>=3)return false;
 if(attempts>0 && now-lastAttemptAt<240000)return false; // at most every 4 min
 if(lastManualAt>0 && now-lastManualAt<240000)return false;
 return true;
}

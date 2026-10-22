// Compare per-interval WebRTC counters without collecting video pixels or
// credentials. A decoder advancing does NOT prove a TV's native plane painted.
// Optional freeze counters may be absent from older VIDAA Chromium builds.
const safeCount=value=>Number.isFinite(Number(value)) && Number(value)>=0?Number(value):null;
export function inspectVideoPipeline(previous,current){
 const decoded=safeCount(current?.decoded);
 const received=safeCount(current?.received);
 const frozen=safeCount(current?.freezeCount);
 const freezeDuration=safeCount(current?.totalFreezesDuration);
 const delta=(newValue,oldValue)=>{
  const a=safeCount(newValue),b=safeCount(oldValue);
  return a!==null && b!==null && a>=b?a-b:null;
 };
 return {
  decodedDelta:delta(decoded,previous?.decoded),
  receivedDelta:delta(received,previous?.received),
  freezeCount:frozen,
  freezeDelta:delta(frozen,previous?.freezeCount),
  freezeDurationSec:freezeDuration,
  freezeDurationDeltaSec:delta(freezeDuration,previous?.totalFreezesDuration),
  hasRenderedMetric:frozen!==null,
  // May be compositor/display bug or a static remote scene. Never call this
  // a confirmed freeze without video-frame presentation evidence.
  sourceStillUnverifiable:true
 };
}

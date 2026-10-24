// VIDAA user-confirmed rescue escalator, never restart Xbox title/login.
// 1) ask the existing Xbox control channel for a fresh H264 keyframe (no DOM
//    pause, no black flash); 2) replace native HTMLVideoElement without
//    disconnecting WebRTC; 3) renegotiate only the SAME active Xbox session.
// The user, not an opaque pixel counter, confirms that the image is still stuck.
export class ManualVideoRescue {
 constructor(){this.reset()}
 reset(){
  this.lastKeyframeAt=0;
  this.lastSurfaceAt=0;
  this.lastTransportAt=0;
  this.inFlight=false;
 }
 choose({now=Date.now(),playing=false,hasVideo=false}={}){
  if(this.inFlight)return {action:'busy',reason:'in-progress'};
  if(!playing)return {action:'unavailable',reason:'no-active-game'};
  if(this.lastTransportAt && now-this.lastTransportAt<60000)
   return {action:'cooldown',reason:'transport-backoff'};
  if(!hasVideo)return {action:'transport',reason:'no-video-element'};
  // Only a THIRD explicit press, after a surface swap that did not repair
  // the picture, is allowed to renegotiate WebRTC.
  if(this.lastSurfaceAt && now-this.lastSurfaceAt>=5000 &&
     now-this.lastSurfaceAt<=300000)
   return {action:'transport',reason:'still-frozen-after-surface'};
  if(this.lastSurfaceAt && now-this.lastSurfaceAt<5000)
   return {action:'cooldown',reason:'surface-settling'};
  // Second user press escalates from zero-flash keyframe to surface.
  if(this.lastKeyframeAt && now-this.lastKeyframeAt>=3000 &&
     now-this.lastKeyframeAt<=120000)
   return {action:'surface',reason:'still-frozen-after-keyframe'};
  if(this.lastKeyframeAt && now-this.lastKeyframeAt<3000)
   return {action:'cooldown',reason:'keyframe-settling'};
  return {action:'keyframe',reason:'try-without-video-detach'};
 }
 start(action,now=Date.now()){
  if(this.inFlight||!['keyframe','surface','transport'].includes(action))return false;
  this.inFlight=true;
  if(action==='keyframe')this.lastKeyframeAt=now;
  if(action==='surface')this.lastSurfaceAt=now;
  if(action==='transport'){
   this.lastTransportAt=now;
   this.lastSurfaceAt=0;this.lastKeyframeAt=0;
  }
  return true;
 }
 finish(){this.inFlight=false}
}

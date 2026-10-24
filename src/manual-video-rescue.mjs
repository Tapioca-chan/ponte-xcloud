// Intent-driven VIDAA recovery. A frozen hardware overlay may be opaque to
// canvas, requestVideoFrameCallback and RTC stats. Never infer visible repair
// from play() resolution or decoded packets.
export class ManualVideoRescue {
  constructor(){ this.reset(); }
  reset(){
    this.lastSurfaceAt=0;
    this.lastTransportAt=0;
    this.inFlight=false;
  }
  choose({now=Date.now(),playing=false,hasVideo=false}={}){
    if(this.inFlight)return {action:'busy',reason:'in-progress'};
    if(!playing)return {action:'unavailable',reason:'no-active-game'};
    if(this.lastTransportAt && now-this.lastTransportAt<60000)
      return {action:'cooldown',reason:'transport-backoff'};
    // On a user-confirmed second failure, rebuild the WebRTC media link to
    // the SAME Xbox session. Do not attempt this without explicit user input.
    if(!hasVideo ||
      (this.lastSurfaceAt>0 && now-this.lastSurfaceAt>=5000 &&
       now-this.lastSurfaceAt<=300000)){
      return {action:'transport',reason:hasVideo?'still-frozen-after-surface':'no-video-element'};
    }
    if(this.lastSurfaceAt && now-this.lastSurfaceAt<5000)
      return {action:'cooldown',reason:'surface-settling'};
    return {action:'surface',reason:'user-confirmed-picture-still'};
  }
  start(action,now=Date.now()){
    if(this.inFlight||!['surface','transport'].includes(action))return false;
    this.inFlight=true;
    if(action==='surface')this.lastSurfaceAt=now;
    if(action==='transport'){
      this.lastTransportAt=now;
      this.lastSurfaceAt=0; // next manual cycle starts with a non-destructive surface swap
    }
    return true;
  }
  finish(){this.inFlight=false;}
}

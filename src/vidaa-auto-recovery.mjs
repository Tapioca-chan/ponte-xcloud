// XBridge VIDAA evidence-based automatic video recovery.
//
// The Toshiba 43V35LS has reported decoded H264 frames increasing while
// framesRendered remains exactly zero even during VISIBLE gameplay.
// Never infer a frozen physical panel from freezeCount or zero-render stats.
// This supervisor uses separate signals for two tiers:
// 1. Two fresh WebRTC freeze increments -> request keyframe, NO DOM changes.
// 2. Independently VERIFIED progress of video.currentTime AND
//    getVideoPlaybackQuality frames on this same element, followed by
//    sustained stalls while new RTP is decoded -> optional one surface swap.
// No pixel copies, timers that trigger by themselves, or Xbox restarts.
const metric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export class VideaAutoRecovery {
 constructor(){this.reset()}
 reset(){
  this.previous=null;
  this.frameClockVerified=false;
  this.mediaClockVerified=false;
  this.stallSamples=0;
  this.freezeEvents=[];
  this.lastKeyframeAt=0;
  this.keyframePendingForStall=false;
  this.lastSurfaceAt=0;
  this.surfaceAttempts=0;
 }
 observe({now,decoded,received,freezeCount,qualityFrames,videoTime,
          ready=false,paused=false,overlay=false,connected=true,
          videoAttached=true,recentUserInput=false}={}){
  const noop=(reason,details={})=>({action:'none',reason,clockVerified:this.mediaClockVerified,
    qualityVerified:this.frameClockVerified,stallSamples:this.stallSamples,...details});
  const curr={now,decoded:metric(decoded),received:metric(received),
    freezes:metric(freezeCount),quality:metric(qualityFrames),time:metric(videoTime)};
  if(!Number.isFinite(now)||!ready||paused||overlay||!connected||!videoAttached||
     curr.decoded===null||curr.received===null){
    this.previous=null;this.stallSamples=0;this.freezeEvents=[];
    this.mediaClockVerified=false;this.frameClockVerified=false;
    this.keyframePendingForStall=false;
    return noop('inactive');
  }
  const prev=this.previous;
  this.previous=curr;
  if(!prev||now<=prev.now||now-prev.now>20000||
     curr.decoded<prev.decoded||curr.received<prev.received ||
     (prev.freezes!==null&&curr.freezes!==null&&curr.freezes<prev.freezes) ||
     (prev.quality!==null&&curr.quality!==null&&curr.quality<prev.quality) ||
     (prev.time!==null&&curr.time!==null&&curr.time+0.1<prev.time)){
    // Discontinuity/rebind: old renderer calibration does not apply.
    this.frameClockVerified=false;this.mediaClockVerified=false;
    this.freezeEvents=[];this.stallSamples=0;
    this.keyframePendingForStall=false;
    return noop('baseline');
  }
  const decodedRise=curr.decoded-prev.decoded,receivedRise=curr.received-prev.received;
  const timeRise=curr.time!==null&&prev.time!==null?curr.time-prev.time:null;
  const qualityRise=curr.quality!==null&&prev.quality!==null?curr.quality-prev.quality:null;
  if(timeRise!==null && timeRise>0.25)this.mediaClockVerified=true;
  if(qualityRise!==null && qualityRise>=2)this.frameClockVerified=true;
  // FreezeCount is a risk indicator, not proof of a user-visible freeze.
  this.freezeEvents=this.freezeEvents.filter(t=>now-t<=32000 && now>=t);
  const freezeRise=curr.freezes!==null&&prev.freezes!==null?
    curr.freezes-prev.freezes:0;
  const activeRtp=decodedRise>=6&&receivedRise>0;
  if(activeRtp&&freezeRise>0) this.freezeEvents.push(now);
  // True media-element stagnation needs counters that moved BEFORE.
  // An opaque VIDAA decoder stuck at 0 forever is NOT calibrated.
  const stalled=activeRtp&&this.mediaClockVerified&&this.frameClockVerified&&
    timeRise!==null&&timeRise<0.05&&qualityRise===0;
  if(stalled)this.stallSamples++;else{
    this.stallSamples=0;
    if(timeRise!==null&&timeRise>0.25 || qualityRise!==null&&qualityRise>0)
      this.keyframePendingForStall=false;
  }
  const details={decodedRise,receivedRise,freezeRise,
    freezeEvents:this.freezeEvents.length,mediaTimeRise:timeRise,
    qualityRise,stallSamples:this.stallSamples};
  // Never interrupt preroll/ad immediately; a burst must repeat on TWO
  // DISTINCT samples. The threshold is a debounce, not a fixed retry timer.
  if(this.lastKeyframeAt===0||now-this.lastKeyframeAt>=90000){
    if(this.stallSamples>=3 && recentUserInput ||
       this.freezeEvents.length>=2 && recentUserInput){
      return {action:'keyframe',reason:this.stallSamples>=3?'media-clock-stall':'recurrent-rtc-freezes',
        ...details};
    }
  }
  // No automatic surface changes without BOTH independent clocks previously
  // proved functional and a keyframe already requested for THIS stall.
  if(this.keyframePendingForStall&&this.stallSamples>=6&&
     now-this.lastKeyframeAt>=18000&&recentUserInput&&
     this.surfaceAttempts<1 && (this.lastSurfaceAt===0||now-this.lastSurfaceAt>=180000)){
    return {action:'surface',reason:'verified-element-stall-after-keyframe',...details};
  }
  return noop(stalled?'clock-stagnation':
    this.freezeEvents.length>0?'rtc-freezes-monitoring':
    !this.mediaClockVerified||!this.frameClockVerified?'metrics-not-calibrated':'healthy',details);
 }
 acknowledgeKeyframe(now,reason){
  this.lastKeyframeAt=now;
  this.freezeEvents=[];
  this.keyframePendingForStall=reason==='media-clock-stall';
 }
 acknowledgeSurface(now){
  this.lastSurfaceAt=now;
  this.surfaceAttempts++;
  this.previous=null;
  this.frameClockVerified=false;this.mediaClockVerified=false;
  this.stallSamples=0;
  this.keyframePendingForStall=false;
  this.freezeEvents=[];
 }
}

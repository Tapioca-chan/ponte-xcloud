// Automatic VIDAA hardware-plane failover, after a MANUALLY VERIFIED
// successful cross-document recovery on Toshiba 43V35LS. This is a
// conservative, opt-in heuristic, not a screenshot/physical-panel detector.
//
// To avoid recreating old 60-second black-flash loops, we only migrate when:
// - same Xbox session and gamepad recently active;
// - WebRTC decode and packets still advance, video element is playable;
// - a prior keyframe rescue already ran;
// - at least TWO separate subsequent WebRTC freeze increments happened;
// - at least 12s passed after the keyframe and <=90s since it;
// - once per game session, with a global 5-minute cooldown.
// FreezeCount itself doesn't prove a physical freeze, so no auto surface
// failover by default without explicit user opt-in.
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export class VideaAutoHostMigration{
 constructor(){this.reset()}
 reset(){
  this.lastSample=null;
  this.keyframeAt=0;
  this.postKeyframeFreezeSamples=0;
  this.totalPostKeyframeFreezeRise=0;
  this.attempts=0;
  this.lastMigrationAt=0;
 }
 noteKeyframe(at){
  if(!Number.isFinite(at)||at<=0)return;
  // A later keyframe must NOT keep resetting the confirmation window while
  // a stuck Toshiba has been actively reporting freezes.
  if(this.keyframeAt && at-this.keyframeAt<90000)return;
  this.keyframeAt=at;
  this.postKeyframeFreezeSamples=0;
  this.totalPostKeyframeFreezeRise=0;
 }
 observe({now,decoded,received,freezeCount,ready=false,paused=false,
          active=false,overlay=false,recentInput=false,busy=false,enabled=false}={}){
  const state=(reason)=>({action:'none',reason,freezeSamples:this.postKeyframeFreezeSamples});
  const next={now,decoded:valid(decoded),received:valid(received),freezes:valid(freezeCount)};
  const prev=this.lastSample;
  this.lastSample=next;
  if(!enabled)return state('opted-out');
  if(this.attempts>=1)return state('session-limit');
  if(!active||overlay||paused||!ready||busy||!recentInput){
   // Don't accumulate evidence while user is in menus, not sending gamepad
   // input, or manual/other recovery is active.
   this.postKeyframeFreezeSamples=0;this.totalPostKeyframeFreezeRise=0;
   return state('not-active');
  }
  if(!prev||!Number.isFinite(now)||now<=prev.now||now-prev.now>20000||
     next.decoded===null||next.received===null||next.freezes===null||
     prev.decoded===null||prev.received===null||prev.freezes===null||
     next.decoded<prev.decoded||next.received<prev.received||next.freezes<prev.freezes){
   this.postKeyframeFreezeSamples=0;this.totalPostKeyframeFreezeRise=0;
   return state('baseline');
  }
  if(!this.keyframeAt||now-this.keyframeAt<12000)return state('keyframe-settling');
  if(now-this.keyframeAt>90000){
   this.postKeyframeFreezeSamples=0;this.totalPostKeyframeFreezeRise=0;
   return state('keyframe-expired');
  }
  if(this.lastMigrationAt&&now-this.lastMigrationAt<300000)return state('cooldown');
  if(next.decoded-prev.decoded<6||next.received<=prev.received){
   this.postKeyframeFreezeSamples=0;this.totalPostKeyframeFreezeRise=0;
   return state('stream-not-advancing');
  }
  const freezeRise=next.freezes-prev.freezes;
  if(freezeRise>0){
   this.postKeyframeFreezeSamples++;
   this.totalPostKeyframeFreezeRise+=freezeRise;
  }
  // Require independent post-keyframe samples; one large spike is not enough.
  if(this.postKeyframeFreezeSamples>=2&&this.totalPostKeyframeFreezeRise>=2){
   return {action:'migrate',reason:'post-keyframe-recurrent-freezes',
      freezeSamples:this.postKeyframeFreezeSamples,freezeRise:this.totalPostKeyframeFreezeRise};
  }
  return state('watching');
 }
 acknowledgeAttempt(now){
  this.attempts++;
  this.lastMigrationAt=now;
  this.keyframeAt=0;
  this.postKeyframeFreezeSamples=0;
  this.totalPostKeyframeFreezeRise=0;
  this.lastSample=null;
 }
}

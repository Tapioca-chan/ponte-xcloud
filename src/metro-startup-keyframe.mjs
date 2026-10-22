// Before Metro's main gameplay video arrives, try to stabilize WebRTC's
// decoder with at most two gently requested keyframes. No pause/play, no
// srcObject reset, no stream renegotiation and no ad skipping.
// The browser's freezeCount alone is *not* proof of a stuck VIDAA video plane.
export class MetroStartupKeyframePreflight {
 constructor(){this.reset();}
 reset(){
  this.baseline=null;this.requests=0;this.lastRequestAt=0;
 }
 observe({metro=false,now,firstVideoAt,freezeCount,
   decodedDelta,receivedDelta,videoReadyState,connected,overlayOpen=false}={}){
  if(!metro || !Number.isFinite(now)||!Number.isFinite(firstVideoAt) ||
    firstVideoAt<=0 || !Number.isFinite(freezeCount) ||
    !Number.isFinite(decodedDelta) || !Number.isFinite(receivedDelta)){
   return false;
  }
  const count=Math.max(0,Math.floor(freezeCount));
  if(this.baseline===null||count<this.baseline){
   this.baseline=count;
   return false;
  }
  const increased=count>this.baseline;
  this.baseline=count;
  const age=now-firstVideoAt;
  if(!increased || age<8000 || age>115000 || this.requests>=2 ||
    decodedDelta<=0 || receivedDelta<=0 || videoReadyState<2 ||
    !connected || overlayOpen || this.lastRequestAt>0 && now-this.lastRequestAt<20000){
   return false;
  }
  this.lastRequestAt=now;
  this.requests++;
  return true;
 }
}

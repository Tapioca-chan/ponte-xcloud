// VIDAA safe presentation watchdog. A reported rendered-frame count of
// zero is NOT evidence of a frozen picture until this very same renderer
// previously demonstrated advancing rendered frames. In the Toshiba's logs
// decoded increased normally while rendered was permanently 0, yet the user
// could see gameplay. The old detector repeatedly tore down that working
// surface roughly every minute. Missing/untrustworthy counters => observe only.
const count=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export class PresentationStallWatch {
 constructor(){this.reset()}
 reset(){
  this.previous=null;
  this.observedRendering=false;
  this.stallStartAt=0;
  this.stalledPolls=0;
  this.keyframeAt=0;
  this.keyframeRequestedForStall=false;
  this.lastSurfaceAt=0;
 }
 observe({now,decoded,rendered,received,ready=false,paused=false,overlay=false,active=true}){
  const status=(action='none',reason='insufficient-presentation-evidence',d=null,r=null)=>({
   action,confirmed:action!=='none',reason,decodedDelta:d,renderedDelta:r,
   measurable:this.observedRendering,stalledPolls:this.stalledPolls
  });
  const current={now,decoded:count(decoded),rendered:count(rendered),received:count(received)};
  if(!active||!ready||paused||overlay||!Number.isFinite(now)||
     current.decoded===null||current.rendered===null||current.received===null){
   this.previous=null;this.observedRendering=false;
   this.stallStartAt=0;this.stalledPolls=0;
   this.keyframeRequestedForStall=false;
   return status('none','not-observable');
  }
  const prev=this.previous;
  this.previous=current;
  if(!prev||now<=prev.now||now-prev.now>20000||
     current.decoded<prev.decoded||current.rendered<prev.rendered||current.received<prev.received){
   // A native-surface replacement, missing polls, or an unexpected counter
   // rollback invalidates earlier proof of reliable compositor callbacks.
   // Demand fresh positive render progress from this exact video surface.
   if(!prev || now-prev.now>20000 || current.rendered<prev.rendered)
    this.observedRendering=false;
   this.stallStartAt=0;this.stalledPolls=0;
   this.keyframeRequestedForStall=false;
   return status('none','baseline');
  }
  const decodedDelta=current.decoded-prev.decoded;
  const renderedDelta=current.rendered-prev.rendered;
  const receivedDelta=current.received-prev.received;
  if(renderedDelta>0){
   this.observedRendering=true;
   this.stallStartAt=0;this.stalledPolls=0;
   this.keyframeRequestedForStall=false;
   return status('none','renderer-advancing',decodedDelta,renderedDelta);
  }
  if(!this.observedRendering){
   // Crucial: 0->0 for minutes is an UNAVAILABLE metric on this VIDAA,
   // not proof that the user is seeing a frozen frame.
   return status('none','render-counter-unverified',decodedDelta,renderedDelta);
  }
  if(decodedDelta<6||receivedDelta<=0){
   this.stallStartAt=0;this.stalledPolls=0;
   this.keyframeRequestedForStall=false;
   return status('none','no-active-video-evidence',decodedDelta,renderedDelta);
  }
  if(!this.stallStartAt)this.stallStartAt=prev.now;
  this.stalledPolls++;
  // Brief buffering transitions do not call pause(), detach srcObject,
  // renegotiate RTC or create a new hardware video plane.
  const duration=now-this.stallStartAt;
  if(!this.keyframeRequestedForStall && this.stalledPolls>=3 &&
     duration>=10000 && now-this.keyframeAt>=60000){
   return status('keyframe','decoded-not-rendered',decodedDelta,renderedDelta);
  }
  // Last resort: only after a keyframe request ALSO failed for >20 seconds.
  // Caller must additionally require an explicit user opt-in before
  // recreating the video surface (this may create a black flash).
  if(this.keyframeRequestedForStall && this.stalledPolls>=6 &&
     now-this.keyframeAt>=20000 && now-this.lastSurfaceAt>=120000){
   return status('surface','persistent-decoded-not-rendered',decodedDelta,renderedDelta);
  }
  return status('none','corroborating',decodedDelta,renderedDelta);
 }
 acknowledgeKeyframe(now){
  this.keyframeAt=now;
  this.keyframeRequestedForStall=true;
 }
 acknowledgeSurface(now){
  this.lastSurfaceAt=now;
  this.previous=null;
  this.observedRendering=false;
  this.stallStartAt=0;
  this.stalledPolls=0;
  this.keyframeRequestedForStall=false;
 }
}

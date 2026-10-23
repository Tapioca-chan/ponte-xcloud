// WebRTC's inbound-rtp.freezeCount can rise while the decoder continues to
// receive frames. On VIDAA the final native video plane cannot be sampled.
// Recurrent increments across separate polls are a corroborating signal,
// NEVER proof that any single still menu or ad is actually frozen.
export class RecurrentWebRtcFreezeWatch {
 constructor(){this.reset();}
 reset(){
  this.previousCount=null;
  this.events=[];
 }
 observe({now,freezeCount,decodedDelta,receivedDelta,firstVideoAt}){
  const status={suspected:false,recentEvents:0,reason:'insufficient-evidence'};
  if(!Number.isFinite(now)||now<=0 || !Number.isFinite(freezeCount)||freezeCount<0){
   this.reset();
   return {...status,reason:'not-supported'};
  }
  const count=Math.floor(freezeCount);
  if(this.previousCount===null || count<this.previousCount){
   this.previousCount=count;
   this.events=[];
   return {...status,reason:'baseline'};
  }
  const increment=count-this.previousCount;
  this.previousCount=count;
  const warmed=Number.isFinite(firstVideoAt) && firstVideoAt>0 && now-firstVideoAt>=45000;
  this.events=this.events.filter(at=>now-at>=0 && now-at<=105000);
  if(!warmed)this.events=[];
  // With faster polls, still require two separate post-grace sample intervals. A burst of two in a
  // single poll could be a normal advert or Xbox media transition.
  if(warmed && increment>0 && Number(decodedDelta)>0 && Number(receivedDelta)>0){
   this.events.push(now);
  }
  const recentEvents=this.events.length;
  return {suspected:warmed && recentEvents>=2,
   recentEvents,reason:warmed?'web-rtc-repeated-freezes':'startup-grace'};
 }
 acknowledgeRecovery(){
  // Do not reuse the same two freeze events to request multiple video resets.
  // Retain the last count as the new baseline so only NEW increments count.
  this.events=[];
 }
}

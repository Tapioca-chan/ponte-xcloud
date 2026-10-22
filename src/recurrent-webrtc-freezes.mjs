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
  this.events=this.events.filter(at=>now-at>=0 && now-at<=105000);
  // Require separate sample intervals: a burst of two counted by the browser
  // in one poll could be a legitimate media/advertisement transition.
  if(increment>0 && Number(decodedDelta)>0 && Number(receivedDelta)>0){
   this.events.push(now);
  }
  const recentEvents=this.events.length;
  const warmed=Number.isFinite(firstVideoAt) && firstVideoAt>0 && now-firstVideoAt>=60000;
  return {suspected:warmed && recentEvents>=2,
   recentEvents,reason:warmed?'web-rtc-repeated-freezes':'startup-grace'};
 }
 acknowledgeRecovery(){
  // Do not reuse the same two freeze events to request multiple video resets.
  // Retain the last count as the new baseline so only NEW increments count.
  this.events=[];
 }
}

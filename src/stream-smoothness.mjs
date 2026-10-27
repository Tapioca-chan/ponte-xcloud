// Network/decoder diagnostics for WebRTC playback. Never touches bitrate,
// resolution, codecs, video DOM, Microsoft tokens or the existing ICE session.
const count=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const diff=(a,b)=>{const x=count(a),y=count(b);return x!==null&&y!==null&&x>=y?x-y:null};
const round=v=>Math.round(v*10)/10;
export function measureSmoothness(previous,inbound,timestampMs){
 const elapsed=previous&&Number.isFinite(previous.at)?
   (timestampMs-previous.at)/1000:null;
 const goodElapsed=elapsed!==null&&elapsed>=1&&elapsed<=20;
 const decoded=goodElapsed?diff(inbound.framesDecoded,previous.decoded):null;
 const packets=goodElapsed?diff(inbound.packetsReceived,previous.packets):null;
 const lost=goodElapsed?diff(inbound.packetsLost,previous.lost):null;
 const decodeTime=goodElapsed?diff(inbound.totalDecodeTime,previous.decodeTime):null;
 const emitted=goodElapsed?diff(inbound.jitterBufferEmittedCount,previous.emitted):null;
 const bufferTime=goodElapsed?diff(inbound.jitterBufferDelay,previous.bufferTime):null;
 const freezes=goodElapsed?diff(inbound.freezeCount,previous.freezes):null;
 const dropped=goodElapsed?diff(inbound.framesDropped,previous.dropped):null;
 const jitter=count(inbound.jitter);
 const jitterMs=jitter===null?null:round(jitter*1000);
 const lossPct=packets!==null&&lost!==null&&packets+lost>0?
  round(100*lost/(packets+lost)):null;
 const fps=decoded!==null?round(decoded/elapsed):null;
 const decodeMs=decoded!==null&&decoded>0&&decodeTime!==null?
  round(1000*decodeTime/decoded):null;
 const bufferMs=emitted!==null&&emitted>0&&bufferTime!==null?
  round(1000*bufferTime/emitted):null;
 const highJitter=jitterMs!==null&&jitterMs>=26;
 const highLoss=lossPct!==null&&lossPct>=2;
 const networkTrouble=Boolean(highJitter||highLoss||((freezes||0)>0&&jitterMs!==null&&jitterMs>=14));
 const decoderTrouble=Boolean(decodeMs!==null&&decodeMs>=24&&
  (jitterMs===null||jitterMs<20)&&(lossPct===null||lossPct<1));
 const cause=networkTrouble&&!decoderTrouble?'network':
  decoderTrouble&&!networkTrouble?'decoder':
  networkTrouble&&decoderTrouble?'mixed':
  fps!==null&&fps<24&&decoded!==null&&decoded>0?'low-fps':'stable-or-unknown';
 const next={at:timestampMs,decoded:inbound.framesDecoded,packets:inbound.packetsReceived,
  lost:inbound.packetsLost,decodeTime:inbound.totalDecodeTime,
  emitted:inbound.jitterBufferEmittedCount,bufferTime:inbound.jitterBufferDelay,
  freezes:inbound.freezeCount,dropped:inbound.framesDropped};
 return {next,metrics:{fps,jitterMs,lossPct,decodeMs,bufferMs,
  newFreezes:freezes,newDropped:dropped,cause,
  networkTrouble:networkTrouble&&!decoderTrouble,decoderTrouble}};
}
// Prefer preserving input latency. Only increase jitter buffering after multiple
// verified bad windows and ONLY where browser supports the standard property.
// Older VIDAA builds silently receive diagnostics without altering playout.
export class AdaptiveVideoPlayout {
 constructor(){this.reset();}
 reset(){this.bad=0;this.good=0;this.targetMs=0;this.unsupported=false;this.original=null;this.lastAppliedMs=0;}
 observe(metrics,peer,timeMs){
  if(!metrics||!peer)return {mode:'monitoring',targetMs:this.targetMs};
  const network=metrics.networkTrouble===true;
  if(network){this.bad++;this.good=0}
  else if(metrics.cause==='stable-or-unknown'&&
   metrics.fps!==null&&metrics.fps>=24){this.good++;this.bad=0}
  else{this.bad=0;this.good=0}
  // Never buffer to mask a slow decoder or a remote low-FPS game.
  if(metrics.decoderTrouble||metrics.cause==='mixed')return {mode:'decoder-limited',targetMs:this.targetMs};
  let requested=this.targetMs;
  if(this.bad>=2){
   const severe=(metrics.jitterMs!==null&&metrics.jitterMs>=48)||
    (metrics.lossPct!==null&&metrics.lossPct>=5);
   requested=severe?90:55;
  }else if(this.good>=4 && this.targetMs>0)requested=0;
  if(requested===this.targetMs)return {mode:this.targetMs>0?'network-buffered':'monitoring',targetMs:this.targetMs};
  // Limit writes to once per 12 s. Excessive tuning itself causes jitter.
  if(this.lastAppliedMs && timeMs-this.lastAppliedMs<12000)
   return {mode:this.targetMs>0?'network-buffered':'monitoring',targetMs:this.targetMs};
  if(this.unsupported)return {mode:'unsupported',targetMs:0};
  try{
   const receiver=peer.getReceivers?.().find(r=>r.track?.kind==='video');
   if(!receiver||!('jitterBufferTarget' in receiver)){this.unsupported=true;return {mode:'unsupported',targetMs:0}}
   if(this.original===null)this.original=Number(receiver.jitterBufferTarget)||0;
   receiver.jitterBufferTarget=requested||this.original;
   this.targetMs=requested;
   this.lastAppliedMs=timeMs;
   return {mode:requested?'network-buffered':'monitoring',targetMs:requested};
  }catch{this.unsupported=true;return {mode:'unsupported',targetMs:this.targetMs}}
 }
}
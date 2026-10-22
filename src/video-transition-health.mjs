// Local-only VIDAA media transition diagnostics. No video pixels, Xbox tokens,
// identifiers, inputs, or account information are recorded or sent.
const EVENT_SET = new Set(['waiting','stalled','playing','pause','emptied','loadeddata','loadstart','resize','error','suspend']);
export class MediaTransitionWatch {
 constructor(){this.lastEvent='none';this.lastAt=0;this.lastRepairAt=0;this.lastRepairReason='none';this.waitSince=0;}
 noteRepair(reason,now){
  if(!Number.isFinite(now)||now<=0)return;
  this.lastRepairAt=now;
  this.lastRepairReason=reason==='manual'?'manual':'automatic';
 }
 noteEvent(kind,now){
  if(!EVENT_SET.has(kind)||!Number.isFinite(now)||now<=0)return null;
  this.lastEvent=kind;this.lastAt=now;
  if((kind==='waiting'||kind==='stalled')&&!this.waitSince)this.waitSince=now;
  if(kind==='playing'||kind==='loadeddata')this.waitSince=0;
  return {kind,initiatedByXBridge:this.lastRepairAt>0 && now-this.lastRepairAt>=0 && now-this.lastRepairAt<=8000,
    repairReason:this.lastRepairReason,ageSinceRepairMs:this.lastRepairAt?now-this.lastRepairAt:null};
 }
 shouldRecoverWait({now,readyState,paused,hasVideo,connected,overlayOpen,attempts,lastAttemptAt}){
  if(!this.waitSince||!Number.isFinite(now)||now-this.waitSince<15000)return false;
  if(overlayOpen||paused||!hasVideo||readyState>=3||!connected)return false;
  if(attempts>=3 || (attempts>0 && now-lastAttemptAt<90000))return false;
  return true;
 }
}

// Once a TV's native MediaStream has been rebound, repeated WebRTC
// freezeCount increments ALONE are not evidence that the visible picture
// stopped painting. Guard against interrupting resumed gameplay repeatedly.
// True transport/decode stalls may still trigger a bounded recovery.
export function shouldAutoRepairAfterVideoEvidence({
  alreadyRebound=false,
  decodeOrPresentationStall=false,
  audioActiveVideoStall=false,
  visualStallConfirmed=false,
  recurringWebRtcFreeze=false,
  introFreeze=false
}={}){
 const strong=decodeOrPresentationStall||audioActiveVideoStall||visualStallConfirmed;
 if(strong)return true;
 return !alreadyRebound && (recurringWebRtcFreeze||introFreeze);
}

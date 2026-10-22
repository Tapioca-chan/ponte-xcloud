// Conservative recovery escalator for VIDAA where the native video plane
// is opaque to the webpage. Never treat decoded WebRTC frames as proof that
// the TV compositor is drawing them.
export function selectVideoRecoveryMode({
  manual=false, now, lastSoftAt=0, lastSoftFreezeCount=null,
  freezeCount=null, signalStrong=false, visualFrozen=false
}={}){
  if(manual)return 'rebind';
  // First auto attempt is always lightweight, without destroying srcObject.
  if(!Number.isFinite(lastSoftAt)||lastSoftAt<=0)return 'soft';
  // A second freeze counted AFTER the lightweight attempt is fresh evidence
  // the decoder/display path still has trouble; a passive still scene is not.
  const freezeAdvanced=Number.isFinite(lastSoftFreezeCount) &&
    Number.isFinite(freezeCount) && freezeCount>lastSoftFreezeCount;
  if(Number.isFinite(now)&&now-lastSoftAt>=20000 &&
     (freezeAdvanced || signalStrong || visualFrozen))return 'rebind';
  return 'soft';
}

export function canRequestSurfaceRefresh({embedded=false,hasVideo=false,overlayOpen=false}={}){
  return Boolean(embedded&&hasVideo&&!overlayOpen);
}

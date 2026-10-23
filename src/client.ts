import QRCode from 'qrcode';
import {mountEmbeddedDashboard} from './embedded-dashboard.mjs';
import {serializeLocalIceCandidates} from './ice-bridge.mjs';
import {compactFrame,acceptsParent} from './xbridge-input.mjs';
import {MenuInputEdges,selectMenuTarget} from './menu-input.mjs';
import {classifyStreamHealth} from './stream-health.mjs';
import {needsXboxDialogCompatibility} from './game-compat.mjs';
import {VideoFreezeWatchdog,sampleVideoLuma,canAutoRecoverStream,classifyAudioVideoStall} from './video-freeze-watchdog.mjs';
import {shouldPerformBlindMetroRefresh} from './vidaa-blind-recovery.mjs';
import {MediaTransitionWatch} from './video-transition-health.mjs';
import {inspectVideoPipeline} from './video-pipeline-diagnostics.mjs';
import {RecurrentWebRtcFreezeWatch} from './recurrent-webrtc-freezes.mjs';
import {shouldRecoverMetroIntro,describeRecoveryBlockers} from './metro-intro-stall.mjs';
import {selectVideoRecoveryMode,canRequestSurfaceRefresh} from './video-recovery-stages.mjs';
import {shouldStartMetroOpaqueRepair,shouldEscalateMetroOpaqueRepair} from './metro-native-plane-autorepair.mjs';
import {EarlyFreezeRiseWatch} from './vidaa-early-freeze.mjs';
import {MetroStartupKeyframePreflight} from './metro-startup-keyframe.mjs';
import {shouldAutoRepairAfterVideoEvidence} from './ongoing-recovery-policy.mjs';
import {decoderSummary} from './decoder-health.mjs';
import {compareFreezeEvidence} from './freeze-evidence.mjs';
const embedded = new URLSearchParams(location.search).get('embed') === 'xbridge' && window.parent !== window;
const parentOrigin = 'https://xcloud-tv.onrender.com';
const notifyParent = (message:any) => { if(embedded) window.parent.postMessage(message,parentOrigin); };
import Player from '../vendor/packages/player/src/client/lib/player';
import {buttons,axes,sanitize,gamepadFrame} from './protocol.mjs';
const $=(id:string)=>document.getElementById(id) as any;
const status=(s:string)=>{$('status').textContent=s;notifyParent({type:'xbridge-player-status',message:s});};
const run=(fn:()=>any)=>async()=>{try{await fn();}catch(e:any){status(e.message||'Falha na conexão');}};
let backend='',room:any,ws:WebSocket,player:any,keepalive:any,frame=sanitize({}),lastFrame=0,started=false;
let videoHealthTimer:any=null,healthPrevious:any=null,freezeChecks=0,audioVideoStallChecks=0;
let lastSoftRecoveryAt=0,lastSoftFreezeCount:number|null=null,currentVideoFreezeCount:number|null=null;
let lastStrongVideoRebindAt=0;
let lastMeaningfulGamepadAt=0,visualWatchdog:VideoFreezeWatchdog|null=null;
let visualSampleCanvas:HTMLCanvasElement|null=null;
let launchedStreamingTitle='',metroRecoveryAttempts=0,metroLastRecoveryAt=0,videoRecoveryInFlight=false,videoHealthBusy=false;
let nativePlaneFirstVideoAt=0,nativeUnreadableSamples=0,lastManualRecoveryAt=0,gameOverlayOpen=false;
let queuedMetroIntroRecovery=false;
let lastVideoTelemetryAt=0;
let freezeMarkerSerial=0;
let activeFreezeMarker:{serial:number;baseline:any}|null=null;
let mediaTransitions=new MediaTransitionWatch();
let webRtcFreezeWatch=new RecurrentWebRtcFreezeWatch();
let earlyFreezeWatch=new EarlyFreezeRiseWatch();
let metroStartupKeyframes=new MetroStartupKeyframePreflight();
let watchedVideo:HTMLVideoElement|null=null,watchedVideoListener:((event:Event)=>void)|null=null;
const trackedMediaEvents=['waiting','stalled','playing','pause','emptied','loadeddata','loadstart','resize','error','suspend'];
function trackVideoTransitions(media:HTMLVideoElement|undefined){
 if(watchedVideo===media)return;
 if(watchedVideo && watchedVideoListener)for(const kind of trackedMediaEvents)
  watchedVideo.removeEventListener(kind,watchedVideoListener);
 watchedVideo=media||null;watchedVideoListener=null;
 if(!media)return;
 watchedVideoListener=(event:Event)=>{
  const transition=mediaTransitions.noteEvent(event.type,Date.now());
  if(!transition)return;
  notifyParent({type:'xbridge-video-transition',
   kind:transition.kind,causedByXBridge:transition.initiatedByXBridge,
   repairReason:transition.initiatedByXBridge?transition.repairReason:null,
   readyState:media.readyState,paused:media.paused,
   width:media.videoWidth,height:media.videoHeight});
 };
 for(const kind of trackedMediaEvents)media.addEventListener(kind,watchedVideoListener);
}
// Track each link of Android -> WebRTC gamepad delivery without recording button
// sequences, Xbox tokens, or session identifiers.
const inputDebug={androidFrames:0,aPresses:0,gamepadPacketsSent:0,lastAndroidAt:0,lastAAt:0};
let previousA=false, sentAtPreviousCheck=0;
function reportInputHealth(){
 const control=(player?._channels?.control as any)?._dataChannel as RTCDataChannel|undefined;
 const input=(player?._channels?.input as any)?._dataChannel as RTCDataChannel|undefined;
 return {
  androidFrames:inputDebug.androidFrames,
  aPresses:inputDebug.aPresses,
  aRecently:inputDebug.lastAAt>0&&Date.now()-inputDebug.lastAAt<20000,
  gamepadPacketsSent:inputDebug.gamepadPacketsSent,
  controlState:control?.readyState||'ausente',
  inputState:input?.readyState||'ausente',
  gamepadRegistered:Boolean(player?._channels?.control?.getGamepadHandlers?.()?.[0]),
  latestInputMs:inputDebug.lastAndroidAt?Date.now()-inputDebug.lastAndroidAt:null
 };
}
function clearInputHealth(){
 inputDebug.androidFrames=0;inputDebug.aPresses=0;inputDebug.gamepadPacketsSent=0;
 inputDebug.lastAndroidAt=0;inputDebug.lastAAt=0;previousA=false;sentAtPreviousCheck=0;
}
function stopVideoHealth(){
 if(videoHealthTimer)clearInterval(videoHealthTimer);
 videoHealthTimer=null;healthPrevious=null;freezeChecks=0;audioVideoStallChecks=0;
 lastSoftRecoveryAt=0;lastSoftFreezeCount=null;currentVideoFreezeCount=null;
 lastStrongVideoRebindAt=0;
 visualWatchdog=null;visualSampleCanvas=null;
 nativePlaneFirstVideoAt=0;nativeUnreadableSamples=0;
 queuedMetroIntroRecovery=false;lastVideoTelemetryAt=0;
 freezeMarkerSerial++;activeFreezeMarker=null;
 trackVideoTransitions(undefined);mediaTransitions=new MediaTransitionWatch();
 webRtcFreezeWatch.reset();earlyFreezeWatch.reset();
 metroStartupKeyframes.reset();
}
// Coarse operational media state only; no video pixels, raw gamepad packets,
// session IDs, room codes, Microsoft credentials or token content.
function traceVideo(phase:string,details:Record<string,unknown>={}){
 notifyParent({type:'xbridge-video-telemetry',phase,...details});
}
// User confirmation supplies the missing visual evidence on VIDAA.
// The diagnostic does not copy pixels, raw packets, session IDs or credentials.
async function captureFreezeSample():Promise<any|null>{
 const active=player;
 const pc=active?._peerConnection;
 const media=active?.getVideoElement?.() as
  (HTMLVideoElement & {__xbridgePresentedFrames?:number})|undefined;
 if(!pc || !media)return null;
 try{
  const stats=await pc.getStats();
  if(player!==active)return null;
  let inbound:any=null,audio:any=null;
  stats.forEach((x:any)=>{
   if(x.type==='inbound-rtp' && (x.kind==='video'||x.mediaType==='video'))inbound=x;
   if(x.type==='inbound-rtp' && (x.kind==='audio'||x.mediaType==='audio'))audio=x;
  });
  const safe=(n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
  const presented=safe(media.__xbridgePresentedFrames);
  const quality=media.getVideoPlaybackQuality?.();
  const codec=stats.get(inbound?.codecId)?.mimeType;
  return {
   at:Date.now(),decoded:safe(inbound?.framesDecoded),received:safe(inbound?.packetsReceived),
   audioReceived:safe(audio?.packetsReceived),freezeCount:safe(inbound?.freezeCount),
   fps:safe(inbound?.framesPerSecond),presented:presented!==null&&presented>0?presented:null,
   currentTime:safe(media.currentTime),ready:media.readyState>=2,
   paused:media.paused,width:safe(media.videoWidth),height:safe(media.videoHeight),
   dropped:safe(quality?.droppedVideoFrames),totalFrames:safe(quality?.totalVideoFrames),
   codec:typeof codec==='string'?codec:'unknown'
  };
 }catch(_){return null;}
}
// A VIDAA getStats() call can hang during a decoder stall. Never let the
// diagnostic delay the user's emergency Recover Image button indefinitely.
async function captureFreezeSampleBounded(maxWaitMs:number):Promise<any|null>{
 return Promise.race([
  captureFreezeSample(),
  new Promise<null>(resolve=>setTimeout(()=>resolve(null),maxWaitMs))
 ]);
}
function reportFreezeSample(phase:string,source:string,sample:any,comparison:any=null){
 traceVideo(phase,{
  source,capture:sample?'ok':'unavailable',
  metro:needsXboxDialogCompatibility(launchedStreamingTitle),
  decoded:sample?.decoded,received:sample?.received,
  audioReceived:sample?.audioReceived,freezeCount:sample?.freezeCount,
  fps:sample?.fps,presented:sample?.presented,mediaTime:sample?.currentTime,
  videoWidth:sample?.width,videoHeight:sample?.height,
  ready:sample?.ready,paused:sample?.paused,dropped:sample?.dropped,
  totalFrames:sample?.totalFrames,codec:sample?.codec,
  verdict:comparison?.verdict,decodedRise:comparison?.decodedRise,
  receivedRise:comparison?.receivedRise,presentedRise:comparison?.presentedRise,
  mediaTimeRise:comparison?.currentTimeRise,elapsedSec:comparison?.elapsedSec
 });
}
async function markVisibleFreeze(){
 const serial=++freezeMarkerSerial;
 const snapshot=await captureFreezeSampleBounded(1500);
 if(serial!==freezeMarkerSerial)return;
 if(!snapshot){
  reportFreezeSample('freeze-marker','user',null);
  status('Marcador recebido, mas o WebRTC ainda não disponibilizou estatísticas do vídeo.');
  return;
 }
 activeFreezeMarker={serial,baseline:snapshot};
 reportFreezeSample('freeze-marker','user',snapshot);
 notifyParent({type:'xbridge-freeze-marked',step:'marked'});
 status('Imagem travada marcada. Observando o WebRTC por 8 s sem interromper o vídeo.');
 setTimeout(async()=>{
  if(serial!==freezeMarkerSerial || activeFreezeMarker?.serial!==serial)return;
  const after=await captureFreezeSampleBounded(1500);
  if(serial!==freezeMarkerSerial || activeFreezeMarker?.serial!==serial)return;
  activeFreezeMarker=null;
  const compare=compareFreezeEvidence(snapshot,after);
  reportFreezeSample('freeze-followup','user',after,compare);
  notifyParent({type:'xbridge-freeze-marked',step:'measured',verdict:compare.verdict});
  status('Diagnóstico da imagem congelada registrado. Pode usar Recuperar imagem se necessário.');
 },8000);
}
async function recoverManuallyWithEvidence(){
 if(videoRecoveryInFlight)return;
 ++freezeMarkerSerial;
 const marker=activeFreezeMarker;
 activeFreezeMarker=null;
 const before=await captureFreezeSampleBounded(450);
 if(marker){
  reportFreezeSample('freeze-followup','before-recovery',before,
   compareFreezeEvidence(marker.baseline,before));
 }else{
  reportFreezeSample('freeze-marker','recovery',before);
 }
 // Keep the proven manual rebind. Snapshots are informational only.
 visualWatchdog?.reset();
 lastManualRecoveryAt=Date.now();
 const recovered=await recoverXboxVideoLocally('manual');
 setTimeout(async()=>{
  const after=await captureFreezeSampleBounded(1500);
  reportFreezeSample('freeze-after-recovery',recovered?'recovery-ok':'recovery-failed',
   after,compareFreezeEvidence(before,after));
 },4000);
}
function trackMeaningfulGamepadInput(state:any){
 // Keep only a timestamp; never store the button sequence.
 if(Object.entries(state||{}).some(([key,value])=>key!=='GamepadIndex'
   && typeof value==='number' && Math.abs(value)>0.27))lastMeaningfulGamepadAt=Date.now();
}
async function recoverXboxVideoLocally(reason:'manual'|'automatic',kind='unknown'):Promise<boolean>{
 // The WebRTC stream stays connected. For automatic repairs prefer pause/play
 // + a lightweight parent-surface repaint. Escalate to srcObject rebind only
 // after subsequent corroborating browser freeze evidence. Manual recovery
 // deliberately retains the stronger method proven on this Toshiba.
 if(videoRecoveryInFlight)return false;
 const activePlayer=player;
 const media=activePlayer?.getVideoElement?.() as HTMLVideoElement|undefined;
 if(!media?.srcObject){
  if(reason==='manual'){
   try{activePlayer?._channels?.control?.requestKeyframeRequest(true)}catch(_){}
   status('Solicitado novo quadro ao Xbox; ainda não há vídeo local para reconectar.');
  }
  return false;
 }
 const stage=selectVideoRecoveryMode({
  manual:reason==='manual',now:Date.now(),
  lastSoftAt:lastSoftRecoveryAt,lastSoftFreezeCount,
  freezeCount:currentVideoFreezeCount,
  compatibilityEscalation:kind==='metro-opaque-escalation',
  signalStrong:kind==='decode-stall'||kind==='presentation-stall'||kind==='audio-active-video-stalled',
  visualFrozen:kind==='visual-still'
 });
 videoRecoveryInFlight=true;
 webRtcFreezeWatch.acknowledgeRecovery();
 mediaTransitions.noteRepair(reason,Date.now());
 notifyParent({type:'xbridge-video-recovery-start',reason,kind,stage});
 traceVideo('attempt',{stage,kind,manual:reason==='manual',freezeCount:currentVideoFreezeCount,attempts:metroRecoveryAttempts});
 try{
  if(stage==='soft'){
   // Stage 1: ask the HTML media element to resume, without recreating the
   // native decoder, detaching its MediaStream or renegotiating WebRTC.
   media.pause();
   let rejected=false;
   await Promise.race([
    Promise.resolve(media.play()).catch(()=>{rejected=true}),
    new Promise(resolve=>setTimeout(resolve,1800))
   ]);
   if(player!==activePlayer)return false;
   if(rejected||media.paused){
    notifyParent({type:'xbridge-video-recovery',step:'gesture-required',kind,stage});
    traceVideo('result',{stage,result:'gesture-required',freezeCount:currentVideoFreezeCount});
    status('O VIDAA exige interação para reativar o vídeo. Use Recuperar imagem no celular.');
    return false;
   }
   try{activePlayer?._channels?.control?.requestKeyframeRequest(true)}catch(_){}
   // Stage 2: request a non-destructive visual layout/compositor refresh in
   // the top-level TV host. The parent owns the native video DOM element.
   if(canRequestSurfaceRefresh({embedded,hasVideo:Boolean(media.srcObject),overlayOpen:gameOverlayOpen})){
    notifyParent({type:'xbridge-video-surface-refresh',reason,kind});
   }
   lastSoftRecoveryAt=Date.now();
   lastSoftFreezeCount=currentVideoFreezeCount;
   healthPrevious=null;freezeChecks=0;audioVideoStallChecks=0;
   notifyParent({type:'xbridge-video-recovery',step:'soft',kind,stage});
   traceVideo('result',{stage,result:'play-accepted',freezeCount:currentVideoFreezeCount});
   status('xBridge: reativação leve do vídeo solicitada, sem desconectar a partida.');
   return true;
  }

  // Stage 3: force a new native video surface using the *same* MediaStream.
  // This may flash black briefly; reserve it for manual recovery or a second
  // independently measured freeze after the earlier lightweight attempt.
  const stream=media.srcObject;
  // Mark the native plane as rebound BEFORE rebuilding it. Even if VIDAA
  // rejects play(), repeated browser freezeCount increments must not keep
  // interrupting resumed gameplay with further automatic pause/play cycles.
  lastStrongVideoRebindAt=Date.now();
  media.pause();
  media.srcObject=null;
  media.srcObject=stream;
  let rejected=false;
  await Promise.race([
   Promise.resolve(media.play()).catch(()=>{rejected=true}),
   new Promise(resolve=>setTimeout(resolve,2500))
  ]);
  if(player!==activePlayer)return false;
  if(rejected||media.paused){
   status('O VIDAA bloqueou a retomada do vídeo. Use o controle da TV.');
   notifyParent({type:'xbridge-video-recovery',step:'gesture-required',kind,stage});
   traceVideo('result',{stage,result:'gesture-required',freezeCount:currentVideoFreezeCount});
   return false;
  }
  try{activePlayer?._channels?.control?.requestKeyframeRequest(true)}catch(_){}
  healthPrevious=null;freezeChecks=0;audioVideoStallChecks=0;
  lastSoftRecoveryAt=0;lastSoftFreezeCount=null;
  notifyParent({type:'xbridge-video-recovery',step:'reattach',kind,stage});
  traceVideo('result',{stage,result:'play-accepted',freezeCount:currentVideoFreezeCount});
  status(reason==='manual'
    ?'Vídeo reconectado localmente, sem reiniciar o jogo.'
    :'xBridge: reconexão forte do vídeo solicitada após nova falha WebRTC.');
  return true;
 }catch(_){
  status('O VIDAA não aceitou a recuperação do vídeo. A sessão Xbox permanece aberta.');
  notifyParent({type:'xbridge-video-recovery',step:'failed',kind,stage});
  traceVideo('result',{stage,result:'exception',freezeCount:currentVideoFreezeCount});
  return false;
 }finally{videoRecoveryInFlight=false}
}
function startVideoHealth(){
 stopVideoHealth();
 // Xbox free-tier ads precede the game: do not use a blind boot timer.
 // Watch decoded + presented frames and sampled visual motion continuously.
 visualWatchdog=new VideoFreezeWatchdog();
 visualSampleCanvas=document.createElement('canvas');
 lastMeaningfulGamepadAt=Date.now();
 traceVideo('start',{metro:needsXboxDialogCompatibility(launchedStreamingTitle)});
 videoHealthTimer=setInterval(async()=>{
  if(videoHealthBusy || !player?._peerConnection)return;
  videoHealthBusy=true;
  const monitoredPlayer=player;
  try{
   const peer=monitoredPlayer._peerConnection;
   const stats=await peer.getStats();
   if(player!==monitoredPlayer)return;
   let inbound:any=null,audioInbound:any=null;
   stats.forEach((x:any)=>{
    if(x.type==='inbound-rtp'&&(x.kind==='video'||x.mediaType==='video'))inbound=x;
    if(x.type==='inbound-rtp'&&(x.kind==='audio'||x.mediaType==='audio'))audioInbound=x;
   });
   if(!inbound){
    notifyParent({type:'xbridge-freeze-diagnostics',visualStatus:'video-stats-missing',
     signalStatus:'unknown',visualStillMs:0});
    if(Date.now()-lastVideoTelemetryAt>19000){
     lastVideoTelemetryAt=Date.now();
     traceVideo('unavailable',{kind:'no-video-stats',metro:needsXboxDialogCompatibility(launchedStreamingTitle)});
    }
    return;
   }
   const media=player.getVideoElement?.() as (HTMLVideoElement & {__xbridgePresentedFrames?:number})|undefined;
   trackVideoTransitions(media);
   const compositorFrames=Number(media?.__xbridgePresentedFrames)||0;
   let qualityFrames=0,droppedFrames=0;
   try {
    const quality=media?.getVideoPlaybackQuality?.();
    qualityFrames=Number(quality?.totalVideoFrames)||0;
    droppedFrames=Number(quality?.droppedVideoFrames)||0;
   } catch(_){}
   // getVideoPlaybackQuality().totalVideoFrames includes displayed AND dropped
   // frames. It is NOT a proof that a frame reached the display compositor.
   // Use only requestVideoFrameCallback for that stronger signal.
   const presented=compositorFrames>0?compositorFrames:null;
   const sample={
    decoded:Number(inbound.framesDecoded)||0,
    received:Number(inbound.packetsReceived)||0,
    audioReceived:Number(audioInbound?.packetsReceived)||0,
    freezeCount:Number.isFinite(inbound.freezeCount)?Number(inbound.freezeCount):null,
    totalFreezesDuration:Number.isFinite(inbound.totalFreezesDuration)?Number(inbound.totalFreezesDuration):null,
    keyFramesDecoded:Number.isFinite(inbound.keyFramesDecoded)?Number(inbound.keyFramesDecoded):null,
    presented,
    videoQualityFrames:qualityFrames,
    videoDroppedFrames:droppedFrames,
    videoPaused:Boolean(media?.paused),
    videoReadyState:Number(media?.readyState)||0,
    videoWidth:Number(inbound.frameWidth)||0,
    videoHeight:Number(inbound.frameHeight)||0,
    connection:peer.connectionState
   };
   const previousDecoded=Number(healthPrevious?.decoded)||0;
   currentVideoFreezeCount=sample.freezeCount;
   const videoPipeline=inspectVideoPipeline(healthPrevious,sample);
   const decodeHealth=decoderSummary(healthPrevious?._rawDecoder||null,inbound);
   // Carry the previous inbound stats only locally, never through telemetry.
   (sample as any)._rawDecoder={framesDecoded:inbound.framesDecoded,totalDecodeTime:inbound.totalDecodeTime,
    packetsReceived:inbound.packetsReceived,packetsLost:inbound.packetsLost,
    jitterBufferEmittedCount:inbound.jitterBufferEmittedCount,jitterBufferDelay:inbound.jitterBufferDelay,
    freezeCount:inbound.freezeCount};
   const result=classifyStreamHealth(healthPrevious,sample,6);
   // Video-specific stalls may hide from the native VIDAA visual sampler,
   // but audio packets prove that the wider cloud stream is still alive.
   const audioProgress=classifyAudioVideoStall(healthPrevious,sample);
   audioVideoStallChecks=audioProgress?audioVideoStallChecks+1:0;
   healthPrevious=sample;
   const controller=reportInputHealth();
   const sentNow=controller.gamepadPacketsSent;
   const inputPacketsInWindow=sentNow-sentAtPreviousCheck;
   sentAtPreviousCheck=sentNow;
   if(result.kind==='decode-stall'||result.kind==='network-stall'||result.kind==='presentation-stall')freezeChecks++;
   else freezeChecks=0;
   notifyParent({type:'xbridge-video-health',message:result.reason,
    kind:result.kind,width:sample.videoWidth,height:sample.videoHeight,
    decoded:sample.decoded,received:sample.received,presented:sample.presented,
    decodedDelta:videoPipeline.decodedDelta,
    receivedDelta:videoPipeline.receivedDelta,
    freezeCount:videoPipeline.freezeCount,
    freezeDelta:videoPipeline.freezeDelta,
    freezeDurationDeltaSec:videoPipeline.freezeDurationDeltaSec,
    keyFramesDecoded:sample.keyFramesDecoded,
    quality:sample.videoQualityFrames,dropped:sample.videoDroppedFrames,
    paused:sample.videoPaused,readyState:sample.videoReadyState,
    input:{...controller,packetsInWindow:inputPacketsInWindow}});
   const now=Date.now();
   const visual=visualWatchdog?.observe({
    now,signature:sampleVideoLuma(media,visualSampleCanvas),
    decoded:sample.decoded,presented:sample.presented,
    received:sample.received,recentInput:now-lastMeaningfulGamepadAt<20000,
    connection:sample.connection,videoReadyState:sample.videoReadyState
   });
   // This VIDAA TV reports advancing decode counters but cannot expose the
   // native video plane to canvas or compositor callbacks. That makes a real
   // visual freeze unobservable. Keep a separate, clearly labelled preventive
   // compatibility refresh rather than falsely claiming freeze detection.
   if(sample.videoReadyState>=2 && sample.decoded>0 && !nativePlaneFirstVideoAt)nativePlaneFirstVideoAt=now;
   const earlyFreezeRises=earlyFreezeWatch.observe({now,freezeCount:sample.freezeCount});
   const freezeEvidence=webRtcFreezeWatch.observe({
    now,freezeCount:sample.freezeCount,
    decodedDelta:videoPipeline.decodedDelta,
    receivedDelta:videoPipeline.receivedDelta,
    firstVideoAt:nativePlaneFirstVideoAt
   });
   const recurringMetroFreezes=freezeEvidence.suspected &&
    needsXboxDialogCompatibility(launchedStreamingTitle) && !gameOverlayOpen;
   const nativeBlind=(visual?.status==='visual-unavailable' && sample.presented===null);
   nativeUnreadableSamples=nativeBlind?nativeUnreadableSamples+1:0;
   notifyParent({type:'xbridge-freeze-diagnostics',
    visualStatus:visual?.status||'unavailable',
    visualStillMs:Math.round(visual?.ageMs||0),
    signalStatus:result.kind,
    nativeBlindMetro:Boolean(nativeBlind && needsXboxDialogCompatibility(launchedStreamingTitle)),
    nativeBlindNextSec:nativeBlind&&nativePlaneFirstVideoAt?
     Math.max(0,Math.ceil(((metroRecoveryAttempts>0?
      Math.max(nativePlaneFirstVideoAt+120000,metroLastRecoveryAt+240000):
      nativePlaneFirstVideoAt+120000)-now)/1000)):null,
    nativeBlindAttempts:metroRecoveryAttempts,
    recurrentWebRtcFreezes:freezeEvidence.recentEvents,
    recurrentEvidenceStatus:freezeEvidence.reason
   });
   // VIDAA may report "connecting" while video and controller work.
   const connectedState=peer.connectionState;
   const effectiveState=(connectedState==='failed'||connectedState==='closed'||connectedState==='disconnected')
     ?connectedState:(sample.videoReadyState>=2 &&
       (sample.decoded>0||sample.audioReceived>0)?'connected':connectedState);
   // Before Metro reaches gameplay, request fresh decoder reference frames
   // when early WebRTC freezes occur. This is proactive but non-destructive:
   // unlike Recover Image it never detaches srcObject or flashes the ad.
   const controlChannel=player?._channels?.control as any;
   const controlOpen=controlChannel?._dataChannel?.readyState==='open';
   // VIDAA was freezing during startup despite two forced keyframes. Disable
   // speculative keyframe injection by default for a clean A/B diagnostic.
   // The safe physical video-plane preallocation and manual repair remain.
   let startupKeyframeEnabled=false;
   try{startupKeyframeEnabled=localStorage.getItem('xbridge:metro-startup-keyframes')==='true';}catch(_){}
   if(startupKeyframeEnabled && controlOpen && metroStartupKeyframes.observe({
    metro:needsXboxDialogCompatibility(launchedStreamingTitle),
    now,firstVideoAt:nativePlaneFirstVideoAt,
    freezeCount:sample.freezeCount,
    decodedDelta:videoPipeline.decodedDelta,
    receivedDelta:videoPipeline.receivedDelta,
    videoReadyState:sample.videoReadyState,
    connected:effectiveState==='connected'||effectiveState==='completed',
    overlayOpen:gameOverlayOpen
   })){
    try{
     controlChannel.requestKeyframeRequest(true);
     notifyParent({type:'xbridge-metro-preflight',step:'startup-keyframe',
       count:metroStartupKeyframes.requests});
     traceVideo('preflight',{kind:'startup-keyframe'});
    }catch(_){}
   }
   // Credits fallback: repeated A with at least one real WebRTC freeze,
   // bounded to the first five minutes and never automatically replayed.
   // Evaluate eligibility independently from overlay visibility. If the
   // detector sees evidence at 90 s while settings are open, defer a SINGLE
   // attempt until the overlay closes instead of losing that opportunity.
   const introEligible=shouldRecoverMetroIntro({
    title:launchedStreamingTitle,
    sessionAgeMs:nativePlaneFirstVideoAt?now-nativePlaneFirstVideoAt:0,
    aPresses:inputDebug.aPresses,recentFreezeEvents:freezeEvidence.recentEvents,
    totalFreezeCount:sample.freezeCount,
    now,lastAttemptAt:metroLastRecoveryAt,attempts:metroRecoveryAttempts,
    overlayOpen:false,videoReadyState:sample.videoReadyState,
    hasVideo:Boolean(media?.srcObject),connection:effectiveState
   });
   if(introEligible && gameOverlayOpen)queuedMetroIntroRecovery=true;
   const introFreeze=introEligible && !gameOverlayOpen;
   const visualFrozen=visual?.frozen===true;
   const signalFrozen=shouldAutoRepairAfterVideoEvidence({
    alreadyRebound:lastStrongVideoRebindAt>0,
    decodeOrPresentationStall:(result.kind==='decode-stall'||result.kind==='presentation-stall')&&freezeChecks>=3,
    audioActiveVideoStall:audioVideoStallChecks>=3,
    visualStallConfirmed:visualFrozen,
    recurringWebRtcFreeze:recurringMetroFreezes,
    introFreeze
   });
   const cooldownMs=metroRecoveryAttempts>0
     ?Math.max(0,90000-(now-metroLastRecoveryAt)):0;
   notifyParent({type:'xbridge-recovery-decision',
    metro:needsXboxDialogCompatibility(launchedStreamingTitle),
    freezeEvents:freezeEvidence.recentEvents,totalFreezes:sample.freezeCount,
    aPresses:inputDebug.aPresses,
    streamAgeSec:nativePlaneFirstVideoAt?Math.round((now-nativePlaneFirstVideoAt)/1000):0,
    overlayOpen:gameOverlayOpen,queuedOnClose:queuedMetroIntroRecovery,
    attempts:metroRecoveryAttempts,
    blocker:describeRecoveryBlockers({
     title:launchedStreamingTitle,
     sessionAgeMs:nativePlaneFirstVideoAt?now-nativePlaneFirstVideoAt:0,
     freezeEvents:freezeEvidence.recentEvents,totalFreezeCount:sample.freezeCount,
     aPresses:inputDebug.aPresses,
     attempts:metroRecoveryAttempts,overlayOpen:gameOverlayOpen,
     hasVideo:Boolean(media?.srcObject),videoReadyState:sample.videoReadyState,
     connection:effectiveState,cooldownMs
    })
   });
   if(audioVideoStallChecks>=3)notifyParent({type:'xbridge-freeze-diagnostics',
    visualStatus:'audio-active-video-stalled',visualStillMs:visual?.ageMs||0,
    signalStatus:result.kind});
   if(recurringMetroFreezes || introFreeze)notifyParent({type:'xbridge-freeze-diagnostics',
    // Do not claim an automatic recovery was requested if the post-rebind
    // playback protection correctly blocked weak freezeCount-only evidence.
    visualStatus:!signalFrozen && lastStrongVideoRebindAt>0?'webrtc-post-rebind-protected':
      introFreeze?'webrtc-metro-intro':'webrtc-recurrent-freezes',
    recentFreezeEvents:freezeEvidence.recentEvents,
    visualStillMs:0,signalStatus:result.kind});
   if(canAutoRecoverStream({
    now,attempts:metroRecoveryAttempts,lastAttemptAt:metroLastRecoveryAt,
    visualFrozen,signalFrozen,hasVideo:Boolean(media?.srcObject),
    connection:effectiveState
   })&&!videoRecoveryInFlight && !gameOverlayOpen && !activeFreezeMarker){
    queuedMetroIntroRecovery=false;
    metroRecoveryAttempts++;
    metroLastRecoveryAt=now;
    const kind=audioVideoStallChecks>=3?'audio-active-video-stalled':
      introFreeze?'metro-intro-a-freeze':
      recurringMetroFreezes?'webrtc-freeze-burst':
      visualFrozen?'visual-still':result.kind;
    status('Possível congelamento detectado ('+kind+'). Recuperando imagem…');
    const recovered=await recoverXboxVideoLocally('automatic',kind);
    visualWatchdog?.reset();
    audioVideoStallChecks=0;
    if(!recovered)notifyParent({type:'xbridge-freeze-diagnostics',
     visualStatus:'recovery-failed',signalStatus:kind});
   }
   if(mediaTransitions.shouldRecoverWait({
    now,readyState:sample.videoReadyState,paused:sample.videoPaused,
    hasVideo:Boolean(media?.srcObject),
    connected:effectiveState==='connected'||effectiveState==='completed',
    overlayOpen:gameOverlayOpen,attempts:metroRecoveryAttempts,lastAttemptAt:metroLastRecoveryAt
   })&&!videoRecoveryInFlight && !activeFreezeMarker){
    metroRecoveryAttempts++;
    metroLastRecoveryAt=now;
    status('VIDAA: espera de vídeo prolongada após uma transição. Recuperando a imagem…');
    await recoverXboxVideoLocally('automatic','browser-waiting');
    visualWatchdog?.reset();
   }
   // The screenshot evidence on this Toshiba is: freezeCount>=1, decoded
   // frames keep moving, canvas and compositor are opaque, but pressing
   // Recuperar imagem (srcObject rebind) restores the visible picture.
   // A soft recovery can resolve most cases, but HTMLMediaElement.play()
   // cannot confirm that VIDAA painted a frame. One bounded, optional
   // strong escalation follows when visibility remains unobservable.
   let opaqueRepairEnabled=true;
   try{opaqueRepairEnabled=localStorage.getItem('xbridge:metro-opaque-autorepair')!=='false';}catch(_){}
   const opaqueRepair={
    title:launchedStreamingTitle,
    nativePlaneUnobservable:nativeBlind,
    firstVideoAt:nativePlaneFirstVideoAt,now,
    freezeCount:sample.freezeCount,
    hasVideo:Boolean(media?.srcObject),videoReadyState:sample.videoReadyState,
    connection:effectiveState,overlayOpen:gameOverlayOpen,
    recoveryBusy:videoRecoveryInFlight||Boolean(activeFreezeMarker),enabled:opaqueRepairEnabled,
    lastManualRecoveryAt,attempts:metroRecoveryAttempts,
    earlyFreezeRises,lastSoftRecoveryAt
   };
   const doSoft=shouldStartMetroOpaqueRepair(opaqueRepair);
   const doStrong=shouldEscalateMetroOpaqueRepair(opaqueRepair);
   if(now-lastVideoTelemetryAt>19000){
    lastVideoTelemetryAt=now;
    traceVideo('heartbeat',{
     metro:needsXboxDialogCompatibility(launchedStreamingTitle),
     ageSec:nativePlaneFirstVideoAt?Math.round((now-nativePlaneFirstVideoAt)/1000):0,
     freezeCount:sample.freezeCount,earlyFreezeRises,decoded:sample.decoded,
     fps:decodeHealth.fps,decodeMs:decodeHealth.decodeMs,
     packetLossPct:decodeHealth.lossPercent,jitterMs:decodeHealth.jitterMs,
     frameWidth:decodeHealth.width,frameHeight:decodeHealth.height,
     freezeRise:decodeHealth.freezeRise,
     codec:(()=>{
      const type=stats.get(inbound.codecId)?.mimeType;
      return ['video/H264','video/VP8','video/VP9','video/AV1','video/H265'].includes(type)?type:'unknown';
     })(),startupKeyframeEnabled,
     visualBlind:nativeBlind,overlay:gameOverlayOpen,
     ready:sample.videoReadyState>=2,
     connected:effectiveState==='connected'||effectiveState==='completed',
     attempts:metroRecoveryAttempts,softEligible:doSoft,strongEligible:doStrong,
     postStrongProtected:lastStrongVideoRebindAt>0,
     recoveryBusy:videoRecoveryInFlight,compatEnabled:opaqueRepairEnabled,
     hasVideo:Boolean(media?.srcObject),lastSoftAgoSec:lastSoftRecoveryAt?
      Math.round((now-lastSoftRecoveryAt)/1000):null
    });
   }
   if(doSoft || doStrong){
    // No Game Pass advertisement skipping, no Xbox session restart, no
    // controller presses. Reconnect the DOM media element only once maximum.
    const stage=doStrong?'strong':'soft';
    metroRecoveryAttempts++;
    metroLastRecoveryAt=now;
    queuedMetroIntroRecovery=false;
    const kind=doStrong?'metro-opaque-escalation':'metro-opaque-startup';
    notifyParent({type:'xbridge-metro-compat-action',
      stage,attempt:metroRecoveryAttempts});
    status(doStrong
      ?'Metro/VIDAA: último recurso, recriando o vídeo sem reiniciar o jogo…'
      :'Metro/VIDAA: iniciando recuperação leve do vídeo…');
    const recovered=await recoverXboxVideoLocally('automatic',kind);
    if(!recovered){
     notifyParent({type:'xbridge-metro-compat-action',stage:'failed',
       attempt:metroRecoveryAttempts});
    }
    visualWatchdog?.reset();
   }
   // Experimental fallback ONLY for Metro on unreadable native VIDAA planes.
   // We cannot detect the picture freezing when decoded frames still advance.
   // Rebind sparingly as maintenance, after a generous free-tier ad grace.
   // OFF by default: periodic srcObject reattachments themselves produce a
   // black flash and might be mistaken for the original game freeze.
   let nativeRefreshEnabled=false;
   try{nativeRefreshEnabled=localStorage.getItem('xbridge:metro-native-refresh')==='true';}catch(_){}
   if(shouldPerformBlindMetroRefresh({
    title:launchedStreamingTitle,enabled:nativeRefreshEnabled,
    now,firstVideoAt:nativePlaneFirstVideoAt,attempts:metroRecoveryAttempts,
    lastAttemptAt:metroLastRecoveryAt,lastManualAt:lastManualRecoveryAt,
    unreadableSamples:nativeUnreadableSamples,
    decodedAdvancing:sample.decoded>previousDecoded,
    hasVideo:Boolean(media?.srcObject),videoReadyState:sample.videoReadyState,
    connection:effectiveState,overlayOpen:gameOverlayOpen,inFlight:videoRecoveryInFlight||Boolean(activeFreezeMarker)
   })){
    metroRecoveryAttempts++;
    metroLastRecoveryAt=now;
    notifyParent({type:'xbridge-freeze-diagnostics',
      visualStatus:'preventive-refresh',visualStillMs:0,
      nativeBlindAttempts:metroRecoveryAttempts,signalStatus:result.kind});
    status('VIDAA: manutenção preventiva do vídeo do Metro, sem reiniciar o jogo…');
    await recoverXboxVideoLocally('automatic','native-plane-preventive');
    visualWatchdog?.reset();
   }
  }catch(_){
   notifyParent({type:'xbridge-video-health',message:'Estatísticas de vídeo não disponíveis no VIDAA',kind:'unknown'});
   if(Date.now()-lastVideoTelemetryAt>19000){
    lastVideoTelemetryAt=Date.now();
    traceVideo('unavailable',{kind:'monitor-error',metro:needsXboxDialogCompatibility(launchedStreamingTitle)});
   }
  }finally{videoHealthBusy=false}
 },6500);
}
let map:any={},mappingKey='',calStep=-1,calWaiting=0,previous:any,baseAxes:number[]=[];
const fields=[...buttons,...axes];
function endpoint(p:string){return backend.replace(/\/$/,'')+p;}
async function api(action:string,body:any={}){
 const response=await fetch(endpoint('/api/'+action),{
  method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json',...(room?{'Authorization':'Bearer '+room.tvKey}:{})},
  body:JSON.stringify({...body,room:room?.id})
 });
 // A platform-generated 429 may be plain text or HTML, not JSON.
 // Never confuse the browser with a JSON parsing error on rate limiting.
 const raw=await response.text();
 let data:any={};
 try{data=JSON.parse(raw)}catch(_){
  data={error:response.status===429
   ?'O servidor limitou temporariamente as requisições (HTTP 429). Aguarde antes de tentar novamente.'
   :'O servidor respondeu em um formato inesperado.'};
 }
 if(!response.ok){
  const error=Object.assign(new Error(data.error||'Servidor indisponível'),{
   status:response.status,stage:data.stage||action,
   reason:data.reason||'',retryable:data.retryable===true,
   retryAfterSec:data.retryAfterSec||60
  });
  throw error;
 }
 return data;
}
function connect(role:string,key:string){
 if(ws)ws.close();ws=new WebSocket(endpoint('/relay').replace(/^http/,'ws'));
 ws.onopen=()=>{ws.send(JSON.stringify({role,key,room:room.id}));status('Conectado ao servidor. Aguardando comandos.');};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='frame'){frame=sanitize(m.frame);lastFrame=Date.now();$('remote').textContent='Comandos do Android recebidos';}};
 ws.onclose=()=>{frame=sanitize({});status('Conexão interrompida. Reconecte ou prepare uma nova sala.');};
 ws.onerror=()=>status('Falha no canal de comandos. Verifique servidor e HTTPS.');
}
function setBackend(value:string){
 const u=new URL(value);
 if(u.protocol!=='https:'&&u.hostname!=='localhost'&&u.hostname!=='127.0.0.1')throw Error('Use um servidor HTTPS');
 // The mounted /player path is the same-origin reverse proxy on the TV site.
 // No arbitrary proxy paths can be entered from the normal setup screen.
 backend=(embedded && u.origin===location.origin && u.pathname==='/player')
  ? u.origin+'/player' : u.origin;
}
$('backend').value=location.protocol==='https:'?location.origin:'http://localhost:3000';
$('diagnostics').textContent='WebRTC: '+(typeof RTCPeerConnection!=='undefined'?'sim':'ausente')+' · WebSocket: '+(typeof WebSocket!=='undefined'?'sim':'ausente')+' · Controle local: '+(navigator.getGamepads?'API disponível':'API ausente');
$('create').onclick=run(async()=>{
 setBackend($('backend').value);room=await api('create');$('setup').hidden=true;$('tv').hidden=false;
 const url=new URL(location.href);url.hash=new URLSearchParams({role:'phone',room:room.id,key:room.phoneKey,backend}).toString();$('phoneLink').value=url.href;await QRCode.toCanvas($('qr'),url.href,{width:280,margin:2});
 connect('tv',room.tvKey);status('Sala criada. Abra o link no Android.');
});
$('copy').onclick=run(async()=>{await navigator.clipboard.writeText($('phoneLink').value);status('Link copiado.');});
$('login').onclick=run(async()=>{status('Gerando código…');const d=await api('login');$('code').textContent='Acesse '+d.verification_uri+' e informe: '+d.user_code;$('verify').hidden=false;status('Autorize somente o código que acabou de gerar.');});
$('verify').onclick=run(async()=>{status('Verificando autorização…');await api('verify');$('titles').disabled=false;$('code').textContent='Conta conectada nesta sala.';status('Login concluído.');});
let titleList:any[]=[];
$('titles').onclick=run(async()=>{const data=await api('titles');titleList=data.results||data.titles||[];if(!Array.isArray(titleList)||!titleList.length)throw Error('Catálogo vazio ou formato não reconhecido');$('games').textContent='';for(const t of titleList){const o=document.createElement('option');o.value=t.titleId||t.id;o.textContent=t.details?.title||t.title||t.titleId||t.id;$('games').appendChild(o);}$('play').disabled=false;status(titleList.length+' jogos recebidos.');});
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
// The TV receives status updates even if the Xbox rejects the session.
// The previous handler permanently set started=true after its first failure.
$('play').onclick=async()=>{
 if(started){status('Já existe uma tentativa em andamento.');return}
 started=true;
 $('play').disabled=true;
 let phase='verificação';
 const announce=(message:string)=>{status(message); const el=document.getElementById('xb-launch-status');if(el)el.textContent=message;};
 try{
  if(typeof RTCPeerConnection==='undefined')throw Error('Este navegador não oferece WebRTC.');
  if(!$('games').value)throw Error('Selecione um jogo da biblioteca antes de jogar.');
  phase='start';announce('Solicitando o jogo aos servidores Xbox…');
  await api('start',{id:$('games').value});
  // Permit recovery menu while Xbox audio works but Metro has no video yet.
  notifyParent({type:'xbridge-game-session',active:true});
  phase='state';announce('Aguardando o Xbox preparar o jogo…');
  let ready=false,connectedToXbox=false,lastState='';
  for(let n=0;n<90;n++){
   const s=await api('state');
   const state=typeof s.state==='string'?s.state:'Aguardando';
   if(state!==lastState){lastState=state;announce('Xbox: '+state);}
   if(state==='Provisioned'){ready=true;break}
   if(state==='Failed'){
    const code=String(s.errorDetails?.code||'desconhecido').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48);
    throw Error('O Xbox recusou a sessão (código '+code+').');
   }
   if(state==='ReadyToConnect'&&!connectedToXbox){
    phase='connect';announce('Autenticando o jogo nos servidores Xbox…');
    await api('connect');connectedToXbox=true;
    phase='state';
   }
   await pause(2000);
  }
  if(!ready)throw Error('O Xbox não concluiu o preparo do jogo.');
  await connectExistingXboxSession(announce);
 }catch(e:any){
  notifyParent({type:'xbridge-game-session',active:false});
  const message=String(e?.message||'Erro desconhecido').slice(0,180);
  const detail='Não foi possível iniciar o jogo ['+phase+']: '+message;
  announce(detail);
  notifyParent({type:'xbridge-player-error',message:detail});
  clearInterval(keepalive);stopVideoHealth();
  try{player?.destroy()}catch(_){}
  player=undefined;
  try{await api('reset')}catch(_){}
  started=false;
  $('play').disabled=false;
 }
};
$('fullscreen').onclick=run(()=> $('playerContainer').requestFullscreen());
$('sound').onclick=run(async()=>{for(const el of document.querySelectorAll('video,audio'))await(el as HTMLMediaElement).play();});
$('stop').onclick=run(async()=>{clearInterval(keepalive);stopVideoHealth();player?.destroy();ws?.close();await api('close');location.hash='';location.reload();});
// Reuse the identical Xbox media connection handshake for both initial
// playback and manual *same-session* reconnection. Never call /api/start,
// /api/reset, or account logout when renegotiating an existing Xbox session.
async function connectExistingXboxSession(announce:(message:string)=>void){
  let phase='webrtc';announce('Iniciando conexão de vídeo e controle WebRTC…');
  player=new Player('playerContainer');
  // Compatibility experiment is scoped to Metro Exodus, whose official
  // browser stream launches while the independent client stalls at its intro.
  // Marvel Rivals and other working games retain their existing handshake.
  const launchedName=String($('games').selectedOptions?.[0]?.textContent||'');
  launchedStreamingTitle=launchedName;
  metroRecoveryAttempts=0;
  metroLastRecoveryAt=0;
  lastManualRecoveryAt=0;
  const metroSystemDialogCompat=needsXboxDialogCompatibility(launchedName);
  (player as any).__xbridgeShowMessageDialogs=metroSystemDialogCompat;
  player.init();
  if(metroSystemDialogCompat)announce('Metro Exodus: monitorando possíveis confirmações Xbox.');
  clearInputHealth();
  // Count packets actually sent to the Xbox input channel, independently of
  // arrival from Android. Preserve the original send semantics.
  const inputChannel=player._channels.input as any;
  const originalInputSend=inputChannel.send.bind(inputChannel);
  inputChannel.send=(payload:any)=>{
   // Xbox input packets begin with a little-endian report mask:
   // 2 = Gamepad. Do not count metadata-only reports as controller traffic.
   if(inputChannel._dataChannel?.readyState==='open' &&
      payload instanceof DataView && payload.byteLength>=2 &&
      (payload.getUint16(0,true)&2)!==0)inputDebug.gamepadPacketsSent++;
   return originalInputSend(payload);
  };
  const channel=player._channels.control;
  const original=channel.sendAuthorization.bind(channel);
  let controlRegistered=false;
  const registerGamepad=()=>{
   if(controlRegistered)return;
   const dataChannel=(channel as any)._dataChannel as RTCDataChannel;
   if(dataChannel?.readyState!=='open'){
    // The message-channel handshake may beat the control channel on slower
    // VIDAA devices. Previously the authorization and gamepadChanged packets
    // could be silently discarded, leaving the running game uncontrollable.
    if(dataChannel)dataChannel.addEventListener('open',registerGamepad,{once:true});
    announce('Aguardando canal de controle do Xbox…');
    return;
   }
   controlRegistered=true;
   const currentPlayer=player;
   const androidHandler={
    getGamepadState:()=>Date.now()-lastFrame<650?frame:sanitize({}),
    handleVibration:()=>{},detach:()=>{}
   };
   if(metroSystemDialogCompat) {
    // Metro startup may sample device availability immediately. Do not
    // advertise + remove the controller within the same handshake tick.
    channel.authorizeWithStableGamepad(androidHandler);
    announce('Metro Exodus: controle virtual registrado de forma contínua.');
    // One later announcement helps if the title attaches its input listener
    // after the stream handshake. Never disconnect or inject button presses.
    setTimeout(()=>{
      if(player===currentPlayer && !currentPlayer._isDestoyed && channel.getGamepadHandlers()?.[0]===androidHandler
        && (channel as any)._dataChannel?.readyState==='open') {
        channel.reannounceStableGamepad();
      }
    },6500);
   } else {
    original();
    channel.sendGamepadState(0,true,androidHandler);
   }
   notifyParent({type:'xbridge-control-ready'});
  };
  channel.sendAuthorization=registerGamepad;
  // Ignore late events from old media connections during same-session
  // reconnection. They must not hide a newly displayed Xbox stream.
  const activePlayer=player;
  const pc=activePlayer._peerConnection;
  pc.addEventListener('connectionstatechange',()=>{
   if(player!==activePlayer)return;
   const state=pc.connectionState;
   announce('Conexão de vídeo: '+state);
   if(state==='failed'||state==='disconnected'||state==='closed'){
    document.body.classList.remove('stream-playing');
    notifyParent({type:'xbridge-playing',playing:false});
   }
  });
  phase='sdp';announce('Negociando áudio e vídeo com o Xbox…');
  const offer=await player.createOffer();
  const answer=await api('sdp',{offer});
  const remoteSdp=JSON.parse(answer.exchangeResponse||'{}');
  if(typeof remoteSdp.sdp!=='string')throw Error('O Xbox não retornou a resposta de vídeo esperada.');
  await player.setRemoteSDP(remoteSdp.sdp);
  phase='ice';announce('Estabelecendo conexão de rede com o Xbox…');
  // Allow the ICE agent time to expose candidate addresses on slower TVs.
  const rtc=player._peerConnection;
  for(let i=0;i<15&&rtc.iceGatheringState!=='complete';i++)await pause(200);
  // getICECandidates() returns a Promise. Resolve it before serialization:
  // attempting .map() directly on the Promise caused the Metro Exodus failure.
  const candidates=await serializeLocalIceCandidates(()=>player.getICECandidates());
  const remote=await api('ice',{candidates});
  const parsed=JSON.parse(remote.exchangeResponse||'[]');
  const remoteCandidates=Array.isArray(parsed)?parsed:Array.isArray(parsed.candidates)?parsed.candidates:parsed.iceCandidates;
  if(!Array.isArray(remoteCandidates))throw Error('O Xbox retornou candidatos de rede em formato desconhecido.');
  await player.setRemoteIceCandidates(remoteCandidates);
  announce('Conexão negociada. Aguardando imagem do jogo…');
  startVideoHealth();
  keepalive=setInterval(()=>api('keepalive').catch(()=>announce('Falha ao manter a sessão Xbox ativa.')),30000);
}
let reconnectingMedia=false;
async function reconnectXboxMediaWithoutRestart(){
 if(reconnectingMedia){status('A reconexão já está em andamento.');return}
 if(!started){status('Inicie o jogo antes de reconectar a transmissão.');return}
 reconnectingMedia=true;
 const tell=(message:string)=>{status(message);const el=document.getElementById('xb-launch-status');if(el)el.textContent=message;};
 try{
  tell('Reconectando somente o vídeo do Xbox, mantendo a mesma partida…');
  clearInterval(keepalive);
  stopVideoHealth();
  const previous=player;
  player=undefined;
  try{previous?.destroy()}catch(_){}
  // The old player will emit disconnected; this is expected during an
  // explicit reconnection, and the video surface is restored on first frame.
  document.body.classList.remove('stream-playing');
  notifyParent({type:'xbridge-playing',playing:false});
  await pause(250);
  await connectExistingXboxSession(tell);
  tell('Transmissão reconectada à mesma partida. Aguardando imagem…');
 }catch(e:any){
  // An SDP renegotiation can be rejected by the Xbox service. Do not
  // automatically delete its session or refresh Microsoft credentials.
  const message='Xbox recusou reconectar esta transmissão: '+String(e?.message||'erro desconhecido').slice(0,135);
  tell(message);
  notifyParent({type:'xbridge-player-error',message});
 }finally{reconnectingMedia=false}
}
function advance(){calStep++;calWaiting=Date.now()+700;previous=null;baseAxes=[];if(calStep>=fields.length){calStep=-1;localStorage.setItem(mappingKey,JSON.stringify(map));$('calibration').textContent='Mapeamento salvo neste celular.';$('skip').hidden=true;}else $('calibration').textContent='Solte os comandos e depois acione: '+fields[calStep]+(axes.includes(fields[calStep])?' (mova para direita ou para baixo)':'');}
$('calibrate').onclick=()=>{map={};calStep=-1;advance();$('skip').hidden=false;};$('skip').onclick=advance;
function poll(){
 try{
 const pads=navigator.getGamepads?navigator.getGamepads():[];const g=Array.from(pads).find(Boolean) as Gamepad|undefined;
 if(g){$('gamepad').textContent=g.id+' · '+g.buttons.length+' botões / '+g.axes.length+' eixos';
  const key='ponte-map-'+g.id;if(mappingKey!==key){mappingKey=key;try{map=JSON.parse(localStorage.getItem(key)||'{}');}catch{map={};}if(!Object.keys(map).length&&g.mapping==='standard'){buttons.forEach((k:string,i:number)=>map[k]={kind:'button',index:i});axes.forEach((k:string,i:number)=>map[k]={kind:'axis',index:i});}}
  if(calStep>=0){
   if(Date.now()<calWaiting){baseAxes=Array.from(g.axes);previous=g.buttons.map(b=>b.value);}
   else if(previous){const k=fields[calStep];let found:any;
    if(!axes.includes(k)){g.buttons.forEach((b,i)=>{if(b.value>.55&&(previous[i]||0)<.2)found={kind:'button',index:i};});}
    if(!found)g.axes.forEach((v,i)=>{if(Math.abs(v-(baseAxes[i]||0))>.65)found={kind:'axis',index:i,direction:v<0?-1:1};});
    if(found){map[k]=found;advance();}else previous=g.buttons.map(b=>b.value);
   }
  }
  const f=calStep>=0?sanitize({}):gamepadFrame(g,map);$('inputs').textContent=Object.entries(f).filter(([k,v])=>k!=='GamepadIndex'&&v!==0).map(([k,v])=>k+': '+Number(v).toFixed(2)).join(' · ')||'Comandos soltos. Se necessário, configure o mapeamento.';
  if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<8192)ws.send(JSON.stringify({type:'frame',frame:f}));
 }else if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'frame',frame:sanitize({})}));
 }catch{status('Falha ao ler o controle. Reabra o Chrome e pressione um botão.');}
}
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.get('role')==='phone'){
 $('setup').hidden=true;$('phone').hidden=false;
 $('phoneConnect').onclick=run(async()=>{setBackend(hash.get('backend')||'');room={id:hash.get('room')};connect('phone',hash.get('key')||'');$('phoneConnect').disabled=true;setInterval(poll,20);try{await(navigator as any).wakeLock?.request('screen');}catch{};});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ws?.readyState===WebSocket.OPEN&&hash.get('role')==='phone')ws.send(JSON.stringify({type:'frame',frame:sanitize({})}));});

// D-pad navigation for the TV remote, preserving selects and editable fields.
document.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;const items=Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea')).filter(el=>el.offsetParent!==null);if(!items.length)return;const i=items.indexOf(document.activeElement as HTMLElement);const step=e.key==='ArrowDown'||e.key==='ArrowRight'?1:-1;items[(i+step+items.length)%items.length].focus();e.preventDefault();});


// The existing xBridge owns pairing and forwards its live packets to this player.
// Account tokens and the TV session key stay inside this frame/server.
if (embedded) {
 document.body.classList.add('xbridge-embedded');
 $('setup').hidden=true; $('tv').hidden=false;
 const handlers:any={};
 ['play','sound','fullscreen','stop'].forEach(id=>handlers[id]=$(id).onclick);
 const dashboard=mountEmbeddedDashboard({api,QRCode,status,notifyParent,handlers});
 const inputEdges=new MenuInputEdges();
 function handleConsoleController(actions:string[]){
  if(document.body.classList.contains('stream-playing'))return;
  const panel=$('xb-settings-panel');
  const scope=panel&&!panel.hidden?panel:
   !$('xb-auth').hidden?$('xb-auth'):$('xb-library');
  const visible=(selector:string)=>Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(el=>!el.hidden&&!el.hasAttribute('disabled')&&el.getClientRects().length>0
      &&getComputedStyle(el).visibility!=='hidden'
      &&!el.closest('[hidden]'));
  for(const action of actions){
   if(action==='menu'){
    $('xb-settings-toggle')?.click();
    ($('xb-settings-panel').hidden?$('xb-settings-toggle'):$('xb-settings-close'))?.focus();
    continue;
   }
   if(action==='back'){
    if(panel&&!panel.hidden){$('xb-settings-close').click();$('xb-settings-toggle').focus();}
    else if(!$('xb-library').hidden){$('xb-nav-home')?.focus();$('xb-nav-home')?.click();}
    continue;
   }
   const candidates=visible('button, a[href], input[type="search"], input:not([type]), [role="button"]')
      .filter(el=>scope.contains(el)||(!panel||panel.hidden)&&el.closest('.xb-app-top'));
   const current=document.activeElement as HTMLElement;
   if(action==='confirm'){
    if(current&&candidates.includes(current)){ if(current.tagName==='INPUT'){current.focus()}else current.click();}
    else if(candidates.length){candidates[0].focus();}
   }else if(['up','down','left','right'].includes(action)){
    const next=selectMenuTarget(candidates,current,action);
    if(next){next.focus();if(typeof next.scrollIntoView==='function')next.scrollIntoView({block:'nearest',inline:'nearest'});}
   }
  }
 }

 window.addEventListener('message',event=>{
  if(!acceptsParent(event,window.parent))return;
  if(event.data?.type==='xbridge-input'){
   frame=compactFrame(event.data.packet);lastFrame=Date.now();
   if(started)trackMeaningfulGamepadInput(frame);
   inputDebug.androidFrames++;
   inputDebug.lastAndroidAt=lastFrame;
   const currentA=Number(frame.A)>.55;
   if(currentA&&!previousA){inputDebug.aPresses++;inputDebug.lastAAt=lastFrame;}
   previousA=currentA;
   // In catalog mode the Android D-pad, left stick and A/B/Menu operate UI.
   // In play mode every original frame remains dedicated to Xbox input.
   if(!document.body.classList.contains('stream-playing'))handleConsoleController(inputEdges.sample(frame));
   else inputEdges.release();
   $('remote').textContent='Controle do celular recebendo comandos';
  } else if(event.data?.type==='xbridge-release'){
   frame=sanitize({});lastFrame=0;inputEdges.release();$('remote').textContent='Aguardando comandos do celular';
  } else if(event.data?.type==='xbridge-game-menu') {
   notifyParent({type:'xbridge-game-session',active:false});
   // Return to catalog WITHOUT losing the Xbox account cookie.
   // Await reset before enabling another title; avoids concurrent Xbox sessions.
   void (async()=>{
    document.body.classList.remove('stream-playing');
    notifyParent({type:'xbridge-playing',playing:false});
    clearInterval(keepalive);stopVideoHealth();
    try{player?.destroy();player=undefined;}catch(_){}
    $('play').disabled=true;
    status('Encerrando partida atual no Xbox…');
    try{await api('reset')}catch(_){status('Não foi possível encerrar a partida no Xbox.')}
    started=false;
    $('play').disabled=false;
    status('Pronto para escolher outro jogo. Conta Xbox mantida.');
   })();
  } else if(event.data?.type==='xbridge-overlay-state'){
   gameOverlayOpen=event.data.open===true;
   if(!gameOverlayOpen && queuedMetroIntroRecovery){
    // The browser may spend its first eligible post-ad moment inside the
    // settings overlay. Trigger the queued, evidence-backed recovery quickly
    // after closing, without forcing another 6.5 s stats cycle.
    setTimeout(()=>{
     const age=nativePlaneFirstVideoAt?Date.now()-nativePlaneFirstVideoAt:Infinity;
     if(gameOverlayOpen || activeFreezeMarker || !queuedMetroIntroRecovery || !started ||
        metroRecoveryAttempts!==0 || videoRecoveryInFlight ||
        age<90000 || age>300000)return;
     const media=player?.getVideoElement?.() as HTMLVideoElement|undefined;
     if(!media?.srcObject || media.readyState<2)return;
     queuedMetroIntroRecovery=false;
     metroRecoveryAttempts++;
     metroLastRecoveryAt=Date.now();
     status('Metro Exodus: recuperação pendente liberada após fechar o painel.');
     void recoverXboxVideoLocally('automatic','metro-intro-a-freeze');
    },650);
   }
  } else if(event.data?.type==='xbridge-reannounce-gamepad'){
   // Reannounce the existing virtual controller without detaching it.
   // Deliberately never fake A/Start/Menu input to advance a game.
   const control=player?._channels?.control;
   const handler=control?.getGamepadHandlers?.()?.[0];
   if(handler && control?._dataChannel?.readyState==='open' && control.reannounceStableGamepad?.()){
    status('Controle reapresentado ao Xbox. Aperte A no celular para testar.');
   }else{
    status('Controle ainda não pronto. Confira o estado do canal nas configurações.');
   }
  } else if(event.data?.type==='xbridge-reconnect-media'){
   // Explicit user action: preserve Xbox account and game session, only
   // renegotiate WebRTC offer/ICE to emulate returning to the same game.
   void reconnectXboxMediaWithoutRestart();
  } else if(event.data?.type==='xbridge-mark-frozen'){
   // Pure observation: no media rebind, controller packet or keyframe request.
   void markVisibleFreeze();
  } else if(event.data?.type==='xbridge-recover-video'){
   void recoverManuallyWithEvidence();
  } else if(event.data?.type==='xbridge-resume-media'){
   // A user gesture in the TV settings may unlock media on VIDAA.
   void (async()=>{
    let resumed=false;
    const mediaElements=[...document.querySelectorAll('video,audio'),player?.getVideoElement?.(),player?.getAudioElement?.()]
     .filter(Boolean) as HTMLMediaElement[];
    for(const element of new Set(mediaElements)){
     try{await element.play();resumed=true}catch(_){}
    }
    status(resumed?'Reprodução solicitada.':'O navegador bloqueou a reprodução. Tente iniciar o vídeo pelo controle da TV.');
   })();
  }
 });
 document.addEventListener('playing',event=>{
  if(event.target instanceof HTMLVideoElement){document.body.classList.add('stream-playing');notifyParent({type:'xbridge-playing',playing:true});}
 },true);
 setInterval(()=>{if(lastFrame && Date.now()-lastFrame>400){frame=sanitize({});lastFrame=0;$('remote').textContent='Aguardando comandos do celular';}},200);
 const prepare=run(async()=>{
  status('Procurando sessão Xbox persistente…');
  setBackend(location.origin+(location.pathname.startsWith('/player')?'/player':''));
  // Only missing/revoked cookies justify prompting Microsoft immediately.
  // Transient failures are retried; saved MongoDB data is never cleared.
  let needsLogin=false;
  for(let attempt=0;attempt<5;attempt++){
   try{
    const previous=await api('resume');
    if(previous.ok&&previous.id&&previous.tvKey){
     room={id:previous.id,tvKey:previous.tvKey};
     dashboard.ready();
     status('Sessão Xbox restaurada automaticamente. Carregando biblioteca…');
     notifyParent({type:'xbridge-ready'});
     await dashboard.restored();
     return;
    }
   }catch(error:any){
    if(error?.status===401 && ['cookie_missing','session_not_found','authorization_rejected'].includes(error?.reason)){
     needsLogin=true;break;
    }
    if(error?.status===429){
     // Respect Xbox/Render rate limits: don't burn four more resume
     // attempts and then allocate another room immediately.
     $('xb-resume-retry').hidden=false;
     dashboard.error('Limite temporário HTTP 429. Sua conta Xbox continua salva. Aguarde um minuto e selecione Restaurar sessão.');
     status('O serviço limitou novas tentativas. Sua conta Xbox permanece salva.');
     return;
    }
   }
   if(attempt<4){
    const delay=[1200,2200,3500,5500][attempt];
    status('Mantendo a sessão Xbox: reconectando ao servidor ('+(attempt+2)+'/5)…');
    await new Promise(resolve=>setTimeout(resolve,delay));
   }
  }
  try{room=await api('create');}
  catch(error:any){
   if(error?.status===429){
    $('xb-resume-retry').hidden=false;
    dashboard.error('O servidor atingiu um limite temporário (HTTP 429). Aguarde cerca de um minuto e selecione Restaurar sessão.');
    status('Limite temporário de salas. Não é necessário autorizar a Microsoft novamente.');
    return;
   }
   throw error;
  }
  dashboard.ready();
  notifyParent({type:'xbridge-ready'});
  if(needsLogin){
   $('xb-resume-retry').hidden=true;
   status('Este navegador não apresentou uma sessão Xbox válida. Autorize sua conta para vinculá-lo.');
   $('xb-login-feedback').textContent='Não foi encontrado um cookie de sessão válido. Após autenticar, o xBridge salvará a conta.';
  }else{
   $('xb-resume-retry').hidden=false;
   $('login').textContent='Autorizar novamente (somente se necessário)';
   status('Não foi possível consultar a sessão Xbox. Sua autorização não foi apagada.');
   $('xb-login-feedback').textContent='Falha temporária do servidor Xbox ou MongoDB. Sua autorização não foi apagada. Tente Restaurar sessão salva novamente antes de fazer outro login Microsoft.';
  }
 });
 void prepare();
}


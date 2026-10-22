// A conservative on-device video watchdog. No screenshot, captured pixel data,
// account data or button sequence is transmitted or persisted.
//
// It is impossible for webpage APIs to guarantee that VIDAA's *native* video
// overlay paints what the decoder/compositor reports. Never guess from time
// alone: require a sustained unchanged visual sample AND advancing video data.
const WIDTH=32, HEIGHT=18;

export function sampleVideoLuma(video, canvas) {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  try {
    canvas.width=WIDTH;
    canvas.height=HEIGHT;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if (!ctx) return null;
    ctx.drawImage(video,0,0,WIDTH,HEIGHT);
    const data=ctx.getImageData(0,0,WIDTH,HEIGHT).data;
    const values=new Uint8Array(WIDTH*HEIGHT);
    let min=255,max=0;
    for(let i=0,j=0;i<data.length;i+=4,j++){
      const luma=(data[i]*3+data[i+1]*6+data[i+2])/10;
      const bucket=Math.min(31,Math.floor(luma/8));
      values[j]=bucket;
      if(bucket<min)min=bucket;
      if(bucket>max)max=bucket;
    }
    // Black or solid-color canvas may be a protected/native video plane. It
    // cannot prove that a remote frame is visually frozen.
    if(max-min<3)return null;
    return values;
  }catch { return null; } // Unsupported VIDAA canvas/readback/DRM; use stats.
}

export function differsVisibly(before,after){
  if(!(before instanceof Uint8Array)||!(after instanceof Uint8Array)||before.length!==after.length)return false;
  let count=0,total=0;
  for(let i=0;i<before.length;i++){
    const delta=Math.abs(before[i]-after[i]);
    total+=delta;
    if(delta>=3)count++;
  }
  return count>=Math.ceil(before.length*0.06)||total/before.length>=1.0;
}

export class VideoFreezeWatchdog {
  constructor(){this.reset();}
  reset(){
    this.startAt=0;
    this.previous=null;
    this.lastVisualMovementAt=0;
    this.decodedAtLastMovement=0;
    this.presentedAtLastMovement=0;
    this.samples=0;
    this.visibleChanges=0;
  }
  observe({now,signature,decoded=0,presented=null,received=0,
           recentInput=false,connection='connected',videoReadyState=0}){
    if(!this.startAt)this.startAt=now;
    const connected=connection==='connected'||connection==='completed';
    if(!connected||videoReadyState<2){
      this.previous=null;
      this.lastVisualMovementAt=now;
      this.decodedAtLastMovement=decoded;
      this.presentedAtLastMovement=presented;
      return {status:'not-ready',frozen:false,ageMs:0};
    }
    if(!(signature instanceof Uint8Array)){
      return {status:'visual-unavailable',frozen:false,ageMs:0};
    }
    this.samples++;
    if(this.previous===null || differsVisibly(this.previous,signature)){
      if(this.previous!==null)this.visibleChanges++;
      this.previous=signature.slice();
      this.lastVisualMovementAt=now;
      this.decodedAtLastMovement=decoded;
      this.presentedAtLastMovement=presented;
      return {status:'moving',frozen:false,ageMs:0};
    }
    const age=now-this.lastVisualMovementAt;
    const runtime=now-this.startAt;
    // At least six valid samples, no motion for a substantial time and
    // actual decoded WebRTC progress since the displayed image last changed.
    const remoteFramesAdvanced=decoded-this.decodedAtLastMovement>=30;
    const presentedFramesAdvanced=presented===null || this.presentedAtLastMovement===null ||
      presented-this.presentedAtLastMovement>=15;
    const threshold=recentInput?36000:65000;
    const warmup=recentInput?55000:90000;
    const frozen=this.samples>=6 && age>=threshold && runtime>=warmup &&
      remoteFramesAdvanced && presentedFramesAdvanced && received>0;
    return {status:frozen?'suspected-visual-freeze':'unchanged',
            frozen,ageMs:age,changes:this.visibleChanges};
  }
}

export function canAutoRecoverStream({now,attempts=0,lastAttemptAt=0,visualFrozen=false,
                                     signalFrozen=false,hasVideo=false,connection='connected'}){
  if(!hasVideo || (connection!=='connected'&&connection!=='completed'))return false;
  if(!visualFrozen && !signalFrozen)return false;
  if(attempts>=3)return false;
  // Do not flash the video every few seconds on a persistent frozen ad/menu.
  if(attempts>0 && now-lastAttemptAt<90000)return false;
  return true;
}

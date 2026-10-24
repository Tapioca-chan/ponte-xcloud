// Evidence-only guard for VIDAA receiver presentation stalls. It never
// reads pixels and never treats RTP freezeCount alone as proof that the
// physical screen is frozen. Missing renderer metrics => no auto-rescue.
const count=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export class PresentationStallWatch {
  constructor(){this.reset()}
  reset(){
    this.previous=null;
    this.evidence=0;
    this.lastRescueAt=0;
  }
  observe({now,decoded,rendered,received,ready=false,paused=false,overlay=false,active=true}){
    const noEvidence={confirmed:false,reason:'insufficient-presentation-evidence',decodedDelta:null,renderedDelta:null};
    const current={now,decoded:count(decoded),rendered:count(rendered),received:count(received)};
    if(!active||!ready||paused||overlay||
       current.decoded===null||current.rendered===null||current.received===null){
      this.previous=null;
      this.evidence=0;
      return {...noEvidence,reason:'not-observable'};
    }
    const prev=this.previous;
    this.previous=current;
    if(!prev||now<=prev.now||now-prev.now>20000||
       current.decoded<prev.decoded||current.rendered<prev.rendered||current.received<prev.received){
      this.evidence=0;
      return {...noEvidence,reason:'baseline'};
    }
    const decodedDelta=current.decoded-prev.decoded;
    const renderedDelta=current.rendered-prev.rendered;
    const receivedDelta=current.received-prev.received;
    // Decoded frames are only render candidates; rendered frames are counted
    // after video frame presentation. Two independent observation intervals
    // with advancing RTP/decode but ZERO render progress confirm a stall in
    // the browser's rendering pipeline (not necessarily the physical panel).
    if(decodedDelta>=6&&receivedDelta>0&&renderedDelta===0){
      this.evidence++;
    }else{
      this.evidence=0;
    }
    const confirmed=this.evidence>=2 && now-this.lastRescueAt>=60000;
    return {
      confirmed,
      reason:confirmed?'decoded-not-rendered':this.evidence?'corroborating':'renderer-advancing',
      decodedDelta,renderedDelta,receivedDelta,evidence:this.evidence
    };
  }
  acknowledge(now){
    this.lastRescueAt=now;
    this.previous=null;
    this.evidence=0;
  }
}

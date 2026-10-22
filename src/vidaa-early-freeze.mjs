// Early, separate WebRTC freeze increments observed in the free xCloud
// launch phase. This is only evidence of decoder stutter, NOT a visual freeze.
// Pair with Metro-only VIDAA native-plane limitations for bounded recovery.
export class EarlyFreezeRiseWatch {
 constructor(){this.reset();}
 reset(){this.lastCount=null;this.rises=[];}
 observe({now,freezeCount}){
  if(!Number.isFinite(now)||!Number.isFinite(freezeCount)||freezeCount<0){
   this.reset();return 0;
  }
  const count=Math.floor(freezeCount);
  if(this.lastCount!==null && count<this.lastCount){
   this.lastCount=count;this.rises=[];return 0;
  }
  if(this.lastCount!==null && count>this.lastCount){
   this.rises.push(now);
  }
  this.lastCount=count;
  this.rises=this.rises.filter(at=>now-at>=0 && now-at<=100000);
  return this.rises.length;
 }
}

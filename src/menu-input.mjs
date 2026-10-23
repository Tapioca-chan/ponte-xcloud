// Console navigation using xBridge's existing Android compact gamepad stream.
// No synthetic Xbox input is emitted while navigating the web catalog.
export const NAV_BUTTONS = {
  A:0, B:1, DPadUp:12, DPadDown:13, DPadLeft:14, DPadRight:15, Menu:9
};
export class MenuInputEdges {
  constructor(){this.previous={};this.lastDirection='';this.lastMoved=0;}
  sample(frame, now=Date.now()){
    const current=frame||{};
    const pressed=name=>(Number(current[name])||0)>.55;
    const result=[];
    const leftY=Number(current.LeftThumbYAxis)||0;
    const leftX=Number(current.LeftThumbXAxis)||0;
    const rightY=Number(current.RightThumbYAxis)||0;
    const rightX=Number(current.RightThumbXAxis)||0;
    const direction=pressed('DPadUp')||leftY<-.58?'up'
      :pressed('DPadDown')||leftY>.58?'down'
      :pressed('DPadLeft')||leftX<-.58?'left'
      :pressed('DPadRight')||leftX>.58?'right'
      :rightY<-.82?'up':rightY>.82?'down'
      :rightX<-.82?'left':rightX>.82?'right':'';
    if(direction && (direction!==this.lastDirection||now-this.lastMoved>160)){
      result.push(direction);this.lastMoved=now;
    }
    this.lastDirection=direction;
    for(const [name,action] of [
      ['A','confirm'],['B','back'],['Menu','menu'],['Nexus','menu'],
      ['View','back'],['X','library'],['Y','favorites'],
      ['LeftShoulder','previousTab'],['RightShoulder','nextTab'],
      ['LeftTrigger','recent'],['RightTrigger','library'],
      ['LeftThumb','fullscreen'],['RightThumb','settings']
    ]){
      const on=pressed(name);
      if(on&&!this.previous[name])result.push(action);
      this.previous[name]=on;
    }
    return result;
  }
  release(){this.previous={};this.lastDirection='';this.lastMoved=0;}
}
export function selectMenuTarget(items, current, direction) {
  if(!Array.isArray(items)||!items.length)return null;
  const idx=items.indexOf(current);
  if(idx<0)return items[0];
  const source=items[idx].getBoundingClientRect();
  const cx=source.left+source.width/2,cy=source.top+source.height/2;
  let best=null,bestScore=Infinity;
  for(let j=0;j<items.length;j++){
    if(j===idx)continue;
    const r=items[j].getBoundingClientRect();
    const dx=r.left+r.width/2-cx, dy=r.top+r.height/2-cy;
    const major=direction==='left'?-dx:direction==='right'?dx:direction==='up'?-dy:dy;
    if(major<=3)continue;
    const minor=(direction==='left'||direction==='right')?Math.abs(dy):Math.abs(dx);
    // Prefer a close item in the intended row/column, not a far-away control.
    const score=major+minor*2.5;
    if(score<bestScore){bestScore=score;best=items[j];}
  }
  return best||items[(idx+(direction==='right'||direction==='down'?1:items.length-1))%items.length];
}

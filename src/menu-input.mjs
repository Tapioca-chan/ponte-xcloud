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
    const direction=pressed('DPadUp')||leftY<-.72?'up'
      :pressed('DPadDown')||leftY>.72?'down'
      :pressed('DPadLeft')||leftX<-.72?'left'
      :pressed('DPadRight')||leftX>.72?'right':'';
    if(direction && (direction!==this.lastDirection||now-this.lastMoved>270)){
      result.push(direction);this.lastMoved=now;
    }
    this.lastDirection=direction;
    for(const [name,action] of [['A','confirm'],['B','back'],['Menu','menu']]){
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

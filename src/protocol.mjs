export const buttons=['A','B','X','Y','LeftShoulder','RightShoulder','LeftTrigger','RightTrigger','View','Menu','LeftThumb','RightThumb','DPadUp','DPadDown','DPadLeft','DPadRight','Nexus'];
export const axes=['LeftThumbXAxis','LeftThumbYAxis','RightThumbXAxis','RightThumbYAxis'];
export function sanitize(frame){
 const out={GamepadIndex:0};
 for(const k of [...buttons,...axes]){const v=frame?.[k];if(typeof v!=='number'||!Number.isFinite(v))out[k]=0;else out[k]=Math.max(axes.includes(k)?-1:0,Math.min(1,v));}
 return out;
}
export function gamepadFrame(g,map){
 const raw={}; for(const k of [...buttons,...axes]){const m=map[k];if(!m)continue;let v=m.kind==='button'?(g.buttons[m.index]?.value||0):(g.axes[m.index]||0);if(m.kind==='axis'&&!axes.includes(k))v=m.direction===-1?Math.max(0,-v):Math.max(0,v); if(axes.includes(k)&&Math.abs(v)<0.09)v=0;raw[k]=v;}
 return sanitize(raw);
}

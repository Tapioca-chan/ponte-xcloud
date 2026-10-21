import {buttons,axes,sanitize} from './protocol.mjs';
export function compactFrame(packet) {
 if(!packet || !Array.isArray(packet.a) || !Array.isArray(packet.t) || !Number.isInteger(packet.b)) return sanitize({});
 const frame={};
 buttons.forEach((key,i)=>{frame[key]=(packet.b & (1<<i)) ? 1 : 0;});
 frame.LeftTrigger=Number(packet.t[0])/255;
 frame.RightTrigger=Number(packet.t[1])/255;
 axes.forEach((key,i)=>{frame[key]=Number(packet.a[i])/127;});
 return sanitize(frame);
}
export function acceptsParent(event,parentWindow) {
 return event.origin==='https://xcloud-tv.onrender.com' && event.source===parentWindow;
}

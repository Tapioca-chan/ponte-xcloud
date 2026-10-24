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
// The embedded Xbox player is reverse-proxied under the TV site's /player/
// path, so TV host and player MUST share the exact origin. The old fixed
// xcloud-tv.onrender.com origin caused every new-domain parent postMessage
// (manual recovery, host migration, controller bridge) to be silently dropped.
// Never accept wildcard '*' or messages from an unrelated frame.
export function acceptsParent(event,parentWindow,playerOrigin) {
 return typeof playerOrigin==='string' &&
   playerOrigin.startsWith('https://') &&
   event.origin===playerOrigin &&
   event.source===parentWindow;
}

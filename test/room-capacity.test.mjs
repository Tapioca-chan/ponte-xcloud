import test from 'node:test';
import assert from 'node:assert/strict';
import {reclaimIdleRooms} from '../src/room-capacity.mjs';
const now=1000*60*70;
function room(age,{playing=false,connected=false,busy=false,device=false}={}){
 const r={created:now-age,touched:now-age,busy,session:playing?{sessionPath:'live'}:null,
   sockets:new Map(),device:device?{user_code:'pending'}:null};
 if(connected)r.sockets.set('tv',{readyState:1});
 return r;
}
test('reclaim stale rooms after repeated page reloads rather than HTTP 429',()=>{
 const rooms=new Map();
 for(let i=0;i<20;i++)rooms.set('stale-'+i,room(8*60*1000));
 const released=reclaimIdleRooms(rooms,now,20);
 assert.ok(released>=1);
 assert.ok(rooms.size<20);
});
test('preserve active Xbox games and connected Android/TV sessions',()=>{
 const rooms=new Map([
  ['game',room(3600000,{playing:true})],
  ['paired',room(3600000,{connected:true})],
  ['busy',room(3600000,{busy:true})],
  ['stale',room(1200000)]
 ]);
 assert.equal(reclaimIdleRooms(rooms,now,4),1);
 assert.equal(rooms.has('game'),true);
 assert.equal(rooms.has('paired'),true);
 assert.equal(rooms.has('busy'),true);
});
test('do not evict valid device-code linking or actively used rooms',()=>{
 const rooms=new Map();
 rooms.set('login',room(7*60*1000,{device:true}));
 rooms.set('recent',room(20000));
 for(let i=0;i<18;i++)rooms.set('live'+i,room(3600000,{connected:true}));
 assert.equal(reclaimIdleRooms(rooms,now,20),0);
 assert.equal(rooms.size,20);
});
test('reclaim expired device-code room after 20 min when server is full',()=>{
 const rooms=new Map();
 rooms.set('expired',room(25*60*1000,{device:true}));
 for(let i=0;i<19;i++)rooms.set('live'+i,room(500000,{connected:true}));
 assert.equal(reclaimIdleRooms(rooms,now,20),1);
});
test('remove old abandoned rooms periodically below capacity',()=>{
 const rooms=new Map([['old',room(15*60*1000)],['young',room(20000)]]);
 assert.equal(reclaimIdleRooms(rooms,now,20),1);
 assert.equal(rooms.has('young'),true);
});

test('reclaim a four-hour disconnected orphaned Xbox stream without touching live games',()=>{
 const rooms=new Map();
 rooms.set('orphan',room(5*60*60*1000,{playing:true}));
 rooms.set('live',room(6*60*60*1000,{playing:true,connected:true}));
 for(let i=0;i<18;i++)rooms.set('room'+i,room(12000,{connected:true}));
 assert.equal(reclaimIdleRooms(rooms,now,20),1);
 assert.equal(rooms.has('orphan'),false);
 assert.equal(rooms.has('live'),true);
});
test('keep a disconnected game for under four hours to protect a reconnection',()=>{
 const rooms=new Map();
 rooms.set('resume-window',room(3*60*60*1000,{playing:true}));
 for(let i=0;i<19;i++)rooms.set('live'+i,room(900000,{connected:true}));
 assert.equal(reclaimIdleRooms(rooms,now,20),0);
 assert.equal(rooms.has('resume-window'),true);
});

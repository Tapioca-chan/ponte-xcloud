// Reclaim only abandoned in-memory player rooms. An active WebSocket,
// running Xbox game, busy request, or Microsoft device-code authorization
// must not be evicted when a TV browser reloads repeatedly.
export function reclaimIdleRooms(rooms, now=Date.now(), maxRooms=20){
 const max=Math.max(1,Math.floor(maxRooms));
 const candidate=[];
 for(const [id,room] of rooms){
  const last=Number.isFinite(room?.touched)?room.touched:room?.created;
  const age=Number.isFinite(last)?Math.max(0,now-last):0;
  const live=room?.sockets instanceof Map &&
    [...room.sockets.values()].some(socket=>socket?.readyState===1);
  if(live)continue;
  // A disconnected player room may retain its old Xbox session object after
  // a TV crash. Keeping it FOREVER eventually fills the 20-room limit and
  // returns 429 even though no device is connected. Do not touch connected
  // rooms; only reclaim orphaned sessions after at least FOUR hours idle.
  if(room?.session&&age<4*60*60*1000)continue;
  if(room?.busy&&age<2*60*60*1000)continue;
  // A pending device-link login may take the full Microsoft verification
  // window; never evict an otherwise idle authorization too early.
  if(room?.device && age<20*60*1000)continue;
  const inactivityThreshold=rooms.size>=max?45*1000:12*60*1000;
  if(age>=inactivityThreshold)candidate.push({id,age});
 }
 candidate.sort((a,b)=>b.age-a.age);
 let deleted=0;
 for(const {id} of candidate){
  if(rooms.size<max && deleted>0)break;
  if(rooms.delete(id))deleted++;
 }
 return deleted;
}

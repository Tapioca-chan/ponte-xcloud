import test from 'node:test';
import assert from 'node:assert/strict';
import {VideaAutoHostMigration} from '../src/vidaa-auto-host-migration.mjs';
const baseline={ready:true,active:true,recentInput:true,enabled:true};
const poll=(w,now,d,f,options={})=>w.observe({...baseline,now,decoded:d,received:d*2,freezeCount:f,...options});

test('repeated physical-freeze risk after keyframe leads to ONE fallback surface-host migration',()=>{
 const w=new VideaAutoHostMigration();
 assert.equal(poll(w,100000,100,2).action,'none');
 w.noteKeyframe(103000);
 assert.equal(poll(w,109000,500,2).action,'none');
 assert.equal(poll(w,115000,900,3).action,'none');
 const r=poll(w,121000,1300,4);
 assert.equal(r.action,'migrate');assert.equal(r.reason,'post-keyframe-recurrent-freezes');
 w.acknowledgeAttempt(121000);
 assert.equal(poll(w,128000,1900,7).action,'none');
 w.noteKeyframe(300000);
 assert.equal(poll(w,315000,2500,8).action,'none');
 assert.equal(w.attempts,1);
});
test('no intervention when disabled, or only a single freezeCount increase',()=>{
 const w=new VideaAutoHostMigration();
 w.noteKeyframe(100000);
 assert.equal(poll(w,104000,200,0,{enabled:false}).action,'none');
 poll(w,116000,400,0);
 assert.equal(poll(w,122000,800,7).action,'none');
 assert.equal(poll(w,128000,1000,7).action,'none');
});
test('no intervention if stream is static, paused, user inactive or overlay open',()=>{
 const w=new VideaAutoHostMigration();
 w.noteKeyframe(100000);
 poll(w,104000,100,0);
 assert.equal(poll(w,116000,100,1).action,'none');
 assert.equal(poll(w,122000,400,2,{overlay:true}).action,'none');
 assert.equal(poll(w,128000,800,3,{recentInput:false}).action,'none');
 assert.equal(poll(w,134000,1000,4,{paused:true}).action,'none');
 assert.equal(poll(w,140000,1500,5,{busy:true}).action,'none');
});
test('a short freeze burst before the keyframe never triggers migration',()=>{
 const w=new VideaAutoHostMigration();
 poll(w,100000,100,0);
 poll(w,106000,500,2);
 w.noteKeyframe(112000);
 assert.equal(poll(w,118000,1000,2).action,'none');
 assert.equal(poll(w,124000,1500,2).action,'none');
});
test('when a repeated keyframe is sent too soon evidence is not reset',()=>{
 const w=new VideaAutoHostMigration();
 poll(w,100000,100,0);
 w.noteKeyframe(103000);
 poll(w,109000,500,0);
 poll(w,115000,900,1);
 w.noteKeyframe(117000);
 assert.equal(poll(w,121000,1300,2).action,'migrate');
});
test('stale getStats samples and decoder counter resets do not trigger',()=>{
 const w=new VideaAutoHostMigration();
 w.noteKeyframe(100000);
 poll(w,104000,100,0);
 poll(w,118000,500,1);
 assert.equal(poll(w,145000,900,2).action,'none');
 assert.equal(poll(w,151000,100,1).action,'none');
});


test('two independent freezes before keyframe authorize one fallback despite no NEW post-keyframe freeze rise',()=>{
 const w=new VideaAutoHostMigration();
 poll(w,100000,100,0);
 assert.equal(poll(w,106000,500,1).action,'none');
 const pre=poll(w,112000,900,2);
 assert.equal(pre.action,'keyframe');
 w.noteKeyframe(112000);
 assert.equal(poll(w,118000,1300,2).action,'none');
 assert.equal(poll(w,124000,1700,2).action,'none');
 const attempt=poll(w,130000,2100,2);
 assert.equal(attempt.action,'migrate');
 assert.equal(attempt.reason,'pre-keyframe-recurrent-freezes');
 w.acknowledgeAttempt(130000);
 assert.equal(poll(w,136000,2500,5).action,'none');
});

test('old pre-keyframe events cannot produce a migration when no fresh repeats exist',()=>{
 const w=new VideaAutoHostMigration();
 poll(w,100000,100,0);
 poll(w,106000,500,1);
 // Independent freeze reports are separated by more than the 35s window.
 assert.equal(poll(w,150000,1000,2).action,'none');
 assert.equal(poll(w,156000,1400,3).action,'none');
 const next=poll(w,162000,1800,4);
 assert.equal(next.action,'keyframe');
 w.noteKeyframe(162000);
 // A paused decoder cannot satisfy the post-keyframe progress guard.
 poll(w,168000,1800,4);
 poll(w,174000,1800,4);
 assert.equal(poll(w,180000,1800,4).action,'none');
});

test('surface failover still requires opt-in and live controller input',()=>{
 const w=new VideaAutoHostMigration();
 poll(w,100000,100,0);
 poll(w,106000,500,1,{enabled:false});
 assert.equal(poll(w,112000,900,2,{enabled:false}).action,'none');
 assert.equal(poll(w,118000,1300,3,{recentInput:false}).action,'none');
 assert.equal(w.keyframeAt,0);
});

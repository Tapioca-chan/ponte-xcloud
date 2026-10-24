import test from 'node:test';
import assert from 'node:assert/strict';
import {PresentationStallWatch} from '../src/presentation-stall-watch.mjs';

test('detects only repeated decoded-but-not-rendered intervals with active RTP',()=>{
 const w=new PresentationStallWatch();
 const base={ready:true,active:true,paused:false,overlay:false};
 assert.equal(w.observe({...base,now:100000,decoded:100,rendered:100,received:300}).confirmed,false);
 assert.equal(w.observe({...base,now:104000,decoded:250,rendered:100,received:800}).confirmed,false);
 const result=w.observe({...base,now:108000,decoded:400,rendered:100,received:1200});
 assert.equal(result.confirmed,true);
 assert.equal(result.reason,'decoded-not-rendered');
});
test('never automatically repairs when VIDAA exposes only decoder counters',()=>{
 const w=new PresentationStallWatch();
 for(let i=0;i<10;i++){
  assert.equal(w.observe({now:100000+i*4000,decoded:100+i*140,rendered:null,received:300+i*600,ready:true}).confirmed,false);
 }
});
test('a single rendered frame increase clears false positives and consecutive evidence',()=>{
 const w=new PresentationStallWatch();const base={ready:true};
 w.observe({...base,now:100000,decoded:100,rendered:100,received:100});
 w.observe({...base,now:104000,decoded:200,rendered:100,received:500});
 assert.equal(w.observe({...base,now:108000,decoded:300,rendered:105,received:900}).confirmed,false);
 assert.equal(w.observe({...base,now:112000,decoded:400,rendered:105,received:1100}).confirmed,false);
});
test('overlay, pause or network loss cannot trigger a false compositor repair',()=>{
 const w=new PresentationStallWatch(),b={ready:true};
 w.observe({...b,now:100000,decoded:100,rendered:100,received:100});
 assert.equal(w.observe({...b,now:104000,decoded:220,rendered:100,received:100}).confirmed,false);
 assert.equal(w.observe({...b,now:108000,decoded:260,rendered:100,received:200,overlay:true}).confirmed,false);
 assert.equal(w.observe({...b,now:112000,decoded:320,rendered:100,received:320,paused:true}).confirmed,false);
});
test('after native surface refresh a 60s cooldown prevents endless black flashes',()=>{
 const w=new PresentationStallWatch(),b={ready:true};
 w.observe({...b,now:100000,decoded:100,rendered:100,received:100});
 w.observe({...b,now:104000,decoded:250,rendered:100,received:200});
 assert.equal(w.observe({...b,now:108000,decoded:350,rendered:100,received:300}).confirmed,true);
 w.acknowledge(108000);
 w.observe({...b,now:112000,decoded:500,rendered:100,received:400});
 assert.equal(w.observe({...b,now:116000,decoded:600,rendered:100,received:500}).confirmed,false);
 assert.equal(w.observe({...b,now:120000,decoded:700,rendered:100,received:600}).confirmed,false);
 assert.equal(w.observe({...b,now:172000,decoded:800,rendered:100,received:700}).confirmed,false);
 assert.equal(w.observe({...b,now:176000,decoded:900,rendered:100,received:800}).confirmed,false);
 assert.equal(w.observe({...b,now:180000,decoded:1000,rendered:100,received:900}).confirmed,true);
});

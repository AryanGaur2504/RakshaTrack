import test from 'node:test';
import assert from 'node:assert/strict';
import {LocationSession,locationBlocker,locationHelp,GPS_POLL_MS,GPS_STALE_MS} from '../src/lib/geolocation.ts';
import {journeyStartPoint} from '../src/lib/location.ts';
import {detectConcern,initialState} from '../src/lib/safety.ts';
import {parsePlaces,searchUrl,searchPlaces} from '../src/lib/search.ts';

function harness(){
  const watches=[],requests=[],cleared=[],positions=[],errors=[];
  let timestamp=1_000_000, nextId=0;
  const timers=new Map();
  const clock={now:()=>timestamp,setInterval(fn,period){const id=++nextId;timers.set(id,{fn,period,next:timestamp+period});return id;},clearInterval(id){timers.delete(id);}};
  const geo={watchPosition(success,error,options){watches.push({success,error,options});return watches.length;},getCurrentPosition(success,error,options){requests.push({success,error,options});},clearWatch(id){cleared.push(id);}};
  const session=new LocationSession(geo,p=>positions.push(p),e=>errors.push(e),clock);
  function advance(delta){const stop=timestamp+delta;while(true){const due=[...timers.values()].filter(t=>t.next<=stop).sort((a,b)=>a.next-b.next)[0];if(!due)break;timestamp=due.next;due.next+=due.period;due.fn();}timestamp=stop;}
  const fix=(time=timestamp)=>({timestamp:time,coords:{latitude:28.61,longitude:77.21,accuracy:10,speed:0}});
  return {session,watches,requests,cleared,positions,errors,advance,fix,clock,timers};
}
const point={lat:28.61,lng:77.21,time:1000000,accuracy:10,speed:null};
test('ride may start without a fix, and a recent fix keeps its original timestamp',()=>{
  assert.equal(journeyStartPoint(null,1000000),null);
  assert.equal(journeyStartPoint(point,1050000),point);
  assert.equal(journeyStartPoint(point,1110000),point);
  assert.equal(journeyStartPoint(point,1120001),null);
  assert.equal(journeyStartPoint({...point,lat:NaN},1000000),null);
  assert.equal(journeyStartPoint({...point,time:1020000},1000000),null);
});
test('pending and low-confidence rides do not generate route safety checks',()=>{
  const trip={points:[],route:[],destination:null};
  assert.equal(detectConcern(trip,initialState.settings,1000000),null);
  assert.equal(detectConcern({...trip,points:[point,point,point].map((p,i)=>({...p,time:900000+i*30000,accuracy:1000}))},initialState.settings,1000000),null);
});
test('start requests high-accuracy GPS immediately while also displaying fast cached location',()=>{
  const h=harness();h.session.start();
  assert.equal(h.watches.length,1);assert.equal(h.requests.length,2);
  assert.equal(h.requests[0].options.enableHighAccuracy,false);
  assert.equal(h.requests[0].options.maximumAge,30000);
  assert.equal(h.requests[1].options.enableHighAccuracy,true);
  assert.equal(h.requests[1].options.maximumAge,0);
  assert.equal(h.watches[0].options.enableHighAccuracy,true);
  assert.equal(h.watches[0].options.maximumAge,0);
  h.session.stop();
});
test('manual refresh bypasses pending automatic request but coalesces repeated taps',()=>{
  const h=harness();h.session.start();
  for(let i=0;i<20;i++)h.session.refresh();
  assert.equal(h.watches.length,1);assert.equal(h.requests.length,3,'one extra manual request');
  h.requests[0].success(h.fix());h.requests[1].success(h.fix()); // invalidated auto result
  h.requests[2].success(h.fix(h.clock.now()+1));
  assert.equal(h.positions.length,2);
  h.session.refresh();assert.equal(h.requests.length,4);
  h.session.stop();
});
test('a stalled watch triggers retries and recovery but never blocks the dot',()=>{
  const h=harness();h.session.start();
  h.advance(12500);
  assert.equal(h.requests.length,3,'automatic high-accuracy retry after initial stalled request');
  h.requests[1].success(h.fix()); // old callback must be ignored
  assert.equal(h.positions.length,0);
  h.advance(17500);
  assert.equal(h.requests.length,5,'fresh coarse fallback requested when precise GPS stalls');
  assert.equal(h.requests[4].options.enableHighAccuracy,false);
  assert.equal(h.requests[4].options.maximumAge,0,'fallback must be uncached');
  assert.equal(h.watches.length,2,'stalled continuous watch restarted at 30 sec');
  assert.deepEqual(h.cleared,[1]);
  h.watches[0].success(h.fix());assert.equal(h.positions.length,0,'retired watch must not overwrite location');
  h.watches[1].success(h.fix());assert.equal(h.positions.length,1);
  h.requests[4].success({...h.fix(h.clock.now()+1),coords:{latitude:28.61,longitude:77.21,accuracy:1200,speed:null}});
  assert.equal(h.positions.length,2,'a fresh low-accuracy fallback may be shown as approximate');
  h.session.stop();
});
test('moving dot receives every real watch update without timer polling a healthy stream',()=>{
  const h=harness();h.session.start();
  for(let i=0;i<20;i++){
    h.advance(1000);
    h.watches[0].success({...h.fix(),coords:{latitude:28.61+i*0.00002,longitude:77.21,accuracy:10,speed:2.5}});
  }
  assert.equal(h.positions.length,20,'each unique 1-second position reaches the map immediately');
  assert.equal(h.watches.length,1,'healthy continuous watch should be retained');
  assert.equal(h.requests.length,2,'no periodic requests should compete with a healthy watch');
  h.session.stop();
});
test('duplicate and out-of-order locations never make the live dot jump backwards',()=>{
  const h=harness();h.session.start();
  h.watches[0].success(h.fix());
  h.watches[0].success(h.fix());
  h.watches[0].success(h.fix(h.clock.now()-1000));
  h.watches[0].success(h.fix(h.clock.now()+1));
  assert.equal(h.positions.length,2);
  h.session.stop();
});
test('repeated coordinates with the same old timestamp do not hide a stalled GPS watch',()=>{
  const h=harness();h.session.start();
  h.watches[0].success(h.fix());
  h.advance(15000);h.watches[0].success(h.fix(1_000_000));
  h.advance(15000);
  assert.equal(h.watches.length,2,'old timestamp should not reset freshness clock');
  h.session.stop();
});
test('resume from background immediately restarts the watch and requests a fresh fix',()=>{
  const h=harness();h.session.start();h.session.setForeground(false);
  h.advance(60000);
  assert.equal(h.requests.length,2,'no polling required from hidden web page');
  h.session.setForeground(true);
  assert.equal(h.watches.length,2);
  assert.equal(h.requests.length,3);
  h.session.stop();
});
test('refresh can retry after timeout and watch continues despite one-shot error',()=>{
  const h=harness();h.session.start();h.session.refresh();
  h.requests[2].error({code:3});assert.equal(h.errors.length,1);
  h.session.refresh();assert.equal(h.requests.length,4);
  h.watches[0].success(h.fix());assert.equal(h.positions.at(-1).timestamp,h.clock.now());
  h.session.stop();
});
test('the watch keeps delivering improved positions while a refresh is pending',()=>{
  const h=harness();h.session.start();h.watches[0].success(h.fix());h.watches[0].success(h.fix(h.clock.now()+1));
  assert.equal(h.positions.length,2);assert.equal(h.requests.length,2);
  h.session.stop();
});
test('pausing clears periodic retries and invalidates late one-shot and watch callbacks',()=>{
  const h=harness();h.session.start();h.session.stop();
  h.requests[0].success(h.fix());h.requests[1].success(h.fix());h.watches[0].success(h.fix());h.watches[0].error({code:3});
  assert.deepEqual(h.cleared,[1]);assert.equal(h.session.watchId,null);assert.equal(h.positions.length,0);assert.equal(h.errors.length,0);
  h.advance(60000);assert.equal(h.requests.length,2);
  h.session.start();h.requests[2].success(h.fix());assert.equal(h.positions.length,1);h.session.stop();
});
test('denied permission stops tracking and is distinct from temporary GPS failure',()=>{
  const h=harness();h.session.start();h.watches[0].error({code:1});
  assert.equal(h.session.watchId,null);assert.equal(h.errors[0].code,1);
  h.requests[0].success(h.fix());assert.equal(h.positions.length,0);
  const waiting=harness();waiting.session.start();waiting.requests[0].error({code:3});assert.equal(waiting.session.watchId,1);assert.equal(waiting.errors.length,0);
  waiting.watches[0].error({code:2});assert.equal(waiting.errors.length,0,'transient watch errors should not interrupt live tracking');assert.equal(waiting.session.watchId,1);waiting.advance(GPS_STALE_MS);assert.equal(waiting.watches.length,2,'stale watch is recovered automatically');waiting.session.stop();
});
test('mobile HTTP and a denied permission provide specific recovery steps',()=>{
  assert.equal(locationBlocker(false,true),'insecure');assert.equal(locationBlocker(true,false),'unsupported');assert.equal(locationBlocker(true,true),null);
  assert.equal(GPS_POLL_MS,10000);assert.equal(GPS_STALE_MS,30000);
  assert.match(locationHelp('insecure'),/HTTPS.*phone/);assert.match(locationHelp('insecure'),/localhost exception/);
  assert.match(locationHelp('denied'),/site’s browser permissions/);assert.match(locationHelp('denied'),/previously denied/);
  assert.match(locationHelp('timeout'),/continuous high-accuracy/);
});
test('search can return twenty places, deduplicates matches, and excludes empty coordinates',()=>{
  const raw=Array.from({length:20},(_,i)=>({place_id:i+1,name:`Campus ${i}`,display_name:`Campus ${i}, Delhi`,lat:'28.6',lon:String(77+i/100)}));
  assert.equal(parsePlaces([...raw,raw[0],{display_name:'Empty',lat:'',lon:null}]).length,20);
  assert.equal(parsePlaces([raw[0],raw[0],{display_name:'Empty',lat:'',lon:null}]).length,1);
  assert.equal(parsePlaces(raw)[0].searchId,'1');
});
test('nearby preference allows other cities and load-more excludes previous results',()=>{
  const url=searchUrl('college',{near:{lat:28.6,lng:77.2},exclude:['12','13','bad']});
  assert.equal(url.searchParams.get('limit'),'20');assert.equal(url.searchParams.get('bounded'),'0');assert.ok(url.searchParams.get('viewbox'));
  assert.equal(url.searchParams.get('exclude_place_ids'),'12,13');assert.equal(searchUrl('Agra').searchParams.has('viewbox'),false);
});
test('identical submitted searches reuse results without another network call',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify([{display_name:'Test campus',lat:'28.6',lon:'77.2'}]),{status:200});};
  try{const first=await searchPlaces('Test campus');const second=await searchPlaces('Test campus');assert.deepEqual(second,first);assert.equal(calls,1);
    const controller=new AbortController();controller.abort();await assert.rejects(searchPlaces('Cancelled campus',controller.signal),{name:'AbortError'});assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('Android fallback watch starts after no fix and clears on precise GPS recovery',()=>{
 const h=harness();h.session.start();h.advance(42500);
 assert.equal(h.watches.length,3,'high accuracy watch restart plus network watch');
 assert.equal(h.watches[2].options.enableHighAccuracy,false);
 h.watches[2].success({...h.fix(),coords:{latitude:28.61,longitude:77.21,accuracy:450,speed:null}});
 assert.equal(h.positions.at(-1).coords.accuracy,450);
 h.watches[1].success({...h.fix(h.clock.now()+1),coords:{latitude:28.61,longitude:77.21,accuracy:12,speed:0}});
 assert.ok(h.cleared.includes(3),'network watch stops after precise real fix');
 h.session.stop();
});

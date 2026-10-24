import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,pathDistance,finalJourneyFix,routeDistance,detectConcern,assessJourneySafety,acceptAlternateRoute,shouldOpenSafetyCheck,monitorRecovery,initialState,makeIncident,nextContact,locationLabel,mergeState} from '../src/lib/safety.ts';
const now=1000000;
const point=(lat,lng,time=now,accuracy=10)=>({lat,lng,time,accuracy,speed:8});
const route=[point(28.6,77.2),point(28.62,77.2)];
const trip=(points,destination={id:'d',name:'College',lat:28.62,lng:77.2,address:'',icon:'College'})=>({id:'t',name:'Test',mode:'Auto',start:now-600000,points,route,destination,events:[],demo:false,status:'active',updated:now});
test('Haversine and segment distance are measured in metres',()=>{assert.ok(distance(point(0,0),point(0,1))>111000);assert.ok(distance(point(0,0),point(0,1))<111300);assert.ok(routeDistance(point(28.61,77.2),route)<1);assert.ok(routeDistance(point(28.61,77.21),route)>900);});
test('ordinary movement along road geometry does not raise a concern',()=>{assert.equal(detectConcern(trip([point(28.605,77.2,now-60000),point(28.607,77.2,now-30000),point(28.61,77.2)]),initialState.settings,now),null);});
test('one brief GPS drift is not a concern',()=>{assert.equal(detectConcern(trip([point(28.605,77.2,now-60000),point(28.607,77.2,now-30000),point(28.61,77.22)]),initialState.settings,now),null);});
test('persistent credible deviation begins verification',()=>{assert.equal(detectConcern(trip([point(28.605,77.22,now-60000),point(28.607,77.22,now-30000),point(28.61,77.22)]),initialState.settings,now),'Persistent route deviation');});
test('low confidence and stale GPS are excluded',()=>{const pts=[point(28.605,77.22,now-60000,100),point(28.607,77.22,now-30000,100),point(28.61,77.22,now,100)];assert.equal(detectConcern(trip(pts),initialState.settings,now),null);assert.equal(detectConcern(trip(pts.map(p=>({...p,accuracy:10,time:p.time-120000}))),initialState.settings,now),null);});
test('unknown destination never claims a route deviation',()=>{const pts=[point(28.605,77.22,now-60000),point(28.607,77.22,now-30000),point(28.61,77.22)];assert.equal(detectConcern(trip(pts,null),initialState.settings,now),null);});
test('five minute stop is detected, including unknown destination',()=>{const pts=Array.from({length:11},(_,i)=>point(28.605,77.2,now-300000+i*30000));assert.equal(detectConcern(trip(pts,null),initialState.settings,now),'Unusual stop');});
test('a stop near the destination is not suspicious',()=>{const pts=Array.from({length:11},(_,i)=>point(28.62,77.2,now-300000+i*30000));assert.equal(detectConcern(trip(pts),initialState.settings,now),null);});
test('explicit SOS bypasses contact verification and keeps delivery pending',()=>{const i=makeIncident(null,'sos','Help',now);assert.equal(i.status,'help_requested');assert.equal(i.stage,2);assert.deepEqual(i.delivery,['pending','pending']);});
test('a concern does not become an emergency automatically',()=>{const i=makeIncident(null,'concern','Deviation',now);assert.equal(i.status,'checking');assert.equal(i.stage,0);const first={...i,stage:1};assert.equal(nextContact(first,now+119000,120),1);assert.equal(nextContact(first,now+120000,120),2);assert.equal(first.status,'checking');assert.equal(nextContact({...first,acknowledged:now+1000},now+120000,120),1);});
test('stale locations are never labelled live',()=>{assert.equal(locationLabel(null,now),'Location unavailable');assert.equal(locationLabel(point(0,0,now-1000),now),'Live location');assert.equal(locationLabel(point(0,0,now-180000),now),'Last known location');});
test('conflict merge deduplicates incident and journey identities',()=>{const a=trip([point(28.6,77.2)]);const b={...a,updated:now+1,name:'Newer'};const i=makeIncident(a,'concern','Check',now);const result=mergeState({...initialState,trips:[a],incidents:[i]},{...initialState,trips:[b],incidents:[{...i,updated:now+1,status:'resolved'}]});assert.equal(result.trips.length,1);assert.equal(result.trips[0].name,'Newer');assert.equal(result.incidents.length,1);assert.equal(result.incidents[0].status,'resolved');});

test('journey distance ignores stationary position noise and low-confidence fixes',()=>{
  const jitter=Array.from({length:35},(_,i)=>point(28.6+(i%3-1)*0.00004,77.2+((i*7)%3-1)*0.00004,now+i*5000,25));
  assert.equal(pathDistance(jitter),0);
  assert.equal(pathDistance([...jitter,point(28.7,77.3,now+180000,250)]),0);
});
test('journey distance accumulates plausible walking and driving without changing raw trail',()=>{
  const walk=Array.from({length:21},(_,i)=>point(28.6+i*0.00007,77.2,now+i*5000,6));
  const measured=pathDistance(walk);
  assert.ok(measured>140&&measured<170,`Expected ~156m, got ${measured}`);
  assert.equal(walk.length,21);
  assert.ok(pathDistance([point(28.6,77.2,now,5),point(28.6,77.203,now+20000,5)])>280);
});
test('journey distance rejects teleporting and out-of-order samples',()=>{
  const base=point(28.6,77.2,now,5),glitch=point(29.6,78.2,now+5000,5),later=point(28.6001,77.2,now+10000,5);
  assert.ok(pathDistance([base,glitch,later])>9&&pathDistance([base,glitch,later])<15);
  assert.equal(pathDistance([base,point(28.61,77.2,now-1000,5)]),0);
  assert.equal(pathDistance([base,point(28.61,77.2,now+3000,100)]),0);
});
test('long GPS outages are not counted as straight-line travel',()=>{
  const before=point(28.6,77.2,now,5),after=point(28.62,77.2,now+180000,5);
  assert.equal(pathDistance([before,after]),0);
  assert.ok(pathDistance([before,after,point(28.6201,77.2,now+185000,5)])>9);
});
test('ride end includes only a newer real fix, never a demo or stale coordinate',()=>{
  const start=point(28.6,77.2,now,5),record={...trip([start]),start:now-1000};
  const current=point(28.6001,77.2,now+5000,8);
  assert.deepEqual(finalJourneyFix(record,current,now+5500),current);
  assert.equal(finalJourneyFix({...record,demo:true},current,now+5500),null);
  assert.equal(finalJourneyFix(record,{...current,time:now-50000},now+5500),null);
  assert.equal(finalJourneyFix(record,{...current,time:now-500},now+5500),null);
  assert.equal(finalJourneyFix(record,{...current,accuracy:120},now+5500),null);
});

test('safety monitor ignores stale fixes, GPS gaps and impossible jumps',()=>{
 const off=Array.from({length:8},(_,i)=>point(28.605+i*.0006,77.21,now-70000+i*10000));
 assert.equal(assessJourneySafety(trip(off),initialState.settings,now).concern,'Persistent route deviation');
 const gap=[off[0],off[1],off[7]];
 assert.equal(assessJourneySafety(trip(gap),initialState.settings,now).concern,null);
 assert.equal(assessJourneySafety(trip(off.map(p=>({...p,time:p.time-50000}))),initialState.settings,now).tracking,'stale');
 const jumps=[point(28.61,77.2,now-20000),point(28.612,77.2,now-10000),point(28.7,77.3,now)];
 assert.equal(assessJourneySafety(trip(jumps),initialState.settings,now).tracking,'unreliable');
});
test('stationary off-route readings do not imply moving route deviation',()=>{
 const samples=Array.from({length:6},(_,i)=>point(28.61,77.21,now-75000+i*15000));
 assert.equal(assessJourneySafety(trip(samples),initialState.settings,now).route,'possible_deviation');
 assert.equal(detectConcern(trip(samples),initialState.settings,now),null);
});
test('prolonged stop requires continuous accurate readings and is ignored near destination',()=>{
 const samples=Array.from({length:11},(_,i)=>point(28.605,77.2,now-300000+i*30000,12));
 assert.equal(detectConcern(trip(samples,null),initialState.settings,now),'Unusual stop');
 assert.equal(detectConcern(trip(samples.filter((_,i)=>i===0||i>=8),null),initialState.settings,now),null);
 assert.equal(detectConcern(trip(samples.map(p=>({...p,accuracy:65})),null),initialState.settings,now),null);
 const destination=Array.from({length:11},(_,i)=>point(28.62,77.2,now-300000+i*30000,10));
 assert.equal(assessJourneySafety(trip(destination),initialState.settings,now).stop,'at_destination');
});
test('repeat check requires persistent recovery event',()=>{
 const t=trip([]),reason='Persistent route deviation',event={id:'alert',time:now-240000,type:'concern',message:reason};
 assert.equal(shouldOpenSafetyCheck(t,reason,now),true);
 assert.equal(shouldOpenSafetyCheck({...t,events:[event]},reason,now),false);
 assert.equal(shouldOpenSafetyCheck({...t,events:[event,{id:'r',time:now-190000,type:'monitor_recovered',message:reason}]},reason,now),true);
});
test('approved alternative route keeps original trail and resets deviation evidence window',()=>{
 const pts=Array.from({length:8},(_,i)=>point(28.605+i*.0006,77.21,now-70000+i*10000));
 const t=trip(pts),next=[point(28.6,77.21,now,0),point(28.62,77.21,now,0),point(28.62,77.2,now,0)];
 assert.equal(detectConcern(t,initialState.settings,now),'Persistent route deviation');
 const approved=acceptAlternateRoute(t,next,now-1000,'yes');
 assert.equal(approved.route,next);
 assert.deepEqual(approved.routeHistory,[t.route]);assert.deepEqual(approved.points,t.points);
 assert.equal(assessJourneySafety(approved,initialState.settings,now).concern,null);
 const invalid=[next[0],point(29,78,now,0)];
 assert.equal(acceptAlternateRoute(t,invalid,now),t);
 const demo={...t,demo:true};assert.equal(acceptAlternateRoute(demo,next,now),demo);
});

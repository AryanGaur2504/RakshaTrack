export type Point={lat:number;lng:number;time:number;accuracy:number;speed:number|null};
export type Contact={id:string;name:string;phone:string;relation:string};
export type Destination={id:string;name:string;address:string;lat:number;lng:number;icon:string;source?:'osm'|'google'|'manual';placeId?:string;route?:Point[]};
export type SafetyEvent={id:string;time:number;type:string;message:string};
export type Trip={id:string;name:string;mode:string;start:number;end?:number;destination:Destination|null;points:Point[];route:Point[];routeHistory?:Point[][];events:SafetyEvent[];demo:boolean;status:'active'|'completed';updated:number};
export type Incident={id:string;tripId:string|null;time:number;type:'sos'|'concern';reason:string;status:'checking'|'help_requested'|'resolved';stage:number;contactAt:number;acknowledged:number|null;delivery:string[];resolvedAt?:number;updated:number;demo:boolean;lastLocation?:Point|null;quiet?:boolean};
export type Settings={name:string;locationConsent:boolean;sharingConsent:boolean;externalMaps:boolean;autoDetect:boolean;checkTimeout:number;contactTimeout:number;deviation:number;stopMinutes:number;retention:number;notifications:boolean};
export type State={settings:Settings;contacts:Contact[];destinations:Destination[];trips:Trip[];incidents:Incident[]};
export const initialState:State={settings:{name:'Aryan',locationConsent:false,sharingConsent:false,externalMaps:false,autoDetect:false,checkTimeout:60,contactTimeout:120,deviation:300,stopMinutes:5,retention:30,notifications:false},contacts:[],destinations:[],trips:[],incidents:[]};
export const demoRoute:Point[]=[[28.6301,77.2198],[28.6312,77.2188],[28.6324,77.2181],[28.6337,77.2174],[28.6350,77.2173],[28.6365,77.2175],[28.6381,77.2176],[28.6396,77.2175],[28.6412,77.2168],[28.6424,77.2155],[28.6439,77.2148],[28.6452,77.2145],[28.6465,77.2141],[28.6478,77.2137],[28.6490,77.2132]].map(([lat,lng])=>({lat,lng,time:0,accuracy:12,speed:8}));
export function distance(a:Pick<Point,'lat'|'lng'>,b:Pick<Point,'lat'|'lng'>){const rad=Math.PI/180;const dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
// Distance shown in ride reports is an estimate, not a GPS odometer.
// Discard low-quality fixes and implausible jumps, and accumulate displacement
// only after it clears the combined positional uncertainty of two readings.
// The original accepted GPS points remain untouched for the journey trail.
export function pathDistance(points:Point[]){
  let anchor:Point|null=null,total=0;
  for(const p of points){
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||
      !Number.isFinite(p.time)||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>75)continue;
    if(!anchor){anchor=p;continue;}
    if(p.time<=anchor.time)continue;
    const travelled=distance(anchor,p),elapsed=(p.time-anchor.time)/1000;
    // Do not bridge long recording gaps with a fictitious straight-line trip.
    if(elapsed>120){anchor=p;continue;}
    // A GPS teleport is not proof the passenger travelled that distance.
    if(travelled/elapsed>65)continue;
    const noiseFloor=Math.max(4,Math.min(22,Math.hypot(anchor.accuracy,p.accuracy)*0.65));
    if(travelled<=noiseFloor)continue;
    total+=travelled;
    anchor=p;
  }
  return total;
}
// Preserve the last real, recent fix when a ride ends between track samples.
// Never attach the passenger's real location to a simulated demo journey.
export function finalJourneyFix(trip:Trip,fix:Point|null,now=Date.now()):Point|null{
  if(trip.demo||!fix||!Number.isFinite(fix.time)||fix.time<trip.start||fix.time>now||now-fix.time>30000||
    !Number.isFinite(fix.lat)||!Number.isFinite(fix.lng)||Math.abs(fix.lat)>90||Math.abs(fix.lng)>180||
    !Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>75)return null;
  const previous=trip.points.at(-1);
  return previous&&fix.time<=previous.time?null:fix;
}
export function routeDistance(p:Point,route:Point[]){if(!route.length)return Infinity;if(route.length===1)return distance(p,route[0]);const scale=111320;const cos=Math.cos(p.lat*Math.PI/180);let best=Infinity;for(let i=1;i<route.length;i++){const a={x:(route[i-1].lng-p.lng)*scale*cos,y:(route[i-1].lat-p.lat)*scale},b={x:(route[i].lng-p.lng)*scale*cos,y:(route[i].lat-p.lat)*scale};const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a.x+t*dx,a.y+t*dy));}return best;}
export type SafetyAssessment={
  tracking:'waiting'|'stale'|'approximate'|'unreliable'|'live';
  route:'unavailable'|'paused'|'on_route'|'possible_deviation'|'deviation';
  stop:'paused'|'monitoring'|'possible_stop'|'unusual_stop'|'at_destination';
  routeDistanceMeters:number|null;
  stationaryMs:number;
  concern:string|null;
};
const SAFETY_FIX_MAX_AGE_MS=30000;
const SAFETY_MAX_GAP_MS=45000;
const SAFETY_MAX_SPEED_MPS=65;
const SAFETY_ACCURACY_METRES=75;
const STOP_ACCURACY_METRES=35;
const credible=(p:Point)=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&
  Number.isFinite(p.lng)&&Math.abs(p.lng)<=180&&Number.isFinite(p.time)&&
  Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=SAFETY_ACCURACY_METRES;

// Only the latest continuous run of credible fixes is eligible for safety
// decisions. GPS gaps cannot be treated as continuous movement or a long stop.
function continuousFixes(trip:Trip,settings:Settings,now:number):Point[]{
  const windowMs=Math.max(180000,settings.stopMinutes*60000+15000);
  const recent=trip.points.filter(p=>credible(p)&&p.time>=trip.start&&p.time<=now&&now-p.time<=windowMs);
  let run:Point[]=[];
  for(const p of recent){
    const prev=run.at(-1);
    if(!prev){run=[p];continue;}
    const dt=p.time-prev.time;
    if(dt<=0)continue;
    if(dt>SAFETY_MAX_GAP_MS){run=[p];continue;}
    if(distance(prev,p)/(dt/1000)>SAFETY_MAX_SPEED_MPS)continue;
    run.push(p);
  }
  return run;
}
export function assessJourneySafety(trip:Trip,settings:Settings,now=Date.now()):SafetyAssessment{
  const base:SafetyAssessment={tracking:'waiting',route:trip.destination&&trip.route.length>=2?'paused':'unavailable',stop:'paused',routeDistanceMeters:null,stationaryMs:0,concern:null};
  if(trip.demo||trip.status!=='active')return base;
  const latest=trip.points.at(-1);
  if(!latest)return base;
  if(!Number.isFinite(latest.time)||latest.time>now||now-latest.time>SAFETY_FIX_MAX_AGE_MS){base.tracking='stale';return base;}
  if(!credible(latest)){base.tracking='approximate';return base;}
  const recent=continuousFixes(trip,settings,now),last=recent.at(-1);
  const routeChangedAt=[...trip.events].reverse().find(e=>e.type==='route_accepted')?.time??trip.start;
  const routeRecent=recent.filter(p=>p.time>routeChangedAt);
  if(!last||last.time!==latest.time){base.tracking='unreliable';return base;}
  base.tracking='live';
  if(trip.destination&&trip.route.length>=2){
    const metres=routeDistance(last,trip.route);
    base.routeDistanceMeters=Math.round(metres);
    if(metres>settings.deviation+last.accuracy){
      base.route='possible_deviation';
      const off:Point[]=[];
      for(let i=routeRecent.length-1;i>=0;i--){
        const p=routeRecent[i];
        if(routeDistance(p,trip.route)<=settings.deviation+p.accuracy)break;
        off.push(p);
      }
      const first=off.at(-1);
      if(first&&off.length>=3&&last.time-first.time>=45000&&distance(first,last)>=50){
        base.route='deviation';base.concern='Persistent route deviation';
      }
    }else base.route='on_route';
  }
  if(last.accuracy>STOP_ACCURACY_METRES)return base;
  base.stop='monitoring';
  if(trip.destination&&distance(last,trip.destination)<=150){base.stop='at_destination';return base;}
  const stop:Point[]=[];
  for(let i=recent.length-1;i>=0;i--){
    const p=recent[i];
    if(p.accuracy>STOP_ACCURACY_METRES||last.time-p.time>settings.stopMinutes*60000+15000||distance(p,last)>40)break;
    stop.push(p);
  }
  const first=stop.at(-1);
  if(first&&stop.length>=3){
    base.stationaryMs=last.time-first.time;
    if(base.stationaryMs>=60000)base.stop='possible_stop';
    if(base.stationaryMs>=settings.stopMinutes*60000-15000){
      base.stop='unusual_stop';
      if(!base.concern)base.concern='Unusual stop';
    }
  }else base.stop='monitoring';
  return base;
}
// Keep both the actual travelled trail and former expected route after a
// passenger explicitly approves one of the routing provider's alternatives.
export function acceptAlternateRoute(trip:Trip,route:Point[],now=Date.now(),eventId=crypto.randomUUID()):Trip{
  if(trip.demo||trip.status!=='active'||!trip.destination||route.length<2||route.length>10000||
    !route.every(p=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180)||
    distance(route.at(-1)!,trip.destination)>300)return trip;
  return {...trip,route,routeHistory:[...(trip.routeHistory??[]),trip.route].slice(-3),updated:now,
    events:[...trip.events,{id:eventId,time:now,type:'route_accepted',message:'Passenger approved an alternative expected road route; previous route retained in history.'}]};
}
export function detectConcern(trip:Trip,settings:Settings,now=Date.now()):string|null{
  return assessJourneySafety(trip,settings,now).concern;
}
// Persist recovery evidence so a dismissed check doesn't reappear on reload.
export function shouldOpenSafetyCheck(trip:Trip,reason:string,now=Date.now()):boolean{
  const lastConcern=[...trip.events].reverse().find(e=>e.type==='concern');
  if(!lastConcern)return true;
  if(now-lastConcern.time<180000)return false;
  const lastSame=[...trip.events].reverse().find(e=>e.type==='concern'&&e.message===reason);
  if(!lastSame)return true;
  return trip.events.some(e=>e.type==='monitor_recovered'&&e.message===reason&&e.time>lastSame.time);
}
export function monitorRecovery(trip:Trip,settings:Settings,now=Date.now()):string|null{
  const concern=[...trip.events].reverse().find(e=>e.type==='concern');
  if(!concern||trip.events.some(e=>e.type==='monitor_recovered'&&e.message===concern.message&&e.time>concern.time))return null;
  const condition=assessJourneySafety(trip,settings,now);
  if(condition.tracking!=='live')return null;
  const recent=continuousFixes(trip,settings,now);
  const last=recent.at(-1),first=recent.at(-3);
  if(!last||!first||last.time-first.time<15000)return null;
  if(concern.message==='Persistent route deviation'&&condition.route==='on_route'&&
    recent.slice(-3).every(p=>routeDistance(p,trip.route)<=settings.deviation+p.accuracy))return concern.message;
  if(concern.message==='Unusual stop'&&condition.stop==='monitoring'&&
    distance(first,last)>=65)return concern.message;
  return null;
}
export function nextContact(i:Incident,now:number,timeout:number){return i.status==='checking'&&i.stage===1&&i.acknowledged===null&&now-i.contactAt>=timeout*1000?2:i.stage;}
export function makeIncident(trip:Trip|null,type:Incident['type'],reason:string,now=Date.now()):Incident{return{id:crypto.randomUUID(),tripId:trip?.id||null,time:now,type,reason,status:type==='sos'?'help_requested':'checking',stage:type==='sos'?2:0,contactAt:now,acknowledged:null,delivery:['pending','pending'],updated:now,demo:trip?.demo||false};}
export function mergeState(local:State,remote:State):State{const merge=<T extends {id:string;updated:number}>(a:T[],b:T[])=>{const m=new Map(b.map(x=>[x.id,x]));for(const x of a){if(!m.has(x.id)||x.updated>=m.get(x.id)!.updated)m.set(x.id,x);}return [...m.values()];};return {...local,trips:merge(local.trips,remote.trips),incidents:merge(local.incidents,remote.incidents)};}
export function locationLabel(p:Point|null,now=Date.now()){return !p?'Location unavailable':now-p.time<10000?'Live location':now-p.time<120000?'Recent location':'Last known location';}

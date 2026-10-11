import type {Point} from './safety';
function validPoint(p:Point){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(p.time);}
export function acceptLocation(previous:Point|null,next:Point,now=Date.now()):boolean{if(!validPoint(next)||now-next.time>60000||next.time>now+10000)return false;if(!previous)return true;if(next.time<=previous.time)return false;if(now-previous.time<15000&&next.accuracy>Math.max(100,previous.accuracy*3))return false;return true;}
export function initialZoom(p:Point|null){return !p?5:p.accuracy<=50?16:p.accuracy<=500?14:11;}
export function locationDescription(p:Point|null,now=Date.now()){if(!p)return 'No location fix yet';const age=Math.max(0,Math.round((now-p.time)/1000));return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ±${Math.round(p.accuracy)} m · ${age}${age>30?'s old':'s ago'}`;}
// A recent known point may seed the ride without being relabelled as a new fix.
// Older points stay on the map as last-known locations; the ride waits for actual GPS.
export function journeyStartPoint(p:Point|null,now=Date.now()):Point|null{return p&&validPoint(p)&&now-p.time<=120000&&p.time<=now+10000?p:null;}

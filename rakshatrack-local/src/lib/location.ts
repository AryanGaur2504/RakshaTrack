import {distance,type Point} from './safety';
function validPoint(p:Point){return Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(p.time);}
export function acceptLocation(previous:Point|null,next:Point,now=Date.now()):boolean{
  if(!validPoint(next)||now-next.time>60000||next.time>now+10000)return false;
  if(!previous)return true;
  if(next.time<=previous.time)return false;
  // Do not let coarse network positioning replace a recent accurate GPS fix.
  if(now-previous.time<30000&&previous.accuracy<=75&&next.accuracy>Math.max(100,previous.accuracy*3))return false;
  const elapsed=(next.time-previous.time)/1000;
  // An isolated impossible jump is not a credible new real-world location.
  // Lower-quality fixes are still available after a genuine loss of GPS.
  if(previous.accuracy<=75&&next.accuracy<=75&&elapsed>0&&elapsed<120&&
    distance(previous,next)>65*elapsed+previous.accuracy+next.accuracy+40)return false;
  return true;
}
// Visual GPS stabilization only. The original OS fix is retained by the caller
// for journey recording, monitoring and route checks; this affects only the dot.
// Holding a marker inside the fix uncertainty circle avoids idle GPS "walking".
export function stableDisplayLocation(previous:Point|null,next:Point):Point{
  if(!previous)return next;
  if(next.accuracy>150&&previous.accuracy<=75&&next.time-previous.time<=30000)return previous;
  if(previous.accuracy>75||next.accuracy>75)return next;
  const metres=distance(previous,next);
  const uncertainty=Math.max(8,Math.min(25,Math.hypot(previous.accuracy,next.accuracy)*1.1));
  const reportedSpeed=next.speed;
  if(metres<=uncertainty&&(!Number.isFinite(reportedSpeed)||reportedSpeed===null||reportedSpeed<1.2)){
    // A new OS sample arrived; update its real timestamp without moving the dot.
    return {...previous,time:next.time,accuracy:Math.max(previous.accuracy,next.accuracy),speed:next.speed};
  }
  return next;
}
export function initialZoom(p:Point|null){return !p?5:p.accuracy<=50?16:p.accuracy<=500?14:11;}
export function locationDescription(p:Point|null,now=Date.now()){if(!p)return 'No location fix yet';const age=Math.max(0,Math.round((now-p.time)/1000));return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ±${Math.round(p.accuracy)} m · ${age}${age>30?'s old':'s ago'}`;}
// A recent known point may seed the ride without being relabelled as a new fix.
// Older points stay on the map as last-known locations; the ride waits for actual GPS.
export function journeyStartPoint(p:Point|null,now=Date.now()):Point|null{return p&&validPoint(p)&&now-p.time<=120000&&p.time<=now+10000?p:null;}

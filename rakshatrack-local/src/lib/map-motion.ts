import {distance,type Point} from './safety.ts';

// This is visual interpolation ONLY, never a synthetic GPS observation.
// Stored journey points and safety checks always use OS-supplied coordinates.
export function interpolateGPS(a:Pick<Point,'lat'|'lng'>,b:Pick<Point,'lat'|'lng'>,fraction:number){
  const t=Math.max(0,Math.min(1,fraction));
  return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
}
export function gpsMotionDuration(previous:Point,next:Point){
  const gap=next.time-previous.time;
  const metres=distance(previous,next);
  // Never make a long-disconnected or inaccurate point look like continuous movement.
  if(gap<=0||gap>12000||metres>350||previous.accuracy>150||next.accuracy>150)return 0;
  if(metres<0.3)return 0;
  // Limit interpolation to a short on-screen transition between actual readings.
  return Math.min(900,Math.max(180,gap*0.65));
}

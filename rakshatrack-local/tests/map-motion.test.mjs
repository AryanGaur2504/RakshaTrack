import test from 'node:test';
import assert from 'node:assert/strict';
import {interpolateGPS,gpsMotionDuration} from '../src/lib/map-motion.ts';
const a={lat:28.60,lng:77.20,time:1000000,accuracy:8,speed:4};
const b={...a,lat:28.6001,lng:77.2001,time:1001000};
test('the animated dot starts at the old real location and ends at the new real location',()=>{
  assert.deepEqual(interpolateGPS(a,b,0),{lat:a.lat,lng:a.lng});
  assert.deepEqual(interpolateGPS(a,b,1),{lat:b.lat,lng:b.lng});
  const half=interpolateGPS(a,b,.5);
  assert.ok(half.lat>a.lat&&half.lat<b.lat);
  assert.equal(interpolateGPS(a,b,-1).lat,a.lat);
  assert.equal(interpolateGPS(a,b,2).lat,b.lat);
});
test('smooth motion occurs between plausible recent GPS samples',()=>{
  assert.equal(gpsMotionDuration(a,b),650);
  assert.equal(gpsMotionDuration(a,{...b,time:1000500}),325);
  assert.equal(gpsMotionDuration(a,{...b,time:1009000}),900);
});
test('never animate over a prolonged outage, huge teleport or coarse fix',()=>{
  assert.equal(gpsMotionDuration(a,{...b,time:1030000}),0);
  assert.equal(gpsMotionDuration(a,{...b,lat:29.1}),0);
  assert.equal(gpsMotionDuration(a,{...b,accuracy:1000}),0);
  assert.equal(gpsMotionDuration({...a,accuracy:1200},b),0);
  assert.equal(gpsMotionDuration(a,{...b,time:a.time}),0);
});

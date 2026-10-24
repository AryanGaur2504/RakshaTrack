import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {addRidePoint} from './storage';
import type {Point} from './safety';
export const TRACK_TASK='rakshatrack-background-ride';
let currentTripId:string|null=null;
export function setTrackingTrip(id:string|null){currentTripId=id;}
export function fromLocation(p:Location.LocationObject):Point{return {lat:p.coords.latitude,lng:p.coords.longitude,time:p.timestamp,accuracy:p.coords.accuracy??999,speed:p.coords.speed};}
TaskManager.defineTask(TRACK_TASK,async({data,error})=>{
 if(error||!currentTripId)return;
 const locations=(data as {locations?:Location.LocationObject[]})?.locations??[];
 for(const raw of locations){const point=fromLocation(raw);if(point.accuracy<=100)await addRidePoint(currentTripId,point);}
});
export async function startNativeTracking(tripId:string){
 const fg=await Location.requestForegroundPermissionsAsync();if(fg.status!=='granted')throw Error('Allow precise location in Android settings.');
 setTrackingTrip(tripId);
 const bg=await Location.requestBackgroundPermissionsAsync();
 if(bg.status!=='granted')throw Error('Background location permission is required for locked-screen tracking.');
 if(await Location.hasStartedLocationUpdatesAsync(TRACK_TASK))await Location.stopLocationUpdatesAsync(TRACK_TASK);
 await Location.startLocationUpdatesAsync(TRACK_TASK,{accuracy:Location.Accuracy.High,activityType:Location.ActivityType.AutomotiveNavigation,timeInterval:3000,distanceInterval:5,pausesUpdatesAutomatically:false,foregroundService:{notificationTitle:'RakshaTrack ride in progress',notificationBody:'Recording the current journey for safety monitoring.',notificationColor:'#17674e'}});
}
export async function stopNativeTracking(){setTrackingTrip(null);if(await Location.hasStartedLocationUpdatesAsync(TRACK_TASK))await Location.stopLocationUpdatesAsync(TRACK_TASK);}

import type {Point} from './safety';
export const BASE=import.meta.env.BASE_URL;
export const SERVER_MODE=import.meta.env.VITE_STORAGE_MODE==='server';
export const SHELL_CACHE='rakshatrack-shell-v7-'+BASE;
export async function roadRouteOptions(from:Point,to:{lat:number;lng:number}):Promise<Point[][]>{
 const url=SERVER_MODE?`/api/route?from=${from.lng},${from.lat}&to=${to.lng},${to.lat}`:`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=true`;
 const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Road routing unavailable');const data=await r.json();
 if(!SERVER_MODE&&data.code!=='Ok')throw Error('No route found');
 const routes=(Array.isArray(data.routes)?data.routes:[]).slice(0,3).map((candidate:any)=>SERVER_MODE?candidate.points as Point[]:candidate.geometry?.coordinates?.map(([lng,lat]:number[])=>({lat,lng,time:0,accuracy:0,speed:null})) as Point[]).filter((route:Point[]|undefined):route is Point[]=>Array.isArray(route)&&route.length>=2&&route.length<=10000);
 if(!routes.length)throw Error('No route found');return routes;
}
export async function roadRoute(from:Point,to:{lat:number;lng:number}):Promise<Point[]>{return (await roadRouteOptions(from,to))[0];}

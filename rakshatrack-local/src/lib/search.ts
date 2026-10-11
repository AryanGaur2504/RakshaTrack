import type {Destination} from './safety';
export type PlaceResult=Omit<Destination,'id'|'icon'>&{searchId?:string};
export type SearchOptions={near?:{lat:number;lng:number}|null;exclude?:string[]};
let lastRequest=0;
const cache=new Map<string,PlaceResult[]>();
function coordinate(x:unknown,max:number){return (typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))&&Math.abs(Number(x))<=max;}
export function parsePlaces(raw:unknown):PlaceResult[]{
  if(!Array.isArray(raw))return [];
  const seen=new Set<string>();
  return raw.filter(x=>{
    if(!x||typeof x.display_name!=='string'||!coordinate(x.lat,90)||!coordinate(x.lon,180))return false;
    const key=`${Number(x.lat)},${Number(x.lon)},${x.display_name}`;
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,20).map(x=>({name:typeof x.name==='string'&&x.name.trim()?x.name:x.display_name.split(',')[0],address:x.display_name,lat:Number(x.lat),lng:Number(x.lon),source:'osm',searchId:x.place_id?String(x.place_id):undefined}));
}
export function searchUrl(query:string,options:SearchOptions={}):URL{
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q:query.trim(),format:'jsonv2',limit:'20','accept-language':'en',addressdetails:'1'}).toString();
  const p=options.near;
  if(p&&coordinate(p.lat,90)&&coordinate(p.lng,180)){
    const dy=.5,dx=Math.min(10,.5/Math.max(.05,Math.cos(p.lat*Math.PI/180)));
    url.searchParams.set('viewbox',[Math.max(-180,p.lng-dx),Math.min(90,p.lat+dy),Math.min(180,p.lng+dx),Math.max(-90,p.lat-dy)].join(','));
    url.searchParams.set('bounded','0');
  }
  if(options.exclude?.length)url.searchParams.set('exclude_place_ids',options.exclude.filter(x=>/^\d+$/.test(x)).join(','));
  return url;
}
export async function searchPlaces(query:string,signal?:AbortSignal,options:SearchOptions={}):Promise<PlaceResult[]>{
  const q=query.trim();if(q.length<3)throw Error('Type at least three characters.');
  const url=searchUrl(q,options),key=url.toString();
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  if(cache.has(key))return cache.get(key)!;
  // Public Nominatim allows one request per second and prohibits autocomplete.
  const slot=Math.max(Date.now(),lastRequest+1100),delay=slot-Date.now();lastRequest=slot;
  if(delay>0)await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Search cancelled','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);
    signal?.addEventListener('abort',abort,{once:true});
  });
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const timeout=new AbortController();const abort=()=>timeout.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>timeout.abort(),10000);
  try{
    const r=await fetch(url,{signal:timeout.signal,headers:{Accept:'application/json'}});
    if(!r.ok)throw Error('Place search is unavailable. Try another name, add the city, or choose a saved destination.');
    const places=parsePlaces(await r.json());cache.set(key,places);if(cache.size>60)cache.delete(cache.keys().next().value!);return places;
  }catch(e){if(timeout.signal.aborted&&!signal?.aborted)throw Error('Search took too long. Check your connection and retry.');throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

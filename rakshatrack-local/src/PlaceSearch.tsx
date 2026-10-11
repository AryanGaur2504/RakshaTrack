import {useEffect,useRef,useState} from 'react';
import {Search,MapPin,LoaderCircle,ExternalLink} from 'lucide-react';
import {GOOGLE_KEY,loadGoogle} from './lib/google';
import {searchPlaces,type PlaceResult} from './lib/search';
type Coords={lat:number;lng:number;time?:number;accuracy?:number};
export default function PlaceSearch({allowed,onEnable,onSelect,location}:{allowed:boolean;onEnable:()=>void;onSelect:(p:PlaceResult)=>void;location?:Coords|null}){
  const[q,setQ]=useState(''),[results,setResults]=useState<PlaceResult[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[googleReady,setGoogleReady]=useState(false),[nearby,setNearby]=useState(true),[more,setMore]=useState(false);
  const root=useRef<HTMLDivElement>(null),widgetRef=useRef<any>(null),handler=useRef(onSelect),controller=useRef<AbortController|null>(null),sequence=useRef(0),googleSelection=useRef(0);
  handler.current=onSelect;
  const near=location&&(!location.time||Date.now()-location.time<120000)&&(location.accuracy||0)<20000?location:null;
  const bias=useRef<Coords|null>(near);bias.current=nearby?near:null;
  useEffect(()=>()=>{sequence.current++;controller.current?.abort();},[]);
  useEffect(()=>{
    if(!allowed||!GOOGLE_KEY)return;
    let cancelled=false;let widget:any;setGoogleReady(false);setError('');
    const select=async(e:any)=>{
      const id=++googleSelection.current;setBusy(true);setError('');
      try{const p=e.placePrediction.toPlace();await p.fetchFields({fields:['displayName','formattedAddress','location']});if(!p.location)throw Error('No coordinates are available for this place.');if(!cancelled&&id===googleSelection.current)handler.current({name:p.displayName||'Destination',address:p.formattedAddress||'',lat:p.location.lat(),lng:p.location.lng(),source:'google',placeId:p.id});}
      catch(e){if(!cancelled&&id===googleSelection.current)setError((e as Error).message);}
      finally{if(!cancelled&&id===googleSelection.current)setBusy(false);}
    };
    loadGoogle().then(async maps=>{
      const lib=await maps.importLibrary('places');if(cancelled||!root.current)return;
      widget=new lib.PlaceAutocompleteElement();widget.placeholder='Search Google Maps places';widget.setAttribute('tabindex','0');
      if(bias.current)widget.locationBias={center:{lat:bias.current.lat,lng:bias.current.lng},radius:30000};
      widget.addEventListener('gmp-select',select);widget.addEventListener('gmp-error',()=>{if(!cancelled)setError('Google Places failed. Check the key, enabled APIs, billing, and website restrictions.');});
      widgetRef.current=widget;root.current.replaceChildren(widget);setGoogleReady(true);
    }).catch(e=>{if(!cancelled)setError((e as Error).message);});
    return()=>{cancelled=true;googleSelection.current++;widget?.removeEventListener('gmp-select',select);widget?.remove();widgetRef.current=null;};
  },[allowed]);
  useEffect(()=>{if(widgetRef.current)widgetRef.current.locationBias=nearby&&near?{center:{lat:near.lat,lng:near.lng},radius:30000}:null;},[nearby,near?.lat,near?.lng,googleReady]);
  function reset(value=q){sequence.current++;controller.current?.abort();setQ(value);setResults([]);setError('');setMore(false);setBusy(false);}
  async function search(append=false){
    if(busy)return;
    const id=++sequence.current;setBusy(true);setError('');controller.current?.abort();controller.current=new AbortController();
    const existing=append?results:[];if(!append)setResults([]);
    try{
      const list=await searchPlaces(q,controller.current.signal,{near:nearby?near:null,exclude:existing.map(p=>p.searchId||'').filter(Boolean)});
      if(id!==sequence.current)return;
      const unique=list.filter(p=>!existing.some(x=>x.lat===p.lat&&x.lng===p.lng&&x.address===p.address));
      setResults([...existing,...unique]);setMore(list.length===20&&unique.length>0&&existing.length<80&&list.every(p=>p.searchId));
      if(!unique.length)setError(append?'No additional matches. Try the full name and city.':'No places found. Add a city or neighbourhood to your search.');
    }catch(e){if(id===sequence.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{if(id===sequence.current)setBusy(false);}
  }
  return <section className="place-search" aria-label="Search for a destination">
    <div className="search-title"><Search size={16}/><strong>Find a destination</strong></div>
    {!allowed?<div className="search-consent"><p>Search and road maps use {GOOGLE_KEY?'Google Maps and Places':'OpenStreetMap'} online. Your search text and viewed area are sent to that provider.</p><button type="button" className="btn outline full" onClick={onEnable}>Enable online maps & search</button></div>:<>
      {near&&<label className="search-nearby"><input type="checkbox" checked={nearby} onChange={e=>{setNearby(e.target.checked);if(!GOOGLE_KEY)reset();}}/>Prefer places near my recent location</label>}
      {GOOGLE_KEY?<><div ref={root} className="google-place-widget"/>{!googleReady&&!error&&<p className="search-feedback">Loading Google Places…</p>}</>:<>
        <div className="place-search-input"><Search size={17}/><input aria-label="Search destination by name" placeholder="Place, address, or landmark + city" value={q} onChange={e=>reset(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search();}}}/><button type="button" className="btn primary" disabled={busy||q.trim().length<3} onClick={()=>search()}>{busy?<LoaderCircle className="spin" size={17}/>:<Search size={17}/>}<span>Search</span></button></div>
        <div className="place-results" aria-live="polite">{results.map(p=><button type="button" key={`${p.lat},${p.lng},${p.address}`} onClick={()=>{const {searchId,...place}=p;onSelect(place);reset(p.name);}}><MapPin size={18}/><span><strong>{p.name}</strong><small>{p.address}</small></span></button>)}</div>
        {more&&<button type="button" className="btn outline full" disabled={busy} onClick={()=>search(true)}>{busy?'Searching…':'Show more places'}</button>}
        <p className="search-feedback">OpenStreetMap places · Search the full name and city. Coverage varies by area.</p>
        <p className="search-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · Search on submit<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q||'places near me')}`} target="_blank" rel="noreferrer">Search in Google Maps<ExternalLink size={12}/></a></p>
      </>}
    </>}
    {error&&<p className="search-error" role="alert">{error}</p>}{busy&&GOOGLE_KEY&&<p className="search-feedback">Getting place details…</p>}
  </section>;
}

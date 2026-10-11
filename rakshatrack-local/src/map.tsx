import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Plus,Minus,LocateFixed,Maximize,MapPin,AlertTriangle} from 'lucide-react';
import type {Point} from './lib/safety';
import {GOOGLE_KEY,GOOGLE_MAP_ID,loadGoogle} from './lib/google';
import {initialZoom} from './lib/location';
import {gpsMotionDuration,interpolateGPS} from './lib/map-motion';

type Coords={lat:number;lng:number};
const EMPTY_POINTS:Point[]=[];
type Engine={
  zoom:(delta:number)=>void;
  view:(p:Coords,z?:number)=>void;
  fit:(ps:Coords[])=>void;
  drawPath:(points:Point[],route:Point[],destination:Coords|null)=>void;
  setLocation:(p:Coords|null,accuracy?:number)=>void;
  resize:()=>void;
  remove:()=>void;
};

function makeLeaflet(root:HTMLDivElement,street:boolean,onDrag:()=>void,onTileError:()=>void):Engine{
  const map=L.map(root,{zoomControl:false,attributionControl:street,scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true,minZoom:2,maxZoom:19}).setView([22.5,79],5);
  if(street)L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).on('tileerror',onTileError).addTo(map);
  const path=L.layerGroup().addTo(map);
  let dot:L.Marker|null=null;
  let halo:L.Circle|null=null;
  const dotIcon=L.divIcon({className:'gps-marker-container',html:'<div class="current-map-dot" aria-hidden="true"></div>',iconSize:[20,20],iconAnchor:[10,10]});
  map.on('dragstart',onDrag);
  return {
    zoom:d=>map.setZoom(map.getZoom()+d),
    view:(p,z)=>z===undefined?map.panTo([p.lat,p.lng],{animate:false}):map.setView([p.lat,p.lng],z,{animate:false}),
    fit:ps=>{if(ps.length)map.fitBounds(L.latLngBounds(ps.map(p=>[p.lat,p.lng])),{padding:[36,46],maxZoom:17});},
    resize:()=>map.invalidateSize({pan:false}),
    remove:()=>map.remove(),
    drawPath:(points,route,destination)=>{
      path.clearLayers();
      if(route.length>1)L.polyline(route.map(p=>[p.lat,p.lng]),{color:'#88a59b',weight:5,dashArray:'8 8'}).addTo(path);
      if(points.length>1){
        L.polyline(points.map(p=>[p.lat,p.lng]),{color:'#fff',weight:9}).addTo(path);
        L.polyline(points.map(p=>[p.lat,p.lng]),{color:'#247d5c',weight:5}).addTo(path);
      }
      if(destination)L.circleMarker([destination.lat,destination.lng],{radius:10,color:'#17674e',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(path);
    },
    setLocation:(p,accuracy=0)=>{
      if(!p){dot?.remove();halo?.remove();dot=null;halo=null;return;}
      const latLng:L.LatLngExpression=[p.lat,p.lng];
      if(!halo)halo=L.circle(latLng,{radius:Math.max(5,accuracy),color:'#397fe5',weight:1,fillColor:'#397fe5',fillOpacity:.1,interactive:false}).addTo(map);
      else {halo.setLatLng(latLng);halo.setRadius(Math.max(5,accuracy));}
      if(!dot)dot=L.marker(latLng,{icon:dotIcon,interactive:false,keyboard:false,zIndexOffset:1000}).addTo(map);
      else dot.setLatLng(latLng);
    }
  };
}

async function makeGoogle(root:HTMLDivElement,dark:boolean,onDrag:()=>void):Promise<Engine>{
  const maps=await loadGoogle();
  const {Map}=await maps.importLibrary('maps');
  const {AdvancedMarkerElement}=await maps.importLibrary('marker');
  const map=new Map(root,{center:{lat:22.5,lng:79},zoom:5,mapId:GOOGLE_MAP_ID,colorScheme:dark?'DARK':'LIGHT',disableDefaultUI:true,gestureHandling:'greedy',scrollwheel:true,clickableIcons:false});
  map.addListener('dragstart',onDrag);
  let paths:any[]=[];
  let dot:any=null,halo:any=null;
  const clearPath=()=>{for(const s of paths){if('setMap'in s)s.setMap(null);else s.map=null;}paths=[];};
  return {
    zoom:d=>map.setZoom(Math.max(2,Math.min(19,(map.getZoom()||5)+d))),
    view:(p,z)=>{map.setCenter(p);if(z!==undefined)map.setZoom(z);},
    fit:ps=>{if(ps.length){const bounds=new maps.LatLngBounds();ps.forEach(p=>bounds.extend(p));map.fitBounds(bounds,35);}},
    resize:()=>maps.event.trigger(map,'resize'),
    remove:()=>{clearPath();if(dot)dot.map=null;if(halo)halo.setMap(null);maps.event.clearInstanceListeners(map);root.replaceChildren();},
    drawPath:(points,route,destination)=>{
      clearPath();
      if(route.length>1)paths.push(new maps.Polyline({map,path:route,strokeColor:'#88a59b',strokeWeight:5,strokeOpacity:.8}));
      if(points.length>1)paths.push(new maps.Polyline({map,path:points,strokeColor:'#247d5c',strokeWeight:5}));
      if(destination){const pin=document.createElement('div');pin.className='destination-map-dot';paths.push(new AdvancedMarkerElement({map,position:destination,content:pin,title:'Destination'}));}
    },
    setLocation:(p,accuracy=0)=>{
      if(!p){if(dot)dot.map=null;if(halo)halo.setMap(null);dot=null;halo=null;return;}
      if(!halo)halo=new maps.Circle({map,center:p,radius:Math.max(5,accuracy),strokeColor:'#397fe5',strokeOpacity:.5,strokeWeight:1,fillColor:'#397fe5',fillOpacity:.12,clickable:false});
      else{halo.setCenter(p);halo.setRadius(Math.max(5,accuracy));}
      if(!dot){const el=document.createElement('div');el.className='current-map-dot';dot=new AdvancedMarkerElement({map,position:p,content:el,title:`Location accuracy ±${Math.round(accuracy)} metres`});}
      else{dot.position=p;dot.title=`Location accuracy ±${Math.round(accuracy)} metres`;}
    }
  };
}

export default function JourneyMap({points=EMPTY_POINTS,route=EMPTY_POINTS,location,street=false,demo=false,destination=null,large=false,dark=false,onLocate,onEnableMaps}:{points?:Point[];route?:Point[];location?:Point|null;street?:boolean;demo?:boolean;destination?:Coords|null;large?:boolean;dark?:boolean;onLocate?:()=>void;onEnableMaps?:()=>void}){
  const root=useRef<HTMLDivElement>(null);
  const engine=useRef<Engine|null>(null);
  const centered=useRef(false);
  const following=useRef(true);
  const [follow,setFollow]=useState(true);
  const [loaded,setLoaded]=useState(0);
  const [error,setError]=useState('');
  const current=location||points.at(-1)||null;
  const all=useRef({points,route,current,destination});all.current={points,route,current,destination};
  const motion=useRef<number|null>(null);
  const displayed=useRef<Coords|null>(null);
  const measured=useRef<Point|null>(null);
  const google=!!GOOGLE_KEY&&street;

  useEffect(()=>{
    let cancelled=false;
    centered.current=false;displayed.current=null;measured.current=null;
    if(motion.current!==null){cancelAnimationFrame(motion.current);motion.current=null;}
    setError('');
    const onDrag=()=>{following.current=false;setFollow(false);};
    (async()=>{
      try{
        const canvas=document.createElement('div');canvas.style.width='100%';canvas.style.height='100%';root.current!.replaceChildren(canvas);
        const e=google?await makeGoogle(canvas,dark,onDrag):makeLeaflet(canvas,street,onDrag,()=>setError('Some road tiles could not load. Check your internet connection.'));
        if(cancelled){e.remove();return;}
        engine.current=e;setLoaded(n=>n+1);
      }catch(e){if(!cancelled)setError((e as Error).message);}
    })();
    const observer=new ResizeObserver(()=>engine.current?.resize());if(root.current)observer.observe(root.current);
    return()=>{
      cancelled=true;observer.disconnect();
      if(motion.current!==null){cancelAnimationFrame(motion.current);motion.current=null;}
      engine.current?.remove();engine.current=null;
    };
  },[street,google,google&&dark]);

  // The route is NOT destroyed/recreated for each GPS reading.
  useEffect(()=>{engine.current?.drawPath(points,route,destination);},[points,route,destination,loaded]);

  // Render every real watchPosition update immediately through a persistent dot,
  // interpolating only the *displayed* marker for a short visual transition.
  // Safety calculations and saved ride coordinates never use interpolated values.
  useEffect(()=>{
    const e=engine.current;if(!e)return;
    if(motion.current!==null){cancelAnimationFrame(motion.current);motion.current=null;}
    if(!current){displayed.current=null;measured.current=null;e.setLocation(null);if(destination&&!centered.current){e.view(destination,14);centered.current=true;}return;}
    const prior=measured.current;
    const start=displayed.current;
    const duration=prior&&start?gpsMotionDuration(prior,current):0;
    measured.current=current;
    if(!centered.current){e.view(current,initialZoom(current));centered.current=true;}
    const place=(p:Coords)=>{displayed.current=p;e.setLocation(p,current.accuracy);if(following.current)e.view(p);};
    if(!duration||!start){place(current);return;}
    const begun=performance.now();
    const animate=(ts:number)=>{
      const fraction=Math.min(1,(ts-begun)/duration);
      // Smooth screen animation between actual GPS samples, never dead-reckon beyond a fix.
      const eased=1-Math.pow(1-fraction,3);
      place(interpolateGPS(start,current,eased));
      motion.current=fraction<1?requestAnimationFrame(animate):null;
    };
    motion.current=requestAnimationFrame(animate);
  },[current,loaded]);

  function recenter(){following.current=true;setFollow(true);const p=displayed.current||all.current.current;if(p)engine.current?.view(p,initialZoom(all.current.current));if(!demo)onLocate?.();}
  function fit(){following.current=false;setFollow(false);const s=all.current;engine.current?.fit([...s.points,...s.route,...(s.destination?[s.destination]:[])]);}
  return <div className={'map real-map '+(large?'large':'')}><div ref={root} className="map-engine" aria-label={demo?'Demo map':'Journey map'} tabIndex={0}/><div className="map-tag"><span className={'dot '+(demo?'amber':'')}/>{demo?'Demo coordinates':street?(google?'Google Maps':'OpenStreetMap'):'GPS canvas · no road map'}</div><div className="map-controls"><button type="button" aria-label="Zoom in" onClick={()=>engine.current?.zoom(1)}><Plus size={19}/></button><button type="button" aria-label="Zoom out" onClick={()=>engine.current?.zoom(-1)}><Minus size={19}/></button><button type="button" className={follow?'following':''} aria-label="Refresh and recenter current location" onClick={recenter}><LocateFixed size={19}/></button><button type="button" aria-label="Fit recorded journey and destination" disabled={!points.length&&!route.length&&!destination} onClick={fit}><Maximize size={18}/></button></div>{!current&&!destination&&<div className="map-empty"><div className="location-pin"><MapPin size={25}/></div><strong>No current location yet</strong><span>Tap the location button to start continuous GPS tracking</span></div>}{!street&&onEnableMaps&&<button type="button" className="map-enable" onClick={onEnableMaps}>Enable road maps</button>}{error&&<div className="map-error" role="status"><AlertTriangle size={15}/>{error}</div>}<div className="map-bottom"><span><i className="legend-line"/>Recorded path <i className="legend-line expected"/>Expected route</span><small>{current?`±${Math.round(current.accuracy)} m · ${follow?'Following location':'Map free to explore'}`:'Drag · pinch or wheel to zoom'}</small></div></div>;
}

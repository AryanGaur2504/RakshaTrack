export type LocationIssue='insecure'|'unsupported'|'denied'|'unavailable'|'timeout';
export function locationBlocker(secure:boolean,supported:boolean):LocationIssue|null{return !secure?'insecure':!supported?'unsupported':null;}
export function locationHelp(issue:LocationIssue):string{
  if(issue==='insecure')return 'Open this app over HTTPS on your phone. A laptop’s http://192.168… address cannot request phone location. Use your GitHub Pages HTTPS URL, or trusted local HTTPS. The localhost exception only applies on the device running the server.';
  if(issue==='unsupported')return 'This browser does not expose location. Open the HTTPS app in Chrome or Safari instead of an embedded browser.';
  if(issue==='denied')return 'Allow Location in this site’s browser permissions, then tap Retry. On Android also enable device Location and allow precise location for your browser. A previously denied request may not show another system popup.';
  if(issue==='timeout')return 'No recent GPS coordinates have arrived. RakshaTrack keeps a continuous high-accuracy location watch and automatically retries if device updates stop. Enable phone Location and Precise location, move to an area with a clear sky view, and turn off battery restrictions for your browser. A web page cannot guarantee a fix within 30 seconds or track reliably after the screen locks.';
  return 'Phone location is temporarily unavailable. RakshaTrack will retry while the page is visible. Verify device Location, browser precise-location permission, and GPS signal. Existing coordinates are only last-known positions.';
}

export const GPS_POLL_MS=10000;
export const GPS_STALE_MS=30000;
const WATCH_TIMEOUT_MS=30000;
const PRECISE_TIMEOUT_MS=12000;
const WATCHDOG_TICK_MS=2500;

// Continuous watchPosition events drive the live marker. A timer only recovers
// from device/browser stalls; it is never the normal animation cadence.
// Never synthesize GPS coordinates or refresh old timestamps.
type Clock={
  now:()=>number;
  setInterval:(fn:()=>void,ms:number)=>ReturnType<typeof setInterval>;
  clearInterval:(id:ReturnType<typeof setInterval>)=>void;
};
const systemClock:Clock={now:()=>Date.now(),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)};

export class LocationSession{
  watchId:number|null=null;
  private generation=0;
  private watchEpoch=0;
  private quickId=0;
  private coarseId=0;
  private lastCoarseRequestAt=0;
  private preciseId=0;
  private precisePending=false;
  private preciseKind:'auto'|'manual'='auto';
  private preciseStartedAt=0;
  private lastRequestAt=0;
  private lastWatchStartAt=0;
  private lastFreshAt=0;
  private lastPositionTimestamp=0;
  private watchdog:ReturnType<typeof setInterval>|null=null;
  private foreground=true;
  private geo:Geolocation;
  private onPosition:(p:GeolocationPosition)=>void;
  private onError:(e:GeolocationPositionError)=>void;
  private clock:Clock;
  constructor(geo:Geolocation,onPosition:(p:GeolocationPosition)=>void,onError:(e:GeolocationPositionError)=>void,clock:Clock=systemClock){
    this.geo=geo;this.onPosition=onPosition;this.onError=onError;this.clock=clock;
  }

  start(){
    if(this.watchId!==null)return;
    this.generation++;
    this.foreground=true;
    this.lastFreshAt=0;
    this.lastPositionTimestamp=0;
    this.lastRequestAt=0;
    this.lastCoarseRequestAt=this.clock.now();
    this.startWatch();
    this.quick(this.generation);
    this.precise('auto');
    this.watchdog=this.clock.setInterval(()=>this.heartbeat(),WATCHDOG_TICK_MS);
  }

  // A tap takes priority over an automatic request, but rapid repeat taps share
  // the manual request rather than launching dozens of concurrent GPS lookups.
  refresh(){
    if(this.watchId===null){this.start();return;}
    this.precise('manual');
    if(this.clock.now()-this.lastWatchStartAt>=GPS_STALE_MS)this.startWatch();
  }

  // Browsers throttle JS and can suspend geolocation entirely in background.
  // Recovery on resume is immediate, without treating an old fix as new.
  setForeground(visible:boolean){
    this.foreground=visible;
    if(!visible||this.watchId===null)return;
    this.startWatch();
    this.precise('manual');
  }

  stop(){
    this.generation++;
    this.watchEpoch++;
    this.quickId++;
    this.coarseId++;
    this.preciseId++;
    this.precisePending=false;
    if(this.watchdog!==null){this.clock.clearInterval(this.watchdog);this.watchdog=null;}
    if(this.watchId!==null)this.geo.clearWatch(this.watchId);
    this.watchId=null;
  }

  private startWatch(){
    if(this.watchId!==null)this.geo.clearWatch(this.watchId);
    const generation=this.generation,epoch=++this.watchEpoch;
    this.lastWatchStartAt=this.clock.now();
    this.watchId=this.geo.watchPosition(
      p=>{if(generation===this.generation&&epoch===this.watchEpoch)this.emit(p);},
      e=>{
        if(generation!==this.generation||epoch!==this.watchEpoch)return;
        if(e.code===1){this.stop();this.onError(e);return;}
        // Timeouts of a single watch request are expected on some devices;
        // don't show a failure alert while recovery keeps running.
        if(this.clock.now()-(this.lastFreshAt||this.lastWatchStartAt)>=GPS_STALE_MS)this.onError(e);
      },
      {enableHighAccuracy:true,maximumAge:0,timeout:WATCH_TIMEOUT_MS}
    );
  }

  private emit(p:GeolocationPosition){
    const now=this.clock.now();
    // Never send cached duplicates, out-of-order or invalid readings to the UI.
    // These can otherwise make the dot appear frozen or jump backwards.
    if(!Number.isFinite(p.timestamp)||p.timestamp<=this.lastPositionTimestamp||
      p.timestamp>now+10000||now-p.timestamp>GPS_STALE_MS||
      !Number.isFinite(p.coords.latitude)||!Number.isFinite(p.coords.longitude)||
      !Number.isFinite(p.coords.accuracy))return;
    this.lastPositionTimestamp=p.timestamp;
    this.lastFreshAt=p.timestamp; // OS fix time, not callback receipt time.
    this.onPosition(p);
  }

  private quick(generation:number){
    const id=++this.quickId;
    const current=()=>generation===this.generation&&id===this.quickId;
    this.geo.getCurrentPosition(
      p=>{if(current())this.emit(p);},
      e=>{if(!current())return;if(e.code===1){this.stop();this.onError(e);}},
      {enableHighAccuracy:false,maximumAge:30000,timeout:10000}
    );
  }

  // If satellite-quality fixes are stalled, ask the OS for a NEW network/
  // lower-accuracy location as a fallback. This is not labelled precise GPS;
  // route safety checks already exclude inaccurate coordinates.
  private coarseFallback(){
    this.lastCoarseRequestAt=this.clock.now();
    const generation=this.generation,id=++this.coarseId;
    const current=()=>generation===this.generation&&id===this.coarseId;
    this.geo.getCurrentPosition(
      p=>{if(current())this.emit(p);},
      e=>{if(!current())return;if(e.code===1){this.stop();this.onError(e);}},
      {enableHighAccuracy:false,maximumAge:0,timeout:7000}
    );
  }

  private precise(kind:'auto'|'manual'){
    const now=this.clock.now();
    if(this.precisePending){
      if(now-this.preciseStartedAt<PRECISE_TIMEOUT_MS&&(kind==='auto'||this.preciseKind==='manual'))return;
      // Replace a hung auto request with the user's explicit refresh.
      this.preciseId++;
    }
    this.precisePending=true;
    this.preciseKind=kind;
    this.preciseStartedAt=now;
    this.lastRequestAt=now;
    const generation=this.generation,id=++this.preciseId;
    const current=()=>generation===this.generation&&id===this.preciseId;
    this.geo.getCurrentPosition(
      p=>{if(!current())return;this.precisePending=false;this.emit(p);},
      e=>{if(!current())return;this.precisePending=false;if(e.code===1)this.stop();this.onError(e);},
      {enableHighAccuracy:true,maximumAge:0,timeout:PRECISE_TIMEOUT_MS}
    );
  }

  private heartbeat(){
    if(this.watchId===null||!this.foreground)return;
    const now=this.clock.now();
    // A healthy watch delivers updates as fast as the device makes them available.
    // Only run extra high-accuracy requests when the watch has been silent for
    // 10 seconds, avoiding competing with a healthy continuous GPS stream.
    const age=this.lastFreshAt?now-this.lastFreshAt:now-this.lastWatchStartAt;
    if(age>=GPS_POLL_MS&&now-this.lastRequestAt>=GPS_POLL_MS)this.precise('auto');
    if(age>=GPS_STALE_MS){
      if(now-this.lastCoarseRequestAt>=GPS_STALE_MS)this.coarseFallback();
      if(now-this.lastWatchStartAt>=GPS_STALE_MS)this.startWatch();
    }
  }
}

import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,chmodSync,existsSync,readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {syncSchema} from './schema.mjs';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.woff2':'font/woff2'};
const hash=s=>createHash('sha256').update(s).digest();
export function createApp(options={}){
 const host=options.host||process.env.HOST||'127.0.0.1';const password=options.password??process.env.APP_PASSWORD??'';const origin=options.origin??process.env.APP_ORIGIN??'';const loopback=['127.0.0.1','localhost','::1'].includes(host);
 if(!loopback&&(!password||password.length<16||!origin.startsWith('https://')))throw Error('Remote hosting requires APP_PASSWORD (16+ characters) and APP_ORIGIN=https://your-domain.');
 const dataDir=resolve(options.dataDir||process.env.DATA_DIR||'data');mkdirSync(dataDir,{recursive:true,mode:0o700});const dbFile=resolve(dataDir,'rakshatrack.sqlite');const db=new DatabaseSync(dbFile);try{chmodSync(dbFile,0o600);}catch{}db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,revision INTEGER NOT NULL);');
 const sessions=new Map(),attempts=new Map();const dist=resolve(options.dist||'dist');
 const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
 const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
 const authenticated=req=>{if(!password)return true;const id=cookies(req).raksha_session;const expiry=id&&sessions.get(id);if(!expiry||expiry<Date.now()){if(id)sessions.delete(id);return false;}return true;};
 const readBody=async req=>{let length=0,parts=[];for await(const chunk of req){length+=chunk.length;if(length>5000000){const e=Error('Request too large');e.status=413;throw e;}parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{const e=Error('Invalid JSON');e.status=400;throw e;}};
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');const requestHost=(req.headers.host||'').split(':')[0];if(loopback&&!['localhost','127.0.0.1','['].includes(requestHost)){json(res,403,{error:'Host rejected'});return;}
  if(url.pathname.startsWith('/api/')){
   if(!['GET','HEAD'].includes(req.method)){const supplied=req.headers.origin;if(!supplied){json(res,403,{error:'Origin required'});return;}const allowed=origin?[origin]:['http://localhost:5173','http://127.0.0.1:5173',`http://localhost:${server.address()?.port}`,`http://127.0.0.1:${server.address()?.port}`];if(!allowed.includes(supplied)){json(res,403,{error:'Origin rejected'});return;}if(req.method!=='DELETE'&&!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON content type required'});return;}}
   if(url.pathname==='/api/login'&&req.method==='POST'){const ip=req.socket.remoteAddress;const prior=attempts.get(ip);const rate=prior&&prior.until>Date.now()?prior:{count:0,until:Date.now()+900000};if(rate.count>=10){json(res,429,{error:'Too many attempts; try again in 15 minutes.'});return;}const body=await readBody(req);if(typeof body.password!=='string'||body.password.length>1000||!timingSafeEqual(hash(body.password),hash(password))){rate.count++;attempts.set(ip,rate);json(res,401,{error:'Incorrect password'});return;}attempts.delete(ip);for(const[k,v]of sessions)if(v<Date.now())sessions.delete(k);if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+86400000);json(res,200,{authenticated:true},{'Set-Cookie':`raksha_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https://')?'; Secure':''}`});return;}
   if(!authenticated(req)){json(res,401,{error:'Sign in required'});return;}
   if(url.pathname==='/api/session'&&req.method==='GET'){json(res,200,{authenticated:true,user:'owner',passwordProtected:!!password});return;}
   if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(cookies(req).raksha_session);json(res,200,{signedOut:true},{'Set-Cookie':'raksha_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;}
   if(url.pathname==='/api/state'){
    const row=db.prepare('SELECT data,revision FROM account WHERE id=1').get();
    if(req.method==='GET'){json(res,200,{state:row?JSON.parse(row.data):null,revision:row?.revision||0});return;}
    if(req.method==='PUT'){const parsed=syncSchema.safeParse(await readBody(req));if(!parsed.success){json(res,400,{error:'Invalid account data'});return;}const{state,revision}=parsed.data;if(revision!==(row?.revision||0)){json(res,409,{error:'Conflict',state:row?JSON.parse(row.data):null,revision:row?.revision||0});return;}const next=revision+1;db.prepare('INSERT INTO account(id,data,revision) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(JSON.stringify(state),next);json(res,200,{revision:next});return;}
    if(req.method==='DELETE'){db.prepare('DELETE FROM account WHERE id=1').run();json(res,200,{deleted:true});return;}
   }
   if(url.pathname==='/api/route'&&req.method==='GET'){const a=url.searchParams.get('from'),b=url.searchParams.get('to');const coord=v=>v&&/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(v)&&v.split(',').every((n,i)=>Number.isFinite(+n)&&Math.abs(+n)<=(i===0?180:90));if(!coord(a)||!coord(b)){json(res,400,{error:'Invalid coordinates'});return;}try{const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=full&geometries=geojson&alternatives=true`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();if(data.code!=='Ok'||!data.routes?.length)throw Error();json(res,200,{routes:data.routes.map(x=>({distance:x.distance,duration:x.duration,points:x.geometry.coordinates.map(([lng,lat])=>({lat,lng,time:0,accuracy:0,speed:null}))}))});}catch{json(res,503,{error:'Routing unavailable. Local recording remains available.'});}return;}
   json(res,404,{error:'Unknown API route'});return;
  }
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
  let file=resolve(dist,'.'+decodeURIComponent(url.pathname));if(file!==dist&&!file.startsWith(dist+sep)){json(res,403,{error:'Path rejected'});return;}if(url.pathname==='/'||!extname(url.pathname))file=resolve(dist,'index.html');if(!existsSync(file)){json(res,404,{error:'Build the frontend first with npm run build or npm run build:server.'});return;}
  res.writeHead(200,{'Content-Type':TYPES[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':extname(file)==='.html'||file.endsWith('sw.js')?'no-cache':'public, max-age=3600','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'Server error'});if(!e.status)console.error(e.message);}});
 return{server,db,host,close:()=>new Promise((resolve,reject)=>server.close(e=>{db.close();e?reject(e):resolve();}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const app=createApp();const port=Number(process.env.PORT||8787);app.server.listen(port,app.host,()=>console.log(`RakshaTrack backend: http://${app.host}:${port} · SQLite records in ${resolve(process.env.DATA_DIR||'data')}`));for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.close().then(()=>process.exit(0)));}

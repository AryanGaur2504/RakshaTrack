import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const scrypt=promisify(scryptCallback);
const here=fileURLToPath(new URL('.',import.meta.url));
const digest=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const shaPassword=async(password,salt)=>Buffer.from(await scrypt(password,salt,64)).toString('hex');
const permittedStates=['acknowledged','calling','on_my_way','resolved','need_information'];
const cleanHandle=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{2,29}$/.test(x.trim().toLowerCase())?x.trim().toLowerCase():null;
const safeLabel=x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=80?x.trim():null;
const endpointAllowed=str=>{try{const u=new URL(str);return u.protocol==='https:' && (/^fcm\.googleapis\.com$|^updates\.push\.services\.mozilla\.com$|^.*\.push\.apple\.com$|^.*\.notify\.windows\.com$/.test(u.hostname));}catch{return false;}};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
export function createGuardian(opts={}){
 const configuredOrigin=opts.origin??process.env.GUARDIAN_ORIGIN??'';
 const dataDir=resolve(opts.dataDir??process.env.GUARDIAN_DATA_DIR??join(here,'data'));
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 const db=new DatabaseSync(join(dataDir,'guardian.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,handle TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(key TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invites(key TEXT PRIMARY KEY,owner_id TEXT NOT NULL,label TEXT NOT NULL,expires INTEGER NOT NULL,used_by TEXT);
 CREATE TABLE IF NOT EXISTS contacts(owner_id TEXT NOT NULL,contact_id TEXT NOT NULL,label TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner_id,contact_id));
 CREATE TABLE IF NOT EXISTS subscriptions(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL,lat REAL,lng REAL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS deliveries(alert_id TEXT NOT NULL,contact_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',push_status TEXT NOT NULL DEFAULT 'pending',reply TEXT,updated INTEGER NOT NULL,PRIMARY KEY(alert_id,contact_id));`);
 const statements={
  findUser:db.prepare('SELECT * FROM users WHERE handle=?'),
  account:db.prepare('SELECT id,handle,name,created FROM users WHERE id=?'),
  session:db.prepare('SELECT user_id,expires FROM sessions WHERE key=?'),
  related:db.prepare('SELECT 1 FROM contacts WHERE owner_id=? AND contact_id=?'),
  contacts:db.prepare('SELECT u.id,u.handle,u.name,c.label,c.created FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=? ORDER BY c.created ASC'),
  inbox:db.prepare('SELECT a.id,a.kind,a.message,a.created,a.lat,a.lng,d.status,d.reply,d.updated,u.handle sender_handle,u.name sender_name FROM deliveries d JOIN alerts a ON a.id=d.alert_id JOIN users u ON u.id=a.sender_id WHERE d.contact_id=? ORDER BY a.created DESC LIMIT 80'),
  sent:db.prepare('SELECT a.id,a.kind,a.message,a.created,u.handle contact_handle,u.name contact_name,d.status,d.push_status,d.reply,d.updated FROM alerts a JOIN deliveries d ON d.alert_id=a.id JOIN users u ON u.id=d.contact_id WHERE a.sender_id=? ORDER BY a.created DESC LIMIT 120')
 };
 const failures=new Map();
 const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));};
 const read=async req=>{let total=0,blocks=[];for await(const chunk of req){total+=chunk.length;if(total>16000){const e=Error('Request too large');e.status=413;throw e;}blocks.push(chunk);}let value;try{value=JSON.parse(Buffer.concat(blocks).toString('utf8'));}catch{const e=Error('Invalid JSON');e.status=400;throw e;}if(!value||typeof value!=='object'||Array.isArray(value)){const e=Error('Invalid request');e.status=400;throw e;}return value;};
 const fail=(code,message)=>{const err=Error(message);err.status=code;throw err;};
 const authorized=req=>{const value=/(?:^|;\s*)guardian_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(!value)return null;const session=statements.session.get(digest(value));if(!session||session.expires<=Date.now())return null;return statements.account.get(session.user_id)||null;};
 const cookie=(value,maxAge)=>'guardian_session='+value+'; HttpOnly; SameSite=Lax; Path=/guardian; Max-Age='+maxAge+(configuredOrigin.startsWith('https:')?'; Secure':'');
 const issue=(res,id)=>{const value=token();const expiry=Date.now()+7*86400000;db.prepare('INSERT INTO sessions(key,user_id,expires) VALUES(?,?,?)').run(digest(value),id,expiry);return {'Set-Cookie':cookie(value,7*86400)};};
 async function pushNotify(uid,payload){
  const rows=db.prepare('SELECT endpoint,payload FROM subscriptions WHERE user_id=?').all(uid);
  if(!rows.length)return 'not_subscribed';
  if(opts.pushSender){const a=await Promise.allSettled(rows.map(r=>opts.pushSender(JSON.parse(r.payload),payload)));return a.some(x=>x.status==='fulfilled')?'accepted':'failed';}
  const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
  if(!publicKey||!privateKey||!subject)return 'not_configured';
  let webPush;
  try{webPush=(await import('web-push')).default;}catch{return 'not_configured';}
  webPush.setVapidDetails(subject,publicKey,privateKey);
  const results=await Promise.allSettled(rows.map(async r=>{
   try{await webPush.sendNotification(JSON.parse(r.payload),JSON.stringify(payload),{TTL:3600,urgency:'high',timeout:8000});}
   catch(e){if(e.statusCode===404||e.statusCode===410)db.prepare('DELETE FROM subscriptions WHERE endpoint=?').run(r.endpoint);throw e;}
  }));
  return results.some(x=>x.status==='fulfilled')?'accepted':'failed';
 }
 const assets=resolve(opts.dist??join(here,'../rakshatrack-local/dist'));
 const serveFile=(req,res,path)=>{if(!existsSync(path)){res.writeHead(404);res.end('Not found');return;}const ext=extname(path);res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'||path.endsWith('/sw.js')?'no-cache':'public, max-age=3600','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:readFileSync(path));};
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),p=url.pathname,api=p.startsWith('/guardian/api/'),method=req.method;
   if(!['GET','HEAD','POST'].includes(method))return json(res,405,{error:'Method not allowed'});
   if(method==='POST'){
    const sentOrigin=req.headers.origin;
    const expected=configuredOrigin||('http://'+req.headers.host);
    if(!sentOrigin||sentOrigin!==expected)return json(res,403,{error:'Origin verification failed'});
    if(!(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON required'});
   }
   if(p==='/health'&&method==='GET')return json(res,200,{ok:true,service:'rakshatrack-guardian',persistent:!!process.env.GUARDIAN_DATA_DIR&& !process.env.GUARDIAN_DATA_DIR.startsWith('/tmp')});
   if(!api){
    if(method!=='GET'&&method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    if(p==='/guardian'||p==='/guardian/')return serveFile(req,res,join(here,'index.html'));
    if(p==='/guardian/sw.js')return serveFile(req,res,join(here,'sw.js'));
    if(p==='/guardian/app.js')return serveFile(req,res,join(here,'app.js'));
    if(p==='/guardian/icon.svg')return serveFile(req,res,join(here,'icon.svg'));
    // The same-origin production service can also serve the existing Vite app.
    const file=p==='/'?join(assets,'index.html'):resolve(assets,'.'+decodeURIComponent(p));
    if(file!==assets&&!file.startsWith(assets+sep))return json(res,403,{error:'Path rejected'});
    return serveFile(req,res,file);
   }
   if(p==='/guardian/api/config'&&method==='GET')return json(res,200,{publicKey:process.env.VAPID_PUBLIC_KEY||null,pushConfigured:!!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT)});
   if(p==='/guardian/api/register'&&method==='POST'){
    const body=await read(req);const handle=cleanHandle(body.handle),name=safeLabel(body.name),password=body.password;
    if(!handle||!name||typeof password!=='string'||password.length<12||password.length>128)fail(400,'Use a valid handle, name and password of at least 12 characters.');
    if(statements.findUser.get(handle))fail(409,'Handle unavailable');
    const key=req.socket.remoteAddress||'unknown',prior=failures.get(key)||{count:0,start:Date.now()};
    if(Date.now()-prior.start>900000){prior.count=0;prior.start=Date.now();}
    if(prior.count>=15)fail(429,'Too many registrations or logins from this connection');
    prior.count++;failures.set(key,prior);
    const id=randomUUID(),salt=token(),hash=await shaPassword(password,salt);
    try{db.prepare('INSERT INTO users(id,handle,name,salt,hash,created) VALUES(?,?,?,?,?,?)').run(id,handle,name,salt,hash,Date.now());}catch{fail(409,'Handle unavailable');}
    return json(res,201,{user:{id,handle,name}},issue(res,id));
   }
   if(p==='/guardian/api/login'&&method==='POST'){
    const body=await read(req),handle=cleanHandle(body.handle),key=req.socket.remoteAddress||'unknown';
    let track=failures.get(key)||{count:0,start:Date.now()};if(Date.now()-track.start>900000)track={count:0,start:Date.now()};
    if(track.count>=20)fail(429,'Too many attempts; try later');
    const user=handle?statements.findUser.get(handle):null;
    const fakeSalt='not-an-account',hash=await shaPassword(typeof body.password==='string'?body.password.slice(0,128):'',user?.salt||fakeSalt);
    if(!user||!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(user.hash,'hex'))){track.count++;failures.set(key,track);fail(401,'Incorrect credentials');}
    failures.delete(key);
    return json(res,200,{user:{id:user.id,handle:user.handle,name:user.name}},issue(res,user.id));
   }
   const me=authorized(req);
   if(p==='/guardian/api/me'&&method==='GET')return json(res,200,{user:me});
   if(!me)fail(401,'Sign in required');
   if(p==='/guardian/api/logout'&&method==='POST'){
    const raw=/(?:^|;\s*)guardian_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(raw)db.prepare('DELETE FROM sessions WHERE key=?').run(digest(raw));
    return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
   }
   if(p==='/guardian/api/contacts'&&method==='GET')return json(res,200,{contacts:statements.contacts.all(me.id)});
   if(p==='/guardian/api/invite'&&method==='POST'){
    const {label}=await read(req);const name=safeLabel(label);if(!name)fail(400,'Contact label required');
    const count=db.prepare('SELECT COUNT(*) n FROM contacts WHERE owner_id=?').get(me.id).n;
    if(count>=10)fail(409,'Maximum ten approved contacts');
    const secret=token();db.prepare('INSERT INTO invites(key,owner_id,label,expires) VALUES(?,?,?,?)').run(digest(secret),me.id,name,Date.now()+7*86400000);
    return json(res,201,{invite:'#invite='+secret,expiresInDays:7});
   }
   if(p==='/guardian/api/invite/accept'&&method==='POST'){
    const {token:secret}=await read(req);if(typeof secret!=='string'||secret.length>300)fail(400,'Invalid invitation');
    const invite=db.prepare('SELECT * FROM invites WHERE key=?').get(digest(secret));
    if(!invite||invite.used_by||invite.expires<Date.now())fail(404,'Invitation expired or already used');
    if(invite.owner_id===me.id)fail(400,'Cannot invite yourself');
    db.exec('BEGIN IMMEDIATE');
    try{
     const taken=db.prepare('UPDATE invites SET used_by=? WHERE key=? AND used_by IS NULL').run(me.id,digest(secret)).changes;
     if(!taken)fail(409,'Invitation was already accepted');
     db.prepare('INSERT OR IGNORE INTO contacts(owner_id,contact_id,label,created) VALUES(?,?,?,?)').run(invite.owner_id,me.id,invite.label,Date.now());
     db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return json(res,200,{accepted:true});
   }
   if(p==='/guardian/api/contacts/remove'&&method==='POST'){
    const {contactId}=await read(req);db.prepare('DELETE FROM contacts WHERE owner_id=? AND contact_id=?').run(me.id,contactId);return json(res,200,{ok:true});
   }
   if(p==='/guardian/api/push/subscribe'&&method==='POST'){
    const {subscription}=await read(req);
    if(!subscription||typeof subscription!=='object'||typeof subscription.endpoint!=='string'||!endpointAllowed(subscription.endpoint)||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string'||JSON.stringify(subscription).length>4096)fail(400,'Invalid push subscription');
    db.prepare('INSERT INTO subscriptions(endpoint,user_id,payload,created) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,payload=excluded.payload,created=excluded.created').run(subscription.endpoint,me.id,JSON.stringify(subscription),Date.now());
    return json(res,201,{ok:true});
   }
   if(p==='/guardian/api/push/unsubscribe'&&method==='POST'){
    const {endpoint}=await read(req);db.prepare('DELETE FROM subscriptions WHERE endpoint=? AND user_id=?').run(endpoint,me.id);return json(res,200,{ok:true});
   }
   if(p==='/guardian/api/inbox'&&method==='GET')return json(res,200,{alerts:statements.inbox.all(me.id)});
   if(p==='/guardian/api/sent'&&method==='GET')return json(res,200,{alerts:statements.sent.all(me.id)});
   if(p==='/guardian/api/alerts'&&method==='POST'){
    const b=await read(req),kind=b.kind==='sos'?'sos':b.kind==='check_in'?'check_in':null;
    if(!kind)fail(400,'Invalid alert type');
    const message=typeof b.message==='string'&&b.message.length<=300?b.message.trim():'';
    if(!message)fail(400,'Alert message required');
    const lastHour=db.prepare('SELECT COUNT(*) n FROM alerts WHERE sender_id=? AND created>?').get(me.id,Date.now()-3600000).n;
    if(lastHour>=6)fail(429,'Alert limit reached for this hour');
    const contacts=statements.contacts.all(me.id);if(!contacts.length)fail(422,'Invite and connect a trusted contact first');
    let lat=null,lng=null;
    if(b.shareLocation===true&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180){lat=b.lat;lng=b.lng;}
    const id=randomUUID(),created=Date.now();
    db.exec('BEGIN IMMEDIATE');
    try{
     db.prepare('INSERT INTO alerts(id,sender_id,kind,message,lat,lng,created) VALUES(?,?,?,?,?,?,?)').run(id,me.id,kind,message,lat,lng,created);
     for(const contact of contacts)db.prepare('INSERT INTO deliveries(alert_id,contact_id,status,updated) VALUES(?,?,?,?)').run(id,contact.id,'pending',created);
     db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    // Push accepted by a gateway is NOT delivery acknowledgement.
    const results=await Promise.all(contacts.map(async c=>{
     let status='failed';try{status=await pushNotify(c.id,{id,kind,sender:me.name,title:kind==='sos'?'RakshaTrack EMERGENCY':'RakshaTrack safety check',body:message});}catch{}
     db.prepare('UPDATE deliveries SET push_status=?,updated=? WHERE alert_id=? AND contact_id=?').run(status,Date.now(),id,c.id);
     return {contactId:c.id,pushStatus:status};
    }));
    return json(res,201,{id,recipients:results,notice:'Saved for linked contacts. Push gateway acceptance does not prove device delivery, sound, vibration or human acknowledgement.'});
   }
   const match=p.match(/^\/guardian\/api\/alerts\/([a-f\d-]{36})\/respond$/i);
   if(match&&method==='POST'){
    const b=await read(req);if(!permittedStates.includes(b.status)||typeof b.reply!=='string'||b.reply.length>500)fail(400,'Invalid response');
    const delivery=db.prepare('SELECT 1 FROM deliveries WHERE alert_id=? AND contact_id=?').get(match[1],me.id);if(!delivery)fail(404,'Alert not found');
    db.prepare('UPDATE deliveries SET status=?,reply=?,updated=? WHERE alert_id=? AND contact_id=?').run(b.status,b.reply.trim(),Date.now(),match[1],me.id);
    return json(res,200,{ok:true});
   }
   return json(res,404,{error:'Unknown endpoint'});
  }catch(e){json(res,e.status||500,{error:e.status?e.message:'Server error'});if(!e.status)console.error(e);}
 });
 return {server,db,close:()=>new Promise((ok,err)=>server.close(e=>{db.close();e?err(e):ok();}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const host=process.env.HOST||'127.0.0.1',origin=process.env.GUARDIAN_ORIGIN||'';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&!origin.startsWith('https://'))throw Error('Public Guardian deployment requires GUARDIAN_ORIGIN=https://your-host and HTTPS at proxy');
 const app=createGuardian();app.server.listen(Number(process.env.PORT||8788),host,()=>console.log('Guardian listening on '+host+':'+(process.env.PORT||8788)));
}

const $=x=>document.getElementById(x);
const api=async(path,body)=>{const r=await fetch('/guardian/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error||'Request failed');return v;};
const status=x=>{$('status').textContent=x};
const text=(name,value,parent)=>{const el=document.createElement(name);el.textContent=value;parent.append(el);return el};
const request=async(p,body,after)=>{try{const x=await api(p,body);status('Success');await after?.(x);}catch(e){status(e.message)}};
const values=f=>Object.fromEntries(new FormData(f));
const form=(id,endpoint,callback)=>{$(id).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=values(f);await request(endpoint,b,async v=>{f.reset();await callback?.(v)});};};
form('register','register',refresh);form('login','login',refresh);
form('invite','invite',v=>{const url=new URL('/guardian/',location.origin);url.hash=v.invite;const a=$('inviteLink');a.replaceChildren();text('p','Share this link directly with the intended person. It expires in 7 days.',a);const link=text('a',url.href,a);link.href=url.href;});
form('accept','invite/accept',refresh);
$('logout').onclick=()=>request('logout',{},refresh);
$('refresh').onclick=refresh;
async function refresh(){
 const me=await api('me');
 const logged=!!me.user;
 $('auth').classList.toggle('hidden',logged);
 for(const section of ['account','send','inbox'])$(section).classList.toggle('hidden',!logged);
 if(!logged)return;
 $('welcome').textContent='Signed in as '+me.user.name+' (@'+me.user.handle+')';
 const [contacts,inbox,sent]=await Promise.all([api('contacts'),api('inbox'),api('sent')]);
 $('contacts').replaceChildren();
 for(const c of contacts.contacts){
  const div=document.createElement('p');text('strong',c.name+' (@'+c.handle+') — '+c.label+' ',div);
  const btn=text('button','Remove',div);btn.className='secondary';btn.onclick=()=>request('contacts/remove',{contactId:c.id},refresh);$('contacts').append(div);
 }
 if(!contacts.contacts.length)text('p','No linked contacts yet. Create an invitation and ask them to accept it.', $('contacts'));
 $('inboxAlerts').replaceChildren();
 for(const a of inbox.alerts){
  const div=document.createElement('div');div.className='alert';
  text('strong',a.sender_name+' — '+a.kind.toUpperCase(),div);text('p',a.message,div);
  if(a.lat!==null&&a.lng!==null){const link=text('a','View last shared location',div);link.href='https://www.openstreetmap.org/?mlat='+a.lat+'&mlon='+a.lng;link.target='_blank';link.rel='noreferrer';}
  text('small',new Date(a.created).toLocaleString()+' · '+a.status,div);
  const select=document.createElement('select');for(const label of ['acknowledged','calling','on_my_way','need_information','resolved']){const opt=new Option(label.replaceAll('_',' '),label);select.add(opt);}
  const input=document.createElement('input');input.placeholder='Optional follow-up message';input.maxLength=500;
  const btn=text('button','Update response',div);
  btn.onclick=()=>request('alerts/'+a.id+'/respond',{status:select.value,reply:input.value},refresh);
  div.append(select,input);$('inboxAlerts').append(div);
 }
 if(!inbox.alerts.length)text('p','No alerts yet.', $('inboxAlerts'));
 $('sentAlerts').replaceChildren();
 for(const a of sent.alerts){const d=document.createElement('p');text('strong',a.contact_name+': ',d);text('span',a.status+' · push '+a.push_status+(a.reply?' · '+a.reply:''),d);$('sentAlerts').append(d);}
 if(!sent.alerts.length)text('p','No alerts sent.', $('sentAlerts'));
}
$('sendAlert').onsubmit=async e=>{
 e.preventDefault();const f=e.currentTarget,b=values(f);
 let lat,lng;
 if(b.shareLocation==='on'){
  if(!navigator.geolocation){status('GPS is not supported');return;}
  try{const p=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000,maximumAge:0}));lat=p.coords.latitude;lng=p.coords.longitude;}catch{status('No GPS fix. Uncheck location to send without it.');return;}
 }
 await request('alerts',{kind:b.kind,message:b.message,shareLocation:b.shareLocation==='on',lat,lng},async x=>{status('Alert saved for '+x.recipients.length+' contacts. Push acceptance is NOT delivery confirmation.');f.reset();await refresh();});
};
$('enable').onclick=async()=>{
 try{
  const config=await api('config');if(!config.publicKey)throw Error('Push keys not configured on server');
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('Push not supported in this browser');
  if(await Notification.requestPermission()!=='granted')throw Error('Notifications not allowed');
  const reg=await navigator.serviceWorker.register('/guardian/sw.js',{scope:'/guardian/'});
  const ready=await navigator.serviceWorker.ready;
  const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const subscription=await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api('push/subscribe',{subscription:subscription.toJSON()});status('Notifications enabled. Keep Android Chrome notifications allowed.');
 }catch(e){status(e.message)}
};
const invite=location.hash.match(/invite=([^&]+)/)?.[1];if(invite){$('accept').elements.token.value=decodeURIComponent(invite);history.replaceState(null,'',location.pathname);}
refresh().catch(e=>status(e.message));

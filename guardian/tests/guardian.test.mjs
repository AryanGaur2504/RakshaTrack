import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGuardian} from '../server.mjs';

async function harness(){
 const dataDir=mkdtempSync(join(tmpdir(),'raksha-guardian-'));
 const app=createGuardian({dataDir,origin:'http://127.0.0.1:0',pushSender:async()=>{}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+app.server.address().port;
 const users=new Map();
 async function call(path,body,who=null){
  const headers={};if(body!==undefined){headers['Content-Type']='application/json';headers.Origin='http://127.0.0.1:0';}
  if(who&&users.has(who))headers.Cookie=users.get(who);
  const response=await fetch(url+'/guardian/api/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const cookie=response.headers.get('set-cookie');if(who&&cookie&&cookie.startsWith('guardian_session='))users.set(who,cookie.split(';')[0]);
  return {status:response.status,data:await response.json()};
 }
 return {call,stop:async()=>{await app.close();rmSync(dataDir,{recursive:true,force:true});}};
}
const register=(name)=>({name,handle:name.toLowerCase(),password:'strong pass '+name+' 12345'});
test('Guardian accounts are isolated, with correct auth/session behavior',async()=>{
 const {call,stop}=await harness();try{
  assert.equal((await call('register',register('Passenger'),'passenger')).status,201);
  assert.equal((await call('register',register('Contact'),'contact')).status,201);
  assert.equal((await call('register',register('Passenger'),'dup')).status,409);
  assert.equal((await call('me')).data.user,null);
  assert.equal((await call('inbox')).status,401);
  assert.equal((await call('login',{handle:'passenger',password:'incorrect'},'wrong')).status,401);
  assert.equal((await call('login',{handle:'passenger',password:register('Passenger').password},'login')).status,200);
  assert.equal((await call('me',undefined,'login')).data.user.handle,'passenger');
  assert.equal((await call('logout',{},'login')).status,200);
  assert.equal((await call('me',undefined,'login')).data.user,null);
 }finally{await stop();}
});
test('Invitation pairing requires consent; alert is only visible to linked contact',async()=>{
 const {call,stop}=await harness();try{
  await call('register',register('Passenger'),'passenger');
  await call('register',register('Contact'),'contact');
  await call('register',register('Stranger'),'stranger');
  assert.equal((await call('alerts',{kind:'sos',message:'I need help'},'passenger')).status,422);
  const invitation=await call('invite',{label:'Guardian'},'passenger');
  assert.equal(invitation.status,201);
  const token=invitation.data.invite.split('#invite=')[1];
  assert.equal((await call('invite/accept',{token},'passenger')).status,400);
  assert.equal((await call('invite/accept',{token},'contact')).status,200);
  assert.equal((await call('invite/accept',{token},'stranger')).status,404);
  const alerts=await call('alerts',{kind:'sos',message:'Please call me',shareLocation:true,lat:28.6,lng:77.2},'passenger');
  assert.equal(alerts.status,201);
  assert.equal(alerts.data.recipients.length,1);
  assert.equal((await call('inbox',undefined,'contact')).data.alerts.length,1);
  assert.equal((await call('inbox',undefined,'stranger')).data.alerts.length,0);
  const id=alerts.data.id;
  assert.equal((await call('alerts/'+id+'/respond',{status:'acknowledged',reply:'I am calling'},'stranger')).status,404);
  assert.equal((await call('alerts/'+id+'/respond',{status:'acknowledged',reply:'I am calling'},'contact')).status,200);
  assert.equal((await call('sent',undefined,'passenger')).data.alerts[0].status,'acknowledged');
 }finally{await stop();}
});
test('Reject forged origins, invalid push endpoint, invalid replies, and unauthenticated alert sends',async()=>{
 const {call,stop}=await harness();try{
  await call('register',register('Passenger'),'passenger');
  assert.equal((await call('alerts',{kind:'sos',message:'Alarm'})).status,401);
  assert.equal((await call('push/subscribe',{subscription:{endpoint:'https://attacker.example/push',keys:{auth:'foo',p256dh:'bar'}}},'passenger')).status,400);
  assert.equal((await call('alerts',{kind:'other',message:'X'},'passenger')).status,400);
 }finally{await stop();}
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const emergency=data.kind==='sos';
 const title=emergency?'🚨 RakshaTrack Emergency':'RakshaTrack Safety Check';
 event.waitUntil(self.registration.showNotification(title,{
  body:String(data.body||'Open your trusted-contact inbox').slice(0,200),
  tag:data.id||'guardian-alert',
  renotify:true,
  requireInteraction:emergency,
  vibrate:emergency?[350,150,350,150,650]:[180,100,180],
  icon:'/guardian/icon.svg',
  badge:'/guardian/icon.svg',
  data:{url:'/guardian/'},
  actions:[{action:'open',title:'Open alert'}]
 }));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow('/guardian/'));});

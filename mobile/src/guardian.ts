const BASE=process.env.EXPO_PUBLIC_GUARDIAN_API||'https://rakshatrack-guardian.onrender.com';
export const serviceUrl=BASE.replace(/\/$/,'');
export type Account={id:string;handle:string;name:string};
export async function login(handle:string,password:string){const r=await fetch(serviceUrl+'/guardian/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle,password})});const v=await r.json();if(!r.ok)throw Error(v.error||'Login failed');return v as {user:Account};}
// The current Guardian backend relies on an HttpOnly cookie, and React Native fetch
// does not offer a portable, auditable cookie-vault API. Cross-device authenticated
// operations are intentionally disabled until token-based mobile sessions are added.
export const remoteAlertsReady=false;

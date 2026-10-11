import type {State} from './safety';
export type Snapshot={state:State;revision:number;dirty:boolean};
let database:Promise<IDBDatabase>|null=null;
function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('rakshatrack-private-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function get(k:string):Promise<any>{const d=await db();return new Promise((res,rej)=>{const r=d.transaction('vault').objectStore('vault').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function put(k:string,v:unknown){const d=await db();return new Promise<void>((res,rej)=>{const t=d.transaction('vault','readwrite');t.objectStore('vault').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function key(user:string){let k=await get(user+':key');if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await put(user+':key',k);}return k as CryptoKey;}
export async function saveLocal(user:string,snapshot:Snapshot){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(user),new TextEncoder().encode(JSON.stringify(snapshot)));await put(user+':state',{iv,encrypted});}
export async function loadLocal(user:string):Promise<Snapshot|null>{const v=await get(user+':state');if(!v)return null;const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:v.iv},await key(user),v.encrypted);return JSON.parse(new TextDecoder().decode(bytes));}
export async function clearLocal(user:string){const d=await db();return new Promise<void>((res,rej)=>{const t=d.transaction('vault','readwrite');t.objectStore('vault').delete(user+':state');t.objectStore('vault').delete(user+':key');t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}

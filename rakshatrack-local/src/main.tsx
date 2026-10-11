import {useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ShieldCheck,Lock,ArrowRight} from 'lucide-react';
import App from './App';
import {BASE,SERVER_MODE} from './lib/runtime';
import './styles.css';
function Root(){const[status,setStatus]=useState(SERVER_MODE?'checking':'ready');const[error,setError]=useState('');const[busy,setBusy]=useState(false);
useEffect(()=>{if(!SERVER_MODE)return;fetch('/api/session',{cache:'no-store'}).then(r=>{if(r.ok)setStatus('ready');else if(r.status===401)setStatus('login');else setStatus('unavailable');}).catch(()=>setStatus('unavailable'));},[]);
if(status==='checking')return <div className="loading"><ShieldCheck size={38}/><strong>RakshaTrack</strong><p>Opening your private account…</p></div>;
if(status==='unavailable')return <div className="loading"><ShieldCheck size={38}/><strong>Server unavailable</strong><p>Start the optional backend with npm run dev:server, or use the default browser-local build.</p><button className="btn outline" onClick={()=>location.reload()}>Retry</button></div>;
if(status==='login')return <div className="login-screen"><form className="login-card" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const password=String(new FormData(e.currentTarget).get('password'));const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(!r.ok){const j=await r.json();throw Error(j.error||'Sign-in failed');}setStatus('ready');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><div className="permission-art"><ShieldCheck size={44}/></div><h1>Welcome to RakshaTrack</h1><p className="muted">Enter your self-hosted instance password to open your safety space.</p><label>Password<input name="password" type="password" autoComplete="current-password" required autoFocus/></label>{error&&<p role="alert" className="login-error">{error}</p>}<button className="btn primary full" disabled={busy}>{busy?'Signing in…':'Open my safety space'}<ArrowRight size={17}/></button><p className="login-note"><Lock size={13}/>Protected by your instance password.</p></form></div>;
return <App userId={(SERVER_MODE?'server-owner:':'device-owner:')+BASE} displayName="Aryan"/>;
}
createRoot(document.getElementById('root')!).render(<Root/>);

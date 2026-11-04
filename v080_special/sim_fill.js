/* SIM login autofill. First-party Login page only; never reads or alters CAPTCHA,
   never submits the form. User's selected roster is the sole credential source. */
(function(admission,dob,customPassword){'use strict';
  const norm=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
  const value=String(admission||'').trim().slice(0,50);
  const digits=String(dob||'').replace(/\D/g,'');
  const custom=String(customPassword||'').slice(0,100);
  const validDob=()=>{if(!/^\d{8}$/.test(digits))return false;
    const d=Number(digits.slice(0,2)),m=Number(digits.slice(2,4)),y=Number(digits.slice(4));
    const date=new Date(Date.UTC(y,m-1,d));
    return y>=1900&&y<=2100&&date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d;
  };
  const locationOk=(()=>{try{return location.protocol==='https:'&&location.hostname.toLowerCase()==='glbg.servergi.com'&&location.port==='8072'&&/\/ISIMGLB\/Login\/?$/i.test(location.pathname);}catch(_){return false;}})();
  if(!locationOk)return JSON.stringify({stage:'unavailable',reason:'Not the official SIM login page'});
  const visible=e=>e&&!e.disabled&&!e.readOnly&&(e.getClientRects().length||e.offsetWidth||e.offsetHeight);
  const input=[...document.querySelectorAll('input')].filter(visible);
  const label=e=>{
    const bits=[e.id,e.name,e.placeholder,e.title,e.getAttribute('aria-label'),e.labels?.[0]?.textContent];
    if(e.id)try{bits.push(document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent);}catch(_){}
    let cell=e.closest('td,th');if(cell)bits.push(cell.previousElementSibling?.textContent);
    let row=e.closest('tr');if(row){bits.push(row.querySelector('label')?.textContent);}
    let parent=e.parentElement;for(let i=0;i<2&&parent;i++,parent=parent.parentElement){bits.push(parent.previousElementSibling?.textContent?.slice(0,80));}
    return norm(bits.filter(Boolean).join(' '));
  };
  const named=input.map(e=>({e,key:label(e)}));
  const banned=f=>/captcha|verification|securitycode|otp|onetime|imagecode|captchacode/i.test(f.key);
  const active=named.filter(f=>!banned(f));
  const user=active.filter(f=>!/password/i.test(f.e.type||'')&&/^(text|email|tel|number|search)?$/i.test(f.e.type||'text'));
  const pass=active.filter(f=>(f.e.type||'').toLowerCase()==='password'||/password|txtpass|passwd|passcode/i.test(f.key));
  const loginRank=f=>/admission|admissionno|studentid|username|userid|loginid|txtuser|txtuid|userlogin|loginname/i.test(f.key)?15:/rollno|rollnumber/i.test(f.key)?6:0;
  const passRank=f=>/password|passwd|txtpass|loginpass/i.test(f.key)?15:(f.e.type||'').toLowerCase()==='password'?5:0;
  user.sort((a,b)=>loginRank(b)-loginRank(a));pass.sort((a,b)=>passRank(b)-passRank(a));
  let admissionInput=user.find(f=>loginRank(f)>0)?.e||null;
  if(!admissionInput&&user.length===1&&pass.length)admissionInput=user[0].e;
  let passwordInput=pass.find(f=>passRank(f)>0)?.e||null;
  if(passwordInput===admissionInput)passwordInput=null;
  const set=(e,val)=>{
    if(!e||!val)return false;
    // Preserve what the student has typed; do not overwrite another student login.
    if(String(e.value||'').trim())return String(e.value).trim()===val;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(setter)setter.call(e,val);else e.value=val;
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
    return e.value===val;
  };
  const userFilled=!!admissionInput&&set(admissionInput,value);
  const passwordFilled=!!passwordInput&&!!(custom||validDob())&&set(passwordInput,custom||digits);
  return JSON.stringify({stage:'login',userFound:!!admissionInput,passwordFound:!!passwordInput,userFilled,passwordFilled,dobAvailable:validDob()});
})('__ADMISSION__','__DOB__','__PASSWORD__')
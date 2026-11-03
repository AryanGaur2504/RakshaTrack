(function(){'use strict';
const text=e=>String(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
const live=e=>e&&Boolean(e.getClientRects().length||e.offsetWidth);
const candidates=[...document.querySelectorAll('table')].filter(live);
const marks=candidates.filter(t=>{
 const rows=[...t.querySelectorAll('tr')].filter(r=>r.closest('table')===t);
 if(rows.length<2)return false;
 const heading=text(rows[0]).toLowerCase();
 return /\b(code|subject|name)\b/.test(heading)&&/\b(internal|external|grade|marks)\b/.test(heading);
});
const ready=marks.length>0;
let string=marks.slice(0,20).map(t=>text(t).slice(0,12000)).join('|');
string+='|'+[...document.querySelectorAll('div,span,td')].filter(live).filter(e=>e.children.length<3&&/\bSGPA\b/i.test(text(e))).slice(0,16).map(e=>text(e).slice(0,140)).join('|');
let digest=2166136261;for(let i=0;i<string.length;i++){digest^=string.charCodeAt(i);digest=Math.imul(digest,16777619);}
return JSON.stringify({ready,signature:ready?String(digest>>>0):'',tables:marks.length});
})()
/* Exam results snapshot: visible DOM values only, no credentials or CAPTCHA. */
(function(){'use strict';
const trim=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const visible=el=>!!el&&(!!el.offsetWidth||!!el.offsetHeight||!!el.getClientRects().length);
const tables=[...document.querySelectorAll('table')].filter(visible).slice(0,55);
const profile={};
const tags={name:/^(student\s*)?name$/i,father:/^father\s*(?:name|\x27s name)?$/i,roll:/^(university\s*)?roll\s*(no\.?|number)?$/i,admission:/^admission\s*(no\.?|number)?$/i,program:/^(branch(?: code & name)?|program|course(?: code & name)?)$/i,college:/^(institute(?: code & name)?|college(?: name)?)$/i};
for(const t of tables.slice(0,8))for(const row of [...t.querySelectorAll('tr')].slice(0,25)){
 const cells=[...row.querySelectorAll('th,td')];
 for(let i=0;i+1<cells.length;i++){
  const key=trim(cells[i].textContent).replace(/[：:]$/,'');
  for(const [target,re] of Object.entries(tags))if(re.test(key)&&!profile[target]){
    const value=trim(cells[i+1].textContent).slice(0,110);
    if(value&&!/password|captcha|select|^-+$/i.test(value))profile[target]=value;
  }
 }
}
const surrounding=(t,i)=>{
 const parts=[];
 // Prefer the closest preceding semester-summary table over page-global headings.
 for(let j=i-1;j>=Math.max(0,i-5);j--){
   const tx=trim(tables[j].textContent).slice(0,950);
   if(/\b(?:semester|sgpa|result status|session)\b/i.test(tx)){parts.unshift(tx);if(/\bsemester\s*[:\-]\s*(?:[0-9]+|I{1,4}|VI{0,3}|IX|X)\b/i.test(tx))break;}
 }
 let e=t;
 for(let depth=0;depth<4&&e;depth++,e=e.parentElement){
   let prev=e.previousElementSibling,steps=0;
   while(prev&&steps++<3){const tx=trim(prev.textContent).slice(-700);
    if(/\b(?:semester|sgpa|result status|session)\b/i.test(tx))parts.push(tx);
    prev=prev.previousElementSibling;}
 }
 return trim(parts.join(' | ')).slice(-2600);
};
const relevant=[];
for(const t of tables){
 const trs=[...t.querySelectorAll('tr')].filter(r=>r.closest('table')===t);
 const first=trs.slice(0,3).map(r=>trim(r.textContent||'').slice(0,140).toLowerCase()).join(' ');
 if(!/\bsubject\b/.test(first)||!/\b(marks?|grade|result|obtained)\b/.test(first)||trs.length<2)continue;
 relevant.push(trs.map(r=>[...r.querySelectorAll('td,th')].filter(c=>c.closest('table')===t).map(c=>trim(c.textContent).slice(0,140)).join('\u001f')).join('\u001e'));
}
const signatureBody=relevant.join('\u001d');let fingerprintHash=2166136261;
for(let i=0;i<signatureBody.length;i++){fingerprintHash^=signatureBody.charCodeAt(i);fingerprintHash=Math.imul(fingerprintHash,16777619);}
const marksFingerprint=relevant.length?String(fingerprintHash>>>0)+':'+signatureBody.length:'';

const snap={profile,marksFingerprint,url:location.pathname,title:document.title||'',headings:[...document.querySelectorAll('h1,h2,h3,h4,h5')].filter(visible).slice(0,40).map(x=>trim(x.textContent).slice(0,140)),tables:tables.map(t=>[...t.querySelectorAll('tr')].filter(r=>r.closest('table')===t).slice(0,340).map(r=>[...r.querySelectorAll('th,td')].filter(x=>x.closest('table')===t).slice(0,18).map(x=>trim(x.innerText||x.textContent).slice(0,180)))),tableMeta:tables.map(t=>{const cap=t.querySelector('caption');const parent=t.closest('section,.panel,.card,.table-responsive,.tab-pane');const head=(parent?.querySelector('h2,h3,h4,strong,b')?.textContent)||'';return {heading:trim(cap?.textContent||head).slice(0,150),semesterContext:surrounding(t,tables.indexOf(t))};}),selections:[...document.querySelectorAll('select')].filter(visible).slice(0,14).map(s=>{const label=s.labels?.[0]?.textContent||s.closest('td')?.previousElementSibling?.textContent||s.parentElement?.previousElementSibling?.textContent||s.parentElement?.textContent?.slice(0,90)||'';return {id:s.id||'',name:s.name||'',label:trim(label).slice(0,90),valueText:trim(s.selectedOptions?.[0]?.textContent||'').slice(0,90)};}),pageSummary:[...document.querySelectorAll('b,strong,span,div,p')].filter(x=>visible(x)&&x.children.length<3&&/\b(?:SGPA|CGPA|RESULT STATUS|FINAL RESULT)\b/i.test(x.textContent||'')).slice(0,18).map(x=>trim(x.textContent).slice(0,100)).join(' | '),capturedAt:new Date().toISOString()};
return JSON.stringify(snap);
})()

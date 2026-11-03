/* Exam results snapshot: visible DOM values only, no credentials or CAPTCHA. */
(function(){'use strict';
const trim=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const visible=el=>!!el&&(!!el.offsetWidth||!!el.offsetHeight||!!el.getClientRects().length);
const tables=[...document.querySelectorAll('table')].filter(visible).slice(0,55);
const profile={};
const tags={name:/^(student\s*)?name$/i,father:/^father\s*(name)?$/i,roll:/^(university\s*)?roll\s*(no\.?|number)?$/i,admission:/^admission\s*(no\.?|number)?$/i,program:/^(branch|program|course)$/i};
for(const t of tables.slice(0,6))for(const row of [...t.querySelectorAll('tr')].slice(0,20)){
 const cells=[...row.querySelectorAll('th,td')];
 for(let i=0;i+1<cells.length;i++){
  const key=trim(cells[i].textContent).replace(/[：:]$/,'');
  for(const [target,re] of Object.entries(tags))if(re.test(key)&&!profile[target]){
    const value=trim(cells[i+1].textContent).slice(0,110);
    if(value&&!/password|captcha|select|^-+$/i.test(value))profile[target]=value;
  }
 }
}
const snap={profile,url:location.pathname,title:document.title||'',headings:[...document.querySelectorAll('h1,h2,h3,h4,h5')].filter(visible).slice(0,40).map(x=>trim(x.textContent).slice(0,140)),tables:tables.map(t=>[...t.querySelectorAll('tr')].slice(0,340).map(r=>[...r.querySelectorAll('th,td')].slice(0,18).map(x=>trim(x.innerText||x.textContent).slice(0,180)))),tableMeta:tables.map(t=>{const cap=t.querySelector('caption');const parent=t.closest('section,.panel,.card,.table-responsive,.tab-pane');const head=(parent?.querySelector('h2,h3,h4,strong,b')?.textContent)||'';return {heading:trim(cap?.textContent||head).slice(0,150)};}),selections:[...document.querySelectorAll('select')].filter(visible).slice(0,14).map(s=>{const label=s.labels?.[0]?.textContent||s.closest('td')?.previousElementSibling?.textContent||s.parentElement?.previousElementSibling?.textContent||s.parentElement?.textContent?.slice(0,90)||'';return {id:s.id||'',name:s.name||'',label:trim(label).slice(0,90),valueText:trim(s.selectedOptions?.[0]?.textContent||'').slice(0,90)};}),pageSummary:[...document.querySelectorAll('b,strong,span,div,p')].filter(x=>visible(x)&&x.children.length<3&&/\b(?:SGPA|CGPA|RESULT STATUS|FINAL RESULT)\b/i.test(x.textContent||'')).slice(0,18).map(x=>trim(x.textContent).slice(0,100)).join(' | '),capturedAt:new Date().toISOString()};
return JSON.stringify(snap);
})()

/* Operates only on the first-party, CAPTCHA-authenticated SIM exam page.
 * Reads visible semester/exam options and controls through normal UI events.
 * No credentials, cookies, hidden tokens, or private APIs are accessed.
 */
(function(){'use strict';
const action='__ACTION__';const args=__ARGS__;
const clean=x=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,140);
const invalid=x=>!x||/^(-+\s*)?(select|choose|please select|--select--|all semesters?)\s*-*$/i.test(clean(x));
const visible=e=>!!e&&(!!e.getClientRects().length||!!e.offsetWidth||!!e.offsetHeight);
if(document.querySelector('input[type=password]'))return JSON.stringify({state:'login'});
const fields=[...document.querySelectorAll('select')].filter(e=>!e.disabled&&visible(e));
const describe=e=>{const parent=e.closest('td,th,.form-group,.row,.input-group')||e.parentElement;
 const label=clean([e.labels?.[0]?.textContent,parent?.previousElementSibling?.textContent,parent?.textContent?.slice(0,65)].filter(Boolean).join(' '));
 return {id:e.id||'',name:e.name||'',label,value:e.value||'',selected:clean(e.selectedOptions?.[0]?.textContent),options:[...e.options].filter(o=>!invalid(o.value)&&!invalid(o.textContent)).slice(0,24).map(o=>({value:o.value,text:clean(o.textContent)}))};};
const title=x=>[x.id,x.name,x.label].join(' ').toLowerCase();
let sem=fields.find(e=>/semester|\bsem\b/i.test(title(describe(e))))||fields[0];
let exam=fields.find(e=>e!==sem&&/exam|test|assessment|sessional/i.test(title(describe(e))))||fields.find(e=>e!==sem);
function resultTableData(){
 const rows=[];
 for(const t of [...document.querySelectorAll('table')].filter(visible)){
   const trs=[...t.querySelectorAll('tr')].filter(r=>r.closest('table')===t);
   const first=trs.slice(0,3).map(r=>clean(r.textContent||'').toLowerCase()).join(' ');
   if(!/\bsubject\b/.test(first)||!/\b(marks?|grade|result|obtained)\b/.test(first)||trs.length<2)continue;
   rows.push(trs.map(r=>[...r.querySelectorAll('td,th')].filter(c=>c.closest('table')===t).map(c=>clean(c.textContent)).join('\u001f')).join('\u001e'));
 }
 const body=rows.join('\u001d');let hash=2166136261;
 for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return {hasMarks:rows.length>0,marksFingerprint:rows.length?String(hash>>>0)+':'+body.length:'',resultTables:rows.length};
}
const data={state:'ok',semester:sem?describe(sem):null,exam:exam?describe(exam):null,...resultTableData()};
if(action==='inspect'||action==='semesters')return JSON.stringify(data);
if(action==='show'){
 const btn=[...document.querySelectorAll('button,input[type=submit],input[type=button],a')].find(b=>visible(b)&&/^(show|view|search|display|result|get result)$/i.test(clean(b.value||b.textContent)));
 if(btn){const before=data.marksFingerprint;btn.click();return JSON.stringify({state:'show-clicked',beforeFingerprint:before});}
 return JSON.stringify({state:'no-show-button'});
}
function find(spec,kind){let e=fields.find(x=>spec?.id&&x.id===spec.id)||fields.find(x=>spec?.name&&x.name===spec.name);if(!e)e=(kind==='semester'?sem:exam);return e;}
const e=find(args.field,action==='choose-semester'?'semester':'exam');
if(!e)return JSON.stringify({state:'error',reason:'selector-missing'});
const option=[...e.options].find(o=>o.value===args.value);
if(!option)return JSON.stringify({state:'error',reason:'option-missing'});
const priorFingerprint=data.marksFingerprint;const changed=e.value!==args.value;e.value=args.value;
if(changed){e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
// Never touch Exam Name; college returns every assessment after Show.
return JSON.stringify({state:'selected',changed,value:args.value,priorFingerprint});
})()

/* Only run in first-party university WebView. Autofill the non-CAPTCHA roll/DOB fields.
 * Read neither verification codes nor passwords. Never submit. Support ASP.NET IDs. */
(function(roll,dob){'use strict';
 const norm=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]+/g,'');
 const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
 const all=[...document.querySelectorAll('input')].filter(e=>{
   const type=(e.type||'text').toLowerCase();return !e.disabled&&!e.readOnly&&!['hidden','submit','button','checkbox','radio','file','password','image'].includes(type) && (e.getClientRects().length||e.offsetWidth||e.offsetHeight);
 });
 function labels(e){
   const bits=[e.id,e.name,e.placeholder,e.title,e.getAttribute('aria-label'),e.labels?.[0]?.textContent,e.getAttribute('data-placeholder')];
   if(e.id){try{bits.push(document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent);}catch(_){}}
   let row=e.closest('tr'),cell=e.closest('td,th');
   if(row){const cells=[...row.children];const n=cell?cells.indexOf(cell):-1;if(n>=1)bits.push(cells[n-1]?.textContent);bits.push(row.querySelector('label')?.textContent);}
   if(cell)bits.push(cell.previousElementSibling?.textContent);
   let parent=e.parentElement;
   for(let i=0;i<2&&parent;i++,parent=parent.parentElement){bits.push(parent.querySelector(':scope > label')?.textContent);bits.push(parent.previousElementSibling?.textContent?.slice(0,80));}
   return bits.filter(Boolean).map(clean).join(' ');
 }
 const fields=all.map(e=>({e,label:labels(e),kind:norm([e.id,e.name,e.placeholder,e.getAttribute('aria-label')].filter(Boolean).join(' '))}));
 const unsafe=f=>/captcha|captch|securitycode|verificationcode|verifycode|otp|onetime|securityanswer|passw|verification|enterimagecode|answercode/i.test(norm(f.label));
 const safe=fields.filter(f=>!unsafe(f));
 const rollScore=f=>/roll(?:number|no|num)?|txtroll|universityroll|studentroll|studentid/i.test(norm(f.label))?10:0;
 const dobScore=f=>/dateofbirth|birthdate|txtdob|birth|dob/i.test(norm(f.label))?10:(f.e.type==='date'?4:0);
 const candidates=(score)=>safe.map(f=>({...f,score:score(f)})).filter(f=>f.score>0).sort((a,b)=>b.score-a.score);
 let rollField=candidates(rollScore)[0]?.e||null;
 let dobField=candidates(dobScore)[0]?.e||null;
 // A single unnamed textbox is a safe roll fallback only if the page itself clearly asks for a roll.
 if(!rollField&&safe.length===1&&/roll\s*(?:no|number)?\b/i.test(document.body?.innerText?.slice(0,1100)||''))rollField=safe[0].e;
 if(rollField===dobField)dobField=null;
 const hasResults=[...document.querySelectorAll('table')].some(t=>/\b(internal|external|sgpa|semester|grade)\b/i.test(t.textContent||'')&&/\b(subject|paper|result|student)\b/i.test(t.textContent||''));
 if(hasResults&&!rollField&&!dobField)return JSON.stringify({stage:'results',rollDone:false,dobDone:false,message:'AKTU result visible'});
 const digits=String(roll||'').replace(/\D/g,'');const valid=/^\d{8,16}$/.test(digits);
 const desiredDOB=/^\d{2}\/\d{2}\/\d{4}$/.test(dob||'')?dob:'';
 function set(e,value){if(!e||!value)return false;
   if(e.value?.trim())return e.value.trim()===value;
   const proto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
   if(proto?.set)proto.set.call(e,value);else e.value=value;
   e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
   return e.value===value;
 }
 const stage=dobField?'verification':rollField?'roll':'unknown';
 const rollDone=valid&&!!rollField&&set(rollField,digits);
 const dobVal=dobField&&desiredDOB?(dobField.type==='date'?desiredDOB.split('/').reverse().join('-'):desiredDOB):'';
 const dobDone=!!dobField&&!!dobVal&&set(dobField,dobVal);
 return JSON.stringify({stage,rollDone,dobDone,hasRoll:!!rollField,hasDob:!!dobField,rollReady:valid,dobReady:!!desiredDOB,message:!valid?'University roll number not available yet; sync your SIM profile.':stage==='roll'?'Roll number prefilled on first step.':stage==='verification'?(dobDone?'Roll number and DOB ready.':'Second step: DOB not yet available or field not detected.'):'University fields not recognized on this page.'});
})('__ROLL__','__DOB__')

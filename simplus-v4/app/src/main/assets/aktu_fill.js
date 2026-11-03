/* Run only on official AKTU One View HTTPS domains verified by Android.
 * Stage 1: university roll number only. Stage 2: roll number + DOB.
 * Never submits a form, touches CAPTCHA fields, or extracts credentials. */
(function(roll,dob){'use strict';
 const inputs=[...document.querySelectorAll('input')].filter(e=>!e.disabled&&!['hidden','submit','button','checkbox','radio','file'].includes((e.type||'').toLowerCase()) && (e.getClientRects().length||e.offsetWidth));
 const meta=e=>[e.name,e.id,e.placeholder,e.getAttribute('aria-label'),e.labels?.[0]?.textContent,e.closest('td')?.previousElementSibling?.textContent].filter(Boolean).join(' ').toLowerCase();
 const unsafe=e=>/captcha|security\s*code|verification\s*code|enter\s*code|otp|one\s*time|answer|pin|password|verify/i.test(meta(e));
 const rollFields=inputs.filter(e=>!unsafe(e)&&/\broll\s*(?:no\.?|number)?\b|university\s*roll|student\s*id/i.test(meta(e)));
 const dobFields=inputs.filter(e=>!unsafe(e)&&(/\bdate\s*of\s*birth\b|\bdob\b|birth\s*date/i.test(meta(e))));
 const hasResults=!![...document.querySelectorAll('table')].find(t=>/\b(?:internal|external|sgpa|semester|grade)\b/i.test(t.textContent||'')&&/\b(?:subject|paper|result|student)\b/i.test(t.textContent||''));
 if(hasResults&&!rollFields.length&&!dobFields.length)return JSON.stringify({stage:'results',rollDone:false,dobDone:false,message:'Result page ready for capture.'});
 const stage=dobFields.length?'verification':rollFields.length?'roll':'unknown';
 function set(e,value){if(!e||!value||unsafe(e))return false;if(e.value?.trim())return e.value.trim()===value;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if(setter)setter.call(e,value);else e.value=value;
  e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}
 const cleanRoll=String(roll||'').replace(/\D/g,'');const validRoll=/^\d{8,16}$/.test(cleanRoll);
 let rollDone=false,dobDone=false;
 if(validRoll&&rollFields.length)rollDone=set(rollFields[0],cleanRoll);
 if(stage==='verification'&&/^\d{2}\/\d{2}\/\d{4}$/.test(dob||'')){
  const f=dobFields[0];const value=f.type==='date'?dob.split('/').reverse().join('-'):dob;
  dobDone=set(f,value);
 }
 return JSON.stringify({stage,rollDone,dobDone,message:stage==='roll'?'Step 1: roll number ready. Submit on AKTU to continue.':stage==='verification'?'Step 2: roll number / DOB filled when available. Complete CAPTCHA and continue.':stage==='results'?'University result is ready for capture.':'Use the university form to continue; no matching fields found.'});
})('__ROLL__','__DOB__')
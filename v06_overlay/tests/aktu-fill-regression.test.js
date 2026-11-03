const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/aktu_fill.js'),'utf8');
class Input{
 constructor(id,type='text'){this.id=id;this.name='ctl00$ContentPlaceHolder1$'+id;this.type=type;this._value='';this.disabled=false;this.readOnly=false;this.offsetWidth=150;this.offsetHeight=25;this.labels=[];this.parentElement=null;this.placeholder='';this.title='';}
 get value(){return this._value;}set value(v){this._value=v;}
 getClientRects(){return [{}];}
 getAttribute(){return '';}
 dispatchEvent(ev){this.events=(this.events||[]).concat(ev.type);}
 closest(){return null;}
}
function check(roll,dob,stage){
 const rollField=new Input('txtRollNo'),dobField=new Input('txtDOB'),captcha=new Input('txtCaptcha');
 const controls=stage===1?[rollField,captcha]:[rollField,dobField,captcha];
 const doc={querySelectorAll(q){if(q==='input')return controls;if(q==='table')return [];return [];},querySelector(){return null;},body:{innerText:'Enter university roll number and verification code'}};
 const js=source.replace("'__ROLL__'",JSON.stringify(roll)).replace("'__DOB__'",JSON.stringify(dob));
 const actual=JSON.parse(vm.runInNewContext(js,{document:doc,HTMLInputElement:Input,Event:class {constructor(type){this.type=type;}}}));
 assert.equal(rollField.value,roll);assert.equal(captcha.value,'');
 if(stage===2)assert.equal(dobField.value,dob);
 assert.equal(actual.stage,stage===1?'roll':'verification');
}
check('2501921530099','08/02/2007',1);
check('2501921530099','08/02/2007',2);
console.log('AKTU autofill regression passed: both stages and CAPTCHA protected');

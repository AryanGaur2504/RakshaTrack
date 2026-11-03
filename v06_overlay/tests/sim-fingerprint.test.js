const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/result_scan.js'),'utf8');
const option=(value,text)=>({value,textContent:text});
const mkField=(id,options)=>({id,name:id,value:'S1',options,disabled:false,offsetWidth:100,getClientRects(){return [{}];},closest(){return {previousElementSibling:{textContent:id},textContent:id};},parentElement:{textContent:id},dispatchEvent(){}});
const sem=mkField('semester',[option('S1','Sem I'),option('S2','Sem II'),option('S3','Sem III')]);
const exam=mkField('exam',[option('','--Select--'),option('E1','Sessional 1')]);exam.value='';
let subjects=['Engineering Chemistry', 'Mathematics I'];
const cell=value=>({textContent:value,closest(){return table;}});
let table;
function buildTable(){const rows=[['Subject Name','Marks Obtained'],...subjects.map((s,i)=>[s,String(i*10+50)])].map(values=>({textContent:values.join(' '),querySelectorAll(){return values.map(cell);},closest(){return table;}}));table={offsetWidth:100,getClientRects(){return [{}];},querySelector(sel){return rows[0];},querySelectorAll(){return rows;}};return table;}
const btn={value:'Show',offsetWidth:100,getClientRects(){return [{}];},click(){}};
const document={querySelector(){return null;},querySelectorAll(q){if(q==='select')return [sem,exam];if(q==='table')return [buildTable()];if(q.includes('button'))return [btn];return [];}};
const run=(action,args={})=>JSON.parse(vm.runInNewContext(source.replace("'__ACTION__'",JSON.stringify(action)).replace('__ARGS__',JSON.stringify(args)),{document,Event:class{constructor(type){this.type=type;}}}));
const first=run('inspect');assert.equal(first.hasMarks,true);assert.ok(first.marksFingerprint);
run('choose-semester',{field:first.semester,value:'S2'});
const old=run('inspect');assert.equal(old.marksFingerprint,first.marksFingerprint,'Selector change cannot prove the marks changed');
subjects=['Python Programming','Data Structure'];
const fresh=run('inspect');assert.notEqual(fresh.marksFingerprint,first.marksFingerprint,'Fresh marks table has a distinct fingerprint');
console.log('SIM fingerprint regression passed');

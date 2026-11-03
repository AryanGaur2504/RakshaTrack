/* Official result-table interpreter. Input is an authenticated WebView DOM snapshot.
   No invented marks, no external service. Tests use isolated fixture snapshots. */
(function(root){'use strict';
const str=v=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,400);
const norm=v=>str(v).toLowerCase();
const index=(row,re)=>row.findIndex(x=>re.test(norm(x)));
const val=(row,i)=>i<0?'':str(row[i]);
const safeNum=s=>{const v=str(s);return /^-?\d+(?:\.\d+)?$/.test(v)?v:'';};
function clean(s){return str(s).replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,130);}
const uniqueKey=(parts)=>parts.map(x=>norm(x).replace(/[^a-z0-9]+/g,'-').slice(0,65)).join('|');
function pick(name,re){const m=str(name).match(re);return m?str(m[0]):'';}
function getContext(snapshot,ti){const d=Array.isArray(snapshot.tableMeta)?snapshot.tableMeta[ti]:null;return String([d?.heading,d?.semesterContext].filter(Boolean).join(' | ')).replace(/\s+/g,' ').trim().slice(-2600);}
function info(snapshot,scope){
 const selections=Array.isArray(snapshot.selections)?snapshot.selections:[];
 const all=str([snapshot.title,snapshot.headings?.join(' '),snapshot.pageSummary,scope].join(' '));
 const findOption=re=>{const f=selections.find(s=>re.test(norm([s.label,s.name,s.id].join(' ')))&&s.valueText&&!/select|choose|^-+$/i.test(s.valueText.trim()));return str(f?.valueText||'');};
 const semester=str(snapshot.scanContext?.semester||'') || findOption(/semester|sem\b/) || pick(scope||all,/\b(?:semester|sem)\s*[-:]?\s*(?:\d{1,2}|i{1,4}|iv|v|vi{0,3}|ix|x)\b/i) || pick(all,/\b(?:semester|sem)\s*[-:]?\s*(?:\d{1,2}|i{1,4}|iv|v|vi{0,3}|ix|x)\b/i);
 const exam=str(snapshot.scanContext?.exam||'') || findOption(/exam(ination)?\s*(type|name)?|assessment|test|sessional/) || pick(scope,/\b(?:regular|carry\s*over|back\s*paper|improvement|sessional\s*\d|mid\s*term\s*\d|end\s*term|class\s*test\s*\d|put\s*\d|ct\s*\d)\b/i) || pick(all,/\b(?:regular|carry\s*over|back\s*paper|improvement|sessional\s*\d|mid\s*term\s*\d|end\s*term|class\s*test\s*\d|put\s*\d|ct\s*\d)\b/i);
 const session=findOption(/session|academic\s*year|year/) || pick(all,/\b20\d{2}\s*[-/]\s*(?:20)?\d{2}\b/);
 return {semester,exam,session};
}
function aktuMeta(context){
 const text=String(context||'');
 const take=re=>{const ms=[...text.matchAll(re)];return ms.length?str(ms[ms.length-1][1]):'';};
 const digit=take(/\bSemester\s*[:\-]\s*(\d{1,2}|[IVX]{1,5})\b/gi);
 const sgpa=take(/\bSGPA\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi);
 const cgpa=take(/\bCGPA\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi);
 const status=take(/\bResult\s*Status\s*[:\-]?\s*(CP\s*\(\d+\)|PWG|PASS|FAIL|PROMOTED|CARRY\s*OVER|WITHHELD|PENDING|ABSENT|BACK)/gi);
 const marksTotal=take(/\bMarks\s*[:\-]\s*(\d+\s*\/\s*\d+)/gi);
 const resultDate=take(/\bDate\s*of\s*Declaration\s*[:\-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi);
 const session=take(/\bSession\s*[:\-]\s*(\d{4}\s*[-/]\s*(?:\d{2}|\d{4})(?:\s*\([^)]*\))?)/gi);
 return {semester:digit?'Semester '+digit:'',sgpa,cgpa,status,marksTotal,resultDate,session};
}
function sgpaData(snapshot){const all=str([snapshot.pageSummary,snapshot.headings?.join(' '),...(snapshot.tables||[]).flat().filter(Array.isArray).map(x=>x.join(' '))].join(' ').slice(0,20000));const extract=re=>{const m=all.match(re);return m?str(m[1]):'';};return {sgpa:extract(/\bSGPA\s*[:\-]?\s*(\d+(?:\.\d+)?)/i),cgpa:extract(/\bCGPA\s*[:\-]?\s*(\d+(?:\.\d+)?)/i),status:extract(/\b(?:final\s+result|result\s+status|status)\s*[:\-]?\s*(PASS|FAIL|PROMOTED|PWG|CARRY\s*OVER|WITHHELD|PENDING|ABSENT|BACK)/i)};}
function findHeader(rows){for(let i=0;i<Math.min(rows.length,10);i++){
 const r=rows[i];const name=index(r,/^(name|subject|subject name|paper|paper name|course name|subject\/paper|subject title|name of the subject|subject name & code)$/);
 const code=index(r,/^(subject code|paper code|course code|code)$/);
 const marks=index(r,/^(marks|marks obtain(?:ed)?|obtained|total marks obtained|marks scored|obt\. marks|total obtained)$/);
 const internal=index(r,/^(internal|sessional|internal marks|internal assessment|ia|sessi?onal marks)$/);
 const external=index(r,/^(external|external marks|end sem|end semester|ese|theory|practical)$/);
 const grade=index(r,/^(grade|letter grade|grade letter|lg)$/);
 const credits=index(r,/^(credit|credits)$/);
 const status=index(r,/^(result|status|remark|remarks)$/);
 const minimum=index(r,/^(min(?:imum)? marks|min)$/);
 const maximum=index(r,/^(max(?:imum)? marks|total marks|maximum|out of|max)$/);
 const examType=index(r,/^(exam type|examination type|assessment type|test type)$/);
 const marksType=index(r,/^(marks type|paper type)$/);
 const examMonth=index(r,/^(exam month|examination month|month of exam)$/);
 const backPaper=index(r,/^(back paper|backpaper|carry over|back paper marks)$/);
 const subjectType=index(r,/^(type|subject type|paper category)$/);
 const valid=(name>=0||code>=0)&&(marks>=0||grade>=0||internal>=0||external>=0||status>=0||maximum>=0);
 if(valid)return {i,name,code,marks,internal,external,grade,credits,status,minimum,maximum,examType,marksType,examMonth,backPaper,subjectType};
}return null;}
function parseSubjects(rows,h){const subjects=[];for(let i=h.i+1;i<rows.length&&subjects.length<90;i++){
 const r=rows[i];if(!r||r.length<=Math.max(h.name,h.code))continue;
 let name=clean(val(r,h.name)),code=clean(val(r,h.code));if(!name&&!code)continue;
 if(!code&&name){const m=name.match(/^(.*?)\s*\(([A-Za-z0-9./\-]+)\)\s*$/);if(m){name=m[1].trim();code=m[2].trim();}}
 if(/^(total|grand total|overall|aggregate|sgpa|cgpa|total marks|result|semester)$/i.test(name))continue;
 const result=clean(val(r,h.status)),grade=clean(val(r,h.grade));
 const internal=safeNum(val(r,h.internal)),external=safeNum(val(r,h.external));
 const directMarks=clean(val(r,h.marks)); const marks=directMarks||((internal||external)?`${internal||'—'} + ${external||'—'}`:'');
 const minimum=clean(val(r,h.minimum)),maximum=clean(val(r,h.maximum)),total=maximum?`${marks}${marks?' / ':''}${maximum}`:'';
 if(!marks&&!grade&&!result)continue;
 subjects.push({name:name||code,code,marks,grade,credits:clean(val(r,h.credits)),total,result,internal,external,minMarks:minimum,maxMarks:maximum,examType:clean(val(r,h.examType)),marksType:clean(val(r,h.marksType)),examMonth:clean(val(r,h.examMonth)),backPaper:clean(val(r,h.backPaper)),subjectType:clean(val(r,h.subjectType))});
}return subjects;}
function parseSummaryRows(rows,source,info,defaults){const found=[];
 for(let i=0;i<Math.min(rows.length,10);i++){
  const row=rows[i];const sem=index(row,/^(sem|semester)$/),status=index(row,/^(result|result status|status)$/),sgpa=index(row,/^sgpa$/),cgpa=index(row,/^cgpa$/);
  if(sem<0||(status<0&&sgpa<0&&cgpa<0))continue;
  for(const r of rows.slice(i+1,i+25)){
    const semester=clean(val(r,sem));if(!semester||!/(?:sem|\d|i)/i.test(semester))continue;
    const item={source,semester,exam:info.exam||'University result',session:info.session,sgpa:clean(val(r,sgpa)),cgpa:clean(val(r,cgpa)),status:clean(val(r,status)),subjects:[]};
    if(!item.sgpa&&!item.cgpa&&!item.status)continue;
    item.id=uniqueKey([source,item.semester,item.exam,item.session]);found.push(item);
  }break;
 }return found;
}
function parseSnapshot(raw,source){if(typeof raw==='string')raw=JSON.parse(raw);if(!raw||!Array.isArray(raw.tables))throw Error('Invalid result snapshot');if(!['college','aktu'].includes(source))throw Error('Unknown result source');
 const defaults=sgpaData(raw),results=[];
 for(let ti=0;ti<Math.min(raw.tables.length,65);ti++){
  const rows=(Array.isArray(raw.tables[ti])?raw.tables[ti]:[]).map(r=>Array.isArray(r)?r.map(clean):[]).filter(r=>r.some(Boolean));if(!rows.length)continue;
  const scope=getContext(raw,ti),infoRow=info(raw,scope),header=findHeader(rows);
  const near=source==='aktu'?aktuMeta(scope):{};
  if(source==='aktu'&&near.semester)infoRow.semester=near.semester;
  if(source==='aktu'&&near.session)infoRow.session=near.session;
  if(header){const subjects=parseSubjects(rows,header);if(!subjects.length)continue;const r={source,...infoRow,sgpa:near.sgpa||((source==='college'||!near.semester)?defaults.sgpa:''),cgpa:near.cgpa||((source==='college'||!near.semester)?defaults.cgpa:''),
    status:near.status||((source==='college'||!near.semester)?defaults.status:''),marksTotal:near.marksTotal||'',resultDate:near.resultDate||'',subjects};r.id=uniqueKey([source,r.semester,r.exam,r.session]);
    if(results.some(x=>x.id===r.id)){
      const prev=results.find(x=>x.id===r.id);const subjectKey=s=>uniqueKey([s.code||s.name,s.examType,s.marksType,s.examMonth]);const bySubject=new Map(prev.subjects.map(s=>[subjectKey(s),s]));subjects.forEach(s=>bySubject.set(subjectKey(s),s));prev.subjects=[...bySubject.values()];
    }else results.push(r);
  } else results.push(...parseSummaryRows(rows,source,infoRow,defaults));
 }
 // Avoid claiming an empty results page is a valid result.
 const byId=new Map();for(const r of results){if(!r.subjects.length&&!r.sgpa&&!r.cgpa&&!r.status)continue;const old=byId.get(r.id);if(!old)byId.set(r.id,r);
 else if(r.subjects.length){const unique=s=>uniqueKey([s.code||s.name,s.examType,s.examMonth,s.subjectType]);
 const combined=new Map((old.subjects||[]).map(s=>[unique(s),s]));r.subjects.forEach(s=>combined.set(unique(s),s));
 old.subjects=[...combined.values()];for(const k of ['sgpa','cgpa','status','marksTotal','resultDate'])if(!old[k]&&r[k])old[k]=r[k];}}
 return {results:[...byId.values()],warnings:byId.size?[]:['No recognizable subject-marks or result-summary table was found.']};
}
const api={parseSnapshot,findHeader,parseSubjects};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SimExams=api;
})(typeof module!=='undefined'&&module.exports?module.exports:window);
const fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.join(__dirname,'../app/src/main/assets');
const dom=new Map(),storage=new Map();
function el(id){if(!dom.has(id))dom.set(id,{innerHTML:'',textContent:'',value:'',classList:{values:new Set(),toggle(v,on){on?this.values.add(v):this.values.delete(v);},add(v){this.values.add(v);},remove(v){this.values.delete(v);}},style:{}});return dom.get(id);}
let invoked=0;
const win={scrollTo(){},Native:{importRoster(){invoked++;}}};
const ctx=vm.createContext({window:win,Native:win.Native,document:{body:{classList:{toggle(){}}},getElementById:el},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(){return 1},clearTimeout(){},confirm(){return true},prompt(){return ''},Date,Number,Math,String,Object,Array,Map,Set,JSON,console,URL});
for(const file of ['engine.js','exam_engine.js','app.js'])vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),ctx,{filename:file});
win.onRosterLoaded({students:[],selected:-1});
win.importStudentExcel();
if(invoked!==1||!el('rosterGate').innerHTML.includes('Choose an Excel'))throw Error('Import picker not invoked');
win.onRosterImportStarted();
if(!el('rosterGate').innerHTML.includes('Reading workbook'))throw Error('Missing visible progress');
win.onRosterImportError('Column A must contain Name');
if(!el('rosterGate').innerHTML.includes('Column A must contain Name')||!el('rosterGate').innerHTML.includes('Select another Excel'))throw Error('Import error hidden behind overlay');
win.onRosterImportStarted();
win.onRosterImported({selected:0,students:[{index:0,name:'A Student',roll:'5432109876'}],student:{name:'A Student',roll:'5432109876'}});
if(el('rosterGate').classList.values.has('hidden')===false||!el('studentBanner').innerHTML.includes('A Student'))throw Error('Successful import did not reveal student selector');
console.log('Excel import error/progress and student selection UI regression passed');

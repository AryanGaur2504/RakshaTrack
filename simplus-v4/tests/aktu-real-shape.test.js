const assert=require('node:assert/strict');
const X=require('../app/src/main/assets/exam_engine.js');
// Synthetic fields with the real One View column order, not real candidate data.
const snap={title:'AKTU-One-View',headings:['One View Result'],tables:[
 [['Code','Name','Type','Internal','External','Back Paper','Grade'],
 ['T101','Applied Mathematics','Theory','25','24','--','D'],['P101','Programming Lab','Practical','39','45','--','A']],
 [['Code','Name','Type','Internal','External','Back Paper','Grade'],
 ['T201','Advanced Mathematics','Theory','22','31','--','B']],
],tableMeta:[
 {semesterContext:'Session : 2023-24(REGULAR) Semesters : 1 Result : Marks :606/900 COP : Semester : 1 Odd SGPA : 6.68 Result Status : CP (0) Date of Declaration : 25/06/24'},
 {semesterContext:'Session : 2023-24(REGULAR) Semesters : 2 Result : Marks :712/900 COP : Semester : 2 Even SGPA : 7.76 Result Status : PASS Date of Declaration : 05/11/24'},
]};
const items=X.parseSnapshot(snap,'aktu').results;
assert.equal(items.length,2,JSON.stringify(items));
assert.equal(items[0].semester,'Semester 1');
assert.equal(items[1].semester,'Semester 2');
assert.equal(items[0].sgpa,'6.68');
assert.equal(items[1].sgpa,'7.76');
assert.equal(items[0].marksTotal,'606/900');
assert.equal(items[1].marksTotal,'712/900');
assert.equal(items[0].subjects.length,2);
assert.equal(items[0].subjects[0].internal,'25');
assert.equal(items[0].subjects[0].external,'24');
assert.equal(items[0].subjects[0].subjectType,'Theory');
assert.equal(items[0].subjects[0].backPaper,'--');
assert.equal(items[0].resultDate,'25/06/24');
// If an empty unreleased semester is present, it is never fabricated.
assert.equal(X.parseSnapshot({...snap,tables:[snap.tables[0], [['Semester','Even'],['Result Status','']]],tableMeta:[snap.tableMeta[0],{semesterContext:'Semester : 2 SGPA : 0'}]},'aktu').results.length,1);
console.log('AKTU two-semester subject schema passed');
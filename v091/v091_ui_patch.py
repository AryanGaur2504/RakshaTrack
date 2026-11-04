from pathlib import Path
p=Path('app/src/main/assets/app.js')
s=p.read_text()
old="rangeEnd:now(),semesterPct:null,monthly:[],subjectPcts:[]"
new="rangeEnd:now(),aktuNotice:'',semesterPct:null,monthly:[],subjectPcts:[]"
assert old in s
s=s.replace(old,new,1)
old=''' return `<div class="home-workspace stack">
  <div class="home-attendance-panel">'''
new=''' return `<div class="home-workspace stack">
  ${state.aktuNotice?`<div class="info-box" role="status"><strong>AKTU temporarily unavailable</strong><p>${esc(state.aktuNotice)}</p><div class="actions" style="margin-top:9px"><button class="action small" onclick="setExamTab('aktu');navigate('results')">Retry from Results</button><button class="action small ghost" onclick="dismissAktuNotice()">Dismiss</button></div></div>`:''}
  <div class="home-attendance-panel">'''
assert old in s
s=s.replace(old,new)
old='''  <div class="result-brief">${matching.length?'''
new='''  ${selected&&state.aktuNotice?`<div class="info-box" role="status">${esc(state.aktuNotice)} <button class="action small" onclick="openAktu()">Retry AKTU One View</button></div>`:''}
  <div class="result-brief">${matching.length?'''
assert old in s
s=s.replace(old,new)
old="window.setExamTab=x=>{if(!['college','aktu'].includes(x))return;examTab=x;render();};"
new=old+"\nwindow.dismissAktuNotice=()=>{state.aktuNotice='';persist();render();};"
assert old in s
s=s.replace(old,new)
old=''' state.start=date;state.setup=true;persist();'''
new=''' state.start=date;state.setup=true;state.aktuNotice='';persist();'''
assert old in s
s=s.replace(old,new)
p.write_text(s)
print('app.js updated with persistent AKTU outage notice and retry button')
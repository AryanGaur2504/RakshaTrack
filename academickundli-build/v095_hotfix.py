from pathlib import Path
root=Path("build-input/AcademicKundli_v0.9.4")
assets=root/"app/src/main/assets"
app=assets/"app.js"
src=app.read_text()
def change(before,after):
 global src
 if src.count(before)!=1: raise RuntimeError("Unexpected source shape: "+before[:95])
 src=src.replace(before,after)
change("const STAR_ROOT='academickundli:v1:starred:', VERSION='AcademicKundli 0.9.4';",
       "const STAR_ROOT='academickundli:v1:starred:', THEME_PREF='academickundli:v1:theme', VERSION='AcademicKundli 0.9.5';")
change("const PAGES={home:",
       "let themeDark=localStorage.getItem(THEME_PREF)==='dark'||(localStorage.getItem(THEME_PREF)===null&&!!state.dark);\nconst PAGES={home:")
change("state={...defaultState,rangeEnd:now(),...record,profile:{...defaultState.profile,...(record.profile||{})}};",
       "state={...defaultState,rangeEnd:now(),...record,dark:themeDark,profile:{...defaultState.profile,...(record.profile||{})}};")
change("function consumeRoster(snapshot){\n hideSplash();",
       "function consumeRoster(snapshot){\n const leavingPreview=viewOnly;\n hideSplash();")
change("if(wasActive){persist();persistResults();}",
       "if(wasActive&&!leavingPreview){persist();persistResults();}")
change("window.onRosterSelected=s=>{viewOnly=false;previewPerson=null;consumeRoster(s);onboardingError='';};",
       "window.onRosterSelected=s=>{consumeRoster(s);onboardingError='';};")
change("window.backToPrimary=()=>{viewOnly=false;previewPerson=null;native('endRosterPreview');};",
       "window.backToPrimary=()=>{if(isReadOnly())native('endRosterPreview');};")
change("window.onLoggedOut=()=>{viewOnly=false;previewPerson=null;primaryKey='';primaryProfile=null;pendingStarRefresh='';state.workspaceReady=false;persist();page='home';native('requestRoster');};",
       "window.onLoggedOut=()=>{if(!isReadOnly())persist();viewOnly=false;previewPerson=null;primaryKey='';primaryProfile=null;pendingStarRefresh='';starred={};state.workspaceReady=false;page='home';studentSearchOpen=false;render();native('requestRoster');toast('Logged out. Choose another student ID to sign in.');};")
change("captureStarSnapshot(id);maybeFetchStar(id);toast('Student starred. Attendance/results are captured once, with official login if required.');",
       "captureStarSnapshot(id);if(!starred[id].hasAttendance&&!starred[id].hasResults)maybeFetchStar(id);else toast('Saved synchronized data. No new login required.');")
change("window.logout=()=>{if(isReadOnly())return toast('Back to my profile before logging out.');if(!confirm('Log out of the primary ERP session? Your starred offline snapshots will remain saved on this device.'))return;native('logoutPrimary');};",
       "window.logout=()=>{if(!primaryKey)return toast('Not logged in.');if(!confirm('Log out of the ERP session? Starred local snapshots are preserved.'))return;if(!native('logoutPrimary'))toast('Logout requires Android.');};")
change("function render(){document.body.classList.toggle('darkmode',state.dark);renderNav();",
       "function render(){document.body.classList.toggle('darkmode',themeDark);if(document.documentElement)document.documentElement.style.colorScheme=themeDark?'dark':'light';renderNav();")
change("document.getElementById('themeToggle').textContent=state.dark?'☀':'◐';",
       "document.getElementById('themeToggle').textContent=themeDark?'☀':'◐';")
change("document.getElementById('studentBanner').style.display=isReadOnly()||page==='profile'?'':'none';",
       "document.getElementById('studentBanner').style.display=isReadOnly()||page==='profile'?'block':'none';")
change("window.toggleTheme=()=>{if(isReadOnly())return toast('Settings are disabled in read-only view.');state.dark=!state.dark;persist();render();};",
       "window.toggleTheme=()=>{if(isReadOnly())return toast('Read-only view.');themeDark=!themeDark;state.dark=themeDark;localStorage.setItem(THEME_PREF,themeDark?'dark':'light');persist();render();};")
# Replace the old dense About panel with a cleaner, professional hierarchy.
a=src.index("function aboutView(){")
b=src.index("window.logout=()=>",a)
tick=chr(96)
about=('<div class="stack about-page"><section class="panel about-hero"><img src="logo.svg" class="about-logo" alt="AcademicKundli">'
 '<span class="about-overline">ACADEMIC COMPANION</span><h2>AcademicKundli</h2>'
 '<p class="about-version">Version 0.9.5 · Android</p><p class="about-lead">Attendance, results and academic records in a private, focused workspace.</p>'
 '<div class="about-credit"><small>DEVELOPED BY</small><strong>Aryan Gaur</strong></div></section>'
 '<section class="panel about-section"><h3>What AcademicKundli does</h3>'
 '<p>Track attendance, browse published SIM and AKTU exam results, and store starred student snapshots on this device.</p></section>'
 '<section class="panel about-section"><h3>Privacy &amp; access</h3>'
 '<p>Switch Student is view-only; it does not change your authenticated identity. Offline starred records update only when you choose Refresh.</p>'
 '<p>AcademicKundli is an independent, unofficial GL Bajaj companion. College SIM and AKTU remain the official sources.</p></section>'
 '<section class="panel about-section"><h3>Account</h3><p>To sign in as another student, log out and choose a different ID.</p>'
 '<div class="actions"><button class="action ghost" onclick="logout()">Log out</button></div></section>'
 '<p class="about-foot">Developed by Aryan Gaur</p></div>')
src=src[:a]+"function aboutView(){return "+tick+about+tick+";}\n"+src[b:]
app.write_text(src)
css=assets/"style.css"
css.write_text(css.read_text()+r"""

/* v0.9.5: consistent indigo/gold theme and visible student switcher */
:root{--brand-gold:#c99b45;--surface:var(--panel);--card:var(--panel);--soft:var(--panel2)}
.roster-banner{display:block;scroll-margin-top:16px}
.starred-row{background:var(--panel);border-color:var(--line)}
.about-page{max-width:750px;margin:auto;gap:15px}
.about-hero{padding:35px 24px!important;text-align:center;display:flex;align-items:center;flex-direction:column}
.about-logo{width:90px;height:90px;border-radius:22px;box-shadow:0 12px 35px #1410392a}
.about-overline{font-size:10px;font-weight:800;letter-spacing:.16em;color:var(--indigo);margin:20px 0 9px}
.about-hero h2{margin:0;font-size:30px;font-weight:900;letter-spacing:-.05em}
.about-version{font-size:12px;color:var(--sub);margin-top:8px}
.about-lead{max-width:480px;color:var(--sub);font-size:13px;line-height:1.7}
.about-credit{border-top:1px solid var(--line);padding-top:15px;margin-top:12px;display:flex;flex-direction:column;gap:6px;width:65%;align-items:center}
.about-credit small{font-size:10px;letter-spacing:.12em;color:var(--sub)}
.about-credit strong{color:var(--ink)}
.about-section h3{margin:0 0 11px;font-size:15px}
.about-section p{font-size:12px;line-height:1.75;color:var(--sub)}
.about-foot{text-align:center;color:var(--sub);font-size:11px}
body.darkmode{--bg:#0e1120;--panel:#1b2035;--panel2:#242a42;--ink:#f5f4ff;--sub:#b8bed4;--line:#39405d;--muted:#949dbb;--nav:#0b1020;--indigo:#a49bff;--indigo-soft:#343457;--surface:#1b2035;--card:#1b2035;--soft:#242a42;--edge:#39405d;--text:#f5f4ff;--border:#39405d;color-scheme:dark;background:var(--bg)}
body.darkmode .main{background:var(--bg)!important;color:var(--ink)}
body.darkmode .panel,body.darkmode .nav-card,body.darkmode .roster-toolbar,body.darkmode .starred-row,
body.darkmode .course-info,body.darkmode .home-actions button,body.darkmode .attention-card,body.darkmode .refresh-panel,
body.darkmode .result-sem-modern,body.darkmode .college-subject-group,body.darkmode .subject-result-card{
background:var(--panel)!important;border-color:var(--line)!important;color:var(--ink)!important}
body.darkmode h2,body.darkmode h3,body.darkmode h4,body.darkmode .home-actions strong,
body.darkmode .course-info strong,body.darkmode .subject-group-title h4{color:var(--ink)!important}
body.darkmode .roster-gate{background:var(--bg)!important}
body.darkmode .welcome-stage{color:var(--ink)!important}
body.darkmode .welcome-steps>div,body.darkmode .welcome-student,body.darkmode .welcome-selected,
body.darkmode .connect-form,body.darkmode .welcome-search,body.darkmode .student-search-row{
background:var(--panel)!important;color:var(--ink)!important;border-color:var(--line)!important}
body.darkmode input,body.darkmode select,body.darkmode textarea{background:var(--panel2)!important;color:var(--ink)!important;border-color:var(--line)!important}
body.darkmode .action.ghost{background:var(--panel2)!important;color:var(--ink)!important;border-color:var(--line)!important}
body.darkmode .badge,body.darkmode .semester-pill,body.darkmode .grade-bubble,body.darkmode .assessment-card,
body.darkmode .result-summary-pills>div,body.darkmode .subject-list .result-values>div,
body.darkmode .result-values>div{background:var(--panel2)!important;color:var(--ink)!important;border-color:var(--line)!important}
body.darkmode .sgpa-highlight{background:#302f58!important;border-color:#484677!important}
body.darkmode .sgpa-highlight strong{color:#dedaff!important}
body.darkmode .segmented,body.darkmode .result-switch{background:#272e49!important}
body.darkmode .segmented button.active,body.darkmode .result-switch button.current{background:#3a3b62!important;color:#fff!important}
body.darkmode .view-only-banner{background:#382f30;color:#ffdfa0;border-color:#796044}
body.darkmode .round-button,body.darkmode .sheet{background:var(--panel)!important;color:var(--ink)}
body.darkmode .about-section p,body.darkmode .subtle,body.darkmode .tiny-line,body.darkmode .footer{color:var(--sub)!important}
body.darkmode .home-attendance-panel{background:linear-gradient(135deg,#39327d,#22295b)}
""")
java=root/"app/src/main/java/com/campus/simplus/MainActivity.java"
j=java.read_text()
before='if(viewOnly){message("Back to your profile before logging out");return;}'
assert j.count(before)==1
j=j.replace(before,'viewOnly=false;',1)
before='''            appView.evaluateJavascript("window.onLoggedOut();",null);
        });'''
assert j.count(before)==1
j=j.replace(before,'''        });''',1)
before='''        CookieManager.getInstance().removeAllCookies(removed -> {'''
assert j.count(before)==1
j=j.replace(before,'''        // Clear UI immediately; the cookie callback handles cleanup separately.
        appView.evaluateJavascript("window.onLoggedOut();",null);
        CookieManager.getInstance().removeAllCookies(removed -> {''',1)
java.write_text(j)
gradle=root/"app/build.gradle"
gradle.write_text(gradle.read_text().replace("versionCode 18","versionCode 19").replace("versionName '0.9.4'","versionName '0.9.5'"))
readme=root/"README.md"
readme.write_text(readme.read_text().replace("v0.9.4","v0.9.5")+
 "\n## v0.9.5 fixes\nLogout restored, switcher unhidden, dark styling unified, About redesigned, synchronized starring no longer opens login.\n")
test=root/"tests/academickundli-primary-starred.test.js"
t=test.read_text().replace("length,1,'Star fetch must happen once only'","length,0,'Star must not reauth when already synced'").replace("length,1,'Open must never fetch again'","length,0,'Open must never fetch again'").replace("length,1,'Cannot fetch another student with primary credentials'","length,0,'Cannot fetch another student with primary credentials'")
test.write_text(t)

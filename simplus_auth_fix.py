from pathlib import Path
p=Path('app/src/main/java/com/campus/simplus/MainActivity.java')
s=p.read_text()
old='private static final String ERP = "https://glbg.servergi.com:8072/ISIMGLB/home";'
assert old in s
s=s.replace(old, 'private static final String LOGIN = "https://glbg.servergi.com:8072/ISIMGLB/Login";\n    '+old)
old='private String pendingFrom = null, pendingTo = null;'
assert old in s
s=s.replace(old, old+'''
    private boolean collegeAuthenticated=false;
    private String afterLoginUrl=null;
    private Runnable afterLoginAction=null;
    private String lastProtectedUrl=ERP;
    private int authProbeGeneration=0;
''')
old='''            @Override public void onPageFinished(WebView view, String url) {
                browserTitle.setText(url.contains("ExamResult") ? "College exam results" : (url.contains("Course") ? "Academic profile" : (url.contains("aktu.ac.in") ? "AKTU One View" : (url.contains("TodayAttendence") ? "Today\\u0027s Attendance" : "Official SIM ERP"))));
                if(academics!=null)academics.onPageFinished(url);
                if (!autoActive && pendingFrom != null && url.toLowerCase(Locale.ROOT).contains("attend")) prefillDates(pendingFrom, pendingTo);
                if (autoActive) scheduleAuto(900);
                super.onPageFinished(view, url);
            }'''
assert old in s,'page-finished block changed'
new='''            @Override public void onPageFinished(WebView view, String url) {
                browserTitle.setText(url.contains("ExamResult") ? "College exam results" : (url.contains("Course") ? "Academic profile" : (url.contains("aktu.ac.in") ? "AKTU One View" : (url.contains("TodayAttendence") ? "Today's Attendance" : "Official SIM ERP"))));
                Uri u=Uri.parse(url);
                if(AcademicFeatures.isCollege(u)) verifyLogin(url);
                else if(academics!=null) academics.onPageFinished(url);
                super.onPageFinished(view,url);
            }'''
s=s.replace(old,new)
old='''        erpView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished'''
assert old in s
s=s.replace(old,'''        erpView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){
                Uri u=Uri.parse(url);
                if(isProtected(u))lastProtectedUrl=url;
                if(isLogin(u)&&collegeAuthenticated){
                    collegeAuthenticated=false;
                    if(afterLoginAction==null){
                        if(autoActive){afterLoginUrl=TODAY;afterLoginAction=()->scheduleAuto(700);}
                        else {afterLoginUrl=lastProtectedUrl;afterLoginAction=()->{};}
                    }
                }
                super.onPageStarted(view,url,icon);
            }
            @Override public void onPageFinished''')
start=s.index('    private void showToday() {')
end=s.index('    /** Fill only visible attendance',start)
s=s[:start]+'''    private boolean isLogin(Uri u){
        return AcademicFeatures.isCollege(u)&&"/ISIMGLB/Login".equalsIgnoreCase(u.getPath());
    }
    private boolean isProtected(Uri u){
        return AcademicFeatures.isCollege(u) && u.getPath()!=null &&
                (u.getPath().equalsIgnoreCase("/ISIMGLB/home") ||
                 u.getPath().startsWith("/ISIMGLB/Student/"));
    }
    /** Authentication always begins at the official /ISIMGLB/Login page. */
    private void requireCollegeLogin(String destination,Runnable action){
        Uri u=Uri.parse(destination);
        if(!isProtected(u)){message("Invalid SIM destination");return;}
        browserContainer.setVisibility(View.VISIBLE);
        if(collegeAuthenticated){action.run();return;}
        afterLoginUrl=destination;afterLoginAction=action;
        browserTitle.setText("SIM Login · enter CAPTCHA");
        String now=erpView.getUrl();
        if(now==null || !isLogin(Uri.parse(now))) erpView.loadUrl(LOGIN);
    }
    private void verifyLogin(String url){
        Uri u=Uri.parse(url);
        int generation=++authProbeGeneration;
        String probe="(function(){const password=!!document.querySelector('input[type=password]');"+
             "const body=(document.body?.innerText||'').slice(0,12000);"+
             "const usable=body.trim().length>25 && /student|attendance|semester|dashboard|course|result/i.test(body)"+
             " && !/Web page not available|ERR_CONNECTION|HTTP ERROR|access denied/i.test(body);"+
             "return JSON.stringify({login:password,usable:usable});})()";
        erpView.evaluateJavascript(probe,raw->{
            if(generation!=authProbeGeneration||!url.equals(erpView.getUrl()))return;
            try{
                JSONObject data=new JSONObject((String)new JSONTokener(raw).nextValue());
                if(isLogin(u)||data.optBoolean("login")){
                    collegeAuthenticated=false;
                    browserTitle.setText("Official ERP Login · solve CAPTCHA");
                    if(autoActive)notifyApp("Sign in on /ISIMGLB/Login to resume sync",false);
                    if(!isLogin(u)){
                        afterLoginUrl=url;
                        erpView.loadUrl(LOGIN);
                    }
                    return;
                }
                if(!isProtected(u)||!data.optBoolean("usable")){
                    collegeAuthenticated=false;
                    browserTitle.setText("ERP login not verified");return;
                }
                collegeAuthenticated=true;
                if(afterLoginUrl!=null){
                    String next=afterLoginUrl;Runnable follow=afterLoginAction;
                    afterLoginUrl=null;afterLoginAction=null;
                    if(!next.equals(url))erpView.loadUrl(next);
                    if(follow!=null)follow.run();
                }
                if(academics!=null)academics.onPageFinished(url);
                if(!autoActive&&pendingFrom!=null&&url.toLowerCase(Locale.ROOT).contains("attend"))
                    prefillDates(pendingFrom,pendingTo);
                if(autoActive)scheduleAuto(900);
            }catch(Exception ignored){collegeAuthenticated=false;}
        });
    }
    private void showToday(){requireCollegeLogin(TODAY,()->erpView.loadUrl(TODAY));}
''' +s[end:]
s=s.replace('''    private void showErp() {
        browserContainer.setVisibility(View.VISIBLE);
        if (erpView.getUrl() == null) erpView.loadUrl(ERP);
    }''','''    private void showErp(){requireCollegeLogin(ERP,()->erpView.loadUrl(ERP));}''')
s=s.replace('''        @JavascriptInterface public void openCollegeResult(){main.post(() -> academics.openCollegeResult());}''','''        @JavascriptInterface public void openCollegeResult(){main.post(() -> requireCollegeLogin(AcademicFeatures.COLLEGE_RESULTS,()->academics.openCollegeResult()));}''')
s=s.replace('''        @JavascriptInterface public void openCourse(){main.post(() -> academics.openCourse());}''','''        @JavascriptInterface public void openCourse(){main.post(() -> requireCollegeLogin(AcademicFeatures.COURSE,()->academics.openCourse()));}''')
s=s.replace('''        @JavascriptInterface public void scanCollegeResults(){main.post(() -> academics.scanCollegeResults());}''','''        @JavascriptInterface public void scanCollegeResults(){main.post(() -> requireCollegeLogin(AcademicFeatures.COLLEGE_RESULTS,()->academics.scanCollegeResults()));}''')
s=s.replace('''            main.post(() -> { erpView.loadUrl(ERP); MainActivity.this.showErp(); });''','''            main.post(() -> {
                collegeAuthenticated=false;
                afterLoginUrl=ERP;afterLoginAction=()->erpView.loadUrl(ERP);
                browserContainer.setVisibility(View.VISIBLE);
                erpView.loadUrl(LOGIN);
            });''')
s=s.replace('''                MainActivity.this.showErp();
                if (erpView.getUrl() != null && erpView.getUrl().toLowerCase(java.util.Locale.ROOT).contains("attend")) prefillDates(from, to);
                else message("Open attendance report; choose " + from + " to " + to + ", then Capture");''','''                requireCollegeLogin(TODAY,()->erpView.loadUrl(TODAY));
                message("After official login, attendance will open for the selected range");''')
s=s.replace('''        browserContainer.setVisibility(View.VISIBLE);
        notifyApp("Starting automatic sync: " + autoWindows.size() + " intervals", false);
        if (erpView.getUrl() == null) erpView.loadUrl(TODAY);
        else scheduleAuto(500);''','''        notifyApp("Starting automatic sync: " + autoWindows.size() + " intervals", false);
        requireCollegeLogin(TODAY,()->{
            if(!TODAY.equals(erpView.getUrl()))erpView.loadUrl(TODAY);
            else scheduleAuto(500);
        });''')
s=s.replace('''        if(!autoActive || autoBusy) return;
        if(!erpHost()) { stopAuto("Only the official HTTPS ERP is supported.");return; }''','''        if(!autoActive || autoBusy)return;
        if(!collegeAuthenticated){
            notifyApp("Waiting for official SIM login and CAPTCHA",false);
            return;
        }
        if(!erpHost()) { requireCollegeLogin(TODAY,()->erpView.loadUrl(TODAY));return; }''')
s=s.replace('''                    erpView.loadUrl(TODAY);
                    scheduleAuto(2600); return;''','''                    requireCollegeLogin(TODAY,()->erpView.loadUrl(TODAY));
                    scheduleAuto(2600); return;''')
s=s.replace('''                if (autoActive && request.isForMainFrame()) {''','''                if (request.isForMainFrame()&&AcademicFeatures.isCollege(request.getUrl()))collegeAuthenticated=false;
                if (autoActive && request.isForMainFrame()) {''')
p.write_text(s)
b=Path('app/build.gradle')
x=b.read_text().replace('versionCode 3','versionCode 4').replace("versionName '0.3.0'","versionName '0.3.1'")
b.write_text(x)
print('Official /ISIMGLB/Login prerequisite installed for all college routes.')

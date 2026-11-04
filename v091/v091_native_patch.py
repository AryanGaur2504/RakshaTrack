from pathlib import Path
root=Path('.')
academic=root/'app/src/main/java/com/campus/simplus/AcademicFeatures.java'
s=academic.read_text()
old='static final String AKTU="https://erp.aktu.ac.in/WebPages/OneView/OneView.aspx";'
new='static final String AKTU="https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx";'
assert old in s
s=s.replace(old,new)
old='    void setAktuCaptured(Runnable callback){aktuCaptured=callback;}'
assert old in s
new='''    void setAktuCaptured(Runnable callback){aktuCaptured=callback;}
    /** Cancel page polling when an AKTU server outage is detected. Retain saved results. */
    void suspendAktuForOutage(){
        aktuWatchToken++;
        aktuFillToken++;
        aktuProbeCount=0;
        aktuCaptureBusy=false;
        aktuCaptured=null;
        openAktuAfterCourse=false;
    }'''
s=s.replace(old,new)
academic.write_text(s)

main=root/'app/src/main/java/com/campus/simplus/MainActivity.java'
s=main.read_text()
old='    private int collectionSerial=0;'
assert old in s
new='''    private int collectionSerial=0;
    private int aktuNavigationSerial=0;
    private boolean aktuMainFrameLoaded=false;'''
s=s.replace(old,new)
old='''        cancelSync.setOnClickListener(v -> {cancelFullCollection();stopAuto("Sync stopped; saved records kept.");if(academics!=null)academics.stopScan("Exam scan stopped; previously captured results retained.");});'''
assert old in s
new='''        cancelSync.setOnClickListener(v -> {
            if(collecting && "aktu".equals(collectionStage)){
                skipAktuAndOpenDashboard("AKTU verification skipped. You can retry One View from Results.");
            }else{
                cancelFullCollection();
                stopAuto("Sync stopped; saved records kept.");
                if(academics!=null)academics.stopScan("Exam scan stopped; previously captured results retained.");
            }
        });'''
s=s.replace(old,new)
old='''                if(collecting)collectionPresentation(false);
                if(academics!=null&&AcademicFeatures.isCollege(uri))academics.onCollegePageStarted(url);'''
assert old in s
new='''                if(collecting)collectionPresentation(false);
                if(collecting && "aktu".equals(collectionStage) && AcademicFeatures.isAktu(uri)){
                    aktuMainFrameLoaded=false;
                    final int nav=++aktuNavigationSerial, collectionId=collectionSerial;
                    // Do not time out an already loaded CAPTCHA page while a human solves it.
                    main.postDelayed(()->{
                        if(collecting && collectionId==collectionSerial && nav==aktuNavigationSerial
                                && "aktu".equals(collectionStage) && !aktuMainFrameLoaded){
                            skipAktuAndOpenDashboard("AKTU One View did not load. Saved SIM details are available; retry from Results.");
                        }
                    },35000);
                }
                if(academics!=null&&AcademicFeatures.isCollege(uri))academics.onCollegePageStarted(url);'''
s=s.replace(old,new)
old='''                } else if (AcademicFeatures.isAktu(uri) && academics != null) {
                    academics.onPageFinished(url);
                    // AKTU has a roll-number page and then a verification page.
                    // Both remain the original official pages. Non-CAPTCHA fields
                    // are filled by the unchanged, previously working adapter.
                    if(collecting&&"aktu".equals(collectionStage))collectionPresentation(true);
                }'''
assert old in s
new='''                } else if (AcademicFeatures.isAktu(uri) && academics != null) {
                    aktuMainFrameLoaded=true;
                    academics.onPageFinished(url);
                    // Some IIS servers serve an HTML error page while onPageFinished
                    // still fires. Never expose a 503 page as a CAPTCHA challenge.
                    if(collecting && "aktu".equals(collectionStage)){
                        final int serial=collectionSerial;
                        view.evaluateJavascript("(function(){var t=((document.title||'')+' '+(document.body?.innerText||'').slice(0,700));return /service\\\\s+unavailable|http\\\\s+error\\\\s+50[0234]/i.test(t);})()", raw->{
                            if(!collecting||serial!=collectionSerial||!"aktu".equals(collectionStage))return;
                            if("true".equals(raw))skipAktuAndOpenDashboard("AKTU One View is temporarily unavailable. Saved SIM data remain accessible; retry from Results.");
                            else collectionPresentation(true);
                        });
                    }
                }'''
s=s.replace(old,new)
old='''            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && AcademicFeatures.isCollege(request.getUrl())) {'''
assert old in s
new='''            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response){
                if(request.isForMainFrame() && AcademicFeatures.isAktu(request.getUrl()) && response.getStatusCode()>=500){
                    handleAktuUnavailable("HTTP " + response.getStatusCode());
                }
                super.onReceivedHttpError(view,request,response);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if(request.isForMainFrame() && AcademicFeatures.isAktu(request.getUrl())){
                    handleAktuUnavailable("network error");
                }
                if (request.isForMainFrame() && AcademicFeatures.isCollege(request.getUrl())) {'''
s=s.replace(old,new)
old='''    private void collectionPresentation(boolean verification){
        if(!collecting)return;
        browserContainer.setVisibility(View.VISIBLE);'''
assert old in s
new='''    private void collectionPresentation(boolean verification){
        if(!collecting)return;
        browserContainer.setVisibility(View.VISIBLE);'''
# keep no-op
old='''        if(browserStopButton!=null){browserStopButton.setText("Cancel");browserStopButton.setVisibility(verification?View.VISIBLE:View.GONE);}'''
assert old in s
new='''        if(browserStopButton!=null){browserStopButton.setText("aktu".equals(collectionStage)?"Skip AKTU":"Cancel");browserStopButton.setVisibility(verification?View.VISIBLE:View.GONE);}'''
s=s.replace(old,new)
old='''    private void startAktuCollection(){
        if(!collecting)return;
        JSONObject student=rosterStore.selected();'''
assert old in s
new='''    private void startAktuCollection(){
        if(!collecting)return;
        aktuMainFrameLoaded=false;
        JSONObject student=rosterStore.selected();'''
s=s.replace(old,new)
old='''    private void finishFullCollection(String message){'''
assert old in s
new='''    /** A university outage should never lock the student outside their saved campus data. */
    private void handleAktuUnavailable(String reason){
        if(collecting && "aktu".equals(collectionStage)){
            skipAktuAndOpenDashboard("AKTU One View unavailable ("+reason+"). Your saved SIM records are available; retry AKTU from Results.");
        }else if(!collecting){
            message("AKTU One View unavailable ("+reason+"). Retry later from Results.");
            if(academics!=null)academics.suspendAktuForOutage();
            erpView.stopLoading();
            showApp();
        }
    }
    private void skipAktuAndOpenDashboard(String reason){
        if(!collecting || !"aktu".equals(collectionStage))return;
        if(academics!=null)academics.suspendAktuForOutage();
        // The user may return to AKTU from Results. Do not erase completed SIM data.
        erpView.stopLoading();
        finishFullCollection(reason);
    }
    private void finishFullCollection(String message){'''
s=s.replace(old,new)
main.write_text(s)

app=root/'app/src/main/assets/app.js'
s=app.read_text()
old='''let onboardingError='',onboardingPassword='',rosterGateRendering=false;'''
assert old in s
new='''let onboardingError='',onboardingPassword='',rosterGateRendering=false;'''
# no-op - patch only collection message
old='''  if(obj.stage==='complete'){state.workspaceReady=true;onboardingError='';persist();page='home';}'''
assert old in s
new='''  if(obj.stage==='complete'){
    state.workspaceReady=true;onboardingError='';
    state.aktuNotice=/AKTU.*(unavailable|did not load|skipped)/i.test(collection.message)?collection.message:'';
    persist();page='home';
  }'''
s=s.replace(old,new)
# add persistent notification to Results source page without changing existing manual retries
needle='''function sourceName(src){return src==='aktu'?'AKTU One View':'College SIM';}'''
assert needle in s
# We add a small persisted warning to the home/results pages through their existing render output later, need inspect insertion separately.
app.write_text(s)

gradle=root/'app/build.gradle'
s=gradle.read_text()
assert "versionName '0.9.0'" in s
s=s.replace("versionName '0.9.0'","versionName '0.9.1'")
import re
s=re.sub(r'versionCode\s+(\d+)',lambda m:'versionCode '+str(int(m.group(1))+1),s,count=1)
gradle.write_text(s)

print('Patched files:',*[str(p) for p in (academic,main,app,gradle)],sep='\n')
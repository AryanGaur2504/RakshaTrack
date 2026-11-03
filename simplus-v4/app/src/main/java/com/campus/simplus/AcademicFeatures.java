package com.campus.simplus;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Extra academic functions run exclusively inside first-party college or university WebViews.
 * JavaScript bridge remains only on the bundled local app page.
 */
public final class AcademicFeatures {
    static final String COLLEGE_HOST="glbg.servergi.com", AKTU_HOST="erp.aktu.ac.in", AKTU_ALT="oneview.aktu.ac.in";
    static final String COLLEGE_RESULTS="https://glbg.servergi.com:8072/ISIMGLB/Student/ExamResult";
    static final String COURSE="https://glbg.servergi.com:8072/ISIMGLB/Student/Course";
    static final String AKTU="https://erp.aktu.ac.in/WebPages/OneView/OneView.aspx";
    static final int SAVE_REPORT=711;
    private final Activity activity;
    private final WebView erp,app;
    private final Runnable showBrowser,showApp;
    private final java.util.function.Consumer<String> navigateCollege;
    private boolean scanPendingAfterLogin = false;
    private final Handler main=new Handler(Looper.getMainLooper());
    private byte[] pendingReport;
    private String aktRoll="";
    private final ArrayList<JSONObject> semesters=new ArrayList<>();
    private final ArrayList<JSONObject> exams=new ArrayList<>();
    private JSONObject semesterField;
    private JSONObject examField;
    private int scanSemesterIndex=0,scanExamIndex=0,scanToken=0,scanRetries=0;
    private boolean scanning=false,scanWaitingLogin=false,scanBusy=false;
    private String scanStage="idle";
    private int scanAttempts=0,semesterVisited=0,viewsCaptured=0;
    private static final String SECRET_ALIAS="SIMPlusDOB_AESv1";

    AcademicFeatures(Activity a,WebView e,WebView ui,Runnable showBrowser,Runnable showApp,java.util.function.Consumer<String> navigateCollege){
        this.activity=a;this.erp=e;this.app=ui;this.showBrowser=showBrowser;this.showApp=showApp;
        this.navigateCollege=navigateCollege;
    }
    static boolean isCollege(Uri uri){return uri!=null&&"https".equalsIgnoreCase(uri.getScheme())&&COLLEGE_HOST.equalsIgnoreCase(uri.getHost())&&uri.getPort()==8072;}
    static boolean isAktu(Uri uri){if(uri==null||!"https".equalsIgnoreCase(uri.getScheme()))return false;String h=uri.getHost();return AKTU_HOST.equalsIgnoreCase(h)||AKTU_ALT.equalsIgnoreCase(h);}
    private Uri current(){try{return Uri.parse(erp.getUrl()==null?"":erp.getUrl());}catch(Exception ignored){return Uri.EMPTY;}}
    private boolean route(Uri uri,String name){return isCollege(uri)&&uri.getPath()!=null&&uri.getPath().toLowerCase(java.util.Locale.ROOT).contains(name.toLowerCase(java.util.Locale.ROOT));}
    void openCollegeResult(){scanning=false;scanPendingAfterLogin=false;navigateCollege.accept(COLLEGE_RESULTS);}
    void openCourse(){scanning=false;scanPendingAfterLogin=false;navigateCollege.accept(COURSE);}
    void openAktu(String roll){scanning=false;aktRoll=roll==null?"":roll.replaceAll("[^0-9]","").substring(0,Math.min(roll.replaceAll("[^0-9]","").length(),18));showBrowser.run();erp.loadUrl(AKTU);}
    boolean canCapture(){Uri uri=current();return route(uri,"ExamResult")||route(uri,"/Course")||isAktu(uri);}
    void captureCurrent(){Uri uri=current();if(route(uri,"ExamResult"))captureResults("college");else if(isAktu(uri))captureResults("aktu");else if(route(uri,"/Course")||route(uri,"Attend"))captureStudentProfile();else toast("Open SIM Result, Course or AKTU first.");}
    void onPageFinished(String url){Uri uri=current();
        if(isAktu(uri)){
            main.postDelayed(this::prefillAktu,950);
            main.postDelayed(()->{if(isAktu(current()))captureResults("aktu");},2800);
        }
        if(route(uri,"/Course")||route(uri,"Attend"))main.postDelayed(this::captureStudentProfile,950);
        if(scanning) scheduleScan(1600);
    }
    private String asset(String filename)throws Exception {try(InputStream in=activity.getAssets().open(filename);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int k;while((k=in.read(buf))>0)out.write(buf,0,k);return out.toString("UTF-8");}}
    private String decode(String raw)throws Exception {if(raw==null||raw.equals("null"))throw new IllegalArgumentException("Empty ERP page");Object value=new JSONTokener(raw).nextValue();return (String)value;}
    private void toast(String s){Toast.makeText(activity,s,Toast.LENGTH_SHORT).show();}
    private void emit(String function,String...data){StringBuilder js=new StringBuilder("window.").append(function).append("(");for(int i=0;i<data.length;i++){if(i>0)js.append(',');js.append(JSONObject.quote(data[i]));}js.append(");");app.evaluateJavascript(js.toString(),null);}
    private void emitStatus(String message,boolean done){try{JSONObject j=new JSONObject().put("message",message).put("done",done);app.evaluateJavascript("window.onExamScanProgress("+j.toString()+");",null);}catch(Exception ignored){}}
    void captureResults(String source){captureResults(source,null);}
    private void captureResults(String source,Runnable complete){Uri uri=current();if(("college".equals(source)&&!route(uri,"ExamResult"))||("aktu".equals(source)&&!isAktu(uri))){toast("Capture allowed only on the official result page");if(complete!=null)complete.run();return;}
        try{erp.evaluateJavascript(asset("result_bot.js"),out->{try{String payload=decode(out);if(payload.length()>330000){toast("Result page too large; use one exam at a time.");return;}
                    if("college".equals(source)&&scanning&&scanSemesterIndex<semesters.size()){
                        JSONObject snapshot=new JSONObject(payload);
                        String semester=semesters.get(scanSemesterIndex).optString("text");
                        String exam=("read-exam".equals(scanStage)&&scanExamIndex<exams.size())
                                ?exams.get(scanExamIndex).optString("text"):"All displayed assessments";
                        snapshot.put("scanContext",new JSONObject().put("semester",semester).put("exam",exam));
                        payload=snapshot.toString();
                    }
                    emit("receiveExamSnapshot",source,payload);}catch(Exception ex){toast("Could not read the displayed result table");}finally{if(complete!=null)complete.run();}});}catch(Exception ex){toast("Result parser is unavailable");if(complete!=null)complete.run();}
    }
    void captureStudentProfile(){Uri uri=current();if(!isCollege(uri)||!(route(uri,"/Course")||route(uri,"Attend"))){toast("Open SIM Course or Attendance to read the profile");return;}
        try{erp.evaluateJavascript(asset("student_bot.js"),raw->{try{JSONObject profile=new JSONObject(decode(raw));String dob=profile.optString("dob","");profile.remove("dob");if(route(current(),"/Course")&&saveDob(dob)){profile.put("dobReady",true);}else profile.put("dobReady",readDob()!=null);
        emit("receiveStudentProfile",profile.toString());}catch(Exception ex){toast("No readable student details found");}});}catch(Exception ex){toast("Profile reader unavailable");}
    }
    private SecretKey key()throws Exception {KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);if(ks.containsAlias(SECRET_ALIAS))return (SecretKey)ks.getKey(SECRET_ALIAS,null);KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(SECRET_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return gen.generateKey();}
    private String normalizeDOB(String raw){raw=raw==null?"":raw.trim();java.util.regex.Matcher m=java.util.regex.Pattern.compile("^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$").matcher(raw);if(m.matches())return String.format(java.util.Locale.US,"%02d/%02d/%s",Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),m.group(3));m=java.util.regex.Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})$").matcher(raw);if(m.matches())return String.format(java.util.Locale.US,"%02d/%02d/%s",Integer.parseInt(m.group(3)),Integer.parseInt(m.group(2)),m.group(1));return null;}
    private boolean saveDob(String dob){String clean=normalizeDOB(dob);if(clean==null)return false;try{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=c.doFinal(clean.getBytes(StandardCharsets.UTF_8));SharedPreferences.Editor e=activity.getSharedPreferences("academic_secret",Activity.MODE_PRIVATE).edit();e.putString("dob_iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP));e.putString("dob_enc",Base64.encodeToString(encrypted,Base64.NO_WRAP));e.apply();return true;}catch(Exception ignored){return false;}}
    private String readDob(){try{SharedPreferences p=activity.getSharedPreferences("academic_secret",Activity.MODE_PRIVATE);String iv=p.getString("dob_iv",null),ct=p.getString("dob_enc",null);if(iv==null||ct==null)return null;Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(ct,Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception ignored){return null;}}
    void prefillAktu(){if(!isAktu(current())){toast("AKTU autofill only works on the official university domain");return;}try{String script=asset("aktu_fill.js").replace("'__ROLL__'",JSONObject.quote(aktRoll==null?"":aktRoll)).replace("'__DOB__'",JSONObject.quote(readDob()==null?"":readDob()));erp.evaluateJavascript(script,out->{try{JSONObject obj=new JSONObject(decode(out));String stage=obj.optString("stage","");
                if(!"results".equals(stage))toast(obj.optString("message","Check the official AKTU page"));}catch(Exception ignored){}});}catch(Exception ex){toast("Could not autofill university login");}}
    /** This scanner discovers actual semester options from the authenticated page.
     * Semester change can populate exam options dynamically or trigger a full postback;
     * no result is fabricated from a percentage, a list of exams, or missing marks. */
    void scanCollegeResults(){
        scanToken++;scanning=false;scanPendingAfterLogin=true;scanWaitingLogin=false;
        scanBusy=false;scanRetries=0;semesterVisited=0;viewsCaptured=0;
        scanSemesterIndex=0;scanExamIndex=0;semesters.clear();exams.clear();
        emitStatus("Login to SIM (CAPTCHA is manual); scanning every available semester",false);
        navigateCollege.accept(COLLEGE_RESULTS);
    }
    void onLoginRequired(){
        if(scanning){scanning=false;scanPendingAfterLogin=true;scanBusy=false;
            emitStatus("SIM session expired; sign in and solve CAPTCHA to restart semester scan",false);}
    }
    void onCollegeAuthenticated(String url){
        if(!route(Uri.parse(url),"ExamResult"))return;
        if(scanPendingAfterLogin){scanPendingAfterLogin=false;scanning=true;scanWaitingLogin=false;
            scanStage="catalogue";scanRetries=0;
            emitStatus("Discovering the semesters listed by your college ERP…",false);
            scheduleScan(1100);
        }else if(scanning)scheduleScan(1000);
    }
    private void scheduleScan(int delay){
        if(!scanning)return;
        final int token=scanToken;
        main.postDelayed(()->{if(scanning&&scanToken==token&&!scanBusy)scanTick();},delay);
    }
    private void runScan(String action,JSONObject args,java.util.function.Consumer<JSONObject> next){
        if(!scanning||scanBusy)return;
        if(!route(current(),"ExamResult")){scheduleScan(2200);return;}
        try{
            String script=asset("result_scan.js")
                    .replace("'__ACTION__'",JSONObject.quote(action))
                    .replace("__ARGS__",args==null?"{}":args.toString());
            scanBusy=true;
            erp.evaluateJavascript(script,raw->{
                scanBusy=false;
                if(!scanning)return;
                try{next.accept(new JSONObject(decode(raw)));}
                catch(Exception ex){stopScan("SIM examination controls changed or could not be read");}
            });
        }catch(Exception e){scanBusy=false;stopScan("SIM semester reader is unavailable");}
    }
    private void scanTick(){
        if(!scanning||scanBusy)return;
        if(!route(current(),"ExamResult")){
            if(++scanAttempts<15){scheduleScan(1700);return;}
            stopScan("Could not reach the authenticated SIM ExamResult page");return;
        }
        scanAttempts=0;
        switch(scanStage){
            case "catalogue":
                runScan("semesters",null,data->{
                    if("login".equals(data.optString("state"))){stopScan("Sign in to SIM and restart semester scan");return;}
                    semesterField=data.optJSONObject("semester");
                    JSONArray opts=semesterField==null?null:semesterField.optJSONArray("options");
                    if(opts==null||opts.length()==0){stopScan("No semester options were found in the ERP dropdown");return;}
                    semesters.clear();
                    for(int i=0;i<opts.length()&&i<24;i++){
                        JSONObject option=opts.optJSONObject(i);
                        if(option!=null&&!option.optString("value").isEmpty())semesters.add(option);
                    }
                    if(semesters.isEmpty()){stopScan("The semester dropdown contains no available semesters");return;}
                    scanSemesterIndex=0;scanStage="choose-semester";scanRetries=0;
                    emitStatus("Found "+semesters.size()+" available semester(s)",false);
                    scheduleScan(350);
                });break;
            case "choose-semester":
                if(scanSemesterIndex>=semesters.size()){
                    stopScan("Checked "+semesterVisited+" semester(s) and captured "+viewsCaptured+" marked result view(s)");return;
                }
                JSONObject item=semesters.get(scanSemesterIndex);
                emitStatus("Semester "+(scanSemesterIndex+1)+" / "+semesters.size()+": "+item.optString("text"),false);
                JSONObject select=new JSONObject();
                try{select.put("field",semesterField);select.put("value",item.optString("value"));}
                catch(Exception ignored){}
                runScan("choose-semester",select,data->{
                    if("selected".equals(data.optString("state"))){
                        scanStage="read-semester";scanRetries=0;scheduleScan(1900);
                    }else{
                        if(++scanRetries<3)scheduleScan(900);
                        else nextSemester("Semester selector did not accept "+item.optString("text"));
                    }
                });break;
            case "read-semester":
                runScan("inspect",null,data->{
                    JSONObject actual=data.optJSONObject("semester");
                    if(!selectedMatches(actual,semesters.get(scanSemesterIndex))){
                        if(++scanRetries<=4){scheduleScan(1300);return;}
                        nextSemester("ERP did not confirm the selected semester");return;
                    }
                    if(!data.optBoolean("hasMarks")){
                        if(++scanRetries<=2){scheduleScan(1300);return;}
                        if(scanRetries==3){runScan("show",null,x->scheduleScan(1400));return;}
                        // Empty semester is not proof of published results; inspect exam
                        // options anyway, as an exam filter might populate the table.
                    }
                    semesterVisited++;
                    scanBusy=true;
                    final boolean hasMarks=data.optBoolean("hasMarks");
                    Runnable after=()->{
                        scanBusy=false;
                        if(hasMarks)viewsCaptured++;
                        scanStage="discover-exams";scanRetries=0;scheduleScan(650);
                    };
                    if(hasMarks)captureResults("college",after);else after.run();
                });break;
            case "discover-exams":
                runScan("inspect",null,data->{
                    JSONObject actual=data.optJSONObject("semester");
                    if(!selectedMatches(actual,semesters.get(scanSemesterIndex))){nextSemester("Semester changed while reading exams");return;}
                    exams.clear();examField=data.optJSONObject("exam");
                    JSONArray opts=examField==null?null:examField.optJSONArray("options");
                    if(opts!=null)for(int i=0;i<opts.length()&&i<20;i++){
                        JSONObject option=opts.optJSONObject(i);
                        if(option!=null&&!option.optString("value").isEmpty())exams.add(option);
                    }
                    scanExamIndex=0;scanRetries=0;
                    if(exams.isEmpty())nextSemester("Default result checked; no extra exam filters");
                    else {scanStage="choose-exam";scheduleScan(500);}
                });break;
            case "choose-exam":
                if(scanExamIndex>=exams.size()){nextSemester("All exam filters checked");return;}
                JSONObject e=exams.get(scanExamIndex);
                emitStatus(semesters.get(scanSemesterIndex).optString("text")+" · "+e.optString("text")+" ("+(scanExamIndex+1)+"/"+exams.size()+")",false);
                JSONObject filter=new JSONObject();
                try{filter.put("field",examField);filter.put("value",e.optString("value"));}
                catch(Exception ignored){}
                runScan("choose-exam",filter,data->{
                    if("selected".equals(data.optString("state"))){scanStage="read-exam";scanRetries=0;scheduleScan(1800);}
                    else nextExam("Exam choice unavailable");
                });break;
            case "read-exam":
                runScan("inspect",null,data->{
                    if(!selectedMatches(data.optJSONObject("semester"),semesters.get(scanSemesterIndex))){
                        if(++scanRetries<3){scheduleScan(1100);return;}
                        nextSemester("Lost semester selection during exam load");return;
                    }
                    if(!selectedMatches(data.optJSONObject("exam"),exams.get(scanExamIndex))){
                        if(++scanRetries<4){scheduleScan(900);return;}
                        nextExam("Exam selection not confirmed");return;
                    }
                    if(!data.optBoolean("hasMarks")){
                        if(++scanRetries<3){scheduleScan(1200);return;}
                        nextExam("No published marks for this exam");return;
                    }
                    scanBusy=true;
                    captureResults("college",()->{scanBusy=false;viewsCaptured++;nextExam("Exam result captured");});
                });break;
            default:stopScan("Unknown scan state");
        }
    }
    private boolean selectedMatches(JSONObject shown,JSONObject chosen){
        return shown!=null&&chosen!=null&&chosen.optString("value").equals(shown.optString("value"));
    }
    private void nextSemester(String reason){
        scanSemesterIndex++;scanExamIndex=0;scanRetries=0;exams.clear();scanStage="choose-semester";
        scheduleScan(650);
    }
    private void nextExam(String reason){scanExamIndex++;scanRetries=0;scanStage="choose-exam";scheduleScan(750);}
    void stopScan(String reason){scanning=false;scanPendingAfterLogin=false;scanBusy=false;scanToken++;scanStage="idle";emitStatus(reason,true);}
    void exportCandidateReport(String raw){try{byte[] report=CandidateReport.render(raw);pendingReport=report;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/pdf");i.putExtra(Intent.EXTRA_TITLE,"SIMPlus_Candidate_Results.pdf");activity.startActivityForResult(i,SAVE_REPORT);}catch(Exception e){toast("Report unavailable: "+e.getMessage());}}
    boolean onActivityResult(int request,int result,Intent data){if(request!=SAVE_REPORT)return false;if(result!=Activity.RESULT_OK||data==null||data.getData()==null){pendingReport=null;return true;}try{if(pendingReport==null)throw new Exception("Report is empty");try(java.io.OutputStream out=activity.getContentResolver().openOutputStream(data.getData())){if(out==null)throw new Exception("Cannot open destination");out.write(pendingReport);out.flush();}toast("Candidate report saved successfully");}catch(Exception e){toast("PDF was not saved: "+e.getMessage());}pendingReport=null;return true;}
    void stop(){scanning=false;pendingReport=null;}
}
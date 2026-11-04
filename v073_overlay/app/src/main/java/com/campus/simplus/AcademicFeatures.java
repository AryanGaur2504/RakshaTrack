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
    private boolean exportBusy=false;
    private String aktRoll="";
    private String importedRoll="";
    private String importedAdmission="";
    private int simFillToken=0;
    private boolean openAktuAfterCourse=false;
    private int aktuWatchToken=0, aktuProbeCount=0, aktuFillToken=0;
    private String lastAktuCaptureSignature="";
    private boolean aktuCaptureBusy=false;
    private final ArrayList<JSONObject> semesters=new ArrayList<>();
    private final ArrayList<JSONObject> exams=new ArrayList<>();
    private JSONObject semesterField;
    private JSONObject examField;
    private int scanSemesterIndex=0,scanExamIndex=0,scanToken=0,scanRetries=0;
    private boolean scanning=false,scanWaitingLogin=false,scanBusy=false;
    private String scanStage="idle";
    private int scanAttempts=0,semesterVisited=0,viewsCaptured=0;
    private String previousMarksFingerprint="", beforeSelectFingerprint="", beforeShowFingerprint="", candidateFingerprint="", lastCapturedSemester="";
    private int candidateStableReads=0;
    private boolean semesterChanged=false;
    private int scanRequestSerial=0;
    private final JSONArray scanOutcome=new JSONArray();
    private int scanNavigationCount=0;
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
    void openAktu(String roll){
        scanning=false;aktuWatchToken++;aktuFillToken++;aktuProbeCount=0;lastAktuCaptureSignature="";
        String digits=roll==null?"":roll.replaceAll("[^0-9]","");
        aktRoll=digits.substring(0,Math.min(digits.length(),18));
        showBrowser.run();
        if(readDob()==null){
            // Obtain DOB from the official authenticated Course page on-device only.
            // Continue to AKTU even when Course does not publish a parseable DOB.
            openAktuAfterCourse=true;
            navigateCollege.accept(COURSE);
        }else{openAktuAfterCourse=false;erp.loadUrl(AKTU);}
    }
    void useImportedStudent(JSONObject student){
        aktuWatchToken++;aktuFillToken++;lastAktuCaptureSignature="";
        aktRoll = student==null?"":student.optString("roll","").replaceAll("[^0-9]","");
        importedAdmission=student==null?"":student.optString("admission","").trim();
        simFillToken++;
        importedRoll=aktRoll;
        if(aktRoll.length()>18)aktRoll=aktRoll.substring(0,18);
        // Never reuse a previous student's DOB when switching profiles.
        activity.getSharedPreferences("academic_secret",Activity.MODE_PRIVATE).edit().clear().apply();
        if(student!=null)saveDob(student.optString("dob",""));
        openAktuAfterCourse=false;
        previousMarksFingerprint="";lastCapturedSemester="";candidateFingerprint="";candidateStableReads=0;
        while(scanOutcome.length()>0)scanOutcome.remove(0);
    }
    boolean canCapture(){Uri uri=current();return route(uri,"ExamResult")||route(uri,"/Course")||isAktu(uri);}
    void captureCurrent(){if(scanning){toast("Semester scan is active; stop it before manual capture");return;}Uri uri=current();if(route(uri,"ExamResult"))captureResults("college");else if(isAktu(uri))captureResults("aktu");else if(route(uri,"/Course")||route(uri,"Attend"))captureStudentProfile();else toast("Open SIM Result, Course or AKTU first.");}
    void onCollegePageStarted(String url){
        if(scanning&&isCollege(Uri.parse(url)))scanNavigationCount++;
    }
    void onPageFinished(String url){Uri uri=current();
        if(route(uri,"/Login"))scheduleSimFill();else simFillToken++;
        if(isAktu(uri)){
            scheduleAktuFill();
            scheduleAktuWatch();
        }else {aktuWatchToken++;aktuProbeCount=0;}

        if(route(uri,"/Course")||route(uri,"Attend"))main.postDelayed(this::captureStudentProfile,950);
        if(scanning) scheduleScan(1600);
    }
    private String asset(String filename)throws Exception {try(InputStream in=activity.getAssets().open(filename);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int k;while((k=in.read(buf))>0)out.write(buf,0,k);return out.toString("UTF-8");}}
    private String decode(String raw)throws Exception {if(raw==null||raw.equals("null"))throw new IllegalArgumentException("Empty ERP page");Object value=new JSONTokener(raw).nextValue();return (String)value;}
    private void toast(String s){Toast.makeText(activity,s,Toast.LENGTH_SHORT).show();}
    private void emit(String function,String...data){StringBuilder js=new StringBuilder("window.").append(function).append("(");for(int i=0;i<data.length;i++){if(i>0)js.append(',');js.append(JSONObject.quote(data[i]));}js.append(");");app.evaluateJavascript(js.toString(),null);}
    private void emitStatus(String message,boolean done){try{JSONObject j=new JSONObject().put("message",message).put("done",done).put("semesters",scanOutcome);app.evaluateJavascript("window.onExamScanProgress("+j.toString()+");",null);}catch(Exception ignored){}}
    void captureResults(String source){captureResults(source,null);}
    /** Import only counts when the local parser actually saved nonempty subject marks. */
    private void captureResults(String source,java.util.function.Consumer<Boolean> complete){
        Uri uri=current();
        if(("college".equals(source)&&!route(uri,"ExamResult"))||("aktu".equals(source)&&!isAktu(uri))){
            toast("Capture allowed only on the official result page");
            if(complete!=null)complete.accept(false);return;
        }
        try{
            erp.evaluateJavascript(asset("result_bot.js"),out->{
                try{
                    String payload=decode(out);
                    if(payload.length()>330000)throw new IllegalArgumentException("Result page is too large");
                    JSONObject snapshot=new JSONObject(payload);
                    JSONObject identity=snapshot.optJSONObject("profile");
                    if(identity!=null&&!importedRoll.isEmpty()){
                        String actual=identity.optString("roll","").replaceAll("[^0-9]","");
                        if(!actual.isEmpty()&&!actual.equals(importedRoll)){
                            toast("Official result belongs to a different university roll number");
                            if(complete!=null)complete.accept(false);return;
                        }
                    }
                    if("college".equals(source)&&scanning&&scanSemesterIndex<semesters.size()){
                        if(candidateFingerprint.isEmpty()||!candidateFingerprint.equals(snapshot.optString("marksFingerprint",""))){
                            emitStatus("Result table changed during capture; retrying...",false);
                            if(complete!=null)complete.accept(false);return;
                        }
                        String semester=semesters.get(scanSemesterIndex).optString("text");
                        JSONArray selections=snapshot.optJSONArray("selections");
                        boolean matched=false;
                        if(selections!=null)for(int i=0;i<selections.length();i++){
                            JSONObject sel=selections.optJSONObject(i);if(sel==null)continue;
                            String label=(sel.optString("label")+" "+sel.optString("name")+" "+sel.optString("id")).toLowerCase(java.util.Locale.ROOT);
                            if(label.contains("semester")||label.matches(".*\\bsem\\b.*")){
                                matched=semester.trim().equalsIgnoreCase(sel.optString("valueText").trim());break;
                            }
                        }
                        if(!matched){emitStatus("Semester selection changed before capture; retrying",false);
                            if(complete!=null)complete.accept(false);return;}
                        snapshot.put("scanContext",new JSONObject().put("semester",semester).put("exam","All assessments"));
                        payload=snapshot.toString();
                    }
                    String js="window.receiveExamSnapshot("+JSONObject.quote(source)+","+JSONObject.quote(payload)+");";
                    app.evaluateJavascript(js,ack->{
                        boolean imported="true".equals(ack);
                        if(!imported&&scanning)emitStatus("Visible marks could not be parsed; retrying...",false);
                        if(complete!=null)complete.accept(imported);
                    });
                }catch(Exception ex){
                    if(!scanning)toast("Could not read the displayed result table");
                    if(complete!=null)complete.accept(false);
                }
            });
        }catch(Exception ex){toast("Result parser is unavailable");if(complete!=null)complete.accept(false);}
    }
    void captureStudentProfile(){Uri uri=current();if(!isCollege(uri)||!(route(uri,"/Course")||route(uri,"Attend"))){toast("Open SIM Course or Attendance to read the profile");return;}
        try{erp.evaluateJavascript(asset("student_bot.js"),raw->{
            boolean continueAktu=openAktuAfterCourse&&route(current(),"/Course");
            try{JSONObject profile=new JSONObject(decode(raw));String dob=profile.optString("dob","");
                String accountRoll=profile.optString("roll","").replaceAll("[^0-9]","");
                if(!importedRoll.isEmpty()&&!accountRoll.isEmpty()&&!accountRoll.equals(importedRoll)){
                    toast("SIM is logged into a different student account; no details imported");return;
                }
                profile.remove("dob");
                if(route(current(),"/Course")&&saveDob(dob)){profile.put("dobReady",true);}else profile.put("dobReady",readDob()!=null);
                String retrieved=profile.optString("roll","").replaceAll("[^0-9]","");
                if(aktRoll.isEmpty()&&retrieved.length()>=8&&retrieved.length()<=16)aktRoll=retrieved;
                emit("receiveStudentProfile",profile.toString());
            }catch(Exception ex){toast("No readable student details found");}
            finally{
                if(continueAktu){openAktuAfterCourse=false;erp.loadUrl(AKTU);}
            }
        });}catch(Exception ex){
            toast("Profile reader unavailable");
            if(openAktuAfterCourse){openAktuAfterCourse=false;erp.loadUrl(AKTU);}
        }
    }
    private SecretKey key()throws Exception {KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);if(ks.containsAlias(SECRET_ALIAS))return (SecretKey)ks.getKey(SECRET_ALIAS,null);KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(SECRET_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return gen.generateKey();}
    private String normalizeDOB(String raw){raw=raw==null?"":raw.trim();java.util.regex.Matcher m=java.util.regex.Pattern.compile("^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$").matcher(raw);if(m.matches())return String.format(java.util.Locale.US,"%02d/%02d/%s",Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),m.group(3));m=java.util.regex.Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})$").matcher(raw);if(m.matches())return String.format(java.util.Locale.US,"%02d/%02d/%s",Integer.parseInt(m.group(3)),Integer.parseInt(m.group(2)),m.group(1));return null;}
    private boolean saveDob(String dob){String clean=normalizeDOB(dob);if(clean==null)return false;try{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=c.doFinal(clean.getBytes(StandardCharsets.UTF_8));SharedPreferences.Editor e=activity.getSharedPreferences("academic_secret",Activity.MODE_PRIVATE).edit();e.putString("dob_iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP));e.putString("dob_enc",Base64.encodeToString(encrypted,Base64.NO_WRAP));e.apply();return true;}catch(Exception ignored){return false;}}
    private String readDob(){try{SharedPreferences p=activity.getSharedPreferences("academic_secret",Activity.MODE_PRIVATE);String iv=p.getString("dob_iv",null),ct=p.getString("dob_enc",null);if(iv==null||ct==null)return null;Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(ct,Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception ignored){return null;}}
    /** SIM login autofill, separate from working AKTU logic. No CAPTCHA or submit. */
    private void scheduleSimFill(){
        if(importedAdmission.isEmpty()||readDob()==null)return;
        final int token=++simFillToken;
        main.postDelayed(()->repeatSimFill(token,0),390);
    }
    private void repeatSimFill(int token,int attempt){
        if(token!=simFillToken||!route(current(),"/Login")||attempt>=22)return;
        try{
            String dob=readDob();
            String digits=dob==null?"":dob.replaceAll("[^0-9]","");
            String script=asset("sim_fill.js")
                .replace("'__ADMISSION__'",JSONObject.quote(importedAdmission))
                .replace("'__DOB__'",JSONObject.quote(digits));
            erp.evaluateJavascript(script,ignored->{
                if(token==simFillToken&&route(current(),"/Login"))
                    main.postDelayed(()->repeatSimFill(token,attempt+1),830);
            });
        }catch(Exception ignored){}
    }
    void prefillAktu(){fillAktu(true,null);}
    private void scheduleAktuFill(){
        final int token=++aktuFillToken;
        main.postDelayed(()->repeatAktuFill(token,0),420);
    }
    private void repeatAktuFill(int token,int attempt){
        if(token!=aktuFillToken||!isAktu(current())||attempt>=45)return;
        fillAktu(false,stage->{
            if(token!=aktuFillToken||!isAktu(current()))return;
            if(!"results".equals(stage))main.postDelayed(()->repeatAktuFill(token,attempt+1),1200);
        });
    }
    private void fillAktu(boolean announce,java.util.function.Consumer<String> complete){
        if(!isAktu(current())){if(announce)toast("Open AKTU One View first");if(complete!=null)complete.accept("unknown");return;}
        try{
            String roll=aktRoll==null?"":aktRoll;
            String dob=readDob();
            String script=asset("aktu_fill.js").replace("'__ROLL__'",JSONObject.quote(roll)).replace("'__DOB__'",JSONObject.quote(dob==null?"":dob));
            erp.evaluateJavascript(script,raw->{String stage="unknown";
                try{JSONObject obj=new JSONObject(decode(raw));stage=obj.optString("stage","unknown");
                    if(announce)toast(obj.optString("message","Check the official AKTU page"));
                }catch(Exception ex){if(announce)toast("AKTU form not readable");}
                if(complete!=null)complete.accept(stage);
            });
        }catch(Exception e){if(announce)toast("AKTU autofill unavailable");if(complete!=null)complete.accept("unknown");}
    }
    /** Waits for a real AKTU marks table after View Result, including asynchronous page updates.
     * Never reads CAPTCHA fields, passwords or cookies; captures only official result tables.
     */
    private void scheduleAktuWatch(){
        final int token=++aktuWatchToken;
        aktuProbeCount=0;
        watchAktu(token);
    }
    private void watchAktu(int token){
        if(token!=aktuWatchToken||!isAktu(current())||!erp.isShown())return;
        try{erp.evaluateJavascript(asset("aktu_probe.js"),raw->{
            if(token!=aktuWatchToken||!isAktu(current())||!erp.isShown())return;
            try{
                JSONObject result=new JSONObject(decode(raw));
                String signature=result.optString("signature","");
                if(result.optBoolean("ready")&&!signature.isEmpty()&&!signature.equals(lastAktuCaptureSignature)&&!aktuCaptureBusy){
                    aktuCaptureBusy=true;
                    lastAktuCaptureSignature=signature;
                    captureResults("aktu",success->{
                        aktuCaptureBusy=false;
                        if(success){emitStatus("AKTU One View result captured from the official page",true);showApp.run();}
                        else lastAktuCaptureSignature="";
                    });
                }
            }catch(Exception ignored){}
            if(++aktuProbeCount<360&&!aktuCaptureBusy) main.postDelayed(()->watchAktu(token),1150);
        });}catch(Exception ignored){}
    }
    /** This scanner discovers actual semester options from the authenticated page.
     * Semester change can populate exam options dynamically or trigger a full postback;
     * no result is fabricated from a percentage, a list of exams, or missing marks. */
    void scanCollegeResults(){
        scanToken++;scanning=false;scanPendingAfterLogin=true;scanWaitingLogin=false;
        scanBusy=false;scanRetries=0;semesterVisited=0;viewsCaptured=0;scanRequestSerial++;while(scanOutcome.length()>0)scanOutcome.remove(0);
        scanSemesterIndex=0;scanExamIndex=0;semesters.clear();exams.clear();
        previousMarksFingerprint="";beforeSelectFingerprint="";beforeShowFingerprint="";candidateFingerprint="";
        candidateStableReads=0;
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
        if(!route(current(),"ExamResult")){scheduleScan(1600);return;}
        try{
            String script=asset("result_scan.js")
                    .replace("'__ACTION__'",JSONObject.quote(action))
                    .replace("__ARGS__",args==null?"{}":args.toString());
            scanBusy=true;
            final int id=++scanRequestSerial,token=scanToken,navigation=scanNavigationCount;
            // ASP.NET postbacks can destroy a JS context before its callback fires.
            main.postDelayed(()->{
                if(!scanning||scanToken!=token||scanRequestSerial!=id||!scanBusy)return;
                scanBusy=false;scanRequestSerial++;
                boolean pageChanged=scanNavigationCount!=navigation;
                if("choose-semester".equals(action)&&pageChanged){
                    scanStage="confirm-semester";
                    emitStatus("Semester selection reloaded ERP; verifying...",false);
                    scheduleScan(1600);
                }else if("show".equals(action)&&pageChanged){
                    scanStage="read-semester";candidateFingerprint="";candidateStableReads=0;
                    emitStatus("Show reloaded ERP; checking fresh rows...",false);
                    scheduleScan(1600);
                }else if(++scanRetries<5){
                    emitStatus("ERP responding slowly; retrying safely...",false);
                    scheduleScan(1300);
                }else nextSemester("Timed out waiting for ERP results");
            },6100);
            erp.evaluateJavascript(script,raw->{
                if(!scanning||scanToken!=token||id!=scanRequestSerial)return;
                scanBusy=false;
                try{next.accept(new JSONObject(decode(raw)));}
                catch(Exception ex){
                    if(++scanRetries<6)scheduleScan(1300);
                    else nextSemester("ERP changed while reading results");
                }
            });
        }catch(Exception ex){scanBusy=false;
            if(++scanRetries<5)scheduleScan(1200);
            else nextSemester("SIM semester reader unavailable");
        }
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
                        semesterChanged=data.optBoolean("changed");
                        beforeSelectFingerprint=data.optString("priorFingerprint","");
                        candidateFingerprint="";candidateStableReads=0;
                        scanStage="confirm-semester";scanRetries=0;scheduleScan(900);
                    }else{
                        if(++scanRetries<3)scheduleScan(900);
                        else nextSemester("Semester selector did not accept "+item.optString("text"));
                    }
                });break;
            case "confirm-semester":
                runScan("inspect",null,data->{
                    JSONObject expected=semesters.get(scanSemesterIndex);
                    if(!selectedMatches(data.optJSONObject("semester"),expected)){
                        if(++scanRetries<8){scheduleScan(1050);return;}
                        nextSemester("Semester dropdown did not settle on "+expected.optString("text"));return;
                    }
                    beforeShowFingerprint=data.optString("marksFingerprint","");
                    scanRetries=0;scanStage="show-semester";scheduleScan(450);
                });break;
            case "show-semester":
                // SIM's Exam Name stays untouched. Show returns ALL sessional rows.
                runScan("show",null,data->{
                    String status=data.optString("state");
                    if("show-clicked".equals(status)){
                        beforeShowFingerprint=data.optString("beforeFingerprint","");
                        candidateFingerprint="";candidateStableReads=0;
                        scanStage="read-semester";scanRetries=0;scheduleScan(1450);
                    }else nextSemester("Show button unavailable for semester");
                });break;
            case "read-semester":
                runScan("inspect",null,data->{
                    JSONObject selected=data.optJSONObject("semester");
                    if(!selectedMatches(selected,semesters.get(scanSemesterIndex))){
                        if(++scanRetries<5){scheduleScan(900);return;}
                        nextSemester("Semester selection not confirmed");return;
                    }
                    if(data.optBoolean("busy")||!data.optBoolean("ready",true)){
                        if(++scanRetries<27){scheduleScan(850);return;}
                        nextSemester("ERP kept loading; no marks saved");return;
                    }
                    String fingerprint=data.optString("marksFingerprint","");
                    if(!data.optBoolean("hasMarks")||fingerprint.isEmpty()){
                        candidateFingerprint="";candidateStableReads=0;
                        if(++scanRetries<24){scheduleScan(1000);return;}
                        semesterVisited++;nextSemester("No published marks found for this semester");return;
                    }
                    // A result belonging to the previously captured semester must never be
                    // copied into the next semester, even if the selection already changed.
                    boolean sameAsPrevious=!previousMarksFingerprint.isEmpty()&&fingerprint.equals(previousMarksFingerprint);
                    boolean staleSelection=semesterChanged&&fingerprint.equals(beforeSelectFingerprint)
                        &&fingerprint.equals(beforeShowFingerprint);
                    if(sameAsPrevious||staleSelection){
                        candidateFingerprint="";candidateStableReads=0;
                        if(++scanRetries<26){scheduleScan(1050);return;}
                        semesterVisited++;
                        emitStatus("Skipping "+semesters.get(scanSemesterIndex).optString("text")+": ERP did not deliver a distinct result table; no stale copy saved",false);
                        nextSemester("Stale result blocked");return;
                    }
                    if(!fingerprint.equals(candidateFingerprint)){
                        candidateFingerprint=fingerprint;candidateStableReads=1;
                        scheduleScan(900);return;
                    }
                    if(++candidateStableReads<2){scheduleScan(900);return;}
                    scanBusy=true;
                    captureResults("college",success->{
                        scanBusy=false;
                        if(success){previousMarksFingerprint=candidateFingerprint;
                            lastCapturedSemester=semesters.get(scanSemesterIndex).optString("text","");
                            semesterVisited++;viewsCaptured++;
                            nextSemester("Imported verified semester results");}
                        else if(++scanRetries<24){candidateStableReads=0;scheduleScan(1050);}
                        else{semesterVisited++;nextSemester("Result changed during import; skipped to avoid mixing marks");}
                    });
                });break;
            default:stopScan("Unknown scan state");
        }
    }
    private boolean selectedMatches(JSONObject shown,JSONObject chosen){
        return shown!=null&&chosen!=null&&chosen.optString("value").equals(shown.optString("value"));
    }
    private void nextSemester(String reason){
        if(scanSemesterIndex<semesters.size())try{
            String sem=semesters.get(scanSemesterIndex).optString("text","");
            scanOutcome.put(new JSONObject().put("semester",sem)
               .put("state",reason.startsWith("Imported")?"verified":reason.startsWith("No published")?"no-results":"unresolved")
               .put("reason",reason));
        }catch(Exception ignored){}
        emitStatus(reason,false);
        scanSemesterIndex++;scanExamIndex=0;scanRetries=0;exams.clear();scanStage="choose-semester";
        candidateFingerprint="";candidateStableReads=0;beforeSelectFingerprint="";beforeShowFingerprint="";
        scheduleScan(650);
    }
    private void nextExam(String reason){scanExamIndex++;scanRetries=0;scanStage="choose-exam";scheduleScan(750);}
    void stopScan(String reason){scanning=false;scanPendingAfterLogin=false;scanBusy=false;scanToken++;scanRequestSerial++;scanStage="idle";emitStatus(reason,true);}
    void exportCandidateReport(String raw,JSONObject importedStudent){
        if(exportBusy){toast("A report is being generated");return;}
        exportBusy=true;toast("Preparing comprehensive candidate PDF…");
        final String photoUserAgent=erp.getSettings().getUserAgentString();
        new Thread(()->{
            try{
                JSONObject payload=new JSONObject(raw);
                JSONObject candidate=payload.optJSONObject("candidate");if(candidate==null)candidate=new JSONObject();
                if(importedStudent!=null){
                    for(String key:StudentRosterStore.FIELDS){
                        String value=importedStudent.optString(key,"");
                        candidate.put(key,value);
                    }
                    candidate.put("program",importedStudent.optString("course",""));
                }
                payload.put("candidate",candidate);
                String photoURL=candidate.optString("photoUrl","");
                StudentPhotoLoader.Result photo=StudentPhotoLoader.load(photoURL,photoUserAgent);
                android.graphics.Bitmap portrait=photo.bitmap;
                byte[] finished=CandidateReport.render(payload.toString(),portrait);
                if(portrait==null&&!photoURL.trim().isEmpty()){
                    String issue=photo.problem;
                    main.post(()->toast("PDF photo not embedded: "+issue));
                }
                if(portrait!=null)portrait.recycle();
                String roll=candidate.optString("roll","").replaceAll("[^0-9A-Za-z]","");
                String name="SIMPlus_"+(roll.isEmpty()?"Student":roll)+"_Comprehensive_Report.pdf";
                main.post(()->{
                    exportBusy=false;pendingReport=finished;
                    try{
                        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/pdf");
                        i.putExtra(Intent.EXTRA_TITLE,name);
                        activity.startActivityForResult(i,SAVE_REPORT);
                    }catch(Exception e){pendingReport=null;toast("Document save picker unavailable");}
                });
            }catch(Exception e){String reason=e.getMessage();main.post(()->{exportBusy=false;toast("Report unavailable: "+(reason==null?"Unknown error":reason));});}
        },"SIMPlus-PDF").start();
    }
    boolean onActivityResult(int request,int result,Intent data){if(request!=SAVE_REPORT)return false;if(result!=Activity.RESULT_OK||data==null||data.getData()==null){pendingReport=null;return true;}try{if(pendingReport==null)throw new Exception("Report is empty");try(java.io.OutputStream out=activity.getContentResolver().openOutputStream(data.getData())){if(out==null)throw new Exception("Cannot open destination");out.write(pendingReport);out.flush();}toast("Candidate report saved successfully");}catch(Exception e){toast("PDF was not saved: "+e.getMessage());}pendingReport=null;return true;}
    void stop(){scanning=false;aktuWatchToken++;pendingReport=null;}
}

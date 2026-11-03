package com.campus.simplus;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONTokener;
import org.json.JSONObject;
import org.json.JSONArray;
import android.webkit.WebResourceError;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;


/**
 * Unofficial student companion. ERP auth stays in an ordinary, first-party WebView.
 * The JavaScript bridge exists ONLY on the bundled, local app UI, never on ERP pages.
 * No passwords, cookie values, CAPTCHA responses or hidden login endpoints are read.
 */
public class MainActivity extends Activity {
    private static final String LOGIN = "https://glbg.servergi.com:8072/ISIMGLB/Login";
    private static final String ERP = "https://glbg.servergi.com:8072/ISIMGLB/home";
    private static final String TODAY = "https://glbg.servergi.com:8072/ISIMGLB/Student/TodayAttendence";
    private String pendingFrom = null, pendingTo = null;
    // A protected college route is never requested until the official Login
    // screen has produced a verified authenticated college page.
    private String afterCollegeLogin = null;
    private String mostRecentCollegeRoute = ERP;
    private boolean collegeSessionReady = false;
    private int authenticationGeneration = 0;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView appView, erpView;
    private AcademicFeatures academics;
    private LinearLayout browserContainer;
    private TextView browserTitle;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_REQUEST = 309;
    private final ArrayList<String[]> autoWindows = new ArrayList<>();
    private boolean autoActive = false, autoBusy = false, awaitingLoginNotice = false;
    private String autoStage = "ensure";
    private int autoIndex = 0, autoAttempts = 0, autoScheduleToken = 0;
    private String automationScript;
    private static final int MAX_READ_ATTEMPTS = 14;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(11, 19, 39));
        getWindow().setNavigationBarColor(Color.rgb(11, 19, 39));

        FrameLayout root = new FrameLayout(this);
        appView = new WebView(this);
        setupWebView(appView);
        // Local JS interface cannot be reached by the college ERP.
        appView.addJavascriptInterface(new UiBridge(), "Native");
        appView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equalsIgnoreCase(u.getScheme())) return false;
                if ("https".equalsIgnoreCase(u.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                }
                return true;
            }
        });
        root.addView(appView, new FrameLayout.LayoutParams(-1, -1));

        browserContainer = new LinearLayout(this);
        browserContainer.setOrientation(LinearLayout.VERTICAL);
        browserContainer.setBackgroundColor(Color.WHITE);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setPadding(dp(12), dp(9), dp(12), dp(9));
        toolbar.setBackgroundColor(Color.rgb(11, 19, 39));
        Button back = new Button(this);
        back.setText("← App");
        back.setAllCaps(false);
        back.setOnClickListener(v -> showApp());
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(90), dp(48)));
        browserTitle = new TextView(this);
        browserTitle.setText("Official SIM ERP");
        browserTitle.setTextColor(Color.WHITE);
        browserTitle.setTextSize(15);
        browserTitle.setPadding(dp(7), dp(13), dp(0), 0);
        toolbar.addView(browserTitle, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button cancelSync = new Button(this);
        cancelSync.setText("Stop");
        cancelSync.setAllCaps(false);
        cancelSync.setOnClickListener(v -> {stopAuto("Sync stopped; saved records kept.");if(academics!=null)academics.stopScan("Exam scan stopped; previously captured results retained.");});
        toolbar.addView(cancelSync, new LinearLayout.LayoutParams(dp(65), dp(48)));
        Button capture = new Button(this);
        capture.setText("Capture");
        capture.setAllCaps(false);
        capture.setOnClickListener(v -> { if(academics!=null && academics.canCapture())academics.captureCurrent(); else captureErp(); });
        toolbar.addView(capture, new LinearLayout.LayoutParams(dp(100), dp(48)));
        browserContainer.addView(toolbar);

        erpView = new WebView(this);
        setupWebView(erpView);
        erpView.getSettings().setAllowFileAccess(false);
        erpView.getSettings().setSupportMultipleWindows(false);
        erpView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        erpView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_REQUEST);
                    return true;
                } catch (Exception ex) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        erpView.setDownloadListener((url, agent, disposition, mimetype, length) -> {
            try {
                // Browser handles sensitive payment/download flows: no cookie copying.
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                Toast.makeText(this, "Opening ERP download in browser", Toast.LENGTH_SHORT).show();
            } catch (Exception ex) { Toast.makeText(this, "Unable to open download", Toast.LENGTH_LONG).show(); }
        });
        erpView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                Uri uri = Uri.parse(url);
                if (isProtectedCollegePath(uri)) mostRecentCollegeRoute = url;
                if (isLoginPath(uri) && collegeSessionReady) {
                    collegeSessionReady = false;
                    if (afterCollegeLogin == null) afterCollegeLogin = autoActive ? TODAY : mostRecentCollegeRoute;
                    if (academics != null) academics.onLoginRequired();
                }
                super.onPageStarted(view,url,icon);
            }
            @Override public void onPageFinished(WebView view, String url) {
                browserTitle.setText(url.contains("ExamResult") ? "College exam results" : (url.contains("Course") ? "Academic profile" : (url.contains("aktu.ac.in") ? "AKTU One View" : (url.contains("TodayAttendence") ? "Today\u0027s Attendance" : "Official SIM ERP"))));
                Uri uri = Uri.parse(url);
                if (AcademicFeatures.isCollege(uri)) {
                    verifyCollegeAuthentication(url);
                } else if (AcademicFeatures.isAktu(uri) && academics != null) {
                    academics.onPageFinished(url);
                }
                super.onPageFinished(view, url);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && AcademicFeatures.isCollege(request.getUrl())) {
                    collegeSessionReady = false;
                }
                if (autoActive && request.isForMainFrame()) {
                    stopAuto("ERP page could not load. Check network or campus-server availability.");
                }
                super.onReceivedError(view,request,error);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                String scheme = target.getScheme();
                // Keep only the official college host in the authenticated WebView.
                // External sites (including payment gateways) open in the device browser.
                if (AcademicFeatures.isCollege(target) || AcademicFeatures.isAktu(target)) return false;
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (Exception ignored) { }
                    return true;
                }
                if ("intent".equalsIgnoreCase(scheme)) return true;
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                catch (Exception ignored) { }
                return true;
            }
        });
        browserContainer.addView(erpView, new LinearLayout.LayoutParams(-1, 0, 1));
        browserContainer.setVisibility(View.GONE);
        root.addView(browserContainer, new FrameLayout.LayoutParams(-1, -1));
        academics=new AcademicFeatures(this,erpView,appView,() -> browserContainer.setVisibility(View.VISIBLE),this::showApp,this::navigateCollege);
        setContentView(root);
        appView.loadUrl("file:///android_asset/index.html");
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + .5f); }
    private void setupWebView(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        w.setBackgroundColor(Color.rgb(248, 250, 252));
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
    }
    /** First-party secure login; user solves the official CAPTCHA manually. */
    private void navigateCollege(String destination) {
        Uri uri = Uri.parse(destination);
        if (!AcademicFeatures.isCollege(uri)
                || !uri.getPath().startsWith("/ISIMGLB/")) {
            message("Only the official college SIM portal is allowed");
            return;
        }
        browserContainer.setVisibility(View.VISIBLE);
        if (!collegeSessionReady) {
            afterCollegeLogin = destination;
            browserTitle.setText("Sign in to SIM ERP · CAPTCHA required");
            String current = erpView.getUrl();
            if (current == null || !isLoginPath(Uri.parse(current))) {
                erpView.loadUrl(LOGIN);
            }
            return;
        }
        mostRecentCollegeRoute = destination;
        if (!destination.equals(erpView.getUrl())) erpView.loadUrl(destination);
        else verifyCollegeAuthentication(destination);
    }
    private static boolean isLoginPath(Uri uri) {
        return AcademicFeatures.isCollege(uri) && "/ISIMGLB/Login".equalsIgnoreCase(uri.getPath());
    }
    private static boolean isProtectedCollegePath(Uri uri) {
        return AcademicFeatures.isCollege(uri) && uri.getPath() != null
                && (uri.getPath().equalsIgnoreCase("/ISIMGLB/home")
                || uri.getPath().startsWith("/ISIMGLB/Student/"));
    }
    /** Confirmation comes from the rendered first-party page, not cookie guesses. */
    private void verifyCollegeAuthentication(String loadedUrl) {
        Uri uri = Uri.parse(loadedUrl);
        if (!AcademicFeatures.isCollege(uri)) return;
        final int generation = ++authenticationGeneration;
        // Do not read passwords, CAPTCHA responses, cookies, hidden fields or tokens.
        String probe = "(function(){const pw=!!document.querySelector('input[type=password]');"
                + "const body=(document.body?.innerText||'').slice(0,12000);"
                + "const loading=/web page not available|ERR_CONNECTION|HTTP ERROR|access denied/i.test(body);"
                + "const meaningful=body.trim().length>25 && /student|attendance|semester|dashboard|course|result/i.test(body);"
                + "return JSON.stringify({login:pw,ready:!pw&&!loading&&meaningful});})()";
        erpView.evaluateJavascript(probe, raw -> {
            if (generation != authenticationGeneration || !loadedUrl.equals(erpView.getUrl())) return;
            try {
                JSONObject result = new JSONObject((String) new JSONTokener(raw).nextValue());
                if (isLoginPath(uri) || result.optBoolean("login")) {
                    collegeSessionReady = false;
                    if (afterCollegeLogin == null && autoActive) afterCollegeLogin = TODAY;
                    if (academics != null) academics.onLoginRequired();
                    browserTitle.setText("SIM ERP Login · Enter CAPTCHA");
                    if (autoActive) notifyApp("Sign in on the official Login page to resume sync",false);
                    if (!isLoginPath(uri)) {
                        // Some ERP configurations render the sign-in form within
                        // the requested protected route. Canonicalize to /Login.
                        if (afterCollegeLogin == null) afterCollegeLogin = loadedUrl;
                        erpView.loadUrl(LOGIN);
                    }
                    return;
                }
                if (!isProtectedCollegePath(uri) || !result.optBoolean("ready")) {
                    collegeSessionReady = false;
                    browserTitle.setText("ERP page not verified · check login");
                    return;
                }
                collegeSessionReady = true;
                mostRecentCollegeRoute = loadedUrl;
                String queued = afterCollegeLogin;
                afterCollegeLogin = null;
                if (queued != null && !queued.equals(loadedUrl)) {
                    navigateCollege(queued);
                    return;
                }
                if (academics != null) {
                    academics.onCollegeAuthenticated(loadedUrl);
                    academics.onPageFinished(loadedUrl);
                }
                if (!autoActive && pendingFrom != null && loadedUrl.toLowerCase(Locale.ROOT).contains("attend")) {
                    prefillDates(pendingFrom,pendingTo);
                }
                if (autoActive) scheduleAuto(900);
            } catch(Exception ignored) {
                collegeSessionReady = false;
                browserTitle.setText("Could not verify ERP login");
            }
        });
    }
    private void showToday() { navigateCollege(TODAY); }
    /** Fill only visible attendance date fields; do not submit forms or bypass CAPTCHA. */
    private void prefillDates(String from, String to) {
        if (from == null || to == null || !from.matches("\\d{4}-\\d{2}-\\d{2}") || !to.matches("\\d{4}-\\d{2}-\\d{2}")) return;
        String js = "(function(){const fields=[...document.querySelectorAll('input')].filter(e=>{if(e.disabled||e.type==='hidden')return false;const s=(e.name+' '+e.id+' '+(e.placeholder||'')).toLowerCase();return /date|from|to|start|end/.test(s)||e.type==='date'});" +
                "const from=fields.find(e=>/from|start/i.test(e.name+' '+e.id+' '+e.placeholder));" +
                "const to=fields.find(e=>/to|end/i.test(e.name+' '+e.id+' '+e.placeholder)&&e!==from);" +
                "if(!from||!to)return 'Dates must be entered in ERP manually';" +
                "function set(el,iso){const [y,m,d]=iso.split('-');const v=el.type==='date'?iso:(d+'/'+m+'/'+y);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}" +
                "set(from,'"+from+"');set(to,'"+to+"');return 'Dates prefilled; generate the report, then tap Capture';})()";
        erpView.evaluateJavascript(js, response -> {
            if (response != null && !response.equals("null")) {
                try { message(new JSONTokener(response).nextValue().toString()); } catch (Exception ignored) { }
            }
        });
        pendingFrom = null; pendingTo = null;
    }
    private void showErp() { navigateCollege(ERP); }
    private void showApp() { browserContainer.setVisibility(View.GONE); }
    private void message(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    // Capture visible HTML table text only from the currently displayed, logged-in page.
    // ERP cookies/passwords are never collected. This may require per-ERP field mapping.
    private void captureErp() {
        Uri current = Uri.parse(erpView.getUrl() == null ? "" : erpView.getUrl());
        if (!"https".equalsIgnoreCase(current.getScheme())
                || !"glbg.servergi.com".equalsIgnoreCase(current.getHost())
                || current.getPort() != 8072) {
            message("Capture is only available on the official ERP site");
            return;
        }
        if (current.getPath() == null || !current.getPath().toLowerCase(java.util.Locale.ROOT).contains("attend")) {
            message("Open an attendance report before capturing");
            return;
        }
        String script = "(function(){" +
                "var tables=[...document.querySelectorAll('table')].slice(0,80).map(t=>[...t.querySelectorAll('tr')].slice(0,700).map(r=>[...r.querySelectorAll('th,td')].map(c=>(c.innerText||'').trim().slice(0,800))));" +
                "const now=new Date(),pageDate=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');" +
                "return JSON.stringify({title:document.title||'',url:location.pathname,tables:tables,pageDate:pageDate,capturedAt:now.toISOString()});" +
                "})()";
        erpView.evaluateJavascript(script, raw -> {
            if (raw == null || "null".equals(raw)) { message("Page isn't ready"); return; }
            try {
                String decoded = (String) new JSONTokener(raw).nextValue();
                if (decoded == null || decoded.length() < 4) { message("No visible data"); return; }
                // JSONObject.quote ensures captured text cannot execute as injected script.
                appView.evaluateJavascript("window.receiveErpSnapshot(" + JSONObject.quote(decoded) + ");", null);
                showApp();
            } catch (Exception ex) { message("Cannot read this ERP page"); }
        });
    }

    private final class UiBridge {
        @JavascriptInterface public void showErp() { main.post(() -> MainActivity.this.showErp()); }
        @JavascriptInterface public void openCollegeResult(){main.post(() -> academics.openCollegeResult());}
        @JavascriptInterface public void openCourse(){main.post(() -> academics.openCourse());}
        @JavascriptInterface public void openAktu(String roll){main.post(() -> academics.openAktu(roll));}
        @JavascriptInterface public void prefillAktu(String roll){main.post(() -> academics.prefillAktu());}
        @JavascriptInterface public void captureCurrentResult(){main.post(() -> academics.captureCurrent());}
        @JavascriptInterface public void captureStudentProfile(){main.post(() -> academics.captureStudentProfile());}
        @JavascriptInterface public void scanCollegeResults(){main.post(() -> academics.scanCollegeResults());}
        @JavascriptInterface public void exportCandidateReport(String json){main.post(() -> academics.exportCandidateReport(json));}
        @JavascriptInterface public void showToday() { main.post(() -> MainActivity.this.showToday()); }
        @JavascriptInterface public void showLogin() {
            main.post(() -> { collegeSessionReady=false; afterCollegeLogin=ERP;
                browserContainer.setVisibility(View.VISIBLE); erpView.loadUrl(LOGIN); });
        }
        @JavascriptInterface public void startAutoSync(String from, String to) {
            main.post(() -> startAutomaticSync(from, to));
        }
        @JavascriptInterface public void stopAutoSync() {
            main.post(() -> stopAuto("Sync stopped. You can resume later."));
        }
        @JavascriptInterface public void openErpRange(String from, String to) {
            // No undocumented API calls: show the official ERP and let the student select
            // this 30-day window there. Date-range batching in the app tracks all windows.
            main.post(() -> {
                pendingFrom = from; pendingTo = to;
                navigateCollege(TODAY);
                if (collegeSessionReady && erpView.getUrl()!=null && erpView.getUrl().toLowerCase(Locale.ROOT).contains("attend")) prefillDates(from, to);
                else message("Sign in on /ISIMGLB/Login, then attendance will open automatically");
            });
        }
    }

    // All requests run in the same WebView as the first-party, CAPTCHA-authenticated
    // session. Automation only clicks the attendance tab, the date inputs and Show;
    // it never reads login inputs or sends cookies or credentials anywhere.
    private void startAutomaticSync(String from, String to) {
        if (autoActive) { message("A sync is already running"); return; }
        autoWindows.clear();
        try {
            SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            df.setLenient(false);
            df.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date fromDate = df.parse(from), toDate = df.parse(to);
            if (fromDate == null || toDate == null || fromDate.after(toDate) || toDate.after(new Date()))
                throw new IllegalArgumentException("Invalid semester date range");
            Calendar start = Calendar.getInstance(TimeZone.getTimeZone("UTC")); start.setTime(fromDate);
            while (!start.getTime().after(toDate) && autoWindows.size() < 240) {
                String a = df.format(start.getTime());
                Calendar end = (Calendar) start.clone(); end.add(Calendar.DATE, 29);
                if (end.getTime().after(toDate)) end.setTime(toDate);
                String b = df.format(end.getTime());
                autoWindows.add(new String[]{a,b});
                start.add(Calendar.DATE, 30);
            }
            if (autoWindows.isEmpty() || autoWindows.size() >= 240) throw new IllegalArgumentException("Date range is too long");
        } catch(Exception e) { message("Choose valid dates before syncing"); return; }
        autoIndex = 0; autoAttempts = 0; autoBusy = false; autoActive = true;
        awaitingLoginNotice = false; autoStage = "ensure";
        notifyApp("Starting automatic sync: " + autoWindows.size() + " intervals", false);
        navigateCollege(TODAY);
        if (collegeSessionReady) scheduleAuto(500);
    }

    private void stopAuto(String explanation) {
        if (!autoActive) return;
        autoActive = false; autoBusy = false; autoStage = "ensure";
        notifyApp(explanation, true);
        message(explanation);
    }

    private boolean erpHost() {
        String u = erpView.getUrl(); if(u == null) return false;
        Uri uri = Uri.parse(u);
        return "https".equalsIgnoreCase(uri.getScheme())
                && "glbg.servergi.com".equalsIgnoreCase(uri.getHost()) && uri.getPort() == 8072;
    }

    private boolean attendancePage() {
        String u = erpView.getUrl();
        return u != null && u.toLowerCase(Locale.ROOT).matches(".*?/student/[^?#]*attend[^?#]*(?:[?#].*)?");
    }

    private void notifyApp(String message, boolean done) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("message",message).put("done",done)
                   .put("index",autoIndex).put("total",autoWindows.size());
        } catch(Exception ignored){}
        if(appView!=null) appView.evaluateJavascript("window.onSyncStatus("+payload.toString()+");",null);
        if(browserTitle!=null)browserTitle.setText(message.length() > 43 ? message.substring(0,43)+"…" : message);
    }

    private void scheduleAuto(int delayMs) {
        if(!autoActive) return;
        int token = ++autoScheduleToken;
        main.postDelayed(() -> {
            if(autoActive && token == autoScheduleToken && !autoBusy) autoTick();
        }, delayMs);
    }

    private String getAutomationScript() throws Exception {
        if(automationScript != null) return automationScript;
        try(InputStream in=getAssets().open("erp_bot.js"); ByteArrayOutputStream buffer=new ByteArrayOutputStream()) {
            byte[] data=new byte[8192]; int n;
            while((n=in.read(data))!=-1) buffer.write(data,0,n);
            automationScript=buffer.toString("UTF-8");
            return automationScript;
        }
    }

    private void command(String action, JSONObject arguments, java.util.function.Consumer<JSONObject> callback) {
        if(!autoActive || !erpHost()) { stopAuto("ERP session is not on the official secure domain."); return; }
        String script;
        try { script=getAutomationScript().replace("'__ACTION__'",JSONObject.quote(action))
                    .replace("__PARAMS__",arguments == null?"{}":arguments.toString()); }
        catch(Exception ex) { stopAuto("Unable to load local attendance automation.");return; }
        autoBusy = true;
        erpView.evaluateJavascript(script, result -> {
            autoBusy = false;
            if(!autoActive) return;
            try {
                Object decoded=new JSONTokener(result).nextValue();
                JSONObject reply=new JSONObject((String)decoded);
                callback.accept(reply);
            } catch(Exception ex) {
                stopAuto("ERP layout could not be read. No attendance was fabricated.");
            }
        });
    }

    private void autoTick() {
        if(!autoActive || autoBusy) return;
        if (!collegeSessionReady) {
            if(afterCollegeLogin == null) afterCollegeLogin = TODAY;
            notifyApp("Waiting for official SIM login and manual CAPTCHA",false);
            // The WebView's onPageFinished will resume sync after successful auth.
            return;
        }
        if(!erpHost()) { navigateCollege(TODAY); return; }
        if(!attendancePage() && !"ensure".equals(autoStage)) autoStage = "ensure";
        if("ensure".equals(autoStage)) {
            command("probe",null,reply -> {
                String state=reply.optString("state");
                if("login".equals(state)) {
                    if(!awaitingLoginNotice){notifyApp("Solve CAPTCHA and log into ERP; sync will resume",false);awaitingLoginNotice=true;}
                    scheduleAuto(3000); return;
                }
                if(!attendancePage()) {
                    if(!awaitingLoginNotice) notifyApp("Opening the official attendance page…",false);
                    navigateCollege(TODAY);
                    scheduleAuto(2600); return;
                }
                awaitingLoginNotice = false; autoStage = "date-tab";
                scheduleAuto(300);
            });
            return;
        }
        if("date-tab".equals(autoStage)) {
            command("open-date",null,reply -> {
                if("login".equals(reply.optString("state"))){autoStage="ensure";scheduleAuto(2000);return;}
                if(!"clicked-tab".equals(reply.optString("state"))) {
                    stopAuto("Couldn't find Date Wise tab. ERP layout needs mapping.");return;
                }
                autoStage="fill";scheduleAuto(1300);
            }); return;
        }
        if(autoIndex>=autoWindows.size()) {
            autoActive=false; autoBusy=false;
            notifyApp("Sync completed: " + autoWindows.size() + " intervals",true);
            showApp();return;
        }
        String[] dates = autoWindows.get(autoIndex);
        JSONObject range=new JSONObject();
        try { range.put("from",dates[0]).put("to",dates[1]); }catch(Exception ignored){}
        if("fill".equals(autoStage)) {
            notifyApp("Fetching " + dates[0] + " to " + dates[1] + " ("+(autoIndex+1)+"/"+autoWindows.size()+")",false);
            command("fill-submit",range,reply -> {
                String state=reply.optString("state");
                if("login".equals(state)) {autoStage="ensure";scheduleAuto(2000);return;}
                if(!"submitted".equals(state)) {
                    if(autoAttempts++ < 2) {autoStage="date-tab";scheduleAuto(1300);}
                    else stopAuto("Date Wise form couldn't be submitted: " + state);
                    return;
                }
                autoAttempts=0;autoStage="read";scheduleAuto(2200);
            });return;
        }
        if("read".equals(autoStage)) {
            command("read",range,reply -> {
                String state=reply.optString("state");
                if("login".equals(state)) {autoStage="ensure";scheduleAuto(2000);return;}
                JSONObject snapshot=reply.optJSONObject("snapshot");
                if(snapshot != null && ("table".equals(state)||"empty".equals(state))) {
                    // Validate the actual returned rows *belong* to this requested
                    // window (and not a stale AJAX report from a previous one).
                    int matching = countRecordsInRange(snapshot,dates[0],dates[1]);
                    if(matching > 0 || "empty".equals(state)) {
                        appView.evaluateJavascript("window.receiveAutoWindow("+
                                JSONObject.quote(dates[0])+","+JSONObject.quote(dates[1])+","+
                                JSONObject.quote(snapshot.toString())+");",null);
                        autoIndex++;autoAttempts=0;autoStage="fill";
                        scheduleAuto(1200);return;
                    }
                }
                if(autoAttempts++ >= MAX_READ_ATTEMPTS) {
                    stopAuto("ERP didn't return verified attendance for "+dates[0]+" – "+dates[1]+". Inspect Date Wise in the app.");
                    return;
                }
                scheduleAuto(1800);
            });
        }
    }

    // Verifies there is at least one actual P/A/NM date-wise row in the interval.
    // Status totals and row deduplication are handled by the JS attendance engine.
    private int countRecordsInRange(JSONObject snapshot,String from,String to) {
        int count=0; JSONArray tables=snapshot.optJSONArray("tables");
        if(tables==null)return 0;
        for(int i=0;i<tables.length();i++) {
            JSONArray table=tables.optJSONArray(i);if(table==null)continue;
            int dateCol=-1,statusCol=-1;
            for(int j=0;j<table.length();j++) {
                JSONArray row=table.optJSONArray(j);if(row==null)continue;
                if(dateCol<0) {
                    for(int k=0;k<row.length();k++) {
                        String cell=row.optString(k).trim().toLowerCase(Locale.ROOT);
                        if(cell.equals("date"))dateCol=k;
                        if(cell.equals("status"))statusCol=k;
                    }
                    if(dateCol>=0&&statusCol>=0)continue;
                    dateCol=-1;statusCol=-1;continue;
                }
                if(row.length()<=Math.max(dateCol,statusCol))continue;
                String d=row.optString(dateCol).trim();
                if(d.matches("\\d{2}/\\d{2}/\\d{4}")) d=d.substring(6)+"-"+d.substring(3,5)+"-"+d.substring(0,2);
                if(d.compareTo(from)>=0 && d.compareTo(to)<=0) {
                    String status=row.optString(statusCol).trim().toUpperCase(Locale.ROOT);
                    if(status.equals("P")||status.equals("A")||status.equals("NM"))count++;
                }
            }
        }
        return count;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (academics!=null && academics.onActivityResult(request,result,data))return;
        if (request == FILE_REQUEST && fileCallback != null) {
            Uri[] files = WebChromeClient.FileChooserParams.parseResult(result, data);
            fileCallback.onReceiveValue(files);
            fileCallback = null;
        }
    }
    @Override public void onBackPressed() {
        if (browserContainer.getVisibility() == View.VISIBLE) {
            if (erpView.canGoBack()) erpView.goBack(); else showApp();
        } else if (appView.canGoBack()) appView.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        autoActive=false;
        if(academics!=null)academics.stop();
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        appView.removeJavascriptInterface("Native");
        appView.destroy();
        erpView.destroy();
        super.onDestroy();
    }
}

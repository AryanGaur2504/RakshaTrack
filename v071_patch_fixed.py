from pathlib import Path
p=Path("app/src/main/java/com/campus/simplus/MainActivity.java")
s=p.read_text()
replacements=[
('try{startActivityForResult(pick,ROSTER_REQUEST);}catch(Exception e){message("No document picker available");}', """try{startActivityForResult(pick,ROSTER_REQUEST);}catch(Exception e){appView.evaluateJavascript("window.onRosterImportError('Android cannot open the document picker.');",null);message("No document picker available");}"""),
('main.post(()->appView.evaluateJavascript("window.onRosterImportError("+JSONObject.quote(reason)+");",null));', 'main.post(()->{appView.evaluateJavascript("window.onRosterImportError("+JSONObject.quote(reason)+");",null);message("Excel import failed: "+reason);});'),
('if(result == RESULT_OK && data != null && data.getData()!=null)importRosterDocument(data.getData());','if(result == RESULT_OK && data != null && data.getData()!=null){appView.evaluateJavascript("window.onRosterImportStarted();",null);importRosterDocument(data.getData());} else {appView.evaluateJavascript("window.onRosterPickerCancelled();",null);}')
]
for old,new in replacements:
    if old not in s: raise Exception("Missing expected import hook: "+old[:50])
    s=s.replace(old,new)
p.write_text(s)
p=Path("app/build.gradle")
s=p.read_text().replace("versionCode 9","versionCode 10").replace("versionName '0.7.0'","versionName '0.7.1'")
p.write_text(s)

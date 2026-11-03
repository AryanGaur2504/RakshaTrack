from pathlib import Path

p=Path("app/src/main/java/com/campus/simplus/MainActivity.java")
s=p.read_text()
old='try{startActivityForResult(pick,ROSTER_REQUEST);}catch(Exception e){message("No document picker available");}'
new='try{startActivityForResult(pick,ROSTER_REQUEST);}catch(Exception e){appView.evaluateJavascript("window.onRosterImportError(\\'Android cannot open the document picker.\\');",null);message("No document picker available");}'
assert old in s, "Roster picker hook missing"
s=s.replace(old,new)
old='main.post(()->appView.evaluateJavascript("window.onRosterImportError("+JSONObject.quote(reason)+");",null));'
new='main.post(()->{appView.evaluateJavascript("window.onRosterImportError("+JSONObject.quote(reason)+");",null);message("Excel import failed: "+reason);});'
assert old in s, "Roster error hook missing"
s=s.replace(old,new)
old='if(result == RESULT_OK && data != null && data.getData()!=null)importRosterDocument(data.getData());'
new='if(result == RESULT_OK && data != null && data.getData()!=null){appView.evaluateJavascript("window.onRosterImportStarted();",null);importRosterDocument(data.getData());} else {appView.evaluateJavascript("window.onRosterPickerCancelled();",null);}'
assert old in s, "Roster activity result missing"
s=s.replace(old,new)
p.write_text(s)
p=Path("app/build.gradle")
s=p.read_text().replace("versionCode 9","versionCode 10").replace("versionName '0.7.0'","versionName '0.7.1'")
p.write_text(s)

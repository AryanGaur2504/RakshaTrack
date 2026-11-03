package com.campus.simplus;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;

/** PDF output intentionally whitelists only candidate identity and exam results.
 * No attendance information is read, shown, or written into the report. */
public final class CandidateReport {
    private static final int WIDTH=595,HEIGHT=842,LEFT=43,RIGHT=552,BOTTOM=783;
    private final PdfDocument doc=new PdfDocument();
    private PdfDocument.Page page;
    private Canvas c;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private int y=0,number=0;
    private CandidateReport(){}
    private void newPage(){if(page!=null)finishPage();page=doc.startPage(new PdfDocument.PageInfo.Builder(WIDTH,HEIGHT,++number).create());c=page.getCanvas();c.drawColor(Color.WHITE);y=43;
        paint.setColor(Color.rgb(69,73,183));paint.setStyle(Paint.Style.FILL);c.drawRoundRect(LEFT,y,LEFT+34,y+34,9,9,paint);paint.setColor(Color.WHITE);paint.setTypeface(Typeface.create(Typeface.DEFAULT,Typeface.BOLD));paint.setTextSize(17);c.drawText("S+",LEFT+7,y+23,paint);
        textAt("SIM+ / ACADEMIC RECORD",LEFT+47,y+14,13,true,Color.rgb(31,42,77));textAt("PERSONAL CANDIDATE REPORT",LEFT+47,y+29,8,true,Color.rgb(118,127,151));y+=55;line();y+=15;}
    private void finishPage(){paint.setColor(Color.rgb(236,239,248));c.drawRect(LEFT,803,RIGHT,804,paint);textAt("Generated from saved official result-page captures. Not an official marksheet.",LEFT,817,8,false,Color.rgb(126,135,154));textAt("Page "+number,RIGHT-39,817,8,false,Color.rgb(126,135,154));doc.finishPage(page);page=null;}
    private void ensure(int height){if(page==null)newPage();if(y+height>=BOTTOM)newPage();}
    private void textAt(String s,int x,int y,float size,boolean bold,int color){paint.setStyle(Paint.Style.FILL);paint.setColor(color);paint.setTextSize(size);paint.setTypeface(Typeface.create(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL));c.drawText(s,x,y,paint);}
    private String safe(String x){if(x==null)return "";String value=x.replaceAll("[\\p{Cntrl}]+"," ").replaceAll("\\s+"," ").trim();return value.substring(0,Math.min(value.length(),220));}
    private String get(JSONObject obj,String key){return safe(obj==null?"":obj.optString(key,""));}
    private void line(){ensure(8);paint.setColor(Color.rgb(233,237,246));c.drawRect(LEFT,y,RIGHT,y+1,paint);y+=5;}
    private void space(int x){ensure(x);y+=x;}
    private void heading(String value){ensure(40);textAt(safe(value),LEFT,y+15,15,true,Color.rgb(31,42,77));y+=28;}
    private int wrapped(String value,int x,int width,int fontSize,boolean bold,int color){value=safe(value);if(value.isEmpty())value="Not provided";paint.setTypeface(Typeface.create(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL));paint.setTextSize(fontSize);String line="";int lines=0;
        for(String token:value.split(" ")){String next=line.isEmpty()?token:line+" "+token;if(paint.measureText(next)>width&&!line.isEmpty()){ensure(18);textAt(line,x,y+12,fontSize,bold,color);y+=15;lines++;line=token;}else line=next;}
        if(!line.isEmpty()){ensure(18);textAt(line,x,y+12,fontSize,bold,color);y+=15;lines++;}return lines;}
    private void labelValue(String label,String value){if(value==null||value.isEmpty())return;ensure(43);textAt(label.toUpperCase(java.util.Locale.US),LEFT,y+9,8,true,Color.rgb(127,136,154));y+=15;wrapped(value,LEFT,RIGHT-LEFT,11,true,Color.rgb(43,54,78));y+=8;}
    private void intro(JSONObject student,String when){heading("Candidate details");labelValue("Candidate",get(student,"name"));labelValue("Father name",get(student,"father"));labelValue("University roll number",get(student,"roll"));labelValue("Program",get(student,"program"));labelValue("Semester",get(student,"semester"));labelValue("College",get(student,"college"));labelValue("Academic session",get(student,"session"));labelValue("Admission number",get(student,"admission"));space(8);if(!when.isEmpty()){textAt("Report assembled: "+when.substring(0,Math.min(when.length(),19)).replace('T',' '),LEFT,y+10,9,false,Color.rgb(108,118,142));y+=24;}}
    private void result(JSONObject r,int n){heading(n+". "+(get(r,"source").equals("aktu")?"AKTU One View":"College SIM")+" exam");labelValue("Semester",get(r,"semester"));labelValue("Examination",get(r,"exam"));labelValue("Session",get(r,"session"));labelValue("Result status",get(r,"status"));String sgpa=get(r,"sgpa"),cgpa=get(r,"cgpa");if(!sgpa.isEmpty()||!cgpa.isEmpty())labelValue("Grade point average",(sgpa.isEmpty()?"":"SGPA "+sgpa)+(cgpa.isEmpty()?"":"   CGPA "+cgpa));
        JSONArray list=r.optJSONArray("subjects");if(list==null||list.length()==0){space(3);wrapped("No subject-level marks were present in the saved result summary.",LEFT,509,10,false,Color.rgb(112,120,143));space(18);return;}
        ensure(34);paint.setColor(Color.rgb(237,239,251));c.drawRoundRect(LEFT,y,RIGHT,y+26,6,6,paint);textAt("SUBJECT / CODE",LEFT+9,y+17,9,true,Color.rgb(76,79,144));textAt("MARKS / GRADE",RIGHT-125,y+17,9,true,Color.rgb(76,79,144));y+=31;
        for(int i=0;i<list.length()&&i<170;i++){
            JSONObject s=list.optJSONObject(i);if(s==null)continue;String name=get(s,"name"),code=get(s,"code"),marks=get(s,"marks"),grade=get(s,"grade"),total=get(s,"total"),status=get(s,"result");String examType=get(s,"examType"),examMonth=get(s,"examMonth"),marksType=get(s,"marksType"),min=get(s,"minMarks"),max=get(s,"maxMarks");
            if(name.isEmpty()&&code.isEmpty())continue;ensure(58);
            int yy=y;int limit=320;String title=name.isEmpty()?code:name;String first=title.length()>49?title.substring(0,48)+"…":title;
            textAt(first,LEFT+8,yy+16,10,true,Color.rgb(38,49,71));String extra=(code.isEmpty()?"":code+" · ")+(examType.isEmpty()?"":examType)+(examMonth.isEmpty()?"":" · "+examMonth);if(!extra.isEmpty())textAt(extra.length()>66?extra.substring(0,65):extra,LEFT+8,yy+31,9,false,Color.rgb(115,124,143));
            String value=!marks.isEmpty()?marks:!total.isEmpty()?total:!status.isEmpty()?status:"—";if(value.length()>20)value=value.substring(0,20);textAt(value,RIGHT-122,yy+17,10,true,Color.rgb(40,54,78));String sub=!min.isEmpty()||!max.isEmpty()?"Min "+min+" / Max "+max:(!grade.isEmpty()?"Grade "+grade:marksType);if(!sub.isEmpty())textAt(sub.substring(0,Math.min(sub.length(),30)),RIGHT-122,yy+32,8,false,Color.rgb(108,121,143));
            y+=45;line();
        }
        space(18);
    }
    static byte[] render(String raw)throws Exception {JSONObject root=new JSONObject(raw);JSONObject student=root.optJSONObject("candidate");JSONArray results=root.optJSONArray("results");if(student==null||results==null)throw new IllegalArgumentException("Missing candidate/results fields");if(results.length()>150)throw new IllegalArgumentException("Too many results");
        CandidateReport p=new CandidateReport();try{p.newPage();p.intro(student,p.get(root,"generatedAt"));p.space(10);p.heading("Exam result summary");if(results.length()==0){p.wrapped("No saved results are available. Capture official results before exporting a comprehensive report.",LEFT,RIGHT-LEFT,10,false,Color.rgb(116,126,144));}
            for(int i=0;i<results.length();i++){JSONObject r=results.optJSONObject(i);if(r!=null)p.result(r,i+1);}if(p.page!=null)p.finishPage();ByteArrayOutputStream out=new ByteArrayOutputStream();p.doc.writeTo(out);return out.toByteArray();}finally{p.doc.close();}
    }
}

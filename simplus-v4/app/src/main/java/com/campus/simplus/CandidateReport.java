package com.campus.simplus;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Compact unofficial academic result report. Explicit allowlist excludes attendance and DOB. */
public final class CandidateReport {
    private static final int W=595,H=842,M=37,RIGHT=W-M,MAXY=787;
    private static final int INK=Color.rgb(26,38,57),FAINT=Color.rgb(104,117,134),PURPLE=Color.rgb(70,78,169),EDGE=Color.rgb(225,230,240);
    private final PdfDocument doc=new PdfDocument();
    private final Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG);
    private PdfDocument.Page page;
    private Canvas canvas;
    private int y,pageNumber;
    private CandidateReport(){}
    private static String clean(String raw){if(raw==null)return "";return raw.replaceAll("[\\p{Cntrl}]"," ").replaceAll("\\s+"," ").trim().substring(0,Math.min(raw.replaceAll("[\\p{Cntrl}]"," ").replaceAll("\\s+"," ").trim().length(),300));}
    private static String val(JSONObject x,String key){return clean(x==null?"":x.optString(key,""));}
    private void draw(String content,float x,float baseline,float size,int shade,boolean bold){pen.setColor(shade);pen.setTypeface(Typeface.create(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL));pen.setTextSize(size);pen.setStyle(Paint.Style.FILL);canvas.drawText(content,x,baseline,pen);}
    private void fillRect(float left,float top,float right,float bottom,int color){pen.setColor(color);pen.setStyle(Paint.Style.FILL);canvas.drawRect(left,top,right,bottom,pen);}
    private void newPage(){if(page!=null)finishPage();page=doc.startPage(new PdfDocument.PageInfo.Builder(W,H,++pageNumber).create());canvas=page.getCanvas();canvas.drawColor(Color.WHITE);y=37;
        fillRect(M,y,M+27,y+27,PURPLE);draw("S+",M+5,y+19,13,Color.WHITE,true);
        draw("SIM+   |   CANDIDATE RESULTS",M+37,y+13,12,INK,true);
        draw("Private academic summary · Not an official marksheet",M+37,y+26,8,FAINT,false);y+=40;
        fillRect(M,y,RIGHT,y+1,EDGE);y+=13;
    }
    private void finishPage(){if(page==null)return;fillRect(M,804,RIGHT,805,EDGE);draw("Based on saved official result-page records · Attendance excluded",M,817,7.5f,FAINT,false);draw("Page "+pageNumber,RIGHT-39,817,7.5f,FAINT,false);doc.finishPage(page);page=null;}
    private void space(int h){ensure(h);y+=h;}
    private void ensure(int h){if(page==null||y+h>MAXY)newPage();}
    private ArrayList<String> wrap(String str,float width,float size){str=clean(str);ArrayList<String> lines=new ArrayList<>();if(str.isEmpty())return lines;
        pen.setTextSize(size);StringBuilder current=new StringBuilder();for(String word:str.split(" ")){String next=current.length()==0?word:current+" "+word;
            if(pen.measureText(next)>width&&current.length()>0){lines.add(current.toString());current=new StringBuilder(word);}else{current=new StringBuilder(next);} }
        if(current.length()>0)lines.add(current.toString());return lines;
    }
    private void title(String heading){ensure(35);draw(heading,M,y+15,13.5f,INK,true);y+=25;}
    private void identity(JSONObject student){title("Candidate details");
        String[][] fields={{"Student",val(student,"name")},{"University roll",val(student,"roll")},{"Father's name",val(student,"father")},{"Programme",val(student,"program")},{"Institute",val(student,"college")},{"Admission",val(student,"admission")}};
        for(int i=0;i<fields.length;i+=2){String[] a=fields[i],b=fields[i+1];if(a[1].isEmpty()&&b[1].isEmpty())continue;
            ArrayList<String> left=wrap(a[1],243,9),right=wrap(b[1],243,9);int rowHeight=Math.max(27,12+12*Math.max(Math.min(left.size(),3),Math.min(right.size(),3)));ensure(rowHeight+4);
            if(!a[1].isEmpty()){draw(a[0].toUpperCase(Locale.US),M,y+7,7.2f,FAINT,true);for(int j=0;j<left.size()&&j<3;j++)draw(left.get(j),M,y+20+11*j,9.2f,INK,true);}
            if(!b[1].isEmpty()){draw(b[0].toUpperCase(Locale.US),M+270,y+7,7.2f,FAINT,true);for(int j=0;j<right.size()&&j<3;j++)draw(right.get(j),M+270,y+20+11*j,9.2f,INK,true);}
            y+=rowHeight+6;
        }
        y+=4;fillRect(M,y,RIGHT,y+1,EDGE);y+=10;
    }
    private void resultHeader(JSONObject result){String source="aktu".equals(val(result,"source"))?"AKTU · UNIVERSITY":"COLLEGE · SIM";
        String semester=val(result,"semester"),exam=val(result,"exam"),session=val(result,"session");
        ensure(73);fillRect(M,y,RIGHT,y+32,Color.rgb(242,244,252));draw(source,M+9,y+12,8.2f,PURPLE,true);
        draw((semester.isEmpty()?"Unspecified semester":semester),M+9,y+26,12,INK,true);y+=39;
        if(!exam.isEmpty()){draw("Exam: "+clip(exam,65,8.4f),M+6,y+8,8.4f,INK,false);y+=15;}
        if(!session.isEmpty()){draw("Session: "+clip(session,65,8.2f),M+6,y+8,8.2f,FAINT,false);y+=15;}
        StringBuilder line=new StringBuilder();for(String[] item:new String[][]{{"SGPA",val(result,"sgpa")},{"CGPA",val(result,"cgpa")},{"Status",val(result,"status")},{"Marks",val(result,"marksTotal")},{"Declared",val(result,"resultDate")}}){if(!item[1].isEmpty()){if(line.length()>0)line.append("   ·   ");line.append(item[0]).append(": ").append(item[1]);}}
        if(line.length()>0){ensure(16);draw(clip(line.toString(),500,8.5f),M+6,y+9,8.5f,INK,true);y+=17;}
    }
    private String clip(String s,float width,float size){s=clean(s);pen.setTypeface(Typeface.create(Typeface.DEFAULT,Typeface.NORMAL));pen.setTextSize(size);if(pen.measureText(s)<=width)return s;
        while(s.length()>2&&pen.measureText(s+"…")>width)s=s.substring(0,s.length()-1);return s+"…";}
    private void tableHead(boolean aktu){ensure(23);fillRect(M,y,RIGHT,y+19,Color.rgb(238,241,250));draw("SUBJECT / CODE",M+6,y+13,7.5f,PURPLE,true);
        if(aktu){draw("INT",356,y+13,7.5f,PURPLE,true);draw("EXT",399,y+13,7.5f,PURPLE,true);draw("BACK",443,y+13,7.5f,PURPLE,true);draw("GRADE",508,y+13,7.5f,PURPLE,true);}
        else{draw("EXAM",350,y+13,7.5f,PURPLE,true);draw("MARKS",445,y+13,7.5f,PURPLE,true);draw("GRADE",509,y+13,7.5f,PURPLE,true);}
        y+=23;
    }
    private void subject(JSONObject s,boolean aktu){String name=val(s,"name"),code=val(s,"code"),typ=val(s,"examType"),grade=val(s,"grade");
        String title=name.isEmpty()?code:name;ArrayList<String> lines=wrap(title,280,8.8f);int height=Math.max(28,13+11*Math.min(lines.size(),3)+(!code.isEmpty()?10:0));
        if(y+height+6>MAXY){newPage();tableHead(aktu);}
        int top=y;for(int i=0;i<Math.min(3,lines.size());i++)draw(clip(lines.get(i),280,8.8f),M+6,y+11+i*11,8.8f,INK,i==0);
        if(!code.isEmpty())draw(clip(code,270,7.4f),M+6,y+11+11*Math.min(3,lines.size()),7.4f,FAINT,false);
        if(aktu){draw(clip(val(s,"internal"),36,9),356,top+13,9,INK,true);draw(clip(val(s,"external"),36,9),399,top+13,9,INK,true);draw(clip(val(s,"backPaper"),53,8.7f),443,top+13,8.7f,FAINT,false);draw(clip(grade,40,9),508,top+13,9,PURPLE,true);}
        else{String month=val(s,"examMonth");draw(clip(typ.isEmpty()?month:typ,90,8.3f),350,top+13,8.3f,INK,false);
            String marks=val(s,"marks"),maximum=val(s,"maxMarks");draw(clip(marks+(maximum.isEmpty()?"":"/"+maximum),60,9),445,top+13,9,INK,true);draw(clip(grade,40,9),509,top+13,9,PURPLE,true);
            if(!month.isEmpty())draw(clip(month,94,7.3f),350,top+25,7.3f,FAINT,false);
        }
        y+=height+2;fillRect(M,y,RIGHT,y+1,EDGE);y+=3;
    }
    private void result(JSONObject r){boolean aktu="aktu".equals(val(r,"source"));resultHeader(r);JSONArray subjects=r.optJSONArray("subjects");
        if(subjects==null||subjects.length()==0){ensure(24);draw("No subject-level records in this captured result.",M+6,y+12,9,FAINT,false);y+=22;}
        else{tableHead(aktu);for(int i=0;i<subjects.length()&&i<180;i++){JSONObject s=subjects.optJSONObject(i);if(s!=null)subject(s,aktu);}}space(10);
    }
    static byte[] render(String json)throws Exception {
        JSONObject root=new JSONObject(json);JSONObject identity=root.optJSONObject("candidate");JSONArray results=root.optJSONArray("results");
        if(identity==null||results==null)throw new IllegalArgumentException("Candidate/result data missing");
        if(results.length()>150)throw new IllegalArgumentException("Too many result sets");
        CandidateReport report=new CandidateReport();try{report.newPage();report.identity(identity);
            report.title("Examination records");
            if(results.length()==0){report.ensure(24);report.draw("No published exam results have been saved.",M,report.y+12,9,FAINT,false);}
            for(int i=0;i<results.length();i++){JSONObject r=results.optJSONObject(i);if(r!=null)report.result(r);}
            report.finishPage();ByteArrayOutputStream out=new ByteArrayOutputStream();report.doc.writeTo(out);return out.toByteArray();
        }finally{report.doc.close();}
    }
}
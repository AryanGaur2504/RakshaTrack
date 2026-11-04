package com.campus.simplus;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;
import javax.xml.parsers.SAXParserFactory;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.math.BigDecimal;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Bounded, streaming .xlsx parser. Never loads a large worksheet DOM in memory. */
final class LargeXlsxReader {
    static final int MAX_STUDENTS=50000;
    private static final long MAX_ARCHIVE_BYTES=256L*1024*1024, MAX_ENTRY_BYTES=192L*1024*1024;
    private static final Pattern FORMULA_LINK=Pattern.compile("(?i)HYPERLINK\\s*\\(\\s*\"(https://[^\"]{1,1900})\"");
    private static final Pattern NUM_SHEET=Pattern.compile("xl/worksheets/sheet([0-9]+)\\.xml");
    private static final String[] KEYS=StudentRosterStore.FIELDS;
    private LargeXlsxReader() {}

    static JSONArray load(Context context,Uri uri) throws Exception {
        if(uri==null)throw new IllegalArgumentException("Choose an Excel .xlsx file");
        Map<String,File> entries=new HashMap<>();
        try {
            try(InputStream in=context.getContentResolver().openInputStream(uri)) {
                if(in==null)throw new IllegalArgumentException("Cannot read selected Excel file");
                try(ZipInputStream zip=new ZipInputStream(in)) {
                    ZipEntry entry;int count=0;long total=0;
                    byte[] buf=new byte[32768];
                    while((entry=zip.getNextEntry())!=null){
                        if(++count>10000)throw new IllegalArgumentException("Too many files inside workbook");
                        String name=entry.getName();
                        boolean wanted=name.equals("xl/sharedStrings.xml")||name.equals("xl/workbook.xml")
                            ||NUM_SHEET.matcher(name).matches()||name.matches("xl/worksheets/_rels/sheet[0-9]+\\.xml\\.rels");
                        if(!wanted){zip.closeEntry();continue;}
                        File temp=File.createTempFile("simplus-xlsx-",".xml",context.getCacheDir());
                        entries.put(name,temp);long size=0;
                        try(FileOutputStream out=new FileOutputStream(temp)){
                            int n;while((n=zip.read(buf))!=-1){
                                size+=n;total+=n;
                                if(size>MAX_ENTRY_BYTES||total>MAX_ARCHIVE_BYTES)
                                    throw new IllegalArgumentException("Excel file is too large after decompression");
                                out.write(buf,0,n);
                            }
                        }
                        zip.closeEntry();
                    }
                }
            }
            if(entries.isEmpty())throw new IllegalArgumentException("The selected file is not a valid .xlsx workbook");
            ArrayList<String> shared=loadShared(entries.get("xl/sharedStrings.xml"));
            boolean date1904=is1904(entries.get("xl/workbook.xml"));
            ArrayList<String> sheets=new ArrayList<>();
            for(String n:entries.keySet())if(NUM_SHEET.matcher(n).matches())sheets.add(n);
            Collections.sort(sheets,(a,b)->Integer.compare(sheetNumber(a),sheetNumber(b)));
            String reason="No student records in the first 13 columns";
            for(String name:sheets){
                String relName=name.replace("xl/worksheets/","xl/worksheets/_rels/")+".rels";
                Map<String,String> rels=loadRelationships(entries.get(relName));
                Map<String,String> hyperlinks=loadHyperlinks(entries.get(name),rels);
                try{
                    JSONArray rows=loadRows(entries.get(name),shared,hyperlinks,date1904);
                    if(rows.length()>0)return rows;
                }catch(IllegalArgumentException ex){reason=ex.getMessage();}
            }
            throw new IllegalArgumentException(reason);
        }finally{
            for(File f:entries.values())if(f!=null)f.delete();
        }
    }

    private static int sheetNumber(String name){
        Matcher m=NUM_SHEET.matcher(name);return m.matches()?Integer.parseInt(m.group(1)):Integer.MAX_VALUE;
    }
    private static String tag(String local,String qualified){
        String t=(local!=null&&!local.isEmpty())?local:qualified;
        int i=t.indexOf(':');return i<0?t:t.substring(i+1);
    }
    private static void sax(File file,DefaultHandler handler)throws Exception{
        if(file==null)return;
        SAXParserFactory factory=SAXParserFactory.newInstance();factory.setNamespaceAware(true);
        try{factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);}catch(Exception ignored){}
        try{factory.setFeature("http://xml.org/sax/features/external-general-entities",false);}catch(Exception ignored){}
        try{factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);}catch(Exception ignored){}
        XMLReader reader=factory.newSAXParser().getXMLReader();
        reader.setContentHandler(handler);
        try(FileInputStream in=new FileInputStream(file)){reader.parse(new InputSource(in));}
    }
    private static ArrayList<String> loadShared(File f)throws Exception{
        ArrayList<String> strings=new ArrayList<>();if(f==null)return strings;
        sax(f,new DefaultHandler(){
            boolean inSI=false,inText=false;StringBuilder item=new StringBuilder(),text=new StringBuilder();
            @Override public void startElement(String uri,String local,String q,Attributes a){
                String t=tag(local,q);if("si".equals(t)){inSI=true;item.setLength(0);}
                if(inSI&&"t".equals(t)){inText=true;text.setLength(0);}
            }
            @Override public void characters(char[] c,int start,int len){if(inText)text.append(c,start,len);}
            @Override public void endElement(String uri,String local,String q){
                String t=tag(local,q);
                if("t".equals(t)&&inText){item.append(text);inText=false;}
                if("si".equals(t)&&inSI){
                    if(strings.size()>=600000)throw new IllegalArgumentException("Too many Excel shared strings");
                    strings.add(item.toString());inSI=false;
                }
            }
        });return strings;
    }
    private static boolean is1904(File f)throws Exception{
        if(f==null)return false;
        final boolean[] date={false};
        sax(f,new DefaultHandler(){@Override public void startElement(String uri,String local,String q,Attributes a){
            if("workbookPr".equals(tag(local,q)))date[0]="1".equals(a.getValue("date1904"))||"true".equalsIgnoreCase(a.getValue("date1904"));
        }});
        return date[0];
    }
    private static Map<String,String> loadRelationships(File f)throws Exception{
        Map<String,String> result=new HashMap<>();if(f==null)return result;
        sax(f,new DefaultHandler(){@Override public void startElement(String uri,String local,String q,Attributes a){
            if(!"Relationship".equals(tag(local,q)))return;
            String id=a.getValue("Id"),type=a.getValue("Type"),target=a.getValue("Target");
            if(id!=null&&type!=null&&type.endsWith("/hyperlink")&&safeHttps(target))result.put(id,target);
        }});return result;
    }
    private static Map<String,String> loadHyperlinks(File f,Map<String,String> rels)throws Exception{
        Map<String,String> links=new HashMap<>();if(f==null)return links;
        sax(f,new DefaultHandler(){@Override public void startElement(String uri,String local,String q,Attributes a){
            if(!"hyperlink".equals(tag(local,q)))return;
            String ref=a.getValue("ref"),rid=a.getValue("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
            if(rid==null)rid=a.getValue("r:id");
            String value=rels.get(rid);
            if(value==null&&safeHttps(a.getValue("location")))value=a.getValue("location");
            if(ref!=null&&value!=null&&ref.matches("(?i)M[0-9]+")&&links.size()<MAX_STUDENTS+1000)links.put(ref.toUpperCase(Locale.ROOT),value);
        }});return links;
    }
    private static boolean safeHttps(String raw){
        if(raw==null||raw.length()>1900)return false;
        try{URI url=new URI(raw.trim());return "https".equalsIgnoreCase(url.getScheme())&&url.getHost()!=null&&url.getUserInfo()==null;}catch(Exception ex){return false;}
    }
    private static int column(String address){
        int n=0;
        for(int i=0;i<address.length();i++){
            char c=Character.toUpperCase(address.charAt(i));if(c<'A'||c>'Z')break;
            n=n*26+c-'A'+1;
        }
        return n-1;
    }
    private static String normal(String s){return s==null?"":s.trim().replaceAll("[\\p{Cntrl}&&[^\\t]]"," ");}
    private static String value(String type,String raw,ArrayList<String> shared){
        raw=normal(raw);
        if("s".equals(type))try{int i=Integer.parseInt(raw);return i>=0&&i<shared.size()?shared.get(i):"";}catch(Exception ignored){return "";}
        if("b".equals(type))return "1".equals(raw)?"Yes":"No";
        if(raw.matches("(?i)[0-9]+(?:\\.[0-9]+)?e[+]?[0-9]+"))try{return new BigDecimal(raw).stripTrailingZeros().toPlainString();}catch(Exception ignored){}
        return raw.replaceFirst("\\.0+$","");
    }
    private static String date(String s,boolean d1904){
        if(s.matches("[0-9]{4,6}(?:\\.0+)?")){
            try{
                long days=Math.round(Double.parseDouble(s));
                if(days>15000&&days<180000){
                    Calendar c=Calendar.getInstance(TimeZone.getTimeZone("UTC"),Locale.US);c.clear();
                    c.set(1899,Calendar.DECEMBER,30);c.add(Calendar.DATE,(int)days+(d1904?1462:0));
                    SimpleDateFormat f=new SimpleDateFormat("dd/MM/yyyy",Locale.US);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(c.getTime());
                }
            }catch(Exception ignored){}
        }
        for(String fmt:new String[]{"dd/MM/yyyy","d/M/yyyy","yyyy-MM-dd","dd-MM-yyyy","dd.MM.yyyy"}){
            try{SimpleDateFormat f=new SimpleDateFormat(fmt,Locale.US);f.setLenient(false);java.util.Date d=f.parse(s);if(d!=null){
                SimpleDateFormat out=new SimpleDateFormat("dd/MM/yyyy",Locale.US);return out.format(d);
            }}catch(Exception ignored){}
        }
        return s;
    }
    private static String norm(String s){return s.replace('\u2019','\'').replaceAll("[^a-zA-Z0-9]","").toLowerCase(Locale.ROOT);}
    private static boolean isHeader(int i,String s){
        String v=norm(s),h=norm(StudentRosterStore.HEADERS[i]);
        if(v.equals(h))return true;
        switch(i){
            case 1:return Arrays.asList("universityrollnumber","rollno","rollnumber","akturollno").contains(v);
            case 2:return Arrays.asList("admissionnumber","admissionno").contains(v);
            case 3:return Arrays.asList("fathername","fathersname").contains(v);
            case 4:return Arrays.asList("dob","birthdate").contains(v);
            case 8:return v.equals("semester")||v.equals("currentsem");
            case 12:return Arrays.asList("photo","photograph","imageurl").contains(v);
            default:return false;
        }
    }
    private static boolean student(String[] a){
        String name=a[0].trim(),roll=a[1].trim();
        if(name.length()<2||name.length()>180||!name.matches(".*[\\p{L}].*"))return false;
        if(roll.length()<5||roll.length()>36||!roll.matches("[\\p{L}0-9_./-]+"))return false;
        int matches=0;for(int i=0;i<13;i++)if(isHeader(i,a[i]))matches++;
        return matches<4 && !norm(name).equals("name");
    }
    private static JSONArray loadRows(File file,ArrayList<String> shared,Map<String,String> links,boolean date1904)throws Exception{
        JSONArray students=new JSONArray();HashSet<String> rolls=new HashSet<>();
        sax(file,new DefaultHandler(){
            String[] cells;String cellType="",cellRef="";int cellIndex=-1,rowNumber=0;
            String read="";StringBuilder text=new StringBuilder();String cellValue="",formula="",inline="";boolean inRow=false,started=false;
            int skipped=0;
            @Override public void startElement(String uri,String local,String q,Attributes a){
                String t=tag(local,q);
                if("row".equals(t)){
                    inRow=true;cells=new String[13];Arrays.fill(cells,"");
                    rowNumber=parseInt(a.getValue("r"),rowNumber+1);
                }else if(inRow&&"c".equals(t)){
                    cellRef=a.getValue("r");cellIndex=column(cellRef==null?"":cellRef);
                    cellType=a.getValue("t");cellValue="";inline="";formula="";
                }else if(inRow&&("v".equals(t)||"f".equals(t)||"t".equals(t))){
                    read=t;text.setLength(0);
                }
            }
            @Override public void characters(char[] ch,int s,int len){if(!read.isEmpty())text.append(ch,s,len);}
            @Override public void endElement(String uri,String local,String q){
                String t=tag(local,q);
                if(inRow&&t.equals(read)){
                    if("v".equals(t))cellValue=text.toString();
                    else if("f".equals(t))formula=text.toString();
                    else if("t".equals(t))inline+=text;
                    read="";
                }
                if(inRow&&"c".equals(t)){
                    if(cellIndex>=0&&cellIndex<13){
                        String v="inlineStr".equals(cellType)?inline:value(cellType,cellValue,shared);
                        if(cellIndex==12){
                            String linked=links.get((cellRef==null?"":cellRef).toUpperCase(Locale.ROOT));
                            if(linked!=null)v=linked;
                            else if(!safeHttps(v)){
                                Matcher found=FORMULA_LINK.matcher(formula);
                                v=found.find()&&safeHttps(found.group(1))?found.group(1):"";
                            }
                        }
                        cells[cellIndex]=normal(v);
                    }
                    cellIndex=-1;
                }
                if(inRow&&"row".equals(t)){
                    inRow=false;boolean any=false;for(String v:cells)if(!v.isEmpty()){any=true;break;}
                    if(!any)return;
                    int matches=0;for(int i=0;i<13;i++)if(isHeader(i,cells[i]))matches++;
                    if(matches>=9){started=true;return;}
                    if(!started){
                        if(student(cells))started=true;
                        else{if(++skipped>100)throw new IllegalArgumentException("Name and University Roll No must be in columns A and B");return;}
                    }
                    if(!student(cells))throw new IllegalArgumentException("Invalid student record in Excel row "+rowNumber+" (columns A and B)");
                    String roll=cells[1].replaceFirst("\\.0+$","");
                    if(!rolls.add(roll.toUpperCase(Locale.ROOT)))throw new IllegalArgumentException("Duplicate University Roll No in Excel row "+rowNumber);
                    if(students.length()>=MAX_STUDENTS)throw new IllegalArgumentException("Too many students. Import a roster of up to "+MAX_STUDENTS+" rows.");
                    try{
                        JSONObject record=new JSONObject();
                        for(int i=0;i<13;i++){
                            String v=cells[i].length()>2200?cells[i].substring(0,2200):cells[i];
                            if(i==4)v=date(v,date1904);
                            record.put(KEYS[i],v);
                        }
                        students.put(record);
                    }catch(Exception ex){throw new IllegalArgumentException("Cannot import Excel row "+rowNumber);}
                }
            }
        });
        return students;
    }
    private static int parseInt(String s,int fallback){try{return Integer.parseInt(s);}catch(Exception e){return fallback;}}
}
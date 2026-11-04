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
import java.io.*;
import java.net.URI;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;
import java.text.*;
import java.math.BigDecimal;

/** Stream large Excel .xlsx worksheets instead of building DOM trees. */
final class LargeXlsxReader {
    static final int MAX_STUDENTS=50000;
    private static final long MAX_TOTAL=256L*1024*1024,MAX_ENTRY=192L*1024*1024;
    private static final Pattern SHEET=Pattern.compile("xl/worksheets/sheet([0-9]+)\\.xml");
    private static final Pattern HYPER=Pattern.compile("(?i)HYPERLINK\\s*\\(\\s*\"(https://[^\"]{1,1900})\"");
    private LargeXlsxReader(){}
    static JSONArray load(Context context,Uri uri)throws Exception {
        if(uri==null)throw new IllegalArgumentException("Choose an .xlsx file");
        Map<String,File> files=new HashMap<>();
        try {
            try(InputStream input=context.getContentResolver().openInputStream(uri)) {
                if(input==null)throw new IllegalArgumentException("Cannot open Excel file");
                try(ZipInputStream zip=new ZipInputStream(new BufferedInputStream(input))) {
                    ZipEntry entry;long total=0;int count=0;byte[] buffer=new byte[32768];
                    while((entry=zip.getNextEntry())!=null) {
                        if(++count>10000)throw new IllegalArgumentException("Too many ZIP entries");
                        String name=entry.getName();
                        boolean wanted=name.equals("xl/workbook.xml")||name.equals("xl/sharedStrings.xml")||SHEET.matcher(name).matches()||name.matches("xl/worksheets/_rels/sheet[0-9]+\\.xml\\.rels");
                        if(!wanted){zip.closeEntry();continue;}
                        File temp=File.createTempFile("simplus-xlsx-",".xml",context.getCacheDir());files.put(name,temp);
                        long size=0;
                        try(OutputStream out=new FileOutputStream(temp)){
                            int n;while((n=zip.read(buffer))!=-1) {
                                total+=n;size+=n;
                                if(total>MAX_TOTAL||size>MAX_ENTRY)throw new IllegalArgumentException("Excel worksheet exceeds import limits");
                                out.write(buffer,0,n);
                            }
                        }
                        zip.closeEntry();
                    }
                }
            }
            if(files.isEmpty())throw new IllegalArgumentException("This is not a readable .xlsx workbook");
            ArrayList<String> strings=shared(files.get("xl/sharedStrings.xml"));
            boolean d1904=dateSystem(files.get("xl/workbook.xml"));
            ArrayList<String> names=new ArrayList<>();
            for(String name:files.keySet())if(SHEET.matcher(name).matches())names.add(name);
            names.sort((a,b)->Integer.compare(sheetNumber(a),sheetNumber(b)));
            String error="Could not find students in columns A and B";
            for(String name:names){
                try {
                    String rel=name.replace("xl/worksheets/","xl/worksheets/_rels/")+".rels";
                    Map<String,String> links=hyperlinks(files.get(name),relationships(files.get(rel)));
                    JSONArray people=rows(files.get(name),strings,links,d1904);
                    if(people.length()>0)return people;
                }catch(IllegalArgumentException e){error=e.getMessage();}
            }
            throw new IllegalArgumentException(error);
        }finally {for(File f:files.values())if(f!=null)f.delete();}
    }
    private static int sheetNumber(String s){Matcher m=SHEET.matcher(s);return m.matches()?Integer.parseInt(m.group(1)):Integer.MAX_VALUE;}
    private static String tag(String local,String qualified){String t=local!=null&&!local.isEmpty()?local:qualified;int p=t.indexOf(':');return p>=0?t.substring(p+1):t;}
    private static void parse(File file,DefaultHandler handler)throws Exception {
        if(file==null)return;
        SAXParserFactory factory=SAXParserFactory.newInstance();factory.setNamespaceAware(true);
        try{factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);}catch(Exception ignored){}
        try{factory.setFeature("http://xml.org/sax/features/external-general-entities",false);}catch(Exception ignored){}
        try{factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);}catch(Exception ignored){}
        XMLReader reader=factory.newSAXParser().getXMLReader();reader.setContentHandler(handler);
        try(InputStream input=new FileInputStream(file)){reader.parse(new InputSource(input));}
    }
    private static ArrayList<String> shared(File file)throws Exception {
        ArrayList<String> list=new ArrayList<>();if(file==null)return list;
        parse(file,new DefaultHandler(){
            boolean inSi=false,inText=false;StringBuilder item=new StringBuilder(),text=new StringBuilder();
            @Override public void startElement(String u,String l,String q,Attributes a){
                String t=tag(l,q);if(t.equals("si")){inSi=true;item.setLength(0);}
                if(inSi&&t.equals("t")){inText=true;text.setLength(0);}
            }
            @Override public void characters(char[] ch,int st,int len){if(inText)text.append(ch,st,len);}
            @Override public void endElement(String u,String l,String q){
                String t=tag(l,q);if(t.equals("t")&&inText){item.append(text);inText=false;}
                if(t.equals("si")&&inSi){if(list.size()>600000)throw new IllegalArgumentException("Too many shared strings");list.add(item.toString());inSi=false;}
            }
        });return list;
    }
    private static boolean dateSystem(File file)throws Exception {
        final boolean[] yes={false};
        parse(file,new DefaultHandler(){@Override public void startElement(String u,String l,String q,Attributes a){
            if(tag(l,q).equals("workbookPr"))yes[0]="1".equals(a.getValue("date1904"))||"true".equalsIgnoreCase(a.getValue("date1904"));
        }});return yes[0];
    }
    private static Map<String,String> relationships(File file)throws Exception {
        Map<String,String> result=new HashMap<>();
        parse(file,new DefaultHandler(){@Override public void startElement(String u,String l,String q,Attributes a){
            if(tag(l,q).equals("Relationship")){
                String id=a.getValue("Id"),type=a.getValue("Type"),link=a.getValue("Target");
                if(id!=null&&type!=null&&type.endsWith("/hyperlink")&&https(link))result.put(id,link);
            }
        }});return result;
    }
    private static Map<String,String> hyperlinks(File file,Map<String,String> relations)throws Exception {
        Map<String,String> result=new HashMap<>();
        parse(file,new DefaultHandler(){@Override public void startElement(String u,String l,String q,Attributes a){
            if(!tag(l,q).equals("hyperlink"))return;
            String ref=a.getValue("ref");
            String id=a.getValue("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
            if(id==null)id=a.getValue("r:id");
            String link=relations.get(id);
            if(link==null&&https(a.getValue("location")))link=a.getValue("location");
            if(ref!=null&&ref.matches("(?i)M[0-9]+")&&link!=null&&result.size()<MAX_STUDENTS+1000)result.put(ref.toUpperCase(Locale.ROOT),link);
        }});return result;
    }
    private static boolean https(String raw){
        if(raw==null||raw.length()>1900)return false;
        try{URI uri=new URI(raw.trim());return "https".equalsIgnoreCase(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null;}catch(Exception ex){return false;}
    }
    private static int column(String ref){
        int result=0;
        for(char c:ref.toUpperCase(Locale.ROOT).toCharArray()){if(c<'A'||c>'Z')break;result=result*26+c-'A'+1;}
        return result-1;
    }
    private static String cell(String type,String v,ArrayList<String> strings){
        if("s".equals(type))try{int i=Integer.parseInt(v.trim());return i>=0&&i<strings.size()?strings.get(i):"";}catch(Exception ex){return "";}
        if("b".equals(type))return "1".equals(v)?"Yes":"No";
        if(v.matches("(?i)[0-9]+(?:\\.[0-9]+)?e[+]?[0-9]+"))try{return new BigDecimal(v).stripTrailingZeros().toPlainString();}catch(Exception ignored){}
        return v.replaceFirst("\\.0+$","");
    }
    private static String dob(String v,boolean date1904){
        if(v.matches("[0-9]{4,6}(?:\\.0+)?"))try{
            int days=(int)Math.round(Double.parseDouble(v));
            if(days>15000&&days<180000){
                Calendar c=Calendar.getInstance(TimeZone.getTimeZone("UTC"),Locale.US);c.clear();
                c.set(1899,Calendar.DECEMBER,30);c.add(Calendar.DATE,days+(date1904?1462:0));
                SimpleDateFormat f=new SimpleDateFormat("dd/MM/yyyy",Locale.US);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(c.getTime());
            }
        }catch(Exception ignored){}
        for(String fmt:new String[]{"dd/MM/yyyy","d/M/yyyy","yyyy-MM-dd","dd-MM-yyyy","dd.MM.yyyy"})try{
            SimpleDateFormat f=new SimpleDateFormat(fmt,Locale.US);f.setLenient(false);
            java.util.Date d=f.parse(v);if(d!=null)return new SimpleDateFormat("dd/MM/yyyy",Locale.US).format(d);
        }catch(Exception ignored){}
        return v;
    }
    private static String norm(String s){return s.replace('\u2019','\'').replaceAll("[^a-zA-Z0-9]","").toLowerCase(Locale.ROOT);}
    private static boolean header(int i,String v){
        String n=norm(v);if(n.equals(norm(StudentRosterStore.HEADERS[i])))return true;
        switch(i){
            case 1:return Arrays.asList("universityrollnumber","rollno","rollnumber","akturollno").contains(n);
            case 2:return Arrays.asList("admissionnumber","admissionno").contains(n);
            case 3:return Arrays.asList("fathername","fathersname").contains(n);
            case 4:return Arrays.asList("dob","birthdate").contains(n);
            case 8:return n.equals("semester")||n.equals("currentsem");
            case 12:return Arrays.asList("photo","photograph","imageurl").contains(n);
            default:return false;
        }
    }
    private static boolean student(String[] c){
        String name=c[0],roll=c[1];int headers=0;for(int i=0;i<13;i++)if(header(i,c[i]))headers++;
        return headers<4&&name.length()>=2&&name.length()<=180&&name.matches(".*[\\p{L}].*")&&roll.length()>=5&&roll.length()<=36&&roll.matches("[\\p{L}0-9_./-]+")&&!norm(name).equals("name");
    }
    private static int integer(String s,int defaultValue){try{return Integer.parseInt(s);}catch(Exception ignored){return defaultValue;}}
    private static JSONArray rows(File file,ArrayList<String> strings,Map<String,String> links,boolean dates)throws Exception {
        JSONArray result=new JSONArray();HashSet<String> uniqueRolls=new HashSet<>();
        parse(file,new DefaultHandler(){
            String[] row;String type="",address="",capture="",v="",formula="",inline="";int index=-1,rowNumber=0,skipped=0;
            StringBuilder value=new StringBuilder();boolean inRow=false,started=false;
            @Override public void startElement(String u,String l,String q,Attributes a){
                String t=tag(l,q);
                if(t.equals("row")){inRow=true;row=new String[13];Arrays.fill(row,"");rowNumber=integer(a.getValue("r"),rowNumber+1);}
                else if(inRow&&t.equals("c")){address=a.getValue("r");index=column(address==null?"":address);type=a.getValue("t");v="";formula="";inline="";}
                else if(inRow&&(t.equals("v")||t.equals("f")||t.equals("t"))){capture=t;value.setLength(0);}
            }
            @Override public void characters(char[] ch,int st,int len){if(!capture.isEmpty())value.append(ch,st,len);}
            @Override public void endElement(String u,String l,String q){
                String t=tag(l,q);
                if(inRow&&t.equals(capture)){
                    if(t.equals("v"))v=value.toString();
                    if(t.equals("f"))formula=value.toString();
                    if(t.equals("t"))inline+=value;
                    capture="";
                }
                if(inRow&&t.equals("c")){
                    if(index>=0&&index<13){
                        String s="inlineStr".equals(type)?inline:cell(type,v,strings);
                        if(index==12){
                            String link=links.get(address==null?"":address.toUpperCase(Locale.ROOT));
                            if(link!=null)s=link;
                            else if(!https(s)){Matcher m=HYPER.matcher(formula);s=m.find()&&https(m.group(1))?m.group(1):"";}
                        }
                        row[index]=s.trim().replaceAll("[\\p{Cntrl}&&[^\t]]"," ");
                    }
                    index=-1;
                }
                if(inRow&&t.equals("row")){
                    inRow=false;
                    boolean blank=true;for(String c:row)if(!c.isEmpty()){blank=false;break;}if(blank)return;
                    int headers=0;for(int i=0;i<13;i++)if(header(i,row[i]))headers++;
                    if(headers>=9){started=true;return;}
                    if(!started){if(student(row))started=true;else{if(++skipped>100)throw new IllegalArgumentException("Name and University Roll No must be in columns A and B");return;}}
                    if(!student(row))throw new IllegalArgumentException("Invalid student in Excel row "+rowNumber);
                    if(!uniqueRolls.add(row[1].toUpperCase(Locale.ROOT)))throw new IllegalArgumentException("Duplicate University Roll No in Excel row "+rowNumber);
                    if(result.length()>=MAX_STUDENTS)throw new IllegalArgumentException("Maximum supported roster is "+MAX_STUDENTS+" students");
                    try{JSONObject item=new JSONObject();for(int i=0;i<13;i++){
                        String s=row[i].length()>2200?row[i].substring(0,2200):row[i];
                        item.put(StudentRosterStore.FIELDS[i],i==4?dob(s,dates):s);
                    }result.put(item);}catch(Exception ex){throw new IllegalArgumentException("Could not import row "+rowNumber);}
                }
            }
        });return result;
    }
}

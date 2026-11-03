package com.campus.simplus;

import android.content.Context;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.xml.parsers.DocumentBuilderFactory;

/**
 * Strict offline XLSX reader and encrypted local multi-student roster.
 * The spreadsheet is never uploaded to a server. No third-party SDK or network access.
 */
final class StudentRosterStore {
    private static final String ALIAS="SIMPLUS_ROSTER_V1";
    private static final String FILE="roster.sec";
    static final String[] HEADERS={"Name","University Roll No","Admission No","Father's Name",
       "Date of Birth","Year of Admission","Category","Course","Current Semester","Session",
       "Correspondence Address (Parents)","Permanent Address (Parents)","Photo URL"};
    static final String[] FIELDS={"name","roll","admission","father","dob","admissionYear","category",
       "course","semester","session","correspondenceAddress","permanentAddress","photoUrl"};
    private static final int MAX_FILE=8*1024*1024,MAX_XML=12*1024*1024,MAX_TOTAL_XML=28*1024*1024,MAX_ROWS=2500;
    private final Context context;
    private JSONArray roster=new JSONArray();
    private int selected=-1;
    StudentRosterStore(Context ctx){context=ctx.getApplicationContext();load();}
    synchronized JSONObject selected(){return selected>=0&&selected<roster.length()?roster.optJSONObject(selected):null;}
    synchronized int count(){return roster.length();}
    synchronized JSONObject snapshot(){
        JSONObject out=new JSONObject();JSONArray list=new JSONArray();
        try {
            out.put("selected",selected);
            for(int i=0;i<roster.length();i++){
                JSONObject row=roster.optJSONObject(i);if(row==null)continue;
                list.put(new JSONObject().put("index",i).put("name",row.optString("name"))
                    .put("roll",row.optString("roll")).put("semester",row.optString("semester")));
            }
            out.put("students",list);
            if(selected()!=null)out.put("student",new JSONObject(selected().toString()));
        }catch(Exception ignored){}
        return out;
    }
    synchronized JSONObject choose(int index)throws Exception{
        if(index<0||index>=roster.length())throw new IllegalArgumentException("Student does not exist");
        selected=index;save();return snapshot();
    }
    synchronized JSONObject importXlsx(Uri uri)throws Exception{
        if(uri==null)throw new IllegalArgumentException("Choose an .xlsx workbook");
        long bytes=0;
        // Some cloud document providers support streams but not descriptors.
        try(android.os.ParcelFileDescriptor fd=context.getContentResolver().openFileDescriptor(uri,"r")){
            if(fd!=null&&fd.getStatSize()>MAX_FILE)throw new IllegalArgumentException("Workbook exceeds 8 MB limit");
        }catch(IllegalArgumentException e){throw e;}catch(Exception unsupportedProvider){
            // The bounded ZIP/XML reader below will validate the selected file.
        }
        Map<String,byte[]> xml=new HashMap<>();int accumulated=0;
        try(InputStream input=context.getContentResolver().openInputStream(uri)){
            if(input==null)throw new IllegalArgumentException("Cannot open workbook");
            try(ZipInputStream zip=new ZipInputStream(new java.io.BufferedInputStream(input))){
                ZipEntry entry;int count=0;
                while((entry=zip.getNextEntry())!=null){
                    if(++count>1500)throw new IllegalArgumentException("Workbook has too many ZIP entries");
                    String name=entry.getName();
                    boolean wanted=name.equals("xl/sharedStrings.xml")||name.equals("xl/workbook.xml")
                        ||name.matches("xl/worksheets/sheet[0-9]+\\.xml");
                    if(!wanted){zip.closeEntry();continue;}
                    ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int got;
                    while((got=zip.read(buffer))!=-1){
                        bytes+=got;accumulated+=got;
                        if(bytes>MAX_TOTAL_XML||out.size()+got>MAX_XML)
                            throw new IllegalArgumentException("Workbook expands beyond safety limits");
                        out.write(buffer,0,got);
                    }
                    xml.put(name,out.toByteArray());zip.closeEntry();
                }
            }
        }
        if(xml.isEmpty())throw new IllegalArgumentException("Not a readable .xlsx workbook");
        ArrayList<String> strings=readShared(xml.get("xl/sharedStrings.xml"));
        boolean date1904=readDateSystem(xml.get("xl/workbook.xml"));
        ArrayList<String> sheets=new ArrayList<>();
        for(String name:xml.keySet())if(name.matches("xl/worksheets/sheet[0-9]+\\.xml"))sheets.add(name);
        java.util.Collections.sort(sheets,(a,b)->Integer.compare(sheetNumber(a),sheetNumber(b)));
        String problem="Expected 13 spreadsheet headings in the specified order";
        for(String name:sheets){
            try{
                JSONArray entries=readSheet(xml.get(name),strings,date1904);
                if(entries.length()==0)throw new IllegalArgumentException("No students found below the header row");
                JSONArray previous=roster;int oldSelection=selected;
                roster=entries;selected=0;
                try{save();}catch(Exception persistError){roster=previous;selected=oldSelection;throw new IllegalArgumentException("Could not save imported student data");}
                return snapshot();
            }catch(IllegalArgumentException e){problem=e.getMessage();}
        }
        throw new IllegalArgumentException(problem);
    }
    private static int sheetNumber(String value){String n=value.replaceAll("\\D+"," ").trim();try{return Integer.parseInt(n);}catch(Exception ignored){return Integer.MAX_VALUE;}}
    private static Document document(byte[] raw)throws Exception{
        if(raw==null)return null;
        // Excel OOXML worksheets require no document type declarations or entity expansion.
        String xml=new String(raw,StandardCharsets.UTF_8);
        if(xml.contains("<!DOCTYPE")||xml.contains("<!ENTITY"))
            throw new IllegalArgumentException("Workbook contains unsupported XML declarations");
        DocumentBuilderFactory fac=DocumentBuilderFactory.newInstance();fac.setNamespaceAware(true);
        try{fac.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);}catch(Exception ignored){}
        try{fac.setFeature("http://xml.org/sax/features/external-general-entities",false);}catch(Exception ignored){}
        try{fac.setFeature("http://xml.org/sax/features/external-parameter-entities",false);}catch(Exception ignored){}
        try{fac.setXIncludeAware(false);}catch(Exception ignored){}
        fac.setExpandEntityReferences(false);
        return fac.newDocumentBuilder().parse(new ByteArrayInputStream(raw));
    }
    private static NodeList nodes(Node e,String name){return ((Element)e).getElementsByTagNameNS("*",name);}
    private static String firstText(Node e,String name){
        NodeList n=nodes(e,name);return n.getLength()>0?n.item(0).getTextContent():"";
    }
    private static ArrayList<String> readShared(byte[] raw)throws Exception{
        ArrayList<String> ss=new ArrayList<>();Document doc=document(raw);if(doc==null)return ss;
        NodeList entries=doc.getElementsByTagNameNS("*","si");
        if(entries.getLength()>100000)throw new IllegalArgumentException("Workbook string table too large");
        for(int i=0;i<entries.getLength();i++){
            NodeList parts=nodes(entries.item(i),"t");StringBuilder content=new StringBuilder();
            for(int k=0;k<parts.getLength();k++)content.append(parts.item(k).getTextContent());
            ss.add(content.toString());
        }
        return ss;
    }
    private static boolean readDateSystem(byte[] raw)throws Exception{
        Document d=document(raw);if(d==null)return false;
        NodeList n=d.getElementsByTagNameNS("*","workbookPr");
        if(n.getLength()==0)return false;
        String value=((Element)n.item(0)).getAttribute("date1904");return "1".equals(value)||"true".equalsIgnoreCase(value);
    }
    private static String norm(String s){return s.replace('\u2019','\'').replaceAll("[^a-zA-Z0-9]","").toLowerCase(Locale.ROOT);}
    private static int colIndex(String ref){int number=0;for(int i=0;i<ref.length();i++){char c=Character.toUpperCase(ref.charAt(i));if(c<'A'||c>'Z')break;number=number*26+c-'A'+1;}return number-1;}
    private static String cellValue(Element cell,ArrayList<String> strings){
        String type=cell.getAttribute("t"),v=firstText(cell,"v");
        if("s".equals(type)){
            try{int i=Integer.parseInt(v);return i>=0&&i<strings.size()?strings.get(i):"";}catch(Exception ignored){return "";}
        }
        if("inlineStr".equals(type)){
            StringBuilder buf=new StringBuilder();NodeList parts=nodes(cell,"t");
            for(int i=0;i<parts.getLength();i++)buf.append(parts.item(i).getTextContent());
            return buf.toString();
        }
        if("b".equals(type))return "1".equals(v)?"Yes":"No";
        if(v.matches("[-+]?\\d+\\.0+"))return v.replaceFirst("\\.0+$","");
        return v;
    }
    private static String dateValue(String value,boolean date1904){
        value=value.trim();
        if(value.matches("\\d{4,6}(?:\\.0+)?")){
            try{
                long days=Math.round(Double.parseDouble(value));
                if(days>10000&&days<180000){
                    Calendar c=Calendar.getInstance(TimeZone.getTimeZone("UTC"),Locale.US);c.clear();
                    c.set(1899,Calendar.DECEMBER,30);c.add(Calendar.DATE,(int)days+(date1904?1462:0));
                    SimpleDateFormat f=new SimpleDateFormat("dd/MM/yyyy",Locale.US);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(c.getTime());
                }
            }catch(Exception ignored){}
        }
        String[] formats={"dd/MM/yyyy","d/M/yyyy","yyyy-MM-dd","dd-MM-yyyy","dd.MM.yyyy"};
        for(String format:formats){try{SimpleDateFormat f=new SimpleDateFormat(format,Locale.US);f.setLenient(false);
            java.util.Date date=f.parse(value);if(date!=null&&f.format(date).equals(value)){
                SimpleDateFormat out=new SimpleDateFormat("dd/MM/yyyy",Locale.US);return out.format(date);
            }
        }catch(Exception ignored){}}
        return value;
    }
    private static boolean headerCell(int i,String value){
        String v=norm(value);
        if(v.equals(norm(HEADERS[i])))return true;
        switch(i){
            case 1:return v.equals("universityrollnumber")||v.equals("universityroll")||v.equals("rollno")||v.equals("rollnumber")||v.equals("akturollno");
            case 2:return v.equals("admissionnumber")||v.equals("admissionid")||v.equals("admissionno");
            case 3:return v.equals("fathername")||v.equals("fathersname")||v.equals("parentsname");
            case 4:return v.equals("dob")||v.equals("birthdate")||v.equals("dateofbirth");
            case 5:return v.equals("admissionyear")||v.equals("joiningyear")||v.equals("yearofjoining");
            case 8:return v.equals("semester")||v.equals("currentsem")||v.equals("currentsemester");
            case 10:return v.equals("correspondenceaddress")||v.equals("parentcorrespondenceaddress");
            case 11:return v.equals("permanentaddress")||v.equals("parentpermanentaddress");
            case 12:return v.equals("photo")||v.equals("photourl")||v.equals("photographurl")||v.equals("imageurl");
            default:return false;
        }
    }
    private static boolean looksLikeStudent(String[] values){
        String name=values[0].trim(),roll=values[1].trim().replaceAll("\\.0+$","");
        if(name.length()<2||name.length()>180||name.matches(".*[<>].*")||!name.matches(".*[\\p{L}].*"))return false;
        if(roll.length()<5||roll.length()>36||!roll.matches("[\\p{L}0-9_./-]+"))return false;
        if(norm(name).equals("name")||norm(name).startsWith("studentname"))return false;
        int matches=0;for(int i=0;i<13;i++)if(headerCell(i,values[i]))matches++;
        return matches<4;
    }
    private static JSONArray readSheet(byte[] raw,ArrayList<String> strings,boolean date1904)throws Exception{
        Document doc=document(raw);if(doc==null)throw new IllegalArgumentException("No worksheet found");
        NodeList rows=doc.getElementsByTagNameNS("*","row");
        if(rows.getLength()>MAX_ROWS+60)throw new IllegalArgumentException("Workbook contains too many rows");
        JSONArray entries=new JSONArray();HashSet<String> found=new HashSet<>();
        boolean started=false;String issue="No student rows found. Name must be column A and University Roll No column B.";
        for(int j=0;j<rows.getLength();j++){
            Node row=rows.item(j);NodeList cells=nodes(row,"c");String[] values=new String[13];
            for(int k=0;k<values.length;k++)values[k]="";
            for(int i=0;i<cells.getLength();i++){
                Element cell=(Element)cells.item(i);int index=colIndex(cell.getAttribute("r"));
                if(index>=0&&index<13)values[index]=cellValue(cell,strings).trim().replaceAll("[\\u0000-\\u001F]"," ");
            }
            boolean blank=true;for(String value:values)if(!value.isEmpty()){blank=false;break;}
            if(blank)continue;
            int headingMatches=0;for(int i=0;i<13;i++)if(headerCell(i,values[i]))headingMatches++;
            if(!started){
                if(headingMatches>=9){started=true;continue;}
                if(headingMatches>=4){
                    issue="Column headings are not in the expected 13-column order (Name, University Roll No, Admission No, Father's Name, DOB, ..., Photo URL).";
                    continue;
                }
                if(!looksLikeStudent(values)){if(j>40)break;continue;}
                started=true; // A headerless workbook starts with an actual student.
            }else if(headingMatches>=9)continue;
            if(!looksLikeStudent(values))throw new IllegalArgumentException("Row "+(j+1)+": name must be in column A and university roll number in column B.");
            String roll=values[1].replaceAll("\\.0+$","");
            if(!found.add(roll.toUpperCase(Locale.ROOT)))throw new IllegalArgumentException("Duplicate University Roll No in row "+(j+1)+": "+roll);
            JSONObject record=new JSONObject();
            try{
                for(int i=0;i<13;i++){
                    String value=values[i].length()>1500?values[i].substring(0,1500):values[i];
                    if(i==4)value=dateValue(value,date1904);
                    record.put(FIELDS[i],value);
                }
                entries.put(record);
            }catch(Exception e){throw new IllegalArgumentException("Could not import row "+(j+1));}
            if(entries.length()>MAX_ROWS)throw new IllegalArgumentException("Too many student records");
        }
        if(entries.length()==0)throw new IllegalArgumentException(issue);
        return entries;
    }
    private SecretKey secret()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias(ALIAS))return (SecretKey)ks.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private void save()throws Exception{
        JSONObject content=new JSONObject().put("students",roster).put("selected",selected);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secret());
        byte[] encrypted=cipher.doFinal(content.toString().getBytes(StandardCharsets.UTF_8));
        File temp=new File(context.getFilesDir(),FILE+".tmp"),finalFile=new File(context.getFilesDir(),FILE);
        try(OutputStream out=new FileOutputStream(temp)){
            out.write(cipher.getIV());out.write(encrypted);out.flush();
        }
        if(!temp.renameTo(finalFile)){
            try(InputStream in=new java.io.FileInputStream(temp);OutputStream out=new FileOutputStream(finalFile)){
                byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);
            }
            temp.delete();
        }
    }
    private void load(){
        File f=new File(context.getFilesDir(),FILE);if(!f.exists())return;
        try(InputStream in=new java.io.FileInputStream(f)){
            ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1){if(data.size()+n>MAX_FILE)throw new Exception("Roster file too large");data.write(buffer,0,n);}
            byte[] full=data.toByteArray();if(full.length<28)throw new Exception("Corrupt file");
            byte[] nonce=java.util.Arrays.copyOfRange(full,0,12);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,nonce));
            byte[] plain=cipher.doFinal(full,12,full.length-12);
            JSONObject obj=new JSONObject(new String(plain,StandardCharsets.UTF_8));
            roster=obj.getJSONArray("students");selected=obj.optInt("selected",0);
            if(selected>=roster.length()||selected<0)selected=roster.length()>0?0:-1;
        }catch(Exception ignored){roster=new JSONArray();selected=-1;}
    }
}

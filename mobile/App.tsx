import React,{useEffect,useRef,useState} from 'react';
import {Alert,Linking,Platform,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import MapView,{Marker,Polyline} from 'react-native-maps';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import {assessJourneySafety,initialState,pathDistance,makeIncident,distance,type State,type Point,type Contact,type Trip} from './src/safety';
import {loadState,saveState,addRidePoint,getRidePoints} from './src/storage';
import {fromLocation,startNativeTracking,stopNativeTracking} from './src/tasks';
import {configureNotifications,localSafetyAlert} from './src/notifications';
import './src/tasks';
const id=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const initial:State={...initialState,settings:{...initialState.settings,name:'Passenger',locationConsent:true,notifications:true}};
type Tab='Home'|'Ride'|'Contacts'|'History'|'Settings';
export default function App(){
 const [state,setState]=useState<State>(initial),[tab,setTab]=useState<Tab>('Home'),[ready,setReady]=useState(false);
 const [location,setLocation]=useState<Point|null>(null),[livePoints,setLivePoints]=useState<Point[]>([]);
 const [contactName,setContactName]=useState(''),[contactPhone,setContactPhone]=useState(''),[contactRelation,setContactRelation]=useState('');
 const [message,setMessage]=useState(''),[clock,setClock]=useState(Date.now());
 const [rideName,setRideName]=useState('My journey'),[busy,setBusy]=useState(false);
 const current=useRef<State>(initial);const watch=useRef<Location.LocationSubscription|null>(null);
 const active=state.trips.find(t=>t.status==='active')??null;
 const commit=(next:State)=>{current.current=next;setState(next);void saveState(next).catch(()=>setMessage('Could not save this journey on device.'))};
 const change=(fn:(s:State)=>State)=>commit(fn(current.current));
 useEffect(()=>{let mounted=true;void(async()=>{try{const prior=await loadState();if(mounted&&prior){current.current=prior;setState(prior);const t=prior.trips.find(x=>x.status==='active');if(t)setLivePoints(await getRidePoints(t.id));}await configureNotifications();}catch(e){if(mounted)setMessage(String(e))}finally{if(mounted)setReady(true)}})();const timer=setInterval(()=>setClock(Date.now()),5000);return()=>{mounted=false;clearInterval(timer);watch.current?.remove()}},[]);
 useEffect(()=>{let cancelled=false;void(async()=>{try{
  const permission=await Location.requestForegroundPermissionsAsync();
  if(permission.status!=='granted'){setMessage('Location access denied. You can still use the SOS phone and SMS fallback.');return;}
  const initialFix=await Location.getLastKnownPositionAsync();if(initialFix&&!cancelled)setLocation(fromLocation(initialFix));
  watch.current=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:2,timeInterval:2000},async fix=>{
    if(cancelled)return;const point=fromLocation(fix);setLocation(point);
    const ride=current.current.trips.find(x=>x.status==='active');if(!ride||point.time<ride.start||point.accuracy>75)return;
    try{await addRidePoint(ride.id,point)}catch{}
    setLivePoints(points=>points.at(-1)?.time===point.time?points:[...points,point].slice(-4000));
  });
 }catch(e){if(!cancelled)setMessage('GPS unavailable: '+String(e))}})();return()=>{cancelled=true;watch.current?.remove()}},[]);
 const start=async()=>{if(busy||active)return;setBusy(true);try{
  const t:Trip={id:id(),name:rideName.trim()||'My journey',mode:'Car / cab',start:Date.now(),destination:null,points:[],route:[],events:[],demo:false,status:'active',updated:Date.now()};
  change(s=>({...s,trips:[t,...s.trips]}));setLivePoints([]);setTab('Ride');
  try{await startNativeTracking(t.id);setMessage('Journey started. Background GPS requested.');}
  catch(e){setMessage(String(e)+' Foreground tracking remains available while app is open.')}
 }finally{setBusy(false)}};
 const end=async()=>{if(!active)return;setBusy(true);try{
  await stopNativeTracking();const points=await getRidePoints(active.id);
  change(s=>({...s,trips:s.trips.map(t=>t.id===active.id?{...t,points,end:Date.now(),updated:Date.now(),status:'completed'}:t)}));
  setLivePoints([]);setMessage('Journey saved. Distance is an estimate, not an odometer.');
 }finally{setBusy(false)}};
 const sendSMS=async(to:Contact[],quiet=false)=>{
  if(!to.length){Alert.alert('No trusted contact','Add a contact in the Contacts tab, or call emergency services.');return;}
  const supported=await SMS.isAvailableAsync();if(!supported){Alert.alert('SMS not available','Use the phone dialer for emergency help.');return;}
  const body=(quiet?'SOS: I cannot speak. Please TEXT instead of calling. ':'SOS: I need help. ')+(location?'Last known location: https://www.google.com/maps/search/?api=1&query='+location.lat+','+location.lng:'Location is unavailable.')+' Timestamp: '+new Date().toISOString()+'. Delivery is not confirmed.';
  const r=await SMS.sendSMSAsync(to.map(c=>c.phone),body);
  setMessage('SMS composer opened'+(r.result==='sent'?' and returned sent status. Delivery is not confirmed.':'. Press Send in your messaging app. Delivery is not confirmed.'));
 };
 const sos=()=>Alert.alert('Emergency actions','Manual SMS or calling only. This app does not yet send remote contact alerts.',[
  {text:'Text trusted contacts',onPress:()=>void sendSMS(state.contacts)},
  {text:'Quiet text — do not call',onPress:()=>void sendSMS(state.contacts,true)},
  {text:'Call 112',onPress:()=>void Linking.openURL('tel:112')},
  {text:'Cancel',style:'cancel'}
 ]);
 const addContact=()=>{const phone=contactPhone.trim(),name=contactName.trim();
  if(!name||!/^\+?[0-9 ()-]{7,20}$/.test(phone)){Alert.alert('Invalid contact','Enter a name and an international phone number.');return;}
  if(state.contacts.length>=2){Alert.alert('Contact limit','Remove a contact before adding another.');return;}
  if(state.contacts.some(c=>c.phone.replace(/\D/g,'')===phone.replace(/\D/g,''))){Alert.alert('Duplicate contact');return;}
  change(s=>({...s,contacts:[...s.contacts,{id:id(),name,phone,relation:contactRelation.trim()}]}));setContactName('');setContactPhone('');setContactRelation('');
 };
 const assessment=active?assessJourneySafety({...active,points:livePoints},state.settings,clock):null;
 useEffect(()=>{if(!active||!assessment?.concern)return;const exists=active.events.some(e=>e.type==='concern'&&e.message===assessment.concern);if(exists)return;
  change(s=>({...s,trips:s.trips.map(t=>t.id===active.id?{...t,events:[...t.events,{id:id(),time:Date.now(),type:'concern',message:assessment.concern!}]}:t)}));
  void localSafetyAlert('RakshaTrack safety check',assessment.concern);Alert.alert('Please confirm your safety',assessment.concern+' — this is a possible concern, not evidence of danger.',[{text:'I am safe'},{text:'Open SOS',onPress:sos}]);
 },[assessment?.concern,active?.id]);
 const btn=(title:string,action:()=>void,red=false)=><TouchableOpacity style={[styles.button,red&&styles.danger]} onPress={action}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
 const field=(title:string,value:string,set:(x:string)=>void,keyboard:'default'|'phone-pad'='default')=><View style={styles.field}><Text style={styles.label}>{title}</Text><TextInput style={styles.input} value={value} onChangeText={set} keyboardType={keyboard} placeholder={title} placeholderTextColor="#7b9188"/></View>;
 const format=(n:number)=>new Date(n).toLocaleString();
 return <SafeAreaView style={styles.screen}><StatusBar barStyle="dark-content"/><View style={styles.header}><View><Text style={styles.brand}>RakshaTrack</Text><Text style={styles.small}>YOUR NATIVE SAFETY COMPANION</Text></View><Text style={styles.online}>{location?'● GPS':'○ GPS waiting'}</Text></View>
 <View style={styles.tabRow}>{(['Home','Ride','Contacts','History','Settings'] as Tab[]).map(x=><TouchableOpacity key={x} onPress={()=>setTab(x)} style={[styles.tab,tab===x&&styles.selected]}><Text style={[styles.tabText,tab===x&&styles.selectedText]}>{x}</Text></TouchableOpacity>)}</View>
 <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
 {message!==''&&<Text style={styles.message} onPress={()=>setMessage('')}>{message}  ×</Text>}
 {tab==='Home'&&<><Text style={styles.h1}>Your journey. Your safety.</Text><Text style={styles.p}>The same RakshaTrack safety workflow rebuilt for Android. GPS, trips and trusted-contact SMS actions are native.</Text><View style={styles.card}><Text style={styles.h2}>{active?'Journey in progress':'Ready to begin'}</Text><Text style={styles.p}>{active?'Started '+format(active.start):'Start a journey to record your movements.'}</Text>{active?btn('Open active journey',()=>setTab('Ride')):btn('Start journey',()=>setTab('Ride'))}</View><View style={styles.card}><Text style={styles.h2}>Your safety circle</Text><Text style={styles.p}>{state.contacts.length} trusted contacts on this device. Remote Guardian account linking is not enabled in this native prototype.</Text>{btn('Manage contacts',()=>setTab('Contacts'))}</View>{btn('Emergency SOS actions',sos,true)}</>}
 {tab==='Ride'&&<><Text style={styles.h1}>My ride</Text><View style={styles.card}>{!active&&field('Journey name',rideName,setRideName)}{active?<>{<Text style={styles.h2}>Tracking: {active.name}</Text>}<Text style={styles.p}>Estimated distance: {(pathDistance(livePoints)/1000).toFixed(2)} km</Text><Text style={styles.p}>Tracking: {assessment?.tracking} · Stops: {assessment?.stop}</Text>{btn('End & save journey',()=>void end(),true)}</>:btn('Start live ride',()=>void start())}</View>
 {location?<MapView style={styles.map} showsUserLocation initialRegion={{latitude:location.lat,longitude:location.lng,latitudeDelta:.018,longitudeDelta:.018}}><Marker coordinate={{latitude:location.lat,longitude:location.lng}} pinColor="#196ec6" title="Last GPS fix"/>{livePoints.length>1&&<Polyline coordinates={livePoints.map(p=>({latitude:p.lat,longitude:p.lng}))} strokeColor="#196ec6" strokeWidth={4}/>}</MapView>:<View style={styles.card}><Text>Waiting for location permission and GPS…</Text></View>}
 <Text style={styles.p}>{location?'Last GPS '+format(location.time)+' · ±'+Math.round(location.accuracy)+'m':'No live GPS fix available'}</Text>{btn('Emergency SOS actions',sos,true)}</>}
 {tab==='Contacts'&&<><Text style={styles.h1}>Trusted contacts</Text><Text style={styles.p}>Add up to two trusted phone contacts for manual SOS SMS/calls. Saving a phone number does not remotely link another person's RakshaTrack account.</Text><View style={styles.card}>{field('Contact name',contactName,setContactName)}{field('Phone (+91...)',contactPhone,setContactPhone,'phone-pad')}{field('Relationship',contactRelation,setContactRelation)}{btn('Save local contact',addContact)}</View>{state.contacts.map((c,i)=><View key={c.id} style={styles.card}><Text style={styles.h2}>{i+1}. {c.name}</Text><Text style={styles.p}>{c.relation} · {c.phone}</Text>{btn('Call contact',()=>void Linking.openURL('tel:'+c.phone.replace(/[^+\d]/g,'')))}{btn('Remove contact',()=>change(s=>({...s,contacts:s.contacts.filter(x=>x.id!==c.id)})),true)}</View>)}{btn('Send SMS to contacts',()=>void sendSMS(state.contacts))}</>}
 {tab==='History'&&<><Text style={styles.h1}>Journey history</Text>{!state.trips.length&&<Text style={styles.p}>Journeys you save will appear here.</Text>}{state.trips.map(t=><View key={t.id} style={styles.card}><Text style={styles.h2}>{t.name}</Text><Text style={styles.p}>{format(t.start)} · {t.status}</Text><Text style={styles.p}>{t.end?'Recorded '+(pathDistance(t.points)/1000).toFixed(2)+' km':'Currently active'}</Text>{t.events.length>0&&<Text style={styles.p}>{t.events.length} safety events</Text>}</View>)}</>}
 {tab==='Settings'&&<><Text style={styles.h1}>Settings & permissions</Text><Text style={styles.p}>For locked-screen recording, grant Android 'Allow all the time' location access. GPS sampling and notifications are subject to Android battery restrictions.</Text>{btn('Request native notifications',()=>void configureNotifications().then(()=>localSafetyAlert('RakshaTrack','Native notification test')))}{btn('Open app permissions',()=>void Linking.openSettings())}<View style={styles.card}><Text style={styles.h2}>Account & remote contacts</Text><Text style={styles.p}>Cross-device accounts and push SOS require secure native tokens and Guardian API integration. These are not enabled yet.</Text></View></>}
 </ScrollView><Text style={styles.footer}>{ready?'Native prototype · Never rely on this alone for emergencies':'Opening saved records…'}</Text></SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#f4f8f6'},header:{paddingHorizontal:17,paddingVertical:14,backgroundColor:'#fff',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{fontSize:24,fontWeight:'800',color:'#17674e'},small:{fontSize:9,color:'#607469',letterSpacing:1},online:{fontSize:12,color:'#17674e'},tabRow:{flexDirection:'row',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#dbe7e0'},tab:{flex:1,alignItems:'center',paddingVertical:12},selected:{borderBottomWidth:3,borderBottomColor:'#17674e'},tabText:{fontSize:11,color:'#5d7868',fontWeight:'600'},selectedText:{color:'#17674e'},content:{padding:16,paddingBottom:50,gap:13},h1:{fontSize:24,fontWeight:'800',color:'#143f32'},h2:{fontSize:17,fontWeight:'700',color:'#204a3b'},p:{fontSize:14,lineHeight:21,color:'#4c6257'},card:{backgroundColor:'#fff',padding:16,borderRadius:14,gap:11,borderWidth:1,borderColor:'#e1eae4'},button:{paddingVertical:12,paddingHorizontal:13,borderRadius:10,backgroundColor:'#17674e',alignItems:'center'},danger:{backgroundColor:'#af3636'},buttonText:{color:'white',fontWeight:'700',fontSize:14},field:{gap:5},label:{fontSize:13,fontWeight:'600',color:'#375747'},input:{borderWidth:1,borderColor:'#b9d0c2',borderRadius:8,padding:11,color:'#173f30',fontSize:15},map:{height:300,borderRadius:12},message:{backgroundColor:'#fff2d9',padding:12,borderRadius:9,color:'#744c19'},footer:{textAlign:'center',padding:9,color:'#63786c',fontSize:10}});

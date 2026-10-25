import * as Notifications from 'expo-notifications';
export async function configureNotifications(){
 await Notifications.setNotificationChannelAsync('rakshatrack-sos',{name:'RakshaTrack Safety',importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,350,150,350,150,650],enableVibrate:true,sound:'default'});
 Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:true})});
}
export async function localSafetyAlert(title:string,message:string){
 const p=await Notifications.requestPermissionsAsync();if(!p.granted) return false;
 await Notifications.scheduleNotificationAsync({content:{title,body:message,sound:'default'},trigger:null});return true;
}

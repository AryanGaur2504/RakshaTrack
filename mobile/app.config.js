// Build-time values; map key is optional for development, required by Google Maps on installed Android APKs.
module.exports=({config})=>({
 ...config,
 name:'RakshaTrack',
 slug:'rakshatrack-native',
 version:'0.1.0',
 orientation:'portrait',
 scheme:'rakshatrack',
 userInterfaceStyle:'automatic',
 android:{
  package:'com.binarybattalion.rakshatrack',
  permissions:['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','ACCESS_BACKGROUND_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS','VIBRATE'],
  config:process.env.GOOGLE_MAPS_API_KEY?{googleMaps:{apiKey:process.env.GOOGLE_MAPS_API_KEY}}:{},
 },
 plugins:[
  ['expo-location',{
   locationWhenInUsePermission:'Allow RakshaTrack to show your live ride location.',
   locationAlwaysAndWhenInUsePermission:'Allow RakshaTrack to record a ride while the phone is locked.',
   isAndroidBackgroundLocationEnabled:true,
   isAndroidForegroundServiceEnabled:true,
  }],
  ['expo-notifications',{color:'#17674e',defaultChannel:'rakshatrack-sos'}],
  'expo-secure-store'
 ],
 extra:{guardianApi:process.env.EXPO_PUBLIC_GUARDIAN_API||'https://rakshatrack-guardian.onrender.com'},
});

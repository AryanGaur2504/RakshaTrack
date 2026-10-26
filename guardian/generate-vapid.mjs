import webPush from 'web-push';
const keys=webPush.generateVAPIDKeys();
console.log('Add these to your hosting provider as secret environment variables:');
console.log('VAPID_PUBLIC_KEY='+keys.publicKey);
console.log('VAPID_PRIVATE_KEY='+keys.privateKey);
console.log('VAPID_SUBJECT=mailto:you@yourdomain.com');
console.log('Keep the private key secret. Never commit it.');

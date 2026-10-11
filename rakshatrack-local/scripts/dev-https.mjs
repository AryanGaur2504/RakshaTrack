import {createServer} from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const cert=resolve('.certs/cert.pem'),key=resolve('.certs/key.pem');
if(!existsSync(cert)||!existsSync(key)){
  console.error('Trusted HTTPS certificates are missing. See README → Test phone GPS locally over HTTPS. Generate .certs/cert.pem and .certs/key.pem for your laptop’s LAN IP, and trust the issuing CA on your phone.');
  process.exit(1);
}
const server=await createServer({server:{host:'0.0.0.0',https:{cert:readFileSync(cert),key:readFileSync(key)},port:5173,strictPort:true}});
await server.listen();server.printUrls();
console.log('On your phone, use the HTTPS network URL. The certificate must be trusted on that phone for reliable location permission.');

import {spawnSync} from 'node:child_process';
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,VITE_STORAGE_MODE:'server',VITE_BASE_PATH:'/'}});if(r.error)throw r.error;if(r.status)process.exit(r.status);}

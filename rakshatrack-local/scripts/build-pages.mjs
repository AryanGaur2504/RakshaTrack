import {spawnSync} from 'node:child_process';
const [owner,repo]=(process.env.GITHUB_REPOSITORY||'').split('/');
const base=process.env.PAGES_BASE_PATH||(repo?(repo.toLowerCase()===`${owner}.github.io`.toLowerCase()?'/':`/${repo}/`):'/');
const env={...process.env,VITE_STORAGE_MODE:'device',VITE_BASE_PATH:base};
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',env});if(r.error)throw r.error;if(r.status)process.exit(r.status);}

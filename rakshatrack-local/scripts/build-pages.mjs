import {spawnSync} from 'node:child_process';

// Pages publishes under /<repository>/, or / for a user site/custom domain.
// configure-pages returns base_path without a trailing slash; Vite and the
// service-worker registration need the canonical /<repository>/ form.
function normalizedBase(value){
  const name=String(value||'').trim();
  if(!name||name==='/')return '/';
  if(name.includes('://')||/[?#\\]/.test(name)||name.includes('..'))throw Error('Invalid Pages base path');
  return '/'+name.replace(/^\/+|\/+$/g,'')+'/';
}
const [owner,repo]=(process.env.GITHUB_REPOSITORY||'').split('/');
const repoPath=repo?(repo.toLowerCase()===`${owner}.github.io`.toLowerCase()?'/':`/${repo}/`):'/';
// Honor the Pages action even if the repo is renamed or uses a custom domain.
// When building outside Actions, fall back to the project name.
const raw=Object.prototype.hasOwnProperty.call(process.env,'PAGES_BASE_PATH')?process.env.PAGES_BASE_PATH:repoPath;
const base=normalizedBase(raw);
console.log(`RakshaTrack GitHub Pages asset base: ${base}`);
const env={...process.env,VITE_STORAGE_MODE:'device',VITE_BASE_PATH:base};
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']]){
  const r=spawnSync(process.execPath,args,{stdio:'inherit',env});
  if(r.error)throw r.error;
  if(r.status)process.exit(r.status);
}

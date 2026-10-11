import {spawn} from 'node:child_process';
const env={...process.env,VITE_STORAGE_MODE:'server',PORT:'8787',HOST:'127.0.0.1'};
const backend=spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env});
const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit',env});
const stop=()=>{backend.kill();frontend.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);backend.on('exit',code=>{frontend.kill();process.exitCode=code||0;});frontend.on('exit',code=>{backend.kill();process.exitCode=code||0;});

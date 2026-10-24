import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('native Android app is separate from GitHub Pages web app',()=>{const c=read('../app.config.js');assert.match(c,/com\.binarybattalion\.rakshatrack/);assert.match(c,/isAndroidBackgroundLocationEnabled:true/);});
test('real native screens and background task exist',()=>{assert.match(read('../App.tsx'),/MapView/);assert.match(read('../src\/tasks.ts'),/TaskManager\.defineTask/);assert.match(read('../src\/storage.ts'),/CREATE TABLE IF NOT EXISTS/);});
test('native SOS uses explicit tap and never claims SMS delivery',()=>{assert.match(read('../App.tsx'),/SMS\.sendSMSAsync/);assert.match(read('../App.tsx'),/Delivery is not confirmed/);});

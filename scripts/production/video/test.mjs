import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {capture,loadSnapshot,assertClaims,excerpt,freshness,ALLOWLIST,hash} from './snapshot.mjs';
import {verify} from './verify.mjs';
const original=path.resolve('docs/production/video'),scripts=path.resolve('scripts/production/video');
const temp=await fs.mkdtemp(path.join(original,'test-temp-'));
let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
try{
 const root=path.join(temp,'worktree'),out=path.join(temp,'artifact');
 await fs.mkdir(out,{recursive:true});
 for(const entry of await fs.readdir(original,{withFileTypes:true})){
  if(entry.name==='intermediates'||entry.name.startsWith('test-temp-'))continue;
  await fs.cp(path.join(original,entry.name),path.join(out,entry.name),{recursive:true});
 }
 const manifest=JSON.parse(await fs.readFile(path.join(original,'manifest.json')));
 const snap=await loadSnapshot(original,manifest.snapshot.sha256);
 for(const p of ALLOWLIST){await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),snap.buffers[p]);}
 const options={dir:out,root,scriptDir:scripts,receipt:false};
 await test('intact copied artifact and current inputs',async()=>assert.equal((await verify(options)).passed,true));
 await test('all 13 changed and missing sources; historical/strict integration',async()=>{
  for(const p of ALLOWLIST){const f=path.join(root,p);await fs.appendFile(f,'\nDRIFT');let r=await freshness(snap,root);assert.equal(r.state,'stale');assert.deepEqual(r.drift.map(d=>[d.path,d.state]),[[p,'changed']]);await fs.unlink(f);r=await freshness(snap,root);assert.deepEqual(r.drift.map(d=>[d.path,d.state]),[[p,'missing']]);await fs.writeFile(f,snap.buffers[p]);}
  for(const p of ALLOWLIST)await fs.appendFile(path.join(root,p),'\nDRIFT');
  let r=await verify(options);assert.equal(r.integrity,'passed');assert.equal(r.passed,true);assert.equal(r.freshness.drift.length,13);assert.equal((await verify({...options,requireCurrent:true})).passed,false);
  for(const p of ALLOWLIST)await fs.unlink(path.join(root,p));
  r=await verify(options);assert.equal(r.integrity,'passed');assert.equal(r.passed,true);assert.equal(r.freshness.drift.length,13);assert.equal((await verify({...options,requireCurrent:true})).passed,false);
  for(const p of ALLOWLIST)await fs.writeFile(path.join(root,p),snap.buffers[p]);
 });
 await test('capture rejects concurrent input mutation',async()=>{await assert.rejects(capture(root,path.join(temp,'race'),{afterRead:()=>fs.appendFile(path.join(root,ALLOWLIST[0]),'changed')}),/changed while capturing/);await fs.writeFile(path.join(root,ALLOWLIST[0]),snap.buffers[ALLOWLIST[0]]);});
 await test('accepted J1 and J2 contradict this narration',async()=>{for(const id of ['J1','J2']){const buffers={...snap.buffers},plan=JSON.parse(buffers['docs/DELIVERY-PLAN.json']);plan.desired_end_result.required_journeys.find(j=>j.id===id).done=true;buffers['docs/DELIVERY-PLAN.json']=Buffer.from(JSON.stringify(plan));assert.throws(()=>assertClaims({...snap,buffers}),/conflicts/);}});
 async function corrupt(name,file,mutate){await test(name,async()=>{const before=await fs.readFile(file);try{await fs.writeFile(file,mutate(before));assert.equal((await verify(options)).integrity,'failed');}finally{await fs.writeFile(file,before);}});}
 await corrupt('snapshot original bytes corruption',path.join(out,'snapshots',snap.id,'files',ALLOWLIST[0]),b=>Buffer.concat([b,Buffer.from('x')]));
 await corrupt('snapshot metadata corruption',path.join(out,'snapshots',snap.id,'snapshot.json'),b=>Buffer.concat([b,Buffer.from(' ')]));
 await corrupt('excerpt line reference corruption',path.join(out,'manifest.json'),b=>{const m=JSON.parse(b);m.scenes.find(s=>s.ex?.length).ex[0].lineStart++;return JSON.stringify(m);});
 await corrupt('excerpt quotation corruption',path.join(out,'manifest.json'),b=>{const m=JSON.parse(b);m.scenes.find(s=>s.ex?.length).ex[0].text+=' invented';return JSON.stringify(m);});
 await corrupt('media truncation detected by fresh probe and full decode',path.join(out,'AgentLayer-evidence-review.mp4'),b=>b.subarray(0,Math.floor(b.length/2)));
 await corrupt('contact sheet corruption',path.join(out,'contact-sheet.png'),b=>b.subarray(0,100));
 await test('script corruption rejected',async()=>{const copy=path.join(temp,'scripts');await fs.cp(scripts,copy,{recursive:true});await fs.appendFile(path.join(copy,'build.mjs'),'\n// changed');assert.equal((await verify({...options,scriptDir:copy})).checks.scripts,'failed');});
 await test('verification leaves manifest and artifacts unchanged',async()=>{const files=['manifest.json',...Object.keys(manifest.artifacts)];const before=await Promise.all(files.map(async p=>hash(await fs.readFile(path.join(out,p)))));assert.equal((await verify({...options,receipt:true})).passed,true);assert.deepEqual(await Promise.all(files.map(async p=>hash(await fs.readFile(path.join(out,p))))),before);});
 console.log(`${count} test groups passed; drift/missing checks cover all ${ALLOWLIST.length} inputs`);
}finally{await fs.rm(temp,{recursive:true,force:true});}

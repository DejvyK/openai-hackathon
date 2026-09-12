import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const R='apps/api/tests/research/live-evidence/';
export const ALLOWLIST=[R+'README.md',R+'broad-search-report.json',R+'draft-validation.json','docs/handoffs/agent-d.md','docs/submission/DRAFT.md','docs/production/story/POSTER.svg','docs/PROJECT-CONCEPT.md','docs/DELIVERY-PLAN.json','docs/production/BRIEFS.md','docs/production/story/VOICEOVER.md','docs/production/story/PITCH.md',R+'contexts.json','apps/api/src/research/drafts.ts'];
export const SCRIPT_NAMES=['build.mjs','narrate.ps1','snapshot.mjs','verify.mjs','test.mjs'];
export const ARTIFACT_NAMES=['AgentLayer-evidence-review.mp4','contact-sheet.png','poster.png','verification.json','narration.json'];
export function exactKeys(object,keys){if(JSON.stringify(Object.keys(object).sort())!==JSON.stringify([...keys].sort()))throw Error('Unexpected or missing allowlisted entries');}
export async function capture(root,out,{afterRead}={}){
 const startedAt=new Date().toISOString(), buffers={}, stats={};
 for(const p of ALLOWLIST){stats[p]=await fs.stat(path.join(root,p),{bigint:true});buffers[p]=await fs.readFile(path.join(root,p));}
 if(afterRead)await afterRead();
 // Re-read every input after the entire collection; check identity, timestamps and bytes.
 for(const p of ALLOWLIST){const s=await fs.stat(path.join(root,p),{bigint:true});if(['ino','size','mtimeNs','ctimeNs'].some(k=>s[k]!==stats[p][k])||!buffers[p].equals(await fs.readFile(path.join(root,p))))throw Error('Input changed while capturing: '+p);}
 const sources=Object.fromEntries(ALLOWLIST.map(p=>[p,{sha256:hash(buffers[p]),bytes:buffers[p].length}]));
 const meta={schema:1,startedAt,capturedAt:new Date().toISOString(),provenance:'Local worktree allowlisted original bytes; no provider runs; capture is not product acceptance',sources};
 const bytes=Buffer.from(JSON.stringify(meta,null,2)+'\n'),id=hash(bytes),dir=path.join(out,'snapshots',id);
 await fs.mkdir(dir,{recursive:true});
 for(const p of ALLOWLIST){await fs.mkdir(path.dirname(path.join(dir,'files',p)),{recursive:true});await fs.writeFile(path.join(dir,'files',p),buffers[p],{flag:'wx'});}
 await fs.writeFile(path.join(dir,'snapshot.json'),bytes,{flag:'wx'});
 await fs.writeFile(path.join(out,'active-snapshot.json'),JSON.stringify({sha256:id},null,2)+'\n');
 return loadSnapshot(out,id);
}
export async function loadSnapshot(out,id){
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid snapshot hash');
 const dir=path.join(out,'snapshots',id),bytes=await fs.readFile(path.join(dir,'snapshot.json'));
 if(hash(bytes)!==id)throw Error('Snapshot metadata hash mismatch');
 const meta=JSON.parse(bytes);exactKeys(meta.sources,ALLOWLIST);
 if(meta.schema!==1||!Number.isFinite(Date.parse(meta.capturedAt))||!Number.isFinite(Date.parse(meta.startedAt)))throw Error('Invalid snapshot provenance');
 const buffers={};for(const p of ALLOWLIST){const b=await fs.readFile(path.join(dir,'files',p)),v=meta.sources[p];if(hash(b)!==v.sha256||b.length!==v.bytes)throw Error('Snapshot source mismatch: '+p);buffers[p]=b;}
 return {id,meta,buffers};
}
export function assertClaims(snapshot){
 const plan=JSON.parse(snapshot.buffers['docs/DELIVERY-PLAN.json']);
 for(const id of ['J1','J2']){const matches=plan.desired_end_result.required_journeys.filter(j=>j.id===id);if(matches.length!==1||matches[0].done!==false)throw Error('Narration conflicts with snapshot journey acceptance: '+id);}
}
export function excerpt(snapshot,file,text){
 const raw=snapshot.buffers[file];if(!raw||!text)throw Error('Invalid excerpt');
 const normalized=raw.toString('utf8').replaceAll('\r\n','\n'),index=normalized.indexOf(text);
 if(index<0)throw Error('Non-verbatim excerpt: '+file);
 const lineStart=normalized.slice(0,index).split('\n').length,lineEnd=lineStart+text.split('\n').length-1;
 // Store original byte offsets and bytes, including CRLF; display normalization is explicit.
 const original=raw.toString('utf8');
 const originalIndex=target=>{let display=0;for(let i=0;i<original.length;i++){if(display===target)return i;if(original[i]==='\r'&&original[i+1]==='\n')i++;display++;}if(display===target)return original.length;throw Error('Invalid excerpt offset');};
 const byteStart=Buffer.byteLength(original.slice(0,originalIndex(index))),byteEnd=Buffer.byteLength(original.slice(0,originalIndex(index+text.length)));
 if(raw.subarray(byteStart,byteEnd).toString('utf8').replaceAll('\r\n','\n')!==text)throw Error('Excerpt byte mapping failed');
 return {file,text,lineStart,lineEnd,byteStart,byteEnd,originalSha256:hash(raw.subarray(byteStart,byteEnd))};
}
export async function freshness(snapshot,root){const drift=[];for(const p of ALLOWLIST){try{const b=await fs.readFile(path.join(root,p));if(hash(b)!==snapshot.meta.sources[p].sha256)drift.push({path:p,state:'changed',currentSha256:hash(b)});}catch(e){drift.push({path:p,state:e.code==='ENOENT'?'missing':'unreadable',error:e.code});}}return {state:drift.length?'stale':'current',drift};}

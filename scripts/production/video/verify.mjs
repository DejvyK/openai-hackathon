import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,loadSnapshot,assertClaims,excerpt,freshness,exactKeys,SCRIPT_NAMES,ARTIFACT_NAMES} from './snapshot.mjs';
export async function verify({dir=path.resolve('docs/production/video'),root=process.cwd(),scriptDir=path.dirname(fileURLToPath(import.meta.url)),requireCurrent=false,receipt=true}={}){
 const failures=[],checks={},manifestBytes=await fs.readFile(path.join(dir,'manifest.json')),manifest=JSON.parse(manifestBytes);
 let current={state:'unknown',drift:[]},probe;
 const check=async(name,fn)=>{try{await fn();checks[name]='passed';}catch(e){checks[name]='failed';failures.push(name+': '+e.message);}};
 await check('snapshot and excerpts',async()=>{
  if(manifest.schema!==2)throw Error('Unsupported manifest schema');
  const snapshot=await loadSnapshot(dir,manifest.snapshot.sha256);assertClaims(snapshot);
  if(JSON.stringify(manifest.sources)!==JSON.stringify(snapshot.meta.sources)||manifest.snapshot.capturedAt!==snapshot.meta.capturedAt)throw Error('Snapshot provenance differs from manifest');
  current=await freshness(snapshot,root);
  for(const s of manifest.scenes)for(const e of s.ex??[]){const expected=excerpt(snapshot,e.file,e.text);if(JSON.stringify(expected)!==JSON.stringify(e))throw Error('Excerpt bytes or used line references differ: '+e.file);}
  const narration=JSON.parse(await fs.readFile(path.join(dir,'narration.json'),'utf8'));
  if(JSON.stringify(narration.scenes)!==JSON.stringify(manifest.scenes))throw Error('Rendered narration differs from manifest scenes');
  if(manifest.scenes.length!==14||manifest.scenes[0].start!==0||manifest.scenes.at(-1).end!==120||manifest.scenes.some((s,i)=>s.end-s.start!==s.d||(i&&s.start!==manifest.scenes[i-1].end)))throw Error('Invalid timeline');
  if(manifest.audio.voiced&&manifest.scenes.some(s=>!Number.isFinite(s.speechDuration)||s.d-s.speechDuration-0.15<0.2))throw Error('Insufficient speech margin');
 });
 for(const [group,base,names]of [['artifacts',dir,ARTIFACT_NAMES],['scripts',scriptDir,SCRIPT_NAMES]])await check(group,async()=>{exactKeys(manifest[group],names);for(const name of names){const b=await fs.readFile(path.join(base,name)),v=manifest[group][name];if(hash(b)!==v.sha256||b.length!==v.bytes)throw Error('Hash/size mismatch: '+name);}});
 function run(tool,args){const r=spawnSync(tool,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(r.error||r.status!==0)throw Error(r.error?.message||r.stderr||`${tool} exit ${r.status}`);return r.stdout;}
 const media=path.join(dir,'AgentLayer-evidence-review.mp4');
 await check('actual media metadata',async()=>{probe=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',media]));const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');if(probe.streams.length!==2||Number(probe.format.duration)!==120||v?.codec_name!=='h264'||v.width!==1600||v.height!==900||v.nb_read_frames!=='3600'||v.avg_frame_rate!=='30/1'||v.pix_fmt!=='yuv420p'||a?.codec_name!=='aac'||a.sample_rate!=='48000'||a.channels!==1)throw Error('Unexpected actual media metadata');});
 await check('actual full decode',async()=>{run('ffmpeg',['-v','error','-xerror','-i',media,'-f','null','-']);});
 const result={checkedAt:new Date().toISOString(),manifestSha256:hash(manifestBytes),snapshotSha256:manifest.snapshot?.sha256,integrity:failures.length?'failed':'passed',checks,failures,freshness:current,requireCurrent,passed:failures.length===0&&(!requireCurrent||current.state==='current'),probe,limitations:['Historical snapshot evidence, not live browser or provider verification','Manual audio listening pending','Hashes are integrity checks, not signed authenticity proof']};
 if(receipt)await fs.writeFile(path.join(dir,'integrity-check.json'),JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>a!=='--require-current'))throw Error('Unknown verification option');
 const result=await verify({requireCurrent:args.includes('--require-current')});console.log(JSON.stringify({...result,probe:undefined},null,2));if(!result.passed)process.exitCode=1;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {capture,loadSnapshot,assertClaims,excerpt,SCRIPT_NAMES} from './snapshot.mjs';

const root = process.cwd(), out = path.resolve('docs/production/video'), temp = path.resolve('docs/production/video/intermediates');
await fs.mkdir(out,{recursive:true}); await fs.mkdir(temp,{recursive:true});
const commands=[];
function run(cmd,args){ commands.push({cmd,args}); const p=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}); if(p.status!==0)throw Error(`${cmd}: ${p.stderr || p.stdout}`); return p.stdout; }
const hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);
if(args.some(a=>a!=='--refresh-snapshot-after-review'))throw Error('Unknown build option');
const snapshot=args.includes('--refresh-snapshot-after-review')?await capture(root,out):await loadSnapshot(out,JSON.parse(await fs.readFile(path.join(out,'active-snapshot.json'),'utf8')).sha256);
assertClaims(snapshot);
const sources=snapshot.meta.sources;
async function read(p){if(!snapshot.buffers[p])throw Error('Source not allowlisted: '+p);return snapshot.buffers[p].toString('utf8').replaceAll('\r\n','\n');}
const R='apps/api/tests/research/live-evidence/';
const review=await read(R+'README.md'), report=await read(R+'broad-search-report.json'), validation=await read(R+'draft-validation.json'), handoff=await read('docs/handoffs/agent-d.md'), draft=await read('docs/submission/DRAFT.md'), poster=await read('docs/production/story/POSTER.svg');
for(const p of ['docs/PROJECT-CONCEPT.md','docs/DELIVERY-PLAN.json','docs/production/BRIEFS.md','docs/production/story/VOICEOVER.md','docs/production/story/PITCH.md',R+'contexts.json','apps/api/src/research/drafts.ts'])await read(p);
function extract(text,start,end){const a=text.indexOf(start),b=end?text.indexOf(end,a+start.length):text.length;if(a<0||b<0)throw Error('Excerpt anchor missing '+start);return text.slice(a,b).trimEnd();}
const ex=(file,text)=>({file,text});
const scenes=[
 {shot:1,d:5,title:'Keep the next step tied to its source.',tag:'Original repository explainer',poster:'intro',say:'Finding a person online is easy. Useful follow-up takes more work.'},
 {shot:1,d:5,title:'Context → research → review → workspace',tag:'Planned workflow · illustration, not product UI',poster:'stages',say:'AgentLayer was built solo by David Král. This is an evidence review.'},
 {shot:2,d:7.5,title:'Start with the input provenance',tag:'Recorded backend runs · manually prepared contexts',ex:[ex(R+'README.md',extract(review,'`contexts.json`','`method:user_edit`'))],say:'A profile supplies context for a contact and follow-up. A selected passage supplies context for a note.'},
 {shot:2,d:7.5,title:'These inputs did not come from the extension',tag:'Exact repository excerpt',ex:[ex(R+'README.md',extract(review,'`method:user_edit`','## Observed issue'))],say:'These research inputs were prepared manually. They do not prove toolbar operation, browser extraction, or workspace persistence.'},
 {shot:3,d:10,title:'Three recorded research runs',tag:'Exact review table · OpenAI + Exa · not a new run',ex:[ex(R+'README.md',extract(review,'| Context |','Manual review against'))],say:'The repository records three backend runs using GPT-5.6 Luna and Exa: two public profiles and one selected passage.'},
 {shot:3,d:10,title:'A claim stays attached to its source',tag:'Exact JSON excerpts · separate ranges, same recorded run',ex:[ex(R+'broad-search-report.json',extract(report,'          {\n            "text": "He is a co-creator','          {\n            "text": "Before')),ex(R+'broad-search-report.json',extract(report,'          {\n            "id": "s1"','          {\n            "id": "s2"'))],say:'This recorded claim cites source s one. The accompanying review checked the original pages; the raw report alone leaves manual acceptance pending.'},
 {shot:4,d:10,title:'Validation is not a workspace save',tag:'Exact JSON excerpts · first and third validation entries',ex:[ex(R+'draft-validation.json',extract(validation,'      "contextId": "live-simon','    },')),ex(R+'draft-validation.json',extract(validation,'      "contextId": "live-w3c','    }\n  ]'))],say:'The actual validation entries mark the drafts as valid, with workspace writes false. These are proposals for review, not saved records.'},
 {shot:4,d:10,title:'Keep unknown information empty',tag:'Exact review excerpt · recorded findings',ex:[ex(R+'README.md',extract(review,'`draft-validation.json`','## Failure evaluation'))],say:'The review records no invented contact details or follow-up dates. The note retains the selected text. Interface controls have separate local coverage.'},
 {shot:5,d:12.5,title:'What the local checks cover',tag:'Documented test results · synthetic workspace provider · not rerun here',ex:[ex('docs/handoffs/agent-d.md',extract(handoff,'- HTTP tests exercise','- `npm run test:e2e`'))],say:'The handoff documents local checks for contact and task linkage, partial failures, and restart recovery. Those workspace checks use a synthetic provider.'},
 {shot:5,d:12.5,title:'Uncertain saves must remain uncertain',tag:'Exact handoff limitations · no live workspace acceptance',ex:[ex('docs/handoffs/agent-d.md',extract(handoff,'Open integration limitations:','\n\n---'))],say:'Proposals expire and do not survive a restart. Uncertain writes without an identifier remain unknown. Actual workspace records and links still need live verification.'},
 {shot:6,d:10,title:'The complete journey is still open',tag:'Exact snapshot scope paragraph',ex:[ex('docs/submission/DRAFT.md',extract(draft,'The Chrome extension and workspace adapters','Editorial budgets:'))],say:'The remaining proof is the full handoff: activate on a real page, research its context, review the proposal, and verify the saved result.'},
 {shot:6,d:10,title:'Two acceptance gaps to close',tag:'Exact G1 and G3 rows · displayed separately',ex:[ex('docs/submission/DRAFT.md',draft.split('\n').find(l=>l.startsWith('| G1 '))),ex('docs/submission/DRAFT.md',draft.split('\n').find(l=>l.startsWith('| G3 ')))],say:'Native toolbar and real-page checks remain open. Contacts, linked tasks, and notes need actual identifiers and read-back. Neither complete live journey is claimed here.'},
 {shot:7,d:5,title:'Keep the next step tied to its source.',tag:'Original repository explainer · author credit',poster:'ending',say:'AgentLayer keeps the next step tied to its source.'},
 {shot:7,d:5,title:'Research evidence. A clear next milestone.',tag:'Editorial summary of the reviewed evidence',summary:'Recorded research demonstrated.\nFull browser-to-workspace delivery still to prove.\nBuilt solo by David Král.',say:'Research has live evidence. Full browser-to-workspace delivery still needs verification.'}
];
// Display LF-normalized text with exact original snapshot byte and line references.
let t=0;for(const [i,s]of scenes.entries()){s.index=i;s.start=t;t+=s.d;s.end=t;s.rate=0;s.ex=s.ex?.map(e=>excerpt(snapshot,e.file,e.text));}
if(t!==120)throw Error('Wrong timeline');
const audioJobs=()=>scenes.map(s=>({text:s.say,rate:s.rate,path:path.join(temp,`voice-${s.index}.wav`)}));
let voice,voiced=true,blocker=null;
try {for(let attempt=0;attempt<6;attempt++){
 await fs.writeFile(path.join(temp,'speech.json'),JSON.stringify(audioJobs()));
 voice=run('powershell.exe',['-NoProfile','-File',path.resolve('scripts/production/video/narrate.ps1'),'-InputJson',path.join(temp,'speech.json')]).trim();
 let fit=true;for(const s of scenes){s.speechDuration=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(temp,`voice-${s.index}.wav`)]));if(s.speechDuration>s.d-0.35){s.rate++;fit=false;}}
 if(fit)break;if(attempt===5)throw Error('Speech exceeds window after rate adjustment');
}}catch(e){voiced=false;blocker=e.message;}
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const browser=await chromium.launch({channel:'chromium',headless:true});
const layout=[];
try{const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});await page.route('**/*',r=>r.abort());
for(const s of scenes){
 let body='';
 if(s.poster){const vb={intro:'0 110 1600 230',stages:'40 340 1520 330',ending:'40 675 1520 205'}[s.poster];body=`<div class="art">${poster.replace(/<\?xml[^>]+>/,'').replace('width="1600" height="900" viewBox="0 0 1600 900"',`width="1456" height="${1456 * Number(vb.split(' ')[3]) / Number(vb.split(' ')[2])}" viewBox="${vb}"`)}</div><div class="file">docs/production/story/POSTER.svg · original SVG crop · explainer</div>`;}
 else if(s.summary)body=`<div class="summary">${escape(s.summary).replaceAll('\n','<br>')}</div>`;
 else body=s.ex.map(e=>`<article><div class="file">${escape(e.file)} · L${e.lineStart}-${e.lineEnd}</div><pre>${escape(e.text)}</pre></article>`).join('');
 await page.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#F4F3ED;color:#193B38;font-family:Arial,Helvetica,sans-serif}.top{height:94px;padding:30px 64px;display:flex;justify-content:space-between;font-size:23px;border-bottom:1px solid #D5DED5}.brand{font-weight:700}.qual{font-size:20px}main{padding:28px 64px}h1{font-size:43px;letter-spacing:-1px;margin:0 0 12px}.tag{font-size:21px;color:#426157;margin-bottom:24px}.content{height:455px;display:flex;gap:22px;flex-direction:${s.ex?.length===2?'row':'column'}}article{flex:1;min-width:0;background:white;border:1px solid #D5DED5;border-radius:16px;padding:22px}.file{font-size:18px;color:#426157;overflow-wrap:anywhere;margin-bottom:18px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font: ${s.shot===3&&s.index===4?'23':'26'}px/1.37 Consolas,monospace;margin:0}article:only-child pre{font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.55}article:only-child:has(pre){} .art{height:422px;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0}.summary{font-size:42px;line-height:1.8;padding:36px 28px;background:#E1ECE4;border-radius:18px;width:100%}.captions{position:absolute;left:64px;right:64px;top:713px;height:126px;background:#193B38;color:white;border-radius:14px;padding:20px 28px;font-size:29px;line-height:1.42;display:flex;align-items:center}.bottom{position:absolute;bottom:20px;left:64px;right:64px;display:flex;justify-content:space-between;font-size:17px;color:#4C625C}.progress{position:absolute;bottom:0;height:6px;background:#34766B;width:${s.end/120*100}%}</style></head><body><div class="top"><span class="brand">AgentLayer / EVIDENCE REVIEW</span><span class="qual">Historical snapshot ${snapshot.meta.capturedAt.slice(0,10)} / ${snapshot.id.slice(0,12)}</span></div><main><h1>${escape(s.title)}</h1><div class="tag">${escape(s.tag)}</div><div class="content">${body}</div></main><div class="captions">${escape(s.say)}</div><div class="bottom"><span>${voiced?'Synthetic narration · '+escape(voice):'CAPTIONED SILENT ROUGH CUT · TTS unavailable'} · no live product recording</span><span>Window ${s.shot} / 7 · ${s.start.toFixed(1)}–${s.end.toFixed(1)} s</span></div><div class="progress"></div></body></html>`);
 const audit=await page.evaluate(()=>[...document.querySelectorAll('pre,.file,.summary,.captions')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),overflow:e.scrollHeight>e.clientHeight+1})));layout.push({scene:s.index,audit});
 for(const a of audit)if(a.overflow||a.rect.bottom> (a.text===s.say?840:704))throw Error('Layout overflow '+s.index+' '+JSON.stringify(a));
 await page.screenshot({path:path.join(temp,`slide-${s.index}.png`)});
}
}finally{await browser.close();}
await fs.writeFile(path.join(temp,'layout.json'),JSON.stringify(layout,null,2));
for(const s of scenes){const audio=voiced?['-i',path.join(temp,`voice-${s.index}.wav`)]:['-f','lavfi','-i','anullsrc=r=48000:cl=mono'];run('ffmpeg',['-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',path.join(temp,`slide-${s.index}.png`),...audio,'-af','adelay=150,apad','-t',String(s.d),'-c:v','libx264','-preset','fast','-tune','stillimage','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','pcm_s16le','-ar','48000','-ac','1',path.join(temp,`part-${s.index}.mkv`)]);console.log(`Encoded ${s.index+1}/14`);}
await fs.writeFile(path.join(temp,'concat.txt'),scenes.map(s=>`file 'part-${s.index}.mkv'`).join('\n'));
const video=path.join(out,'AgentLayer-evidence-review.mp4');
run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',path.join(temp,'concat.txt'),'-c:v','copy','-c:a','aac','-b:a','160k','-t','120.000','-movflags','+faststart',video]);
const probe=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',video]));
if(Number(probe.format.duration)!==120||probe.streams.find(s=>s.codec_type==='video').nb_read_frames!=='3600')throw Error('Export duration/frame count mismatch');
run('ffmpeg',['-v','error','-xerror','-i',video,'-f','null','-']);
const bounds=[0,10,25,45,65,90,110,120];const frames=[0,...bounds.slice(1,-1).flatMap(t=>[t*30-1,t*30]),3599];
const select=frames.map(n=>`eq(n\\,${n})`).join('+');
run('ffmpeg',['-v','error','-y','-i',video,'-vf',`select=${select},scale=640:360,tile=2x7`,'-frames:v','1',path.join(out,'contact-sheet.png')]);
run('ffmpeg',['-v','error','-y','-ss','0','-i',video,'-frames:v','1',path.join(out,'poster.png')]);
run('ffmpeg',['-v','error','-y','-i',video,'-vf',`select=${select}`,'-fps_mode','vfr',path.join(temp,'boundary-%02d.png')]);
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({probe,fullDecode:'passed: ffmpeg -v error -xerror -i <video> -f null -',boundaryFrameNumbers:frames,boundaryTimes:frames.map(n=>n/30),layoutCheck:'passed',commands},null,2));
await fs.writeFile(path.join(out,'narration.json'),JSON.stringify({voice,voiced,blocker,scenes},null,2));
const artifacts={};for(const name of ['AgentLayer-evidence-review.mp4','contact-sheet.png','poster.png','verification.json','narration.json']){const b=await fs.readFile(path.join(out,name));artifacts[name]={sha256:hash(b),bytes:b.length};}
const scripts={};for(const name of SCRIPT_NAMES){const b=await fs.readFile(path.join('scripts/production/video',name));scripts[name]={sha256:hash(b),bytes:b.length};}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({schema:2,snapshot:{sha256:snapshot.id,capturedAt:snapshot.meta.capturedAt},generatedAt:new Date().toISOString(),qualification:'Evidence review of repository artifacts; not a live product recording or product acceptance',durationSeconds:Number(probe.format.duration),video:{codec:'h264',width:1600,height:900,fps:30,frames:3600},audio:{codec:'aac',sampleRate:48000,synthetic:true,voice,voiced,blocker},attribution:{production:'Codex-generated local HTML layouts and captions; Playwright Chromium renders; FFmpeg encoding',visual:'Original repository POSTER.svg by story production; local Arial and Consolas; no external assets',narration:'Stock Windows System.Speech voice; no David voice imitation',authorCredit:'David Král, solo builder'},sources,artifacts,scripts,windows:[0,10,25,45,65,90,110].map((start,i)=>({start,end:bounds[i+1]})),scenes,limits:['No network or new provider run','Source review is recorded documentation, not independently repeated against live pages','Local app tests not rerun','No external workspace writes or publication','J1/J2 unaccepted in captured snapshot','Synthetic narration; manual listening pending','Reproduction depends on installed fonts, Chromium, speech voice and FFmpeg; no toolchain-independent MP4 byte identity guarantee','manifest excludes its own hash to avoid self-reference']},null,2));
console.log(JSON.stringify({video,duration:probe.format.duration,voice,voiced,blocker}));

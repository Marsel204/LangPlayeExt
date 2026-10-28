// Full reportable pass; implementation/probing is outside this 25-minute clock.
import {mkdir,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {bounded} from './lib/process.mjs';
const require=createRequire(import.meta.url),{root}=require('./lib/shipped'),{env}=require('./lib/env');
const out=path.join(root,'docs/reviews/2026-10-28/results/baseline');await mkdir(path.join(out,'logs'),{recursive:true});
const started=Date.now(),deadline=started+25*60000,metadata=env('baseline');await writeFile(path.join(out,'env.json'),JSON.stringify(metadata,null,2)+'\n');
const commands=[
 ['node-existing',process.execPath,['--test',...require('node:fs').readdirSync(path.join(root,'tests')).filter(x=>/^test_.*\.js$/.test(x)).map(x=>'tests/'+x)],60000],
 ['legacy',process.execPath,['run_tests.js'],60000],
 ['native-python','python3',['-I','tests/test_native_host.py'],60000],
 ['chromium-existing',process.execPath,['tests/browser_custom_ai.mjs'],90000],
 ['self-check',process.execPath,['tests/perf/run_perf.mjs','--self-check'],15000],
 ['perf',process.execPath,['--expose-gc','tests/perf/run_perf.mjs','--profile','baseline','--repeat-processes','3','--out','docs/reviews/2026-10-28/results/baseline/perf'],22*60000],
 ['p8',process.execPath,['tests/perf/perf_p8_browser.mjs','--out','docs/reviews/2026-10-28/results/baseline/perf'],90000],
 ['review',process.execPath,['tests/review/run_review_matrix.mjs','--mode','baseline','--repeat-processes','3','--repeat-browser','3','--out','docs/reviews/2026-10-28/results/baseline/review'],5*60000]
];
const runs=[];
for(const [id,cmd,args,max]of commands){if(Date.now()>deadline){runs.push({id,status:'NOT_EXECUTED',reason:'25 minute measurement cap'});break;}console.log('START '+id+' '+new Date().toISOString());const r=await bounded(cmd,args,{cwd:root,timeout:Math.min(max,deadline-Date.now()),stdoutFile:path.join(out,'logs',id+'.stdout.log'),stderrFile:path.join(out,'logs',id+'.stderr.log')});const row={id,command:[cmd,...args],code:r.code,timedOut:r.timedOut,durationMs:r.durationMs};runs.push(row);console.log('END '+JSON.stringify(row));await writeFile(path.join(out,'commands.json'),JSON.stringify({startedAt:new Date(started).toISOString(),deadline:new Date(deadline).toISOString(),elapsedMs:Date.now()-started,runs},null,2)+'\n');if(r.code!==0&&['node-existing','legacy','native-python','chromium-existing','self-check'].includes(id)){console.log('STOP: existing suite or harness self-check failed');break;}}
const sha=require('node:crypto'),fs=require('node:fs');const before=JSON.parse(await readFile(path.join(out,'tracked-before.json'),'utf8')),after={},changed=[];for(const [p,h]of Object.entries(before)){try{after[p]=sha.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');}catch{after[p]=null;}if(after[p]!==h)changed.push(p);}await writeFile(path.join(out,'tracked-after.json'),JSON.stringify(after,null,2)+'\n');await writeFile(path.join(out,'integrity.json'),JSON.stringify({baseline:metadata.gitHead,trackedFiles:Object.keys(before).length,changed,byteIdentical:changed.length===0},null,2)+'\n');metadata.finishedAt=new Date().toISOString();metadata.elapsedMs=Date.now()-started;metadata.integrity={changed,byteIdentical:!changed.length};metadata.completedCommands=runs;await writeFile(path.join(out,'env-after.json'),JSON.stringify(metadata,null,2)+'\n');

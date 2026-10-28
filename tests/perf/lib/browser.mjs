import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'../../..');
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function browserFixture(){
 const profile=await mkdtemp(path.join(tmpdir(),'lp-perf-'));
 const child=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-dev-shm-usage','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost','--remote-debugging-port=0',`--user-data-dir=${profile}`,`--load-extension=${root}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
 let ws; const pending=new Map();let next=0;const handlers=new Map();
 const close=async()=>{ws?.close();child.kill('SIGTERM');await Promise.race([new Promise(r=>child.exitCode!==null?r():child.once('exit',r)),delay(2000)]);if(child.exitCode===null)child.kill('SIGKILL');await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});};
 try {
 const url=await new Promise((resolve,reject)=>{let s='';const t=setTimeout(()=>reject(Error('HARNESS_ERROR BROWSER_START '+s.slice(-1000))),15000);child.stderr.on('data',b=>{s+=b;const m=s.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(t);resolve(m[1]);}});child.on('error',e=>{clearTimeout(t);reject(e);});});
 ws=new WebSocket(url);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else for(const h of handlers.get(m.method)||[])Promise.resolve(h(m.params,m.sessionId)).catch(e=>{errors.push(String(e));});});
 const errors=[];
 const rpc=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('HARNESS_ERROR CDP_TIMEOUT '+method));},5000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const on=(name,fn)=>{if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);};
 const attach=async url=>{const {targetId}=await rpc('Target.createTarget',{url});return (await rpc('Target.attachToTarget',{targetId,flatten:true})).sessionId;};
 const evaluate=async(expression,sessionId,contextId)=>{const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,...(contextId?{contextId}:{})},sessionId);if(r.exceptionDetails)throw Error('HARNESS_ERROR EVALUATE '+JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(fn,label)=>{const end=Date.now()+5000;while(Date.now()<end){const v=await fn();if(v)return v;await delay(50);}throw Error('HARNESS_ERROR PRECONDITION '+label);};
 const worker=await wait(async()=> (await rpc('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/background.js')),'extension worker');
 const workerSession=(await rpc('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
 const origin=new URL(worker.url).origin==='null'?`chrome-extension://${new URL(worker.url).hostname}`:new URL(worker.url).origin;
 const options=await attach(origin+'/options.html');await wait(()=>evaluate('document.readyState==="complete" && !!chrome.storage',options),'options ready');
 await evaluate('chrome.storage.local.set({linguaplay_auto_start_server:false,linguaplay_app_enabled:true,linguaplay_9router_model:""})',options);
 const page=await attach('about:blank');const contexts=[];on('Runtime.executionContextCreated',(p,s)=>{if(s===page)contexts.push(p.context);});
 const requests=[];
 const html=await readFile(path.join(root,'tests/perf/fixtures/watch.html'),'utf8');
 on('Fetch.requestPaused',async(p,s)=>{if(s!==page)return;const u=new URL(p.request.url);requests.push({url:p.request.url,type:p.resourceType});if(u.hostname==='www.youtube.com'&&p.resourceType==='Document')await rpc('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from(html).toString('base64')},s);else await rpc('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'},s);});
 await rpc('Runtime.enable',{},page);await rpc('Page.enable',{},page);await rpc('Page.addScriptToEvaluateOnNewDocument',{source:`window.__bridgePolls=0;const originalInterval=window.setInterval;window.setInterval=function(fn,ms,...args){return originalInterval.call(this,fn.name==='ensureJapaneseTrackActive'?function(...a){window.__bridgePolls++;return fn(...a);}:fn,ms,...args);};`},page);await rpc('Fetch.enable',{patterns:[{urlPattern:'*'}]},page);await rpc('Page.navigate',{url:'https://www.youtube.com/watch?v=FIXTUREVID01'},page);
 await wait(()=>evaluate('!!document.getElementById("linguaplay-yt-controls")',page),'manifest content injection');
 const isolated=await wait(async()=>contexts.find(c=>c.auxData?.type==='isolated'&&c.origin===origin)?.id,'isolated context');
 const evalMain=e=>evaluate(e,page);const evalContent=e=>evaluate(e,page,isolated);const evalOptions=e=>evaluate(e,options);const evalWorker=e=>evaluate(e,workerSession);
 await evalMain('window.dispatchEvent(new CustomEvent("LINGUAPLAY_SET_APP_STATE",{detail:{enabled:false}})); window.fixture.selected={languageCode:"en"};window.fixture.sets=0;window.dispatchEvent(new CustomEvent("LINGUAPLAY_REQUEST_TRACK_SWITCH",{detail:{vssId:".ja"}}))');
 if(await evalMain('fixture.sets')!==0)throw Error('HARNESS_ERROR bridge off control');
 await evalMain('window.dispatchEvent(new CustomEvent("LINGUAPLAY_SET_APP_STATE",{detail:{enabled:true}}));window.dispatchEvent(new CustomEvent("LINGUAPLAY_REQUEST_TRACK_SWITCH",{detail:{vssId:".ja"}}))');
 if(await evalMain('fixture.selected.languageCode')!=='ja')throw Error('HARNESS_ERROR bridge on control');
 return {rpc,on,wait,page,options,origin,isolated,evalMain,evalContent,evalOptions,evalWorker,requests,errors,close,fixtureMode:'fetch-intercept'};
 }catch(e){await close();throw e;}
}

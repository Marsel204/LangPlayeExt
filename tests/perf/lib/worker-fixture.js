const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const workers=new WeakMap(),root=path.resolve(__dirname,'../../..');
function background(s){if(workers.has(s))return workers.get(s);let listener,inFlight=0;const calls=[],messages=[];
 const runtime=Object.assign(Object.create(s.runtime),{id:'fixture-extension',onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}});
 const sandbox={chrome:{action:{onClicked:{addListener(){}}},runtime,storage:{local:s.api},permissions:{contains:async request=>request.origins.every(origin=>['http://127.0.0.1/*','http://localhost/*'].includes(origin))}},fetch:async(url,options)=>{calls.push({url,options});return {ok:false,status:500,json:async()=>({}),text:async()=>''};},console:{log(){},debug(){},warn(){},error(){}},URL,AbortSignal,AbortController,TextEncoder,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),sandbox,{filename:'background.js'});if(!listener)throw Error('HARNESS_ERROR worker listener');
 const worker={calls,messages,sandbox,get pending(){return inFlight;},async drain(){for(let i=0;i<128;i++){await require('./fakes').flush(1);if(inFlight===0&&s.pending===0)return;}throw Error('HARNESS_ERROR worker acknowledgement deadline');},request:message=>{messages.push(message);inFlight++;return new Promise(resolve=>{const kept=listener(message,{id:'fixture-extension',url:'https://www.youtube.com/watch?v=A'},resolve);if(kept!==true)resolve({unhandled:true});}).finally(()=>inFlight--);}};workers.set(s,worker);return worker;
}
const offline=new Set(['ENSURE_LOCAL_SERVER','FETCH_LRCLIB_LYRICS','PARSE_JAPANESE','CALL_CUSTOM_AI','OPEN_OPTIONS_PAGE']);
function wire(s,options={},messages=[]){const worker=options.worker||background(s);const runtime=Object.assign(Object.create(s.runtime),{id:'fixture-extension'});
 runtime.sendMessage=(request,cb)=>{messages.push(JSON.parse(JSON.stringify(request)));let value=options.message?.(request);if(value===undefined)value=offline.has(request.action)?{success:false,error:'offline fixture'}:worker.request(request);const promise=Promise.resolve(value);if(cb){promise.then(v=>cb(v),e=>{s.runtime.lastError={message:e.message};try{cb();}finally{delete s.runtime.lastError;}});return;}return promise;};return {worker,runtime};}
module.exports={background,wire};

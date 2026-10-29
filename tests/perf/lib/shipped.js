'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {dom,storage,flush,HarnessError,precondition,clone}=require('./fakes');
const root=path.resolve(__dirname,'../../..');
// Closed driver DSL: symbols are identifiers, calls only forward args, snapshot only reads.
// No caller-supplied JavaScript is ever admitted. The three fixture assignments are explicit.
const functions=Object.freeze(['getWordReading','generateSentenceRomaji','tokenize','segmentJapaneseSentence','renderSentenceTokens','onTimeUpdate','checkAndInitVideo','handleTokenClick','injectUI','setupLiveCaptionHooking','parseLRC','parseVTT','parseSRT','parseSubtitleFile','fetchSentenceTranslation','identifySongWithSensei','getOnPageCaptionTracks','renderPedagogicalBreakdown','findJapaneseCaptionTrack','fetchYouTubeCaptions','startServerOnPlayback','callSenseiLlmApi']);
const state=Object.freeze(['currentVideoId','currentSubIndex','renderedSentence','activeLiveSentence','drawerContextVersion','subtitleRenderVersion','lastAiData','drawerContextSentence']);
function buildTail(extra=[]){const functionsWithExtra=[...functions,...extra];if(extra.some(n=>!['stripMarkupTags','toRomajiSafe'].includes(n)))throw new HarnessError('TAIL_NOT_PURE');for(const n of [...functionsWithExtra,...state])if(!/^[A-Za-z_$][\w$]*$/.test(n))throw new HarnessError('TAIL_NOT_PURE');return '\n'+[...functionsWithExtra,...state].map(n=>`if(typeof ${n} === "undefined") throw new Error("HARNESS_ERROR MISSING_SYMBOL: ${n}");`).join('\n')+'\nglobalThis.__shipped = Object.freeze({'+functionsWithExtra.map(n=>`${n}: (...args) => ${n}(...args)`).join(',')+',snapshot: () => ({'+state.join(',')+',timelineLength:subtitleTimeline.length,sentenceTranslationCacheSize:sentenceTranslationCache.size}),timeline: () => subtitleTimeline.map(c=>({start:c.start,end:c.end,text:c.text})),setPlayback: (video,cues,reset=true) => {activeVideoEl=video;subtitleTimeline=cues;if(reset)currentSubIndex=-1;}});\n';}
function instrument(source,tail=buildTail(),extra=[]){
 if(tail!==buildTail(extra))throw new HarnessError('TAIL_NOT_PURE');
 const match=/\}\)\(\);\s*$/.exec(source);if(!match)throw new HarnessError('TRAILER_MISSING');
 const prefix=source.slice(0,match.index),trailer=source.slice(match.index);const result=prefix+tail+trailer;
 if(result.slice(0,prefix.length)!==prefix||result.slice(prefix.length+tail.length)!==trailer)throw new HarnessError('TAIL_NOT_PURE');
 return result;
}
function category(url){url=String(url);return url.includes('/api/captions')?'captions':url.includes('translate.googleapis')?'translate':url.includes('8765')?'anki':url.includes('/youtubei/')?'innertube':url.includes('/watch?')?'watchHtml':url.includes('generativelanguage')?'gemini':url.includes('deepseek')?'deepseek':url.includes('openrouter')?'openrouter':url.includes('/api/ai/')?'localAI':url.includes('/chat/completions')?'router':'other';}
function isLocalNetworkUrl(url){
 let host;try{host=new URL(url).hostname.replace(/\.$/,'');}catch{return false;}
 if(host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='0.0.0.0')return true;
 const parts=host.split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b]=parts;return a===127||a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===169&&b===254);
}
function response(data={},text='',ok=true){return {ok,status:ok?200:500,json:async()=>clone(data),text:async()=>text};}
async function create(config={},options={}){
 const d=dom(),s=options.storage||storage({...config}),calls=[],messages=[],pending=[],spies={segmenters:0,wanakana:{},parserRequests:0};
 const wk=require(path.join(root,'lib/wanakana.min.js'));
 const wanakana=new Proxy(wk,{get(o,k){if(typeof o[k]!=='function')return o[k];return(...args)=>{spies.wanakana[k]=(spies.wanakana[k]||0)+1;return o[k](...args);};}});
 const {worker,runtime}=require('./worker-fixture').wire(s,options,messages);runtime.openOptionsPage=()=>{messages.push({action:'OPEN_OPTIONS'});};
 const fetchFrom=context=>(url,opts={})=>{const c={url:String(url),options:opts,category:category(url),context};calls.push(c);let action;try{action=JSON.parse(opts.body).action;}catch{}if(context==='content'&&(c.category==='anki'||action==='addNote'||c.url===s.state.linguaplay_ankiconnect_url))return Promise.reject(new HarnessError('CONTENT_ANKI_FETCH: AnkiConnect must use the extension worker'));if(context==='content'&&isLocalNetworkUrl(c.url))return Promise.reject(new HarnessError('CONTENT_LOCAL_NETWORK_FETCH: '+c.url+' must use the extension worker'));if(options.fetch)return options.fetch(c);if(c.category==='translate')return Promise.resolve(response([[['translation']]]));return new Promise((resolve,reject)=>pending.push({call:c,resolve,reject}));};
 // Content requests cannot borrow the worker's host permissions in this fixture.
 const fetch=fetchFrom('content');
 worker.sandbox.fetch=fetchFrom('worker');
 const IntlSpy={...Intl,Segmenter:class extends Intl.Segmenter{constructor(...args){super(...args);spies.segmenters++;}}};
 d.window.wanakana=options.spies===false?wk:wanakana;d.window.YomitanDeinflector=require(path.join(root,'lib/yomitan-deinflector.js'));
 let Parser;
 if(options.parser==='offline'){const real=require(path.join(root,'js/japanese-parser.js'));Parser={create:opts=>real.create({...opts,transport:async()=>{spies.parserRequests++;throw Error('offline fixture');}})};}
 const sandbox={console:{log(){},debug(){},warn(){},error(){}},window:d.window,document:d.document,chrome:{storage:{local:s.api},runtime},MutationObserver:d.MutationObserver,...d.clock,URL,URLSearchParams,AbortSignal,AbortController,Intl:options.spies===false?Intl:IntlSpy,fetch,LinguaPlayParser:Parser,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},Event:class{constructor(type){this.type=type;}},performance,TextEncoder,TextDecoder,alert(){},FileReader:class{readAsText(file){Promise.resolve(file.text()).then(result=>this.onload({target:{result}}));}}};
 const source=fs.readFileSync(path.join(root,'content.js'),'utf8');vm.runInNewContext(instrument(source,buildTail(options.extra||[]),options.extra||[]),sandbox,{filename:'content.js',timeout:10000});
 const raw=sandbox.__shipped;const api={...raw,snapshot:()=>clone(raw.snapshot()),timeline:()=>clone(raw.timeline())};
 api.injectUI();await flush();
 const h={...api,...d,storage:s,worker,sandbox,calls,messages,pending,spies,fixtureMode:'node-fake',navigate(id){d.window.location={search:id?'?v='+id:'',pathname:id?'/watch':'/',href:'https://www.youtube.com/'+(id?'watch?v='+id:'')};},async click(id){const el=d.document.getElementById(id);precondition(el,'element '+id);precondition(el.listeners.click?.size,'click handler '+id);el.click();await flush();},select(word='猫',sentence=word+'がいる',token={}){api.handleTokenClick({surface:word,baseForm:word,...token},sentence);},async waitForFetch(category,count=1){for(let i=0;i<128;i++){if(pending.filter(p=>p.call.category===category).length>=count)return;await flush(1);}throw new HarnessError('Pending fetch deadline: '+category);},resolve(category,data,text='',ok=true){const p=pending.find(p=>p.call.category===category&&!p.done);precondition(p,'pending '+category);p.done=true;p.resolve(response(data,text,ok));},async tick(){const i=d.intervals.find(i=>i.fn.name==='checkAndInitVideo');precondition(i,'production interval');const p=i.fn();await flush();return {pending:p};}};
 return h;
}
function loadBridge(h){const counts={load:0,get:0,set:0};let selected={languageCode:'en',vssId:'.en'};h.player.loadModule=()=>counts.load++;h.player.getOption=(_,k)=>{counts.get++;return k==='tracklist'?[{languageCode:'en',vssId:'.en'},{languageCode:'ja',vssId:'.ja'}]:selected;};h.player.setOption=(_,k,v)=>{counts.set++;selected=v;};vm.runInNewContext(fs.readFileSync(path.join(root,'js/youtube-bridge.js'),'utf8'),h.sandbox);return {counts,poll:()=>h.intervals.at(-1).fn(),get selected(){return selected;},set selected(v){selected=v;}};}
module.exports={root,create,instrument,buildTail,functions,category,response,loadBridge,flush,HarnessError,precondition,storage,clone};

'use strict';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const flush=async(n=8)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
class HarnessError extends Error {constructor(message){super(message);this.name='HarnessError';}}
function precondition(value,message){if(!value)throw new HarnessError('PRECONDITION: '+message);}
function storage(seed={},options={}){
 const state=clone(seed),writes=[],reads=[],runtime={};let pending=0;const random=require('./stats').rng(options.seed??0x5eed);const defer=fn=>{if(!options.randomLatency)return queueMicrotask(fn);let turns=Math.floor(random()*4);const step=()=>turns--?setImmediate(step):fn();setImmediate(step);};
 const api={
  get(keys,callback){const snapshot={};for(const k of keys===null?Object.keys(state):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys||{}))if(k in state)snapshot[k]=clone(state[k]);else if(keys&&!Array.isArray(keys)&&typeof keys==='object'&&keys[k]!==undefined)snapshot[k]=clone(keys[k]);reads.push({keys,bytes:Buffer.byteLength(JSON.stringify(snapshot))});return schedule(()=>clone(snapshot),callback);},
  set(values,callback){const captured=clone(values);return schedule(()=>{const next={...state,...captured};const bytes=Buffer.byteLength(JSON.stringify(next));const failed=!!options.fail||bytes>(options.quota??Infinity);writes.push({keys:Object.keys(captured),bytes:Buffer.byteLength(JSON.stringify(captured)),failed});if(failed){runtime.lastError={message:'QUOTA_BYTES quota exceeded'};return undefined;}Object.assign(state,captured);return undefined;},callback,true);},
  remove(keys,cb){return schedule(()=>{for(const k of Array.isArray(keys)?keys:[keys])delete state[k];},cb);},
  clear(cb){return schedule(()=>{for(const k of Object.keys(state))delete state[k];},cb);},
  getBytesInUse(_keys,cb){return schedule(()=>Buffer.byteLength(JSON.stringify(state)),cb);}
 };
 function schedule(fn,cb,isWrite=false){pending++;return new Promise((resolve,reject)=>defer(()=>{try{const v=fn();if(cb)cb(v);if(runtime.lastError&&!cb&&isWrite){reject(new Error(runtime.lastError.message));}else resolve(v);}catch(e){reject(e);}finally{delete runtime.lastError;pending--;}}));}
 return {api,state,writes,reads,runtime,options,get pending(){return pending;}};
}
function dom(){
 const counts={create:0,append:0,remove:0,html:0,text:0,style:0,class:0,attribute:0,queries:0,addListener:0,removeListener:0,observerCallbacks:0};
 const elements=new Map(),all=[],observers=[],intervals=[],timeouts=[];
 class EventTarget {constructor(){this.listeners={};}addEventListener(k,fn){(this.listeners[k]??=new Set()).add(fn);counts.addListener++;}removeEventListener(k,fn){if(this.listeners[k]?.delete(fn))counts.removeListener++;}dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);return true;}emit(type,extra={}){return this.dispatchEvent({type,stopPropagation(){},preventDefault(){},...extra});}listenerCount(){return Object.values(this.listeners).reduce((n,s)=>n+s.size,0);}}
 class Element extends EventTarget{
  replaceChildren(...children){for(const child of [...this.children])child.remove();this.textContent='';for(const child of children)this.appendChild(child);}
  constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.value='';this._text='';this._html='';this.offsetParent={};this.style=new Proxy({setProperty:(k,v)=>{this.style[k]=v;}},{set:(o,k,v)=>{counts.style++;o[k]=v;return true;}});const classes=new Set();this.classList={add:(...x)=>{counts.class++;x.forEach(v=>classes.add(v));},remove:(...x)=>{counts.class++;x.forEach(v=>classes.delete(v));},contains:x=>classes.has(x),toggle:(x,f=!classes.has(x))=>{counts.class++;f?classes.add(x):classes.delete(x);return f;},values:()=>[...classes]};all.push(this);}
  set id(v){this._id=v;elements.set(v,this);}get id(){return this._id;}
  set className(v){this.classList.remove(...this.classList.values());this.classList.add(...String(v).split(/\s+/).filter(Boolean));}get className(){return this.classList.values().join(' ');}
  setAttribute(k,v){counts.attribute++;this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
  set innerHTML(v){counts.html++;this._html=String(v);this._text='';for(const c of this.children)c.parentElement=null;this.children=[];
   // Only static id-bearing UI scaffolding is fabricated. No text/markup oracle uses this fake.
   for(const m of this._html.matchAll(/id="([^"]+)"/g)){const e=new Element();e.id=m[1];this.appendChild(e);}
  }get innerHTML(){return this._html;}
  set textContent(v){counts.text++;this._text=String(v??'');this._html='';for(const c of this.children)c.parentElement=null;this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  get firstChild(){return this.children[0]||null;}get firstElementChild(){return this.firstChild;}get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}get parentNode(){return this.parentElement;}get isConnected(){return this===html||!!this.parentElement?.isConnected;}
  appendChild(e){counts.append++;e.remove();e.parentElement=this;this.children.push(e);return e;}insertBefore(e,anchor){if(!anchor)return this.appendChild(e);e.remove();counts.append++;e.parentElement=this;this.children.splice(this.children.indexOf(anchor),0,e);return e;}
  remove(){if(this.parentElement){counts.remove++;this.parentElement.children=this.parentElement.children.filter(e=>e!==this);}this.parentElement=null;}removeChild(e){e.remove();return e;}
  contains(e){return this===e||this.children.some(c=>c.contains(e));}matches(s){return s==='*'||(s[0]==='#'?this.id===s.slice(1):s[0]==='.'?this.classList.contains(s.slice(1)):this.tagName.toLowerCase()===s);}
  querySelectorAll(s){counts.queries++;const descendants=this.children.flatMap(c=>[c,...c.descendants()]);return descendants.filter(c=>c.matches(s));}descendants(){return this.children.flatMap(c=>[c,...c.descendants()]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  getBoundingClientRect(){return this.id==='movie_player'?{top:0,bottom:510,left:0,right:900,width:900,height:510}:{top:470,bottom:510,left:0,right:900,width:40,height:40};}scrollIntoView(){}focus(){}click(){this.emit('click');}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}
 }
 const html=new Element('html'),body=new Element('body');html.appendChild(body);
 const make=(tag,id,parent=body)=>{const e=new Element(tag);if(id)e.id=id;parent.appendChild(e);return e;};
 const player=make('div','movie_player');player.className='html5-video-player';const bar=make('div',null,player);bar.className='ytp-chrome-bottom';const controls=make('div',null,bar);controls.className='ytp-right-controls';const cc=make('button',null,controls);cc.className='ytp-button ytp-subtitles-button';cc.setAttribute('aria-pressed','true');cc.addEventListener('click',()=>cc.setAttribute('aria-pressed',String(cc.getAttribute('aria-pressed')!=='true')));
 const secondary=make('aside','secondary'),inner=make('div','secondary-inner',secondary);const video=make('video',null,player);Object.assign(video,{currentTime:0,duration:180,paused:true,ended:false,textTracks:[]});const caption=make('div',null,player);caption.className='ytp-caption-window-container';const segment=make('span',null,caption);segment.className='ytp-caption-segment';
 const document=new EventTarget();Object.assign(document,{body,documentElement:html,title:'Fixture Song - YouTube',scripts:[],createElement:tag=>{counts.create++;return new Element(tag);},getElementById:id=>{const e=elements.get(id);return e?.isConnected?e:null;},querySelector:s=>{counts.queries++;return html.querySelector(s);},querySelectorAll:s=>s==='script'?document.scripts:html.querySelectorAll(s)});
 const window=new EventTarget();window.location={search:'',href:'https://www.youtube.com/',pathname:'/'};window.innerWidth=1440;
 class MutationObserver{constructor(fn){this.fn=fn;this.connected=false;observers.push(this);}observe(target,options){this.target=target;this.options=options;this.connected=true;}disconnect(){this.connected=false;}deliver(records=[]){if(this.connected){counts.observerCallbacks++;this.fn(records,this);}}}
 const clock={setInterval(fn,ms){const o={fn,ms,active:true};intervals.push(o);return o;},clearInterval(o){if(o)o.active=false;},setTimeout(fn,ms){const o={fn,ms,active:true};timeouts.push(o);return o;},clearTimeout(o){if(o)o.active=false;}};
 return {Element,EventTarget,document,window,elements,all,player,video,cc,caption,segment,secondary,counts,observers,intervals,timeouts,MutationObserver,clock,resetCounts(){for(const k of Object.keys(counts))counts[k]=0;}};
}
module.exports={dom,storage,flush,HarnessError,precondition,clone};

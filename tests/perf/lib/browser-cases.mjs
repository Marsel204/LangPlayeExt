import {delay,root} from './browser.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {instrument}=require('./shipped.js');
const pre=(v,m)=>{if(!v)throw Error('HARNESS_ERROR PRECONDITION '+m);};
export async function boundaryCases(b){
 const results=[];
 const record=(id,expected,control,ok,witness,signature)=>results.push({id,expected,control,ok,witness,signature,fixtureMode:b.fixtureMode});
 const m=b.evalMain,c=b.evalContent,o=b.evalOptions,w=b.evalWorker;
 await c(`window.__network=[];window.__mode='normal';window.__ai=[];window.fetch=(url,options={})=>{__network.push({url:String(url),body:options.body});if(String(url).includes('translate.googleapis'))return Promise.resolve({ok:true,json:async()=>[[['fixture translation']]]});if(String(url).includes('8765'))return Promise.resolve({ok:true,json:async()=>({result:1,error:null})});if(String(url).includes('deepseek'))return new Promise(resolve=>__ai.push(resolve));return Promise.resolve({ok:false,status:500,json:async()=>({status:'error',message:'offline fixture'}),text:async()=>''});};`);
 // Keep UI ownership in the isolated world and model transport in the real worker.
 await w(`globalThis.__ai=[];globalThis.__network=[];globalThis.fetch=(url,options={})=>{__network.push({url:String(url),body:options.body});if(String(url).includes('/chat/completions'))return new Promise(resolve=>__ai.push(resolve));return Promise.resolve({ok:false,status:500,json:async()=>({}),text:async()=>''});};`);
 async function select(text='猫がいる'){await m(`document.querySelector('.ytp-caption-segment').textContent=${JSON.stringify(text)}`);await b.wait(()=>c(`!!document.querySelector('.linguaplay-yt-token') && document.getElementById('linguaplay-yt-tokens').textContent.includes('猫')`),'live token');await c(`document.querySelector('.linguaplay-yt-token').click()`);}
 await select();
 await o(`chrome.storage.local.set({linguaplay_9router_model:''})`);await c(`document.getElementById('lp-ai-btn').click()`);
 await b.wait(()=>m(`!!document.getElementById('lp-go-options-btn')`),'no-key error settings affordance');
 let opened=0;b.on('Target.targetCreated',p=>{if(p.targetInfo.url?.endsWith('/options.html'))opened++;});await b.rpc('Target.setDiscoverTargets',{discover:true});
 // Intercept only the options-opening boundary to avoid changing the active fixture tab.
 await c(`window.__openedOptions=0;chrome.runtime.openOptionsPage=()=>{__openedOptions++;};window.__originalSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(req,cb)=>{if(req.action==='OPEN_OPTIONS_PAGE'){__openedOptions++;cb?.({success:true});return;}return __originalSend(req,cb);};document.getElementById('lp-go-options-btn').click()`);
 const affordance=await c(`({button:!!document.getElementById('lp-go-options-btn'),opened:__openedOptions})`);
 // openExtensionSettings prefers chrome.runtime.openOptionsPage if present; check event path too.
 record('R-A01-control','green',null,affordance.button&&affordance.opened>0,{...affordance,openedTargets:opened},'SETTINGS_AFFORDANCE_PRESENT');
 const hostile=await m(`(()=>{const e=document.getElementById('lp-inline-api-key');if(e)e.value='dummy-review-secret';return {passwordFields:document.querySelectorAll('input[type=password]').length,mainWorldValue:e?.value||null};})()`);
 record('R-A01-1','red','R-A01-control',hostile.passwordFields===0&&hostile.mainWorldValue===null,hostile,'HOST_PAGE_READS_DUMMY_CREDENTIAL');
 // The escaped chat markdown renderer is driven by the real send handler.
 await c(`document.getElementById('lp-chat-input').value='fixture question';document.getElementById('lp-chat-send-btn').click()`);await delay(30);
 // Missing key error is also escaped in chat; use a keyed model response for the positive escaped payload control.
 await o(`chrome.storage.local.set({linguaplay_9router_model:'fixture-study',linguaplay_9router_key:'dummy-fixture-key'})`);
 await c(`document.getElementById('lp-chat-input').value='fixture question 2';document.getElementById('lp-chat-send-btn').click()`);
 await b.wait(()=>w('__ai.length>0'),'chat request issued');
 const payload='<img data-injected src=x onerror="void(0)">';
 await w(`__ai.shift()({ok:true,json:async()=>({choices:[{message:{content:${JSON.stringify(payload)}}}]})})`);await delay(20);
 const control=await m(`({injected:document.querySelectorAll('#lp-chat-messages [data-injected]').length,text:document.getElementById('lp-chat-messages').textContent})`);
 record('R-A02-control','green',null,control.injected===0&&control.text.includes(payload),control,'CHAT_MARKDOWN_ESCAPES_PAYLOAD');
 const romajiWitness=[];const payloads=['<img data-injected src=x onerror="void(0)">','"><svg data-injected>','&amp;','</div><b data-injected>','" data-injected="yes','<img data-injected src=x onerror="void(0)"'];
 for(let i=0;i<payloads.length;i++){
  const p=payloads[i];await select('猫 '+p+' がいる '+i);
  const w=await m(`(()=>{const ids=['lp-sentence-jp','lp-chat-context-sentence','lp-sentence-romaji','lp-chat-sentence-romaji'];return ids.map(id=>{const e=document.getElementById(id);return {id,text:e.textContent,injected:e.querySelectorAll('[data-injected]').length,html:e.innerHTML};});})()`);
  romajiWitness.push(...w.filter(x=>x.id.includes('romaji')));const desired='猫 '+p+' がいる '+i;const jp=w.filter(x=>x.id==='lp-sentence-jp'||x.id==='lp-chat-context-sentence');
  record('R-A02-highlight-'+i,i===4?'green':'red','R-A02-control',jp.every(x=>x.injected===0&&x.text===desired),{payload:p,sinks:w},'HIGHLIGHT_MARKUP_OR_TEXT_CHANGED');
 }
 record('R-A02-romaji','green','R-A02-control',romajiWitness.every(x=>x.injected===0),{sinks:romajiWitness},'FALLBACK_ROMAJI_NO_MARKUP_ON_CORPUS');
 // Feed the real AI handler to reach renderPedagogicalBreakdown, including title attributes.
 await select('猫がいる');await c(`document.getElementById('lp-ai-btn').click()`);await b.wait(()=>w('__ai.length>0'),'gloss request');
 const data={word_by_word:[{word:'猫',reading:'ねこ',meaning:payload,role:'" data-injected="role'}]};
 await w(`__ai.shift()({ok:true,json:async()=>({choices:[{message:{content:${JSON.stringify(JSON.stringify(data))}}}]})})`);await delay(20);
 const gloss=await m(`({injected:document.querySelectorAll('#lp-ai-results [data-injected]').length,html:document.getElementById('lp-ai-results').innerHTML})`);
 record('R-A02-gloss','red','R-A02-control',gloss.injected===0,gloss,'GLOSS_ELEMENT_ATTRIBUTE_INJECTION');
 // Error strings originate at the transport boundary; real renderer handles them.
 await c(`document.getElementById('lp-ai-btn').click()`);await b.wait(()=>w('__ai.length>0'),'error request');await w(`__ai.shift()({ok:false,status:500,json:async()=>({error:{message:${JSON.stringify(payload)}}})})`);await delay(20);
 const err=await m(`({injected:document.querySelectorAll('#lp-ai-results [data-injected]').length,html:document.getElementById('lp-ai-results').innerHTML})`);
 record('R-A02-error','red','R-A02-control',err.injected===0,err,'ERROR_BANNER_INJECTION');
 
 // Lyrics and AI identification banners use real handlers with local-only message/model responses.
 await c(`window.__sendBeforeLyrics=chrome.runtime.sendMessage;chrome.runtime.sendMessage=(req,cb)=>{if(req.action==='FETCH_LRCLIB_LYRICS'){queueMicrotask(()=>cb({success:true,syncedLyrics:'[00:00.00]猫',trackName:${JSON.stringify(payload)},artistName:${JSON.stringify(payload)}}));return;}return __sendBeforeLyrics(req,cb);};document.getElementById('lp-search-track-input').value='fixture';document.getElementById('lp-search-submit-btn').click()`);await delay(30);
 const lyrics=await m(`({injected:document.querySelectorAll('#lp-search-results-list [data-injected]').length,html:document.getElementById('lp-search-results-list').innerHTML})`);
 pre(lyrics.html.includes('Found on'),'lyrics banner reached');record('R-A02-lyrics','red','R-A02-control',lyrics.injected===0,lyrics,'LYRICS_METADATA_INJECTION');
 await c(`document.getElementById('lp-ai-identify-btn').click()`);await b.wait(()=>w('__ai.length>0'),'identify model request');
 const metadata={trackName:payload,artistName:payload,animeName:payload};await w(`__ai.shift()({ok:true,json:async()=>({choices:[{message:{content:${JSON.stringify(JSON.stringify(metadata))}}}]})})`);await delay(40);
 const identified=await m(`({injected:document.querySelectorAll('#lp-search-results-list [data-injected]').length,html:document.getElementById('lp-search-results-list').innerHTML})`);pre(identified.html.includes('Identified:'),'identified banner reached');record('R-A02-identified','red','R-A02-control',identified.injected===0,identified,'IDENTIFIED_METADATA_INJECTION');
 await c(`document.getElementById('lp-clear-cache-btn').click();chrome.runtime.sendMessage=__sendBeforeLyrics`);await delay(20);

 // Actual card JSON is parsed with the browser's HTML parser; no fake-DOM sink oracle.
 await select('猫 '+payload);await c(`document.getElementById('lp-active-def').textContent=${JSON.stringify(payload)};document.getElementById('lp-quick-anki-btn').click()`);await delay(20);
 const card=await c(`(()=>{const r=__network.filter(x=>x.url.includes('8765')).at(-1);if(!r)return null;const note=JSON.parse(r.body).params.note;return {note,injected:Object.values(note.fields).map(html=>{const t=document.createElement('template');t.innerHTML=html;return t.content.querySelectorAll('[data-injected]').length;})};})()`);pre(card,'card request recorded');
 record('R-A02-card-A','red','R-A02-control',card.injected.every(n=>n===0),card,'ANKI_FIELDS_CONTAIN_MARKUP');
 // Full production exporters on their actual extension pages, Blob captured at download boundary.
 const exported={};const seed={word:'猫',reading:'ねこ',romaji:'neko',meaning:payload+'\tmeaning\nnext',sentence:'猫 猫 '+payload,sentence_en:'a cat'};
 await o(`chrome.storage.local.set({linguaplay_cards:[${JSON.stringify(seed)}]})`);
 for(const pageName of ['options','popup']){
  let session=b.options;
  if(pageName==='popup'){const t=await b.rpc('Target.createTarget',{url:b.origin+'/popup.html'});session=(await b.rpc('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;await b.wait(async()=>{const r=await b.rpc('Runtime.evaluate',{expression:'document.readyState==="complete" && !!document.getElementById("export-tsv-btn")',returnByValue:true},session);return r.result.value;},'popup ready');}
  const expr=`(async()=>{window.__blob=null;URL.createObjectURL=b=>{__blob=b;return 'blob:fixture';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};document.getElementById('export-tsv-btn').click();await new Promise(r=>setTimeout(r,30));if(!__blob)throw Error('no export Blob');const text=await __blob.text();const rows=text.split('\\n').filter(x=>x&&!x.startsWith('#'));const t=document.createElement('template');t.innerHTML=rows.join('');return {text,columns:rows.map(x=>x.split('\\t').length),injected:t.content.querySelectorAll('[data-injected]').length};})()`;
  const rr=await b.rpc('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},session);pre(!rr.exceptionDetails,'export Blob '+JSON.stringify(rr.exceptionDetails));exported[pageName]=rr.result.value;
 }
 const colOkay=Object.values(exported).every(x=>x.columns.every(n=>n===4));record('R-A02-card-B','red','R-A02-control',Object.values(exported).every(x=>x.injected===0)&&colOkay,exported,'TSV_HTML_UNESCAPED');
 record('R-A06-exporters','red','R-A02-control',exported.options.text===exported.popup.text,exported,'EXPORT_BYTES_DIVERGE');
 // Shared MAIN bridge + isolated real eye handler.
 await m(`window.dispatchEvent(new CustomEvent('LINGUAPLAY_SET_APP_STATE',{detail:{enabled:true}}));fixture.selected={languageCode:'en'};fixture.loads=0;document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed','false')`);await b.wait(()=>m('fixture.loads>0'),'visible bridge poll actually ran');
 const visible=await m(`({selected:fixture.selected.languageCode,cc:document.querySelector('.ytp-subtitles-button').getAttribute('aria-pressed')})`);
 record('R-A05-browser-control','green',null,visible.selected==='ja'&&visible.cc==='true',visible,'VISIBLE_POLL_CONTROL');
 await c(`if(!document.documentElement.classList.contains('linguaplay-subtitles-hidden'))document.getElementById('linguaplay-visibility-toggle').click()`);
 pre(await m(`document.documentElement.classList.contains('linguaplay-subtitles-hidden')`),'eye actually hidden');await m(`fixture.selected={languageCode:'en'};document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed','false');fixture.sets=0;fixture.loads=0;window.__hiddenPollStart=__bridgePolls`);await b.wait(()=>m('__bridgePolls>__hiddenPollStart'),'hidden bridge poll actually ran');
 const hidden=await m(`({selected:fixture.selected.languageCode,cc:document.querySelector('.ytp-subtitles-button').getAttribute('aria-pressed'),sets:fixture.sets,pollsObserved:__bridgePolls-__hiddenPollStart})`);
 record('R-A05-browser','red','R-A05-browser-control',hidden.selected==='en'&&hidden.cc==='false',hidden,'REAL_HIDDEN_OVERLAY_CC_JA_RESTORED');
 if(process.env.LP_REVIEW_MODE==='after'){await b.wait(()=>m('__bridgePolls-__hiddenPollStart>=3'),'three actual hidden bridge polls');const w=await m(`({selected:fixture.selected.languageCode,cc:document.querySelector('.ytp-subtitles-button').getAttribute('aria-pressed'),pollsObserved:__bridgePolls-__hiddenPollStart})`);record('R-A05-browser-multipoll','green','R-A05-browser-control',w.pollsObserved>=3&&w.selected==='en'&&w.cc==='false',w,'THREE_HIDDEN_POLLS');}
 const permission=await o(`chrome.permissions.contains({origins:['https://example.invalid/*']})`);const loopback=await o(`chrome.permissions.contains({origins:['http://127.0.0.1/*']})`);
 record('R-A11-browser-control','green',null,loopback,{loopback},'REAL_LOOPBACK_PERMISSION');record('R-A11-guard','red','R-A11-browser-control',!permission,{permissionGranted:permission},'UNREQUESTED_ORIGIN_ALREADY_GRANTED');
 // Near-quota real storage, confirm filler write succeeds, then the real Quick Add handler.
 await o(`chrome.storage.local.clear()`);await c(`document.getElementById('lp-active-def').textContent='short';document.getElementById('lp-quick-anki-btn').click()`);await delay(40);const savedControl=await o(`chrome.storage.local.get('linguaplay_cards')`);record('R-A07-quota-control','green',null,savedControl.linguaplay_cards?.length===1,{persistedCards:savedControl.linguaplay_cards?.length||0},'REAL_STORAGE_SAVE_CONTROL');await o(`chrome.storage.local.clear()`);const quota=await o(`(async()=>{await chrome.storage.local.set({linguaplay_9router_model:'fixture-study',linguaplay_auto_start_server:false});const used=await chrome.storage.local.getBytesInUse(null);const n=chrome.storage.local.QUOTA_BYTES-used-2048-8;await chrome.storage.local.set({filler:'x'.repeat(n)});return {quota:chrome.storage.local.QUOTA_BYTES,used:await chrome.storage.local.getBytesInUse(null)};})()`);pre(quota.quota-quota.used<2100,'real quota pressure established');
 await c(`document.getElementById('lp-active-def').textContent='quota witness '.repeat(1500);document.getElementById('lp-quick-anki-btn').click()`);await delay(80);
 const quotaResult=await o(`chrome.storage.local.get('linguaplay_cards')`);const label=await m(`document.getElementById('lp-quick-anki-btn').textContent`);
 record('R-A07-quota','red','R-A07-quota-control',!label.includes('Saved'),{...quota,persistedCards:quotaResult.linguaplay_cards?.length||0,label},'REAL_QUOTA_FALSE_SUCCESS');await o(`chrome.storage.local.clear()`);
 // Native DOM visibility after synchronous navigation reset.
 await c(`if(document.documentElement.classList.contains('linguaplay-subtitles-hidden'))document.getElementById('linguaplay-visibility-toggle').click()`);await select('猫がいる');
 for(const [id,url] of [['newVideo','?v=FIXTUREVID02'],['leaveWatch','/']]){await m(`history.pushState({},'',${JSON.stringify(url)});window.dispatchEvent(new Event('yt-navigate-finish'))`);const w=await m(`({overlayActive:document.getElementById('linguaplay-yt-tokens-overlay').classList.contains('active'),drawerHidden:document.getElementById('linguaplay-yt-drawer').classList.contains('hidden'),tokens:document.getElementById('linguaplay-yt-tokens').textContent})`);record('R-A08-browser-'+id,'red','R-A05-browser-control',!w.overlayActive&&w.drawerHidden&&!w.tokens,w,'REAL_NAVIGATION_STALE_DOM');}
 return results;
}

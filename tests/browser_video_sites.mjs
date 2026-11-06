// Production MV3 extension on intercepted video sites. No real accounts or provider calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const videoData = (await readFile(path.join(root, 'tests/fixtures/video.webm'))).toString('base64');
const profile = await mkdtemp(path.join(tmpdir(), 'langplay-video-sites-'));
const captureDir = path.join(root, '.impeccable/review/player');
const browser = spawn(process.env.CHROMIUM_PATH || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-dev-shm-usage', '--window-size=1280,900', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--load-extension=' + root, 'about:blank'], {stdio: ['ignore','ignore','pipe']});
const calls = [], errors = [], pending = new Map();
let ws, nextId = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, name) {
  const end = Date.now() + 15000; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await delay(50); }
  throw Error('Timed out: ' + name + ' (' + JSON.stringify(value) + ')');
}
function rpc(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {pending.delete(id); reject(Error('CDP timeout: ' + method));}, 12000);
    pending.set(id, {resolve, reject, timer}); ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
}
async function evaluate(session, expression) {
  const r = await rpc('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, session);
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const ass = '[Script Info]\nTitle: Fixture\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,世界は綺麗だった。\nDialogue: 0,0:00:04.01,0:00:10.00,Default,,0,0,0,,私は日本語を勉強する。\n';
const fixture = `<!doctype html><html><meta charset="utf-8"><title>Fixture series - Netflix</title><style>*{box-sizing:border-box}body{margin:0;background:#10151c;color:#ddd;font-family:system-ui}.watch-video{position:relative;width:100vw;height:100vh;background:#253640}.watch-video video{display:block;width:100%;height:100%;object-fit:contain;background:#253640}.fixture-label{position:absolute;top:24px;left:24px;color:#c7d2d9;font-size:14px;pointer-events:none}</style><div class="watch-video"><video muted loop src="data:video/webm;base64,${videoData}"></video><span class="fixture-label">Video player fixture · Japanese study</span></div><script>window.playCalls=0;window.pauseCalls=0;const video=document.querySelector('video');video.addEventListener('pause',()=>window.pauseCalls++);video.addEventListener('play',()=>window.playCalls++);</script></html>`;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('Chromium startup timeout ' + output.slice(-800))), 15000);
    browser.stderr.on('data', chunk => {output += chunk; const m=output.match(/DevTools listening on (ws:\/\/\S+)/); if(m){clearTimeout(timer);resolve(m[1]);}});
    browser.once('error', reject);
  });
  ws = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {ws.addEventListener('open', resolve, {once:true}); ws.addEventListener('error', reject, {once:true});});
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const p=pending.get(message.id); if(!p)return; pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result); return;
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method !== 'Fetch.requestPaused') return;
    const {requestId, request, resourceType} = message.params;
    calls.push({url: request.url, headers: request.headers});
    const url=new URL(request.url); let body='{}', type='application/json', code=200;
    if(resourceType==='Document'){body=fixture;type='text/html; charset=utf-8';}
    else if(url.hostname==='jimaku.cc' && url.pathname.endsWith('/search')) body=JSON.stringify([{id:12,name:'Fixture series',english_name:'Fixture series',japanese_name:'作品'}]);
    else if(url.hostname==='jimaku.cc' && url.pathname.endsWith('/files')) body=JSON.stringify([{name:'Fixture.01.ja.ass',url:'https://jimaku.cc/entry/12/Fixture.01.ja.ass',size:ass.length},{name:'Season.zip',url:'https://jimaku.cc/entry/12/Season.zip',size:1200}]);
    else if(url.hostname==='jimaku.cc' && url.pathname.startsWith('/entry/')){body=ass;type='text/plain';}
    else if(url.hostname==='lrclib.net') body=JSON.stringify({id:1,trackName:'Fixture song',artistName:'Fixture artist',syncedLyrics:'[00:00.00]歌を歌う\n[00:06.00]君の歌',duration:12});
    else if(url.hostname==='translate.googleapis.com'){
      const text=url.searchParams.get('q');
      body=JSON.stringify([[[text==='世界は綺麗だった。'?'The world was beautiful.':text==='私は日本語を勉強する。'?'I study Japanese.':'Existing subtitle.']],null,'ja']);
    }else code=404;
    rpc('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(body).toString('base64')},message.sessionId).catch(error=>errors.push(error.message));
  });
  const worker = await until(async () => (await rpc('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/background.js')), 'extension worker');
  const {sessionId: workerSession}=await rpc('Target.attachToTarget',{targetId:worker.targetId,flatten:true});
  await rpc('Runtime.enable',{},workerSession);
  await rpc('Runtime.runIfWaitingForDebugger',{},workerSession);
  await rpc('Fetch.enable',{patterns:[{urlPattern:'https://*/*'}]},workerSession);
  const {targetId:optionsTarget}=await rpc('Target.createTarget',{url:`chrome-extension://${new URL(worker.url).hostname}/options.html`});
  const {sessionId:options}=await rpc('Target.attachToTarget',{targetId:optionsTarget,flatten:true});
  await until(()=>evaluate(options,'typeof chrome!=="undefined"&&!!chrome.storage?.local'),'extension storage');
  await evaluate(options,'chrome.storage.local.set({linguaplay_auto_start_server:false,linguaplay_server_url:"http://127.0.0.1:1",linguaplay_sentence_meaning:true,linguaplay_caption_position:{horizontal:-500,vertical:"above"}})');
  const {targetId}=await rpc('Target.createTarget',{url:'about:blank'});
  const {sessionId:page}=await rpc('Target.attachToTarget',{targetId,flatten:true});
  await rpc('Fetch.enable',{patterns:[{urlPattern:'https://*/*'}]},page);
  await rpc('Page.enable',{},page); await rpc('Runtime.enable',{},page);
  const run=expression=>evaluate(page,expression);
  const click=id=>run(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function assertCaptionCenteredOnVideo(state) {
    const centers = await run('(()=>{const video=document.querySelector("video").getBoundingClientRect();const caption=document.getElementById("linguaplay-caption-surface").getBoundingClientRect();return {video:(video.left+video.right)/2,caption:(caption.left+caption.right)/2}})()');
    assert.ok(Math.abs(centers.caption-centers.video)<1,`${state}: subtitles stay centered on the video (${JSON.stringify(centers)})`);
  }
  await rpc('Page.navigate',{url:'https://www.netflix.com/watch/12345'},page);
  await until(()=>run('!!document.getElementById("linguaplay-sub-status")'),'Netflix controls');
  await until(()=>run('document.querySelector("video").readyState>=2'),'playable media');
  await run('document.querySelector("video").currentTime=1');
  assert.equal(await run('document.querySelectorAll("#linguaplay-yt-controls").length'),1);
  await click('linguaplay-toggle-trigger');
  await run('document.getElementById("linguaplay-more-menu").open=true');
  assert.equal(await run('getComputedStyle(document.getElementById("linguaplay-fetch-lyrics-btn")).display'),'none','YouTube lyrics stay out of other sites\' menus');
  await click('linguaplay-jimaku-btn');
  assert.equal(await run('getComputedStyle(document.getElementById("linguaplay-yt-widget")).display'),'none','Opening Subtitles dismisses the compact toolbar');
  assert.equal(await run('document.getElementById("linguaplay-more-menu").open'),false);
  await click('linguaplay-toggle-trigger');
  await run('document.getElementById("linguaplay-jimaku-btn").focus()');
  await click('linguaplay-jimaku-btn');
  assert.equal(await run('document.activeElement.id'),'lp-jimaku-query','An already-open panel receives focus before its invoking toolbar is hidden');
  await click('lp-jimaku-close');
  const badgePoint = await run('(()=>{const el=document.getElementById("linguaplay-sub-status");const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el}})()');
  assert.equal(badgePoint.hit,true,'The subtitle entry point accepts pointer input');
  await rpc('Input.dispatchMouseEvent',{type:'mousePressed',x:badgePoint.x,y:badgePoint.y,button:'left',clickCount:1},page);
  await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',x:badgePoint.x,y:badgePoint.y,button:'left',clickCount:1},page);
  assert.equal(await run('document.getElementById("linguaplay-subtitle-panel").hidden'),false);
  assert.equal(await run('document.getElementById("lp-caption-horizontal").value'),'50','Invalid saved coordinates restore the centered default');
  assert.equal(await run('document.getElementById("lp-caption-vertical").value'),'0');
  await run('document.getElementById("lp-jimaku-query").value="Fixture";document.getElementById("lp-jimaku-form").requestSubmit()');
  await until(()=>run('document.getElementById("lp-jimaku-status").textContent.includes("API key")'),'missing key recovery');
  assert.equal(calls.filter(c=>c.url.includes('jimaku.cc')).length,0);
  await evaluate(options,'document.getElementById("jimaku-key").value="fixture-key";document.getElementById("jimaku-key").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("auto-start-server").checked=false;document.getElementById("server-url").value="http://127.0.0.1:1";document.getElementById("save-settings-btn").click()');
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_jimaku_key"]).then(value=>value.linguaplay_jimaku_key==="fixture-key")'),'Jimaku key saved through Settings');
  await run(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify('1\n00:00:00,000 --> 00:00:10,000\n既存の字幕\n')}],'existing.srt'));const input=document.getElementById('linguaplay-manual-sub-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(()=>run('document.getElementById("linguaplay-yt-tokens").textContent.includes("既存")'),'manual import');
  await run('document.getElementById("lp-jimaku-query").value="Fixture";document.getElementById("lp-jimaku-episode").value="1";document.getElementById("lp-jimaku-form").requestSubmit()');
  await until(()=>run('document.querySelector(".lp-source-result")?.textContent.includes("Fixture series")'),'title search');
  await run('document.querySelector(".lp-source-result").click()');
  await until(()=>run('document.querySelector(".lp-source-result")?.textContent.includes(".ass")'),'episode files');
  assert.equal(await run('document.querySelectorAll(".lp-source-result:disabled").length'),1);
  await run('document.querySelector(".lp-source-result").click()');
  await until(()=>run('!document.getElementById("lp-jimaku-apply").disabled'),'file preview');
  assert.equal(await run('document.getElementById("linguaplay-yt-tokens").textContent.includes("既存")'),true,'preview preserves previous working source');
  assert.match(await run('document.getElementById("lp-jimaku-preview").textContent'),/世界/);
  await click('lp-jimaku-apply');
  await until(()=>run('document.getElementById("linguaplay-caption-english").textContent==="The world was beautiful."'),'caption sentence meaning');
  const search = calls.find(c=>c.url.includes('jimaku.cc/api/entries/search'));
  assert.equal(search.headers.Authorization,'fixture-key');
  assert.equal(new URL(calls.find(c=>c.url.includes('/12/files')).url).searchParams.get('episode'),'1');
  await click('lp-jimaku-close');
  await assertCaptionCenteredOnVideo('Panels closed');
  await run('document.querySelector("video").play()');
  await until(()=>run('!document.querySelector("video").paused'),'playing before word selection');
  await run('document.querySelector(".linguaplay-yt-token").click()');
  await until(()=>run('document.querySelectorAll("#lp-sentence-jp ruby rt").length>0'),'aligned sentence readings');
  assert.equal(await run('document.querySelector("video").paused'),true);
  assert.equal(await run('window.pauseCalls'),1);
  assert.equal(await run('document.activeElement.id'),'lp-study-heading');
  await until(()=>run('document.getElementById("lp-sentence-en").textContent==="The world was beautiful."'),'study sentence translation');
  assert.equal(await run('getComputedStyle(document.getElementById("linguaplay-yt-drawer")).backgroundColor'),'rgb(23, 25, 28)');
  assert.equal(await run('getComputedStyle(document.getElementById("lp-resume-btn")).backgroundColor'),'rgb(196, 181, 253)');
  await assertCaptionCenteredOnVideo('Study panel open');
  await mkdir(captureDir,{recursive:true});
  async function capture(name) {if(process.env.LP_SKIP_SCREENSHOTS)return;const {data}=await rpc('Page.captureScreenshot',{format:'png'},page);await writeFile(path.join(captureDir,name),Buffer.from(data,'base64'));}
  await capture('desktop-study.png');
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},page);
  await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'},page);
  assert.equal(await run('document.getElementById("linguaplay-yt-drawer").classList.contains("hidden")'),true);
  await assertCaptionCenteredOnVideo('Study panel closed');
  assert.equal(await run('window.playCalls'),1,'Close/Escape never resumes');
  assert.equal(await run('document.querySelector("video").paused'),true);
  await run('document.querySelector(".linguaplay-yt-token").click()'); await click('lp-resume-btn');
  await until(()=>run('window.playCalls===2&&!document.querySelector("video").paused'),'explicit resume');
  await run('document.querySelector("video").pause()');
  await run('document.querySelector("video").currentTime=6;document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
  await until(()=>run('document.getElementById("linguaplay-caption-english").textContent==="I study Japanese."'),'second cue');
  await click('linguaplay-sub-status');
  await assertCaptionCenteredOnVideo('Subtitles panel open');
  await run('document.getElementById("lp-jimaku-offset").value=3;document.getElementById("lp-jimaku-offset").dispatchEvent(new Event("change"))');
  assert.equal(await run('document.getElementById("linguaplay-yt-tokens").textContent.includes("世界")'),true,'positive delay selects an earlier source cue');
  await click('lp-jimaku-reset');
  assert.equal(await run('document.getElementById("linguaplay-yt-tokens").textContent.includes("日本語")'),true);
  await run('window.captionWord=document.querySelector(".linguaplay-yt-token");document.getElementById("lp-caption-opacity").value=0;document.getElementById("lp-caption-opacity").dispatchEvent(new Event("input"))');
  assert.equal(await run('window.captionWord===document.querySelector(".linguaplay-yt-token")'),true);
  assert.equal(await run('getComputedStyle(document.getElementById("linguaplay-caption-surface")).backdropFilter'),'none');
  await run('document.getElementById("lp-caption-meaning").click()');
  assert.equal(await run('document.getElementById("linguaplay-caption-english").hidden'),true);
  await run('document.getElementById("lp-caption-meaning").click();document.getElementById("lp-caption-opacity").value=18;document.getElementById("lp-caption-opacity").dispatchEvent(new Event("input"))');
  const fontSizes = () => run('Array.from([document.querySelector(".linguaplay-jp-text"),document.querySelector(".linguaplay-token-reading"),document.getElementById("linguaplay-caption-english")],el=>parseFloat(getComputedStyle(el).fontSize))');
  const normalSizes = await fontSizes();
  await run('document.getElementById("lp-caption-size").value=150;document.getElementById("lp-caption-size").dispatchEvent(new Event("input"));document.getElementById("lp-caption-size").dispatchEvent(new Event("change"))');
  const enlargedSizes = await fontSizes();
  enlargedSizes.forEach((size,index)=>assert.ok(Math.abs(size-normalSizes[index]*1.5)<.02,JSON.stringify({normalSizes,enlargedSizes})));
  assert.equal(await run('window.captionWord===document.querySelector(".linguaplay-yt-token")'),true,'Resizing preserves clickable word nodes');
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_caption_size"]).then(value=>value.linguaplay_caption_size===150)'),'saved subtitle size');
  await run('document.getElementById("lp-caption-size").scrollIntoView({block:"center"});document.getElementById("lp-caption-size").focus()');
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},page);
  await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},page);
  assert.equal(await run('document.getElementById("lp-caption-size-value").textContent'),'155%');
  assert.equal(await run('document.getElementById("lp-caption-size").getAttribute("aria-valuetext")'),'155%');
  await capture('subtitle-size-desktop.png');
  await click('lp-caption-size-reset');
  assert.equal(await run('document.getElementById("lp-caption-size").value'),'100');
  assert.deepEqual(await fontSizes(),normalSizes);
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_caption_size"]).then(value=>value.linguaplay_caption_size===100)'),'default subtitle size saved');
  const captionBounds = () => run('(()=>{const a=document.getElementById("linguaplay-yt-tokens-overlay").getBoundingClientRect();const c=document.getElementById("linguaplay-caption-surface").getBoundingClientRect();return {area:{left:a.left,right:a.right,top:a.top,bottom:a.bottom,width:a.width,height:a.height},caption:{left:c.left,right:c.right,top:c.top,bottom:c.bottom,width:c.width,height:c.height}}})()');
  async function setPosition(horizontal, vertical, save = false) {
    await run(`(()=>{for(const [axis,value] of Object.entries(${JSON.stringify({horizontal,vertical})})){const input=document.getElementById('lp-caption-'+axis);input.value=value;input.dispatchEvent(new Event('input'));}${save ? "document.getElementById('lp-caption-vertical').dispatchEvent(new Event('change'));" : ''}})()`);
  }
  async function checkPosition(horizontal, vertical) {
    const {area,caption} = await captionBounds();
    assert.ok(caption.left>=area.left-.5&&caption.right<=area.right+.5&&caption.top>=area.top-.5&&caption.bottom<=area.bottom+.5,JSON.stringify({area,caption}));
    assert.ok(Math.abs(caption.left-(area.left+(area.width-caption.width)*horizontal/100))<.5,JSON.stringify({area,caption,horizontal}));
    assert.ok(Math.abs(caption.top-(area.top+(area.height-caption.height)*(100-vertical)/100))<.5,JSON.stringify({area,caption,vertical}));
  }
  const defaultPosition = await captionBounds();
  await checkPosition(50,0);
  for(const [horizontal,vertical] of [[0,0],[100,0],[0,100],[100,100],[50,50]]) {
    await setPosition(horizontal,vertical); await checkPosition(horizontal,vertical);
  }
  assert.equal(await run('window.captionWord===document.querySelector(".linguaplay-yt-token")'),true,'Repositioning preserves clickable words');
  await click('lp-caption-position-reset');
  assert.deepEqual(await captionBounds(),defaultPosition,'Default position restores bottom-center placement');
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_caption_position"]).then(value=>value.linguaplay_caption_position?.horizontal===50&&value.linguaplay_caption_position?.vertical===0)'),'default position saved');
  await setPosition(25,60,true);
  await run('document.getElementById("lp-caption-horizontal").scrollIntoView({block:"center"});document.getElementById("lp-caption-horizontal").focus()');
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},page);
  await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},page);
  assert.equal(await run('document.getElementById("lp-caption-horizontal-value").textContent'),'26%');
  await checkPosition(26,60);
  await capture('subtitle-position-desktop.png');
  const fullscreen = await rpc('Runtime.evaluate',{expression:'document.querySelector(".watch-video").requestFullscreen()',awaitPromise:true,userGesture:true,returnByValue:true},page);
  assert.equal(fullscreen.exceptionDetails,undefined);
  await until(()=>run('!!document.fullscreenElement'),'video container fullscreen');
  await checkPosition(26,60);
  await setPosition(50,60);
  await assertCaptionCenteredOnVideo('Subtitles panel open in fullscreen');
  await setPosition(26,60);
  await run('document.exitFullscreen()');
  await until(()=>run('!document.fullscreenElement'),'exit video fullscreen');
  await setPosition(30,70,true);
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_caption_position"]).then(value=>value.linguaplay_caption_position?.horizontal===30&&value.linguaplay_caption_position?.vertical===70)'),'custom position saved');
  await capture('desktop-subtitles.png');
  await click('lp-jimaku-close');
  await run('document.querySelector(".linguaplay-yt-token").click()');
  await rpc('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},page);
  await click('linguaplay-sub-status');
  await run('document.getElementById("lp-caption-size").value=200;document.getElementById("lp-caption-size").dispatchEvent(new Event("input"));document.getElementById("lp-caption-size").dispatchEvent(new Event("change"));document.getElementById("lp-caption-size").scrollIntoView({block:"center"})');
  await until(()=>evaluate(options,'chrome.storage.local.get(["linguaplay_caption_size"]).then(value=>value.linguaplay_caption_size===200)'),'large subtitle size saved');
  await capture('subtitle-size-narrow.png');
  await checkPosition(30,70);
  await run('document.getElementById("lp-caption-vertical").scrollIntoView({block:"center"})');
  await capture('subtitle-position-narrow.png');
  await click('lp-jimaku-close');
  await run('document.querySelector(".linguaplay-yt-token").click()');
  await delay(100);
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  const narrow=await run('(()=>{const d=document.getElementById("linguaplay-yt-drawer").getBoundingClientRect();const s=document.getElementById("lp-resume-btn").getBoundingClientRect();return {left:d.left,right:d.right,bottom:d.bottom,buttonBottom:s.bottom,height:d.height}})()');
  assert.ok(narrow.left>=0&&narrow.right<=390&&narrow.buttonBottom<=844,JSON.stringify(narrow));
  await checkPosition(30,70);
  await setPosition(50,70);
  await assertCaptionCenteredOnVideo('Study panel open on a narrow player');
  await setPosition(30,70);
  await capture('narrow-study.png');
  // A release downloaded for the previous episode cannot alter a new episode.
  await run('history.pushState({},"","/watch/67890")');
  await until(()=>run('document.getElementById("linguaplay-yt-drawer").classList.contains("hidden")'),'episode navigation cleanup');
  assert.equal(await run('document.getElementById("linguaplay-yt-tokens-overlay").classList.contains("active")'),false);
  for(const url of ['https://www.primevideo.com/detail/fixture','https://www.disneyplus.com/video/fixture','https://www.hulu.com/watch/fixture','https://www.crunchyroll.com/watch/fixture','https://vimeo.com/123456']){
    await rpc('Page.navigate',{url},page);
    await until(()=>run('!!document.getElementById("linguaplay-sub-status")'),url+' controls');
    assert.equal(await run('document.querySelectorAll("#linguaplay-yt-controls").length'),1);
    assert.equal(await run('document.getElementById("linguaplay-sub-status").textContent'),'Subtitles');
    await click('linguaplay-sub-status');
    assert.equal(await run('document.getElementById("lp-caption-size").value'),'200','Subtitle size survives a new document on another video site');
    assert.equal(await run('document.getElementById("lp-caption-horizontal").value'),'30','Horizontal position survives a new document on another video site');
    assert.equal(await run('document.getElementById("lp-caption-vertical").value'),'70','Vertical position survives a new document on another video site');
    await click('lp-jimaku-close');
  }
  await rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},page);
  await click('linguaplay-sub-status');
  await run('document.getElementById("lp-watch-mode").value="episode";document.getElementById("lp-watch-mode").dispatchEvent(new Event("change"))');
  await until(()=>evaluate(options,'chrome.storage.local.get(["lp_watch_mode_vimeo.com/123456"]).then(value=>value["lp_watch_mode_vimeo.com/123456"]==="episode")'),'saved episode choice');
  assert.equal(await run('document.getElementById("lp-episode-sources").hidden'),false);
  assert.equal(calls.some(call=>new URL(call.url).hostname==='lrclib.net'),false,'Episode mode never searches for songs');
  await capture('watch-mode-episode.png');
  const jimakuCalls=calls.filter(call=>new URL(call.url).hostname==='jimaku.cc').length;
  await run('document.getElementById("lp-watch-mode").value="song";document.getElementById("lp-watch-mode").dispatchEvent(new Event("change"))');
  await until(()=>run('document.getElementById("linguaplay-yt-tokens").textContent.includes("歌")'),'song lyrics acquisition');
  assert.equal(await run('document.getElementById("lp-episode-sources").hidden'),true);
  assert.equal(await run('document.getElementById("lp-song-sources").hidden'),false);
  assert.match(await run('document.getElementById("lp-jimaku-current").textContent'),/cues/);
  await capture('watch-mode-song.png');
  await click('linguaplay-sub-status');
  assert.equal(await run('document.getElementById("linguaplay-lyrics-modal").classList.contains("hidden")'),false,'The song badge opens the previous lyrics workflow');
  assert.equal(await run('document.getElementById("linguaplay-subtitle-panel").hidden'),true);
  await click('lp-lyrics-modal-close');
  await rpc('Page.navigate',{url:'https://vimeo.com/123456'},page);
  await until(()=>run('document.getElementById("linguaplay-sub-status")?.textContent.includes("Fixture song")'),'song mode restored after reload');
  await click('linguaplay-jimaku-btn');
  assert.equal(await run('document.getElementById("lp-watch-mode").value'),'song');
  assert.equal(calls.filter(call=>new URL(call.url).hostname==='jimaku.cc').length,jimakuCalls,'Song selection and reload make no Jimaku requests');
  await rpc('Page.navigate',{url:'https://www.netflix.com/watch/99999'},page);
  await until(()=>run('!!document.getElementById("linguaplay-sub-status")'),'new episode identity');
  await click('linguaplay-sub-status');
  assert.equal(await run('document.getElementById("lp-watch-mode").value'),'auto','A song override does not leak into another video');
  assert.equal(await run('document.getElementById("lp-episode-sources").hidden'),false);
  assert.equal(calls.some(c=>c.url.includes('/chat/completions')),false,'caption and dictionary requests never invoke generative AI');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:(await rpc('Browser.getVersion')).product,sites:6,jimakuSearch:true,episodeFiles:true,previewPreservesSource:true,assImport:true,sentenceMeaning:true,alignedReadings:true,pauseCloseResume:true,delay:true,opacity:true,subtitleSize:true,sizeKeyboard:true,sizePersistence:true,subtitlePosition:true,positionBounds:true,positionKeyboard:true,positionReset:true,positionPersistence:true,watchModes:true,modePersistence:true,songWorkflow:true,modeIsolation:true,fullscreen:true,narrow:true,navigationCleanup:true,captures:captureDir}));
} finally {
  ws?.close(); for(const p of pending.values())clearTimeout(p.timer);
  browser.kill('SIGTERM');
  if(browser.exitCode===null&&browser.signalCode===null)await new Promise(resolve=>browser.once('exit',resolve));
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}

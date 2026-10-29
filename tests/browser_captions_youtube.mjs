// Run with: node tests/browser_captions_youtube.mjs (requires Chromium).
// Exercise the shipped extension on an intercepted HTTPS YouTube page with
// default browser security, against backends with and without CORS headers.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = process.env.CHROMIUM_PATH || 'chromium';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 15000) {
  const start = Date.now();
  let last;
  do {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await pause(100);
  } while (Date.now() - start < timeout);
  throw new Error(`Timed out waiting for ${label}${last instanceof Error ? ': ' + last.message : ''}`);
}

const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n猫がいる\n\n00:00:02.001 --> 00:00:05.000\n犬がいる\n';
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>YouTube</title></head><body>
<main><div id="movie_player" class="html5-video-player"><video></video>
<div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment"></span></div></div>
<div class="ytp-chrome-bottom"><div class="ytp-right-controls">
<button class="ytp-button ytp-subtitles-button" aria-pressed="true">CC</button>
<button class="ytp-button ytp-settings-button">Settings</button>
<button class="ytp-button ytp-fullscreen-button">Fullscreen</button>
</div></div></div><aside id="secondary"><div id="secondary-inner"><div id="related">Recommended</div></div></aside></main></body></html>`;

async function checkBackend(cors) {
  const videoId = cors ? 'lpcaption01' : 'lpcaption02', requests = [], chromeNetwork = [];
  const server = http.createServer((req, res) => {
    requests.push({method: req.method, url: req.url, origin: req.headers.origin || null});
    const captions = req.method === 'GET' && req.url === `/api/captions?v=${videoId}`;
    res.writeHead(captions ? 200 : 404, {
      'Content-Type': captions ? 'text/vtt; charset=utf-8' : 'application/json',
      ...(cors ? {'Access-Control-Allow-Origin': '*'} : {})
    });
    res.end(captions ? vtt : '{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, endpoint = `http://127.0.0.1:${port}`;
  let profile, browser, ws;
  const pending = new Map();
  try {
    profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-captions-'));
    browser = spawn(chromium, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
      '--disable-dev-shm-usage', '--window-size=1440,900', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'
    ], {stdio: ['ignore', 'ignore', 'pipe']});
    const debuggerUrl = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error('Browser did not start: ' + stderr.slice(-1500))), 15000);
      browser.stderr.on('data', chunk => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.on('error', error => { clearTimeout(timer); reject(error); });
      browser.on('exit', code => { clearTimeout(timer); reject(new Error('Browser exited ' + code)); });
    });
    ws = new WebSocket(debuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, {once: true});
      ws.addEventListener('error', reject, {once: true});
    });
    let nextId = 0;
    const listeners = [], interceptionErrors = [];
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        clearTimeout(entry.timer);
        message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
      } else listeners.forEach(listener => listener(message));
    });
    function rpc(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pending.set(id, {resolve, reject, timer});
        ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
      });
    }
    async function evaluate(sessionId, expression) {
      const result = await rpc('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }

    const worker = await until(async () => (await rpc('Target.getTargets')).targetInfos.find(target =>
      target.type === 'service_worker' && target.url.endsWith('/background.js')), 'extension worker');
    const extensionOrigin = `chrome-extension://${new URL(worker.url).hostname}`;
    const {targetId: optionsTarget} = await rpc('Target.createTarget', {url: `${extensionOrigin}/options.html`});
    const {sessionId: options} = await rpc('Target.attachToTarget', {targetId: optionsTarget, flatten: true});
    await until(() => evaluate(options, 'typeof chrome.storage !== "undefined" && document.readyState === "complete"'), 'Settings');
    await evaluate(options, `chrome.storage.local.set(${JSON.stringify({
      linguaplay_server_url: endpoint, linguaplay_auto_start_server: false
    })})`);

    const {sessionId: workerSession} = await rpc('Target.attachToTarget', {targetId: worker.targetId, flatten: true});
    const {targetId: youtubeTarget} = await rpc('Target.createTarget', {url: 'about:blank'});
    const {sessionId: youtube} = await rpc('Target.attachToTarget', {targetId: youtubeTarget, flatten: true});
    listeners.push(message => {
      if (message.sessionId === youtube && message.method === 'Network.requestWillBeSent') {
        const url = new URL(message.params.request.url);
        if (url.port === String(port)) chromeNetwork.push(message.params.request.url);
      }
      if (![youtube, workerSession].includes(message.sessionId) || message.method !== 'Fetch.requestPaused') return;
      const {requestId, request, resourceType} = message.params;
      const watch = message.sessionId === youtube && request.url === `https://www.youtube.com/watch?v=${videoId}` && resourceType === 'Document';
      rpc('Fetch.fulfillRequest', {
        requestId, responseCode: watch ? 200 : 404,
        responseHeaders: [{name: 'Content-Type', value: watch ? 'text/html; charset=utf-8' : 'application/json'},
          {name: 'Access-Control-Allow-Origin', value: '*'}],
        body: Buffer.from(watch ? fixture : '{}').toString('base64')
      }, message.sessionId).catch(error => interceptionErrors.push(error.message));
    });
    // All Google/YouTube requests and alternative caption/lyrics sources return
    // 404. Loopback HTTP stays real, so a content-side backend fetch cannot pass.
    await rpc('Fetch.enable', {patterns: [{urlPattern: 'https://*/*'}]}, workerSession);
    await rpc('Fetch.enable', {patterns: [{urlPattern: 'https://*/*'}]}, youtube);
    await rpc('Network.enable', {}, youtube);
    await rpc('Page.enable', {}, youtube);
    await rpc('Page.navigate', {url: `https://www.youtube.com/watch?v=${videoId}`}, youtube);
    const badge = await until(async () => {
      const text = await evaluate(youtube, 'document.getElementById("linguaplay-sub-status")?.textContent');
      return text === 'Auto Sub (2)' ? text : '';
    }, 'two backend cues in the player');
    assert.equal(badge, 'Auto Sub (2)');
    await evaluate(youtube, 'document.querySelector("video").currentTime = 1; document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
    await until(() => evaluate(youtube, 'document.getElementById("linguaplay-yt-tokens").textContent.includes("猫")'), 'first backend cue');
    await evaluate(youtube, 'document.querySelector("video").currentTime = 3; document.querySelector("video").dispatchEvent(new Event("timeupdate"))');
    await until(() => evaluate(youtube, 'document.getElementById("linguaplay-yt-tokens").textContent.includes("犬")'), 'second backend cue');
    const captions = requests.filter(request => request.url.startsWith('/api/captions'));
    assert.equal(captions.length, 1, JSON.stringify(requests));
    assert.equal(captions[0].method, 'GET');
    assert.equal(captions[0].url, `/api/captions?v=${videoId}`);
    assert.ok(captions[0].origin === extensionOrigin || captions[0].origin === null, JSON.stringify(captions));
    assert.ok(!requests.some(request => request.origin === 'https://www.youtube.com'), JSON.stringify(requests));
    assert.deepEqual(chromeNetwork, [], 'the page must never request the backend port');
    assert.deepEqual(interceptionErrors, []);
    console.log(JSON.stringify({browser: (await rpc('Browser.getVersion')).product, cors: cors ? 'permissive' : 'none', captionGets: captions.length,
      backendOrigin: captions[0].origin, extensionOrigin, chromeNetwork, badge, renderedCues: 2}));
  } finally {
    ws?.close();
    for (const entry of pending.values()) clearTimeout(entry.timer);
    browser?.kill('SIGTERM');
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (profile) await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}

await checkBackend(true);
await checkBackend(false);

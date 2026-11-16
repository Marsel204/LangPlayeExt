// Run with: node tests/browser_card_media.mjs (requires Chromium and ffmpeg).
// Save a card on an intercepted YouTube page that plays a real video with
// audio, and check that AnkiConnect receives a JPEG screenshot and a WebM
// recording of the selected line before the note that references them.
import assert from 'node:assert/strict';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = process.env.CHROMIUM_PATH || 'chromium';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 20000) {
  const start = Date.now();
  let last;
  do {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await pause(100);
  } while (Date.now() - start < timeout);
  throw new Error(`Timed out waiting for ${label}${last instanceof Error ? ': ' + last.message : ''}`);
}

const videoId = 'lpmedia0001';
const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n猫がいる\n\n00:00:02.501 --> 00:00:05.000\n犬がいる\n';
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>YouTube</title></head><body>
<main><div id="movie_player" class="html5-video-player"><video src="/lp-media-fixture.webm" preload="auto"></video>
<div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment"></span></div></div>
<div class="ytp-chrome-bottom"><div class="ytp-right-controls">
<button class="ytp-button ytp-subtitles-button" aria-pressed="true">CC</button>
<button class="ytp-button ytp-settings-button">Settings</button>
</div></div></div><aside id="secondary"><div id="secondary-inner"><div id="related">Recommended</div></div></aside></main></body></html>`;

const work = await mkdtemp(path.join(tmpdir(), 'linguaplay-media-'));
const clipPath = path.join(work, 'clip.webm');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=6',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libopus', '-shortest', clipPath]);
const clip = await readFile(clipPath);

const anki = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    if (req.method === 'GET' && req.url === `/api/captions?v=${videoId}`) {
      res.writeHead(200, {'Content-Type': 'text/vtt; charset=utf-8'});
      res.end(vtt);
      return;
    }
    const cors = {'Access-Control-Allow-Origin': 'http://localhost'};
    if (req.method === 'OPTIONS') { res.writeHead(200, {...cors, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST'}); res.end(); return; }
    let payload = null;
    try { payload = JSON.parse(body); } catch {}
    // The parser shares this server; only AnkiConnect payloads have an action.
    if (payload?.action) anki.push(payload);
    const result = payload?.action === 'storeMediaFile' ? payload.params.filename : payload?.action === 'addNote' ? 1700000000000 : null;
    res.writeHead(payload ? 200 : 404, {...cors, 'Content-Type': 'application/json'});
    res.end(JSON.stringify({result, error: result === null ? 'unsupported action' : null}));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-media-profile-'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required',
  '--disable-dev-shm-usage', '--window-size=1440,900', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'
], {stdio: ['ignore', 'ignore', 'pipe']});
const pending = new Map();
let ws;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Browser did not start: ' + stderr.slice(-1500))), 15000);
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.on('error', error => { clearTimeout(timer); reject(error); });
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
    linguaplay_server_url: endpoint, linguaplay_auto_start_server: false,
    linguaplay_ankiconnect_url: endpoint, linguaplay_anki_deck: 'LinguaPlay'
  })})`);
  const {sessionId: workerSession} = await rpc('Target.attachToTarget', {targetId: worker.targetId, flatten: true});
  const {targetId: youtubeTarget} = await rpc('Target.createTarget', {url: 'about:blank'});
  const {sessionId: youtube} = await rpc('Target.attachToTarget', {targetId: youtubeTarget, flatten: true});
  listeners.push(message => {
    if (![youtube, workerSession].includes(message.sessionId) || message.method !== 'Fetch.requestPaused') return;
    const {requestId, request, resourceType} = message.params;
    const watch = message.sessionId === youtube && request.url === `https://www.youtube.com/watch?v=${videoId}` && resourceType === 'Document';
    const media = message.sessionId === youtube && request.url === 'https://www.youtube.com/lp-media-fixture.webm';
    if (media) {
      // Media must answer byte ranges, or the element cannot seek.
      const range = /bytes=(\d+)-(\d*)/.exec(Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'range')?.[1] || '');
      const first = range ? Number(range[1]) : 0;
      const last = range && range[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1;
      rpc('Fetch.fulfillRequest', {
        requestId, responseCode: range ? 206 : 200,
        responseHeaders: [{name: 'Content-Type', value: 'video/webm'}, {name: 'Accept-Ranges', value: 'bytes'},
          {name: 'Content-Length', value: String(last - first + 1)},
          ...(range ? [{name: 'Content-Range', value: `bytes ${first}-${last}/${clip.length}`}] : [])],
        body: clip.subarray(first, last + 1).toString('base64')
      }, message.sessionId).catch(() => {});
      return;
    }
    rpc('Fetch.fulfillRequest', {
      requestId, responseCode: watch ? 200 : 404,
      responseHeaders: [{name: 'Content-Type', value: watch ? 'text/html; charset=utf-8' : 'application/json'},
        {name: 'Access-Control-Allow-Origin', value: '*'}],
      body: Buffer.from(watch ? fixture : '{}').toString('base64')
    }, message.sessionId).catch(() => {});
  });
  // Google and YouTube requests are intercepted; loopback HTTP (captions and AnkiConnect) stays real.
  await rpc('Fetch.enable', {patterns: [{urlPattern: 'https://*/*'}]}, workerSession);
  await rpc('Fetch.enable', {patterns: [{urlPattern: 'https://*/*'}]}, youtube);
  await rpc('Page.enable', {}, youtube);
  await rpc('Page.navigate', {url: `https://www.youtube.com/watch?v=${videoId}`}, youtube);
  await until(async () => (await evaluate(youtube, 'document.getElementById("linguaplay-sub-status")?.textContent')) === 'Auto Sub (2)', 'timed captions');
  await until(() => evaluate(youtube, 'document.querySelector("video").readyState >= 2'), 'video data');
  await evaluate(youtube, 'const v = document.querySelector("video"); v.currentTime = 1.5; new Promise(r => v.addEventListener("seeked", r, {once: true})).then(() => v.dispatchEvent(new Event("timeupdate")))');
  await until(() => evaluate(youtube, '!!document.querySelector(".linguaplay-yt-token")'), 'subtitle tokens').catch(async error => {
    console.error(JSON.stringify(await evaluate(youtube, '({tokens: document.getElementById("linguaplay-yt-tokens")?.innerHTML, t: document.querySelector("video").currentTime, ready: document.querySelector("video").readyState, err: document.querySelector("video").error?.message, badge: document.getElementById("linguaplay-sub-status")?.textContent})')));
    throw error;
  });
  await evaluate(youtube, 'document.querySelector(".linguaplay-yt-token").click()');
  await until(() => evaluate(youtube, 'document.getElementById("lp-active-word").textContent.length > 0'), 'Study');
  const before = await evaluate(youtube, '({time: document.querySelector("video").currentTime, paused: document.querySelector("video").paused})');
  assert.equal(before.paused, true, 'Selecting a word pauses playback');

  await evaluate(youtube, 'document.getElementById("lp-quick-anki-btn").click()');
  await until(async () => /Recording/.test(await evaluate(youtube, 'document.getElementById("lp-quick-anki-btn").textContent')), 'recording state', 5000).catch(() => {});
  const label = await until(async () => {
    const text = (await evaluate(youtube, 'document.getElementById("lp-quick-anki-btn").textContent')).trim();
    return /^[✓⚠✗]/.test(text) ? text : '';
  }, 'card result', 30000);
  assert.equal(label, '✓ Added to Anki · stored locally');

  const actions = anki.map(payload => payload.action);
  assert.deepEqual(actions, ['storeMediaFile', 'storeMediaFile', 'addNote'], JSON.stringify(actions));
  const [image, audio] = anki.slice(0, 2).map(payload => ({name: payload.params.filename, bytes: Buffer.from(payload.params.data, 'base64')}));
  assert.match(image.name, /^linguaplay-\d+-[a-z0-9]+\.jpg$/);
  assert.equal(image.bytes.subarray(0, 3).toString('hex'), 'ffd8ff', 'The screenshot is a JPEG');
  assert.match(audio.name, /^linguaplay-\d+-[a-z0-9]+\.webm$/);
  assert.equal(audio.bytes.subarray(0, 4).toString('hex'), '1a45dfa3', 'The audio is a WebM file');
  assert.ok(audio.bytes.length > 1000, `The recording has content (${audio.bytes.length} bytes)`);
  // The clip holds a 440 Hz tone: the recording must cover the line (1.5 s plus padding) and not be silent.
  const recorded = path.join(work, 'recorded.webm');
  await writeFile(recorded, audio.bytes);
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', recorded, '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  const seconds = (() => { const m = /time=(\d+):(\d+):([\d.]+)/g; let last = null, x; while ((x = m.exec(log))) last = x; return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0; })();
  const meanVolume = Number(/mean_volume: (-?[\d.]+) dB/.exec(log)?.[1]);
  assert.ok(seconds >= 1.4 && seconds <= 3.5, `Recorded ${seconds}s for a 1.5 s line`);
  assert.ok(meanVolume > -40, `The recording is not silent (${meanVolume} dB)`);
  const back = anki[2].params.note.fields.Back;
  assert.ok(back.includes(`<img src="${image.name}">`) && back.includes(`[sound:${audio.name}]`), back);
  const after = await evaluate(youtube, '({time: document.querySelector("video").currentTime, paused: document.querySelector("video").paused})');
  assert.equal(after.paused, true, 'Playback stays paused after recording');
  assert.ok(Math.abs(after.time - before.time) < 0.05, `Playback returns to ${before.time}, got ${after.time}`);
  console.log(JSON.stringify({browser: (await rpc('Browser.getVersion')).product, label, ankiActions: actions,
    screenshotBytes: image.bytes.length, audioBytes: audio.bytes.length, audioSeconds: seconds, audioMeanVolumeDb: meanVolume, restoredTime: after.time}));
} finally {
  ws?.close();
  for (const entry of pending.values()) clearTimeout(entry.timer);
  browser.kill('SIGTERM');
  await new Promise(resolve => {
    if (browser.exitCode !== null || browser.signalCode !== null || !browser.pid) resolve();
    else browser.once('exit', resolve);
  });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  await rm(work, {recursive: true, force: true});
}

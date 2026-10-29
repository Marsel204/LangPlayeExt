// Run with: node tests/browser_anki_youtube.mjs (requires Chromium).
// Load the shipped extension on an intercepted YouTube page and use a local
// AnkiConnect with its default CORS policy: webCorsOriginList = ['http://localhost'].
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

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch { /* OPTIONS has no body. */ }
    const origin = req.headers.origin || '(none)';
    requests.push({method: req.method, origin, payload});
    // Unlisted origins get AnkiConnect's default allowed origin, not '*'.
    const cors = {'Access-Control-Allow-Origin': 'http://localhost'};
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {...cors, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST'});
      res.end();
      return;
    }
    const result = payload?.action === 'version' ? 6 : payload?.action === 'addNote' ? 1700000000000 : null;
    res.writeHead(200, {...cors, 'Content-Type': 'application/json'});
    res.end(JSON.stringify({result, error: result === null ? 'unsupported action' : null}));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-anki-'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--disable-dev-shm-usage', '--window-size=1440,900', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'
], {stdio: ['ignore', 'ignore', 'pipe']});

const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>LinguaPlay Anki regression</title></head><body>
<main><div id="movie_player" class="html5-video-player"><video></video>
<div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment"></span></div></div></div>
<aside id="secondary"><div id="secondary-inner"><div id="related">Recommended videos</div></div></aside></main></body></html>`;
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
    browser.on('exit', code => { clearTimeout(timer); reject(new Error('Browser exited ' + code)); });
  });
  ws = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  let nextId = 0;
  const pending = new Map(), listeners = [];
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
  await evaluate(options, `
    document.getElementById('ankiconnect-url').value = ${JSON.stringify(endpoint)};
    document.getElementById('test-anki-btn').click();
  `);
  const settingsTest = await until(async () => {
    const text = await evaluate(options, 'document.getElementById("anki-status-text").textContent');
    return /AnkiConnect is active|error|fetch|Check the URL/i.test(text) ? text : '';
  }, 'Settings AnkiConnect test');
  assert.equal(settingsTest, 'AnkiConnect is active (API version 6).');
  await evaluate(options, `chrome.storage.local.set(${JSON.stringify({
    linguaplay_ankiconnect_url: endpoint, linguaplay_anki_deck: 'LinguaPlay',
    linguaplay_server_url: endpoint + '/parser-unavailable', linguaplay_auto_start_server: false
  })})`);

  const {targetId: youtubeTarget} = await rpc('Target.createTarget', {url: 'about:blank'});
  const {sessionId: youtube} = await rpc('Target.attachToTarget', {targetId: youtubeTarget, flatten: true});
  listeners.push(message => {
    if (message.sessionId !== youtube || message.method !== 'Fetch.requestPaused') return;
    const {requestId, request, resourceType} = message.params;
    const watch = request.url.startsWith('https://www.youtube.com/watch') && resourceType === 'Document';
    const translation = request.url.startsWith('https://translate.googleapis.com/');
    const body = watch ? fixture : translation ? JSON.stringify([[['cat']]]) : '';
    rpc('Fetch.fulfillRequest', {
      requestId, responseCode: watch || translation ? 200 : 404,
      responseHeaders: [{name: 'Content-Type', value: watch ? 'text/html; charset=utf-8' : 'application/json'},
        {name: 'Access-Control-Allow-Origin', value: '*'}],
      body: Buffer.from(body).toString('base64')
    }, youtube).catch(() => {});
  });
  // No real YouTube, dictionary, translation, or AI network dependency. Leave
  // loopback HTTP untouched so a direct content-script Anki request would fail.
  await rpc('Fetch.enable', {patterns: [{urlPattern: 'https://*/*'}]}, youtube);
  await rpc('Page.enable', {}, youtube);
  await rpc('Page.navigate', {url: 'https://www.youtube.com/watch?v=lpankitest1'}, youtube);
  await until(() => evaluate(youtube, 'location.origin === "https://www.youtube.com" && !!document.getElementById("linguaplay-yt-tokens")'), 'YouTube content injection');
  await evaluate(youtube, 'document.querySelector(".ytp-caption-segment").textContent = "猫がいる"');
  await until(() => evaluate(youtube, '!!document.querySelector(".linguaplay-yt-token")'), 'subtitle tokens');
  await evaluate(youtube, 'document.querySelector(".linguaplay-yt-token").click()');
  await until(() => evaluate(youtube, 'document.getElementById("lp-active-word").textContent === "猫"'), 'selected word');

  const before = requests.length;
  await evaluate(youtube, 'document.getElementById("lp-quick-anki-btn").click()');
  const quickAdd = await until(async () => {
    const text = (await evaluate(youtube, 'document.getElementById("lp-quick-anki-btn").textContent')).trim();
    return /^[✓⚠✗]/.test(text) ? text : '';
  }, 'Quick Add result');
  assert.equal(quickAdd, '✓ Added to Anki · stored locally');
  const notes = requests.slice(before).filter(request => request.method === 'POST' && request.payload?.action === 'addNote');
  assert.equal(notes.length, 1, 'Quick Add must reach AnkiConnect exactly once');
  assert.equal(notes[0].origin, extensionOrigin);
  assert.ok(!requests.some(request => request.origin === 'https://www.youtube.com'), JSON.stringify(requests));
  const cards = await evaluate(options, 'chrome.storage.local.get("linguaplay_cards")');
  assert.equal(cards.linguaplay_cards.length, 1);
  assert.equal(cards.linguaplay_cards[0].word, '猫');
  assert.equal(notes[0].payload.params.note.deckName, 'LinguaPlay');
  assert.equal(notes[0].payload.params.note.modelName, 'Basic');
  assert.deepEqual(notes[0].payload.params.note.tags, ['linguaplay', 'youtube']);
  console.log(JSON.stringify({
    browser: (await rpc('Browser.getVersion')).product, settingsTest, quickAdd,
    ankiPosts: notes.length, ankiOrigin: notes[0].origin, youtubeRequests: 0, storedCards: cards.linguaplay_cards.length
  }));
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => {
    if (browser.exitCode !== null || browser.signalCode !== null || !browser.pid) resolve();
    else browser.once('exit', resolve);
  });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
}

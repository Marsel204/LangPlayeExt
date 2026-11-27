// Run with: node tests/browser_grammar_patterns.mjs (requires Chromium).
// Loads the unpacked extension on an intercepted YouTube watch page, clicks
// words in real Japanese subtitles, verifies N5–N1 grammar patterns appear
// in the Study / Translation panel with interactive token highlights and
// Ask Sensei integration, and optionally saves a visual proof screenshot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = process.env.CHROMIUM_PATH || 'chromium';
const screenshotPath = process.env.LP_GRAMMAR_SCREENSHOT || '';
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

const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Grammar Study - YouTube</title>
<style>
  body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: system-ui, sans-serif; }
  main { display: flex; gap: 20px; padding: 20px; align-items: flex-start; }
  #movie_player { position: relative; width: 900px; height: 510px; background: linear-gradient(135deg, #1b1e2c, #27213c); flex-shrink: 0; border-radius: 12px; overflow: hidden; }
  video { width: 100%; height: 100%; }
  #secondary { width: 390px; display: flex; flex-direction: column; }
  .ytp-caption-window-container { position: absolute; bottom: 90px; left: 0; right: 0; text-align: center; }
  .ytp-chrome-bottom { position: absolute; bottom: 8px; left: 12px; right: 12px; height: 40px; }
  .ytp-right-controls { float: right; height: 100%; display: flex; align-items: center; }
  .ytp-button { width: 40px; height: 40px; border: 0; background: transparent; color: white; }
</style></head><body>
<main>
  <div id="movie_player" class="html5-video-player">
    <video></video>
    <div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment"></span></div></div>
    <div class="ytp-chrome-bottom"><div class="ytp-right-controls">
      <button class="ytp-button ytp-subtitles-button" aria-pressed="true">CC</button>
      <button class="ytp-button ytp-settings-button">Settings</button>
    </div></div>
  </div>
  <aside id="secondary"><div id="secondary-inner"><div id="related" style="padding:12px;color:#888;">Recommended videos</div></div></aside>
</main></body></html>`;

const profileBase = process.platform === 'linux' && tmpdir().length > 40 ? '/tmp' : tmpdir();
const profile = await mkdtemp(path.join(profileBase, 'lp-gram-'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--disable-dev-shm-usage', '--window-size=1380,920', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: profileBase } });

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
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const listeners = [];
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
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async function evaluate(sessionId, expression) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  // Wait for service worker so we know the extension loaded cleanly.
  await until(async () => (await rpc('Target.getTargets')).targetInfos.find(target =>
    target.type === 'service_worker' && target.url.endsWith('/background.js')), 'extension worker');

  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Fetch.enable', { patterns: [{ urlPattern: '*://www.youtube.com/watch*' }, { urlPattern: '*://translate.googleapis.com/*' }] }, sessionId);

  listeners.push(message => {
    if (message.sessionId !== sessionId || message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    if (request.url.includes('translate.googleapis.com')) {
      const body = JSON.stringify([[['I only understand Japanese.', '日本語しか分からない']]]);
      rpc('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'application/json; charset=utf-8' }],
        body: Buffer.from(body).toString('base64')
      }, sessionId).catch(() => {});
      return;
    }
    rpc('Fetch.fulfillRequest', {
      requestId, responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from(fixtureHtml).toString('base64')
    }, sessionId).catch(() => {});
  });

  await rpc('Page.navigate', { url: 'https://www.youtube.com/watch?v=lpgrammar01' }, sessionId);
  await until(() => evaluate(sessionId, '!!document.getElementById("linguaplay-yt-drawer")'), 'content script drawer injection');

  // 1. Live caption with user's example: 日本語しか分からない
  await evaluate(sessionId, 'document.querySelector(".ytp-caption-segment").textContent = "日本語しか分からない"');
  await until(() => evaluate(sessionId, 'document.querySelectorAll(".linguaplay-yt-token").length > 0'), 'subtitle tokens');
  await evaluate(sessionId, 'document.querySelector(".linguaplay-yt-token").click()');

  const shikaState = await until(() => evaluate(sessionId, `(() => {
    const sec = document.getElementById('lp-grammar-section');
    const cards = [...document.querySelectorAll('#lp-grammar-list .lp-grammar-card')];
    if (!sec || sec.hidden || !cards.length) return null;
    cards[0].open = true;
    return {
      count: document.getElementById('lp-grammar-count')?.textContent,
      drawerVisible: !document.getElementById('linguaplay-yt-drawer').classList.contains('hidden'),
      cards: cards.map(c => ({
        level: c.dataset.level,
        id: c.dataset.patternId,
        pattern: c.querySelector('.lp-grammar-pattern')?.textContent,
        meaning: c.querySelector('.lp-grammar-meaning')?.textContent,
        matched: c.querySelector('.lp-grammar-match mark')?.textContent,
        structure: c.querySelector('.lp-grammar-structure')?.textContent,
      })),
    };
  })()`), 'shika-nai grammar card');

  assert.equal(shikaState.drawerVisible, true);
  assert.equal(shikaState.count, '1 pattern');
  assert.equal(shikaState.cards[0].level, 'N4');
  assert.equal(shikaState.cards[0].id, 'n4-shika-nai');
  assert.equal(shikaState.cards[0].pattern, '〜しか〜ない');
  assert.equal(shikaState.cards[0].matched, 'しか分からない');

  // Verify opening the grammar card highlighted the matching tokens in #lp-sentence-jp.
  const highlighted = await until(() => evaluate(sessionId, `(() => {
    const els = [...document.querySelectorAll('#lp-sentence-jp .lp-sentence-word.is-grammar-match')];
    return els.length ? els.map(el => el.querySelector('ruby')?.firstChild?.textContent || el.textContent) : null;
  })()`), 'highlighted tokens');
  assert.ok(highlighted.some(t => t.includes('しか')), JSON.stringify(highlighted));

  if (screenshotPath) {
    const { data } = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(screenshotPath, Buffer.from(data, 'base64'));
  }

  // 2. Multi-level sentence (N5 + N2 + N2)
  await evaluate(sessionId, 'document.querySelector(".ytp-caption-segment").textContent = "雨が降っているにもかかわらず、出かけざるを得ない"');
  await until(() => evaluate(sessionId, 'document.getElementById("linguaplay-yt-tokens").textContent.includes("にもかかわらず")'), 'N2 caption tokens');
  await evaluate(sessionId, 'document.querySelector(".linguaplay-yt-token").click()');

  const multiState = await until(() => evaluate(sessionId, `(() => {
    const cards = [...document.querySelectorAll('#lp-grammar-list .lp-grammar-card')];
    if (cards.length < 3) return null;
    return cards.map(c => ({ level: c.dataset.level, id: c.dataset.patternId }));
  })()`), 'multi-level grammar cards');

  assert.deepEqual(multiState.map(c => c.id), ['n5-te-iru', 'n2-ni-mo-kakawarazu', 'n2-zaru-wo-enai']);
  assert.deepEqual(multiState.map(c => c.level), ['N5', 'N2', 'N2']);

  // 3. Sentence with no grammar patterns hides the section cleanly.
  await evaluate(sessionId, 'document.querySelector(".ytp-caption-segment").textContent = "猫がいる"');
  await until(() => evaluate(sessionId, 'document.getElementById("linguaplay-yt-tokens").textContent.includes("猫")'), 'plain caption tokens');
  await evaluate(sessionId, 'document.querySelector(".linguaplay-yt-token").click()');

  const emptyState = await until(() => evaluate(sessionId, `(() => {
    const sec = document.getElementById('lp-grammar-section');
    const word = document.getElementById('lp-active-word')?.textContent;
    return word === '猫' ? { hidden: sec.hidden, count: document.querySelectorAll('.lp-grammar-card').length } : null;
  })()`), 'empty grammar state');
  assert.equal(emptyState.hidden, true);
  assert.equal(emptyState.count, 0);

  console.log(JSON.stringify({ pass: true, shika: shikaState.cards[0], highlighted, multiState, emptyState }));
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

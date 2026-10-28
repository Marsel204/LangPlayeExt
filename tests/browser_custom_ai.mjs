// Run with: node tests/browser_custom_ai.mjs (requires Chromium).
// Uses a disposable browser profile and a local mock API; never calls a model.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import { checkSubtitleVisibility } from './browser_subtitle_visibility_checks.mjs';
import { checkNativeStartup } from './browser_native_startup_checks.mjs';
import { checkJapaneseParsing } from './browser_japanese_parsing_checks.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserBinary = process.env.CHROMIUM_PATH || 'chromium';
const profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-browser-'));
const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, origin: req.headers.origin, authorization: req.headers.authorization, body });
    if (req.url.startsWith('/anki-')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(req.url === '/anki-valid' ? { result: 6, error: null } : { result: null, error: 'Invalid AnkiConnect API key' }));
      return;
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'provider/test-model' }, { id: 'study-combo' }] }));
      return;
    }
    if (req.url === '/v1/chat/completions' && JSON.parse(body).messages.some(message => message.content.includes('word_by_word'))) {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ word_by_word: [{ word: '猫', reading: 'ねこ', romaji: 'neko', meaning: 'cat' }] }) } }] }));
      }, 5200);
      return;
    }
    if (req.headers.origin === 'https://www.youtube.com') {
      res.writeHead(403); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"contextual_meaning":"cat"}' } }] }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = spawn(browserBinary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-dev-shm-usage', '--window-size=1440,900', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Browser did not start: ${stderr.slice(-1500)}`)), 15000);
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited ${code}`)); });
  });
  ws = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  });
  function rpc(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  let worker;
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await rpc('Target.getTargets');
    worker = targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js'));
    if (worker) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(worker, 'The real extension service worker must register successfully');
  const extensionOrigin = `chrome-extension://${new URL(worker.url).hostname}`;
  const { targetId } = await rpc('Target.createTarget', { url: `${extensionOrigin}/options.html` });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  async function evaluate(expression) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  for (let i = 0; i < 50; i++) {
    if (await evaluate('typeof chrome.storage !== "undefined" && document.readyState === "complete"')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await evaluate('chrome.action.getPopup({})'), '', 'The toolbar icon must not open a popup');
  const permission = await evaluate('chrome.permissions.contains({origins:["http://127.0.0.1/*"]})');
  assert.equal(permission, true, 'Local endpoint permissions must cover arbitrary local model ports');
  assert.equal(await evaluate('document.getElementById("ai-provider")'), null);
  await evaluate(`
    document.getElementById('9router-url').value = 'http://127.0.0.1:${port}';
    document.getElementById('9router-key').value = 'router-test-key';
    document.getElementById('9router-url').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('9router-key').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('load-9router-models-btn').click();
  `);
  async function waitForRouterControl(id) {
    for (let i = 0; i < 50; i++) {
      if (await evaluate(`!document.getElementById(${JSON.stringify(id)}).disabled`)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`9Router control did not finish: ${id}`);
  }
  await waitForRouterControl('load-9router-models-btn');
  assert.deepEqual(await evaluate('Array.from(document.getElementById("9router-models").options, option => option.value).filter(Boolean)'), ['provider/test-model', 'study-combo']);
  await evaluate(`
    const modelInput = document.getElementById('9router-model');
    modelInput.value = 'custom-manual-combo';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  assert.equal(await evaluate('document.getElementById("9router-models").value'), '');
  assert.deepEqual(await evaluate('Array.from(document.getElementById("9router-models").options, option => option.value).filter(Boolean)'), ['provider/test-model', 'study-combo']);
  await evaluate(`
    const picker = document.getElementById('9router-models');
    picker.value = 'study-combo';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  assert.equal(await evaluate('document.getElementById("9router-model").value'), 'study-combo');
  await evaluate(`document.getElementById('test-9router-btn').click();`);
  await waitForRouterControl('test-9router-btn');
  assert.match(await evaluate('document.getElementById("9router-status-text").textContent'), /is working with study-combo/);
  const settingsSaved = await evaluate(`new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.storage.onChanged.removeListener(changed); reject(new Error('9Router settings were not saved')); }, 5000);
    function changed(changes) {
      if (changes.linguaplay_9router_model?.newValue !== 'study-combo') return;
      clearTimeout(timer); chrome.storage.onChanged.removeListener(changed); resolve(true);
    }
    chrome.storage.onChanged.addListener(changed);
    document.getElementById('save-settings-btn').click();
  })`);
  assert.equal(settingsSaved, true);
  const routerConfig = await evaluate('chrome.storage.local.get(["linguaplay_9router_url", "linguaplay_9router_model"])');
  assert.equal(routerConfig.linguaplay_9router_url, `http://127.0.0.1:${port}/v1`);
  assert.equal(routerConfig.linguaplay_9router_model, 'study-combo');
  await evaluate(`
    document.getElementById('reading-mode').value = 'romaji';
    document.getElementById('reading-mode').dispatchEvent(new Event('change', { bubbles: true }));
  `);
  assert.equal(await evaluate('document.getElementById("reading-example-romaji").hidden'), false);
  assert.equal(await evaluate('document.getElementById("settings-save-state").textContent'), 'Unsaved changes');
  await evaluate(`
    document.getElementById('reading-mode').value = 'furigana';
    document.getElementById('reading-mode').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('open-setup-guide').click();
  `);
  assert.equal(await evaluate('document.getElementById("setup-guide").open'), true);
  assert.equal(await evaluate('document.getElementById("settings-save-state").textContent'), 'No pending changes');
  await evaluate(`
    document.getElementById('setup-guide').open = false;
    history.replaceState(null, '', location.pathname);
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
  `);
  const routerAnswer = await evaluate('chrome.runtime.sendMessage({action:"CALL_9ROUTER_AI",isJson:true,messages:[{role:"user",content:"Explain 猫"}]})');
  assert.equal(routerAnswer.success, true, JSON.stringify(routerAnswer));
  const routerRequest = requests.at(-1);
  assert.equal(routerRequest.authorization, 'Bearer router-test-key');
  assert.equal(JSON.parse(routerRequest.body).model, 'study-combo');
  assert.equal(JSON.parse(routerRequest.body).response_format.type, 'json_object');
  for (const [route, expected] of [['anki-valid', 'AnkiConnect is active'], ['anki-invalid', 'Invalid AnkiConnect API key']]) {
    await evaluate(`
      document.getElementById('ankiconnect-url').value = 'http://127.0.0.1:${port}/${route}';
      document.getElementById('test-anki-btn').click();
    `);
    let status = '';
    for (let i = 0; i < 50; i++) {
      status = await evaluate('document.getElementById("anki-status-text").textContent');
      if (status.includes(expected)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(status.includes(expected), status);
    if (route === 'anki-invalid') assert.ok(!status.includes('is active'), status);
  }
  await evaluate(`
    document.getElementById('ankiconnect-url').value = 'http://127.0.0.1:8765';
    document.getElementById('anki-status-text').textContent = 'Keep Anki open with AnkiConnect installed. Add-on code: 2055492159.';
    document.getElementById('anki-status-text').style.color = '';
  `);
  if (process.env.OPTIONS_SCREENSHOT_DIR) {
    await mkdir(process.env.OPTIONS_SCREENSHOT_DIR, { recursive: true });
    for (const width of [900, 420]) {
      await rpc('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      const { data } = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(path.join(process.env.OPTIONS_SCREENSHOT_DIR, `9router-options-${width}.png`), Buffer.from(data, 'base64'));
    }
    await rpc('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  }
  const nativeStartup = await checkNativeStartup({ root, profile, extensionOrigin, evaluate });
  const subtitleVisibility = await checkSubtitleVisibility({ root, evaluate, rpc, sessionId, routerUrl: `http://127.0.0.1:${port}` });
  const analysis = requests.find(request => request.url === '/v1/chat/completions' && JSON.parse(request.body).messages.some(message => message.content.includes('word_by_word')));
  assert.ok(analysis, 'A grammar breakdown must reach 9Router');
  assert.equal(JSON.parse(analysis.body).model, 'study-combo');
  const japaneseParsing = process.env.PARSER_SERVER_DIR ? await checkJapaneseParsing({root,evaluate,backend:process.env.PARSER_SERVER_DIR}) : {skipped:'Set PARSER_SERVER_DIR to test a real Sudachi backend'};
  console.log(JSON.stringify({ extensionLoaded: true, localHostPermission: permission, routerModelDiscovery: true, routerSettingsSaved: settingsSaved, routerWorkerRequest: routerAnswer.success, origins: requests.map(request => request.origin || '(none)'), nativeStartup, subtitleVisibility, japaneseParsing }));
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => { if (browser.exitCode !== null || browser.signalCode !== null || !browser.pid) resolve(); else browser.once('exit', resolve); });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

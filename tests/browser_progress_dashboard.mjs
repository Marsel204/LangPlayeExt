// Run with: node tests/browser_progress_dashboard.mjs (requires Chromium).
// Loads the unpacked extension, seeds vocabulary statuses, saved cards, and
// encountered JLPT N5–N1 grammar patterns in chrome.storage.local, opens
// options.html#progress-settings, verifies live counts, editing, filtering,
// JSON import/export, and non-dirty Settings form state, and optionally saves
// light + dark screenshots for visual review.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = process.env.CHROMIUM_PATH || 'chromium';
const lightShotPath = process.env.LP_PROGRESS_SHOT_LIGHT || '';
const darkShotPath = process.env.LP_PROGRESS_SHOT_DARK || '';
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

const profileBase = process.platform === 'linux' && tmpdir().length > 40 ? '/tmp' : tmpdir();
const profile = await mkdtemp(path.join(profileBase, 'lp-prog-'));
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--disable-dev-shm-usage', '--window-size=1360,960', '--remote-debugging-port=0',
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
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
  const evalIn = async (sessionId, expression) => {
    const { result, exceptionDetails } = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };

  const workerTarget = await until(async () => {
    const { targetInfos } = await rpc('Target.getTargets');
    return targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/background.js'));
  }, 'extension service worker');
  const extensionOrigin = `chrome-extension://${new URL(workerTarget.url).hostname}`;

  const { targetId } = await rpc('Target.createTarget', { url: `${extensionOrigin}/options.html#progress-settings` });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Runtime.enable', {}, sessionId);

  await until(() => evalIn(sessionId, 'document.readyState === "complete" && !!document.getElementById("progress-known-count")'), 'options page ready');

  // Seed realistic vocabulary, saved cards, and JLPT N5–N1 grammar history.
  const now = Date.now();
  await evalIn(sessionId, `new Promise(resolve => chrome.storage.local.set({
    linguaplay_word_status: {
      '日本語': 'known',
      '約束': 'known',
      '図書館': 'known',
      '経験': 'learning',
      '不思議': 'learning',
      '懐かしい': 'new',
      '雰囲気': 'new'
    },
    linguaplay_cards: [
      { word: '季節', reading: 'きせつ', meaning: 'season', sentence: '好きな季節は秋です。' },
      { word: '日本語', reading: 'にほんご', meaning: 'Japanese', sentence: '日本語を勉強しています。' }
    ],
    linguaplay_grammar_seen: {
      'n5-te-iru': { count: 7, lastSeen: ${now - 60000}, example: '毎日日本語を勉強している。' },
      'n4-shika-nai': { count: 4, lastSeen: ${now - 30000}, example: '日本語しか話せない。' },
      'n3-tatoe-temo': { count: 2, lastSeen: ${now - 20000}, example: 'たとえ雨が降っても行く。' },
      'n2-wo-hajime': { count: 1, lastSeen: ${now - 10000}, example: '東京をはじめ多くの都市を訪れた。' },
      'n1-ni-itaru': { count: 1, lastSeen: ${now}, example: 'ついに完成に至るまで努力した。' }
    }
  }, resolve))`);

  // Verify live storage update rendered immediately in Progress dashboard
  const initial = await until(() => evalIn(sessionId, `(() => {
    const known = document.getElementById('progress-known-count')?.textContent;
    const learning = document.getElementById('progress-learning-count')?.textContent;
    const nw = document.getElementById('progress-new-count')?.textContent;
    const gram = document.getElementById('progress-grammar-seen-count')?.textContent;
    const rows = document.querySelectorAll('#progress-word-list .progress-word-row').length;
    const gramRows = document.querySelectorAll('#progress-grammar-list .progress-grammar-row').length;
    if (known === '3' && learning === '3' && nw === '2' && rows === 8 && gramRows === 5) {
      return { known, learning, nw, gram, rows, gramRows };
    }
    return null;
  })()`), 'seeded progress counts');

  assert.equal(initial.known, '3');
  assert.equal(initial.learning, '3'); // 2 explicit + 1 from saved card (季節); 日本語 overridden to known
  assert.equal(initial.nw, '2');
  assert.match(initial.gram, /^5 \/ 216$/);

  // Scroll Progress section into view (top with summary stats + vocab) and capture light + dark screenshots
  await evalIn(sessionId, `(() => {
    const el = document.getElementById('progress-settings');
    window.scrollTo({ top: el.offsetTop - 16, behavior: 'instant' });
  })()`);
  await pause(250);

  if (lightShotPath) {
    await rpc('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId);
    await pause(150);
    const { data } = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(lightShotPath, Buffer.from(data, 'base64'));
  }
  if (darkShotPath) {
    await rpc('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
    await pause(150);
    const { data } = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(darkShotPath, Buffer.from(data, 'base64'));
    if (process.env.LP_PROGRESS_SHOT_GRAMMAR) {
      await evalIn(sessionId, `(() => {
        const el = document.getElementById('progress-grammar-section');
        window.scrollTo({ top: el.offsetTop - 16, behavior: 'instant' });
      })()`);
      await pause(150);
      const gramShot = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(process.env.LP_PROGRESS_SHOT_GRAMMAR, Buffer.from(gramShot.data, 'base64'));
    }
  }

  // Focus 懐かしい Known button before clicking, then confirm persistence, focus retention, and non-dirty save bar
  await evalIn(sessionId, `(() => {
    const row = document.querySelector('#progress-word-list .progress-word-row[data-word="懐かしい"]');
    if (!row) throw new Error('Missing 懐かしい row');
    const btn = row.querySelector('button[data-status-value="known"]');
    btn.focus();
    btn.click();
  })()`);

  const afterFlip = await until(() => evalIn(sessionId, `new Promise(resolve => chrome.storage.local.get(['linguaplay_word_status'], res => {
    const statusText = document.getElementById('progress-status-text')?.textContent || '';
    if (res.linguaplay_word_status?.['懐かしい'] === 'known' && statusText.includes('懐かしい')) {
      const active = document.activeElement;
      resolve({
        known: document.getElementById('progress-known-count').textContent,
        nw: document.getElementById('progress-new-count').textContent,
        saveState: document.getElementById('settings-save-state').textContent,
        statusText,
        focusedWord: active?.closest?.('.progress-word-row')?.dataset?.word || '',
        focusedStatus: active?.dataset?.statusValue || ''
      });
    } else resolve(null);
  }))`), 'word status flip persistence');
  assert.equal(afterFlip.known, '4');
  assert.equal(afterFlip.nw, '1');
  assert.equal(afterFlip.saveState, 'No pending changes', 'Progress edits must never dirty Save Settings');
  assert.match(afterFlip.statusText, /Marked 「懐かしい」 as Known/);
  assert.equal(afterFlip.focusedWord, '懐かしい', 'Keyboard focus should remain on the updated word row');
  assert.equal(afterFlip.focusedStatus, 'known', 'Keyboard focus should remain on the activated status button');

  // Verify grammar-only storage update does NOT disrupt focus inside vocabulary list
  const grammarOnlyFocus = await evalIn(sessionId, `new Promise(resolve => {
    const beforeEl = document.activeElement;
    chrome.storage.local.set({
      linguaplay_grammar_seen: {
        'n5-te-iru': { count: 8, lastSeen: ${now + 500}, example: '毎日日本語を勉強している。' },
        'n4-shika-nai': { count: 4, lastSeen: ${now - 30000}, example: '日本語しか話せない。' },
        'n3-tatoe-temo': { count: 2, lastSeen: ${now - 20000}, example: 'たとえ雨が降っても行く。' },
        'n2-wo-hajime': { count: 1, lastSeen: ${now - 10000}, example: '東京をはじめ多くの都市を訪れた。' },
        'n1-ni-itaru': { count: 1, lastSeen: ${now}, example: 'ついに完成に至るまで努力した。' }
      }
    }, () => setTimeout(() => resolve(document.activeElement === beforeEl), 100));
  })`);
  assert.equal(grammarOnlyFocus, true, 'Grammar-only storage events must not rebuild vocabulary list or steal focus');

  // Remove a word via its focused Remove button and verify focus moves to a neighbor row
  await evalIn(sessionId, `(() => {
    const row = document.querySelector('#progress-word-list .progress-word-row[data-word="約束"]');
    const removeBtn = row.querySelector('.progress-remove-btn');
    removeBtn.focus();
    removeBtn.click();
  })()`);
  const afterRemove = await until(() => evalIn(sessionId, `new Promise(resolve => chrome.storage.local.get(['linguaplay_word_status'], res => {
    const statusText = document.getElementById('progress-status-text')?.textContent || '';
    if (!res.linguaplay_word_status?.['約束'] && statusText.includes('約束')) {
      resolve({
        known: document.getElementById('progress-known-count').textContent,
        focusedInList: !!document.activeElement?.closest?.('#progress-word-list')
      });
    } else resolve(null);
  }))`), 'word removal focus handoff');
  assert.equal(afterRemove.known, '3');
  assert.equal(afterRemove.focusedInList, true, 'Removing a word row should move focus to a neighbor in the list');

  // Filter JLPT grammar by N4 pill and verify
  const n4State = await evalIn(sessionId, `(() => {
    const pill = document.querySelector('#progress-grammar-levels .grammar-level-pill[data-level="N4"]');
    pill.click();
    return {
      pressed: pill.getAttribute('aria-pressed'),
      ids: [...document.querySelectorAll('#progress-grammar-list .progress-grammar-row')].map(el => el.dataset.patternId)
    };
  })()`);
  assert.equal(n4State.pressed, 'true');
  assert.deepEqual(n4State.ids, ['n4-shika-nai']);

  // Import a JSON backup via DataTransfer on the file input and verify merge persistence
  await evalIn(sessionId, `(() => {
    const payload = JSON.stringify({
      version: 1,
      app: 'LinguaPlay',
      wordStatus: { '勇気': 'known' },
      grammarSeen: { 'n5-tai': { count: 2, lastSeen: ${now + 1000}, example: '日本へ行きたい。' } }
    });
    const file = new File([payload], 'backup.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('progress-import-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  const afterImport = await until(() => evalIn(sessionId, `new Promise(resolve => chrome.storage.local.get(['linguaplay_word_status', 'linguaplay_grammar_seen'], res => {
    if (res.linguaplay_word_status?.['勇気'] === 'known' && res.linguaplay_grammar_seen?.['n5-tai']?.count === 2) {
      resolve({
        known: document.getElementById('progress-known-count').textContent,
        gram: document.getElementById('progress-grammar-seen-count').textContent,
        saveState: document.getElementById('settings-save-state').textContent
      });
    } else resolve(null);
  }))`), 'JSON import persistence');
  assert.equal(afterImport.known, '4');
  assert.match(afterImport.gram, /^6 \/ 216$/);
  assert.equal(afterImport.saveState, 'No pending changes');

  console.log('Browser progress dashboard verification passed:', {
    initialKnown: initial.known,
    afterFlipKnown: afterFlip.known,
    afterImportKnown: afterImport.known,
    afterImportGrammar: afterImport.gram
  });
} finally {
  ws?.close();
  if (browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill('SIGTERM');
    await Promise.race([exited, pause(3000)]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone} = require('./perf/lib/fakes');
const {create, response, flush} = require('./perf/lib/shipped');

const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n猫がいる\n';
function captionsWorker(config = {}) {
  const local = storage(config), worker = background(local), calls = [], permissions = [];
  const contains = worker.sandbox.chrome.permissions.contains;
  worker.sandbox.chrome.permissions.contains = async request => { permissions.push(clone(request)); return contains(request); };
  worker.sandbox.fetch = async (url, options) => { calls.push({url, options}); return response({}, vtt); };
  return {worker, local, calls, permissions, request: (values = {}, sender) => worker.request({action: 'FETCH_BACKEND_CAPTIONS', videoId: 'A_1-z', ...values}, sender)};
}

test('caption worker uses the default endpoint and ignores caller URLs, hosts and paths', async () => {
  const h = captionsWorker();
  assert.deepEqual(clone(await h.request({url: 'https://injected.invalid', server: 'http://localhost:9999', serverUrl: 'https://injected.invalid', host: 'injected.invalid', path: '/injected', linguaplay_server_url: 'https://injected.invalid'})), {success: true, vtt});
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'http://127.0.0.1:8000/api/captions?v=A_1-z');
  assert.deepEqual(h.permissions, [{origins: ['http://127.0.0.1/*']}]);
  assert.equal(h.calls[0].options.signal.aborted, false);
});

test('caption worker preserves saved path prefixes, removes trailing slashes, query and hash', async () => {
  for (const [saved, expected] of [
    ['http://localhost:9876///?old=yes#fragment', 'http://localhost:9876/api/captions?v=A_1-z'],
    ['http://localhost:9876/prefix///?v=old&key=secret#fragment', 'http://localhost:9876/prefix/api/captions?v=A_1-z'],
    ['http://localhost:9876/prefix', 'http://localhost:9876/prefix/api/captions?v=A_1-z'],
  ]) {
    const h = captionsWorker({linguaplay_server_url: saved});
    assert.deepEqual(clone(await h.request()), {success: true, vtt});
    assert.equal(h.calls[0].url, expected);
    assert.deepEqual(h.permissions, [{origins: ['http://localhost/*']}]);
  }
});

test('caption worker accepts the same watch and Settings senders as the parser', async () => {
  for (const url of ['https://www.youtube.com/watch?v=A', 'https://youtube.com/watch?v=A', 'chrome-extension://fixture-extension/options.html']) {
    const h = captionsWorker();
    assert.equal((await h.request({}, {id: 'fixture-extension', url})).success, true);
  }
});

test('caption worker rejects untrusted senders before storage or fetch', async () => {
  const h = captionsWorker();
  for (const sender of [
    {id: 'other', url: 'https://www.youtube.com/watch?v=A'},
    {id: 'fixture-extension', url: 'https://youtube.com.example.com/watch'},
    {id: 'fixture-extension', url: 'http://www.youtube.com/watch'},
    {id: 'fixture-extension', url: 'https://www.youtube.com/elsewhere'},
    {id: 'fixture-extension', url: 'chrome-extension://other/options.html'},
    {id: 'fixture-extension', url: 'chrome-extension://fixture-extension/elsewhere.html'},
    {id: 'fixture-extension'},
  ]) {
    const result = await h.request({}, sender);
    assert.equal(result.success, false);
    assert.match(result.error, /Untrusted/);
  }
  assert.equal(h.local.reads.length, 0);
  assert.equal(h.calls.length, 0);
});

test('caption worker validates video ids before storage or fetch', async () => {
  const h = captionsWorker();
  for (const videoId of [undefined, null, 1, {}, [], '', ' ', '../A', 'A?x=1', '猫', 'a'.repeat(65)]) {
    const result = await h.request({videoId});
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid video id/i);
  }
  assert.equal(h.local.reads.length, 0);
  assert.equal(h.calls.length, 0);
  for (const videoId of ['a', 'a'.repeat(64), '_-09AZaz']) assert.equal((await h.request({videoId})).success, true);
});

test('caption worker rejects invalid URLs and embedded credentials', async () => {
  for (const url of ['not a url', 'file:///captions', 'ftp://localhost', 'http://user:secret@localhost:8000', 'https://user@captions.example']) {
    const h = captionsWorker({linguaplay_server_url: url});
    const result = await h.request();
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid server URL/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.permissions.length, 0);
  }
});

test('caption worker requires permission for the saved server origin', async () => {
  const h = captionsWorker({linguaplay_server_url: 'https://captions.example:9876/prefix'});
  const result = await h.request();
  assert.equal(result.success, false);
  assert.match(result.error, /Server endpoint permission is missing/);
  assert.deepEqual(h.permissions, [{origins: ['https://captions.example/*']}]);
  assert.equal(h.calls.length, 0);
});

test('caption worker supports HTTPS after its optional permission is granted', async () => {
  const h = captionsWorker({linguaplay_server_url: 'https://captions.example:9876/prefix/?old=1#hash'});
  h.worker.sandbox.chrome.permissions.contains = async request => {
    assert.deepEqual(clone(request), {origins: ['https://captions.example/*']});
    return true;
  };
  assert.deepEqual(clone(await h.request()), {success: true, vtt});
  assert.equal(h.calls[0].url, 'https://captions.example:9876/prefix/api/captions?v=A_1-z');
});

test('caption worker reports HTTP and network failures', async () => {
  const h = captionsWorker();
  h.worker.sandbox.fetch = async () => ({ok: false, status: 404, text: async () => assert.fail('HTTP error body must not be consumed')});
  let result = await h.request();
  assert.equal(result.success, false);
  assert.match(result.error, /HTTP 404/);
  h.worker.sandbox.fetch = async () => { throw new Error('offline fixture'); };
  result = await h.request();
  assert.deepEqual(clone(result), {success: false, error: 'offline fixture'});
});

test('caption worker retains the 1500 ms abort deadline and acknowledges timeout', async () => {
  const h = captionsWorker(), deadlines = [];
  h.worker.sandbox.AbortSignal = {timeout(ms) { deadlines.push(ms); return AbortSignal.timeout(10); }};
  h.worker.sandbox.fetch = (_url, {signal}) => new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('Fetch was not aborted')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(guard); reject(signal.reason); }, {once: true});
  });
  const result = await h.request();
  assert.deepEqual(deadlines, [1500]);
  assert.equal(result.success, false);
  assert.match(result.error, /timeout/i);
});

test('caption worker rejects blank and oversized UTF-8 bodies', async () => {
  const h = captionsWorker();
  for (const body of ['', ' \n\t', 'x'.repeat(4 * 1024 * 1024 + 1), '猫'.repeat(1400000)]) {
    h.worker.sandbox.fetch = async () => response({}, body);
    const result = await h.request();
    assert.equal(result.success, false);
    assert.match(result.error, /empty|blank|limit|large/i);
  }
});

test('content requests backend captions only through the worker and parses its Japanese VTT', async () => {
  const h = await create({linguaplay_server_url: 'http://localhost:9876/prefix'}, {fetch: async c => {
    assert.equal(c.context, 'worker');
    assert.equal(c.category, 'captions');
    return response({}, vtt);
  }});
  assert.deepEqual(clone(await h.fetchYouTubeCaptions('A')), [{start: 0, end: 2, text: '猫がいる'}]);
  assert.deepEqual(h.messages.filter(m => m.action === 'FETCH_BACKEND_CAPTIONS'), [{action: 'FETCH_BACKEND_CAPTIONS', videoId: 'A'}]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'http://localhost:9876/prefix/api/captions?v=A');
});

test('content rejects backend VTT without Japanese and preserves the caption fallback order', async () => {
  for (const backend of ['english', 'empty', 'failure']) {
    const events = [];
    const h = await create({}, {fetch: async c => {
      events.push(c.category === 'other' ? c.url.split('?')[0] : c.category);
      if (c.category === 'captions') return response({}, backend === 'english' ? vtt.replace('猫がいる', 'A cat is here') : '', backend !== 'failure');
      if (c.category === 'watchHtml') return response({}, 'var p={"captionTracks":[{"baseUrl":"https://fixture.invalid/final","languageCode":"ja"}]}');
      if (c.url.startsWith('https://fixture.invalid/final')) return response({}, vtt);
      return response({}, '', false);
    }});
    h.document.scripts = [{textContent: 'var p={"captionTracks":[{"baseUrl":"https://fixture.invalid/onpage","languageCode":"ja"}]}'}];
    h.window.addEventListener('LINGUAPLAY_REQUEST_TRACK_SWITCH', event => { if (!('vssId' in event.detail)) events.push('probe'); });
    assert.deepEqual(clone(await h.fetchYouTubeCaptions('A')), [{start: 0, end: 2, text: '猫がいる'}]);
    assert.deepEqual(events, ['captions', 'probe', 'innertube', 'https://fixture.invalid/onpage', 'watchHtml', 'https://fixture.invalid/final']);
  }
});

test('caption message guard falls through after three seconds if the worker never responds', async () => {
  const h = await create({}, {message: m => m.action === 'FETCH_BACKEND_CAPTIONS' ? new Promise(() => {}) : undefined, fetch: async () => response({}, '', false)});
  const pending = h.fetchYouTubeCaptions('A');
  await flush();
  const guard = h.timeouts.find(t => t.active && t.ms === 3000);
  assert.ok(guard, 'caption message has a short acknowledgement guard');
  guard.fn();
  assert.deepEqual(clone(await pending), []);
  assert.deepEqual(h.calls.map(c => c.category), ['innertube', 'watchHtml']);
});

test('Anki acknowledgement timeout describes Anki while storage callers retain their wording', async () => {
  const h = await create({}, {message: m => ['ADD_ANKI_NOTE', 'SAVE_CARD'].includes(m.action) ? new Promise(() => {}) : undefined});
  h.select();
  await h.click('lp-quick-anki-btn');
  const guards = h.timeouts.filter(t => t.active && t.ms === 8000);
  assert.equal(guards.length, 2);
  guards.forEach(t => t.fn());
  await flush();
  const label = h.elements.get('lp-quick-anki-btn').textContent;
  assert.match(label, /Could not confirm the extension storage result; please retry/);
  assert.match(label, /Anki: Could not confirm the Anki result; please retry/);
});

test('harness rejects content fetches across local network ranges and keeps Anki checks', async () => {
  const h = await create({}, {fetch: async () => response()});
  for (const host of ['localhost', 'api.localhost', 'LOCALHOST', 'localhost.', 'api.localhost.', '127.0.0.1', '127.255.255.254', '[::1]', '0.0.0.0',
    '10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.0.1', '192.168.255.254', '169.254.0.1', '169.254.255.254']) {
    await assert.rejects(h.sandbox.fetch(`http://${host}:8000/api/captions`), {name: 'HarnessError', message: /CONTENT_LOCAL_NETWORK_FETCH:.*must use the extension worker/});
  }
  await assert.rejects(h.sandbox.fetch('http://127.0.0.1:8765'), /CONTENT_ANKI_FETCH/);
  await assert.rejects(h.sandbox.fetch('https://fixture.invalid', {body: JSON.stringify({action: 'addNote'})}), /CONTENT_ANKI_FETCH/);
  for (const host of ['www.youtube.com', 'translate.googleapis.com', 'fixture.invalid', '172.15.255.254', '172.32.0.1', '192.169.0.1', '169.255.0.1']) {
    assert.equal((await h.sandbox.fetch(`https://${host}/`)).ok, true);
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone} = require('./perf/lib/fakes');

const fields = {Front: '猫 <span>neko</span>', Back: '<div>cat</div>'};
function ankiWorker(config = {}) {
  const local = storage(config);
  const worker = background(local);
  const calls = [], permissions = [];
  const contains = worker.sandbox.chrome.permissions.contains;
  worker.sandbox.chrome.permissions.contains = async request => { permissions.push(clone(request)); return contains(request); };
  worker.sandbox.fetch = async (url, options) => { calls.push({url, options}); return {ok: true, json: async () => ({result: 123, error: null})}; };
  return {worker, local, calls, permissions, request: (values = {}, sender) => worker.request({action: 'ADD_ANKI_NOTE', fields, ...values}, sender)};
}

test('Anki worker uses saved endpoint and deck and ignores caller configuration', async () => {
  const h = ankiWorker({linguaplay_ankiconnect_url: 'http://localhost:9876/anki', linguaplay_anki_deck: 'Saved deck'});
  assert.deepEqual(clone(await h.request({url: 'https://untrusted.invalid', deckName: 'Injected', modelName: 'Injected', tags: ['injected']})), {success: true});
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'http://localhost:9876/anki');
  assert.deepEqual(h.permissions, [{origins: ['http://localhost/*']}]);
  assert.deepEqual(JSON.parse(h.calls[0].options.body), {action: 'addNote', version: 6, params: {note: {
    deckName: 'Saved deck', modelName: 'Basic', fields, tags: ['linguaplay', 'youtube']
  }}});
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(h.calls[0].options.signal.aborted, false);
});

test('Anki worker retains default endpoint, deck, and supported senders', async () => {
  for (const url of ['https://www.youtube.com/watch?v=A', 'https://youtube.com/watch?v=A', 'chrome-extension://fixture-extension/options.html']) {
    const h = ankiWorker();
    assert.deepEqual(clone(await h.request({}, {id: 'fixture-extension', url})), {success: true});
    assert.equal(h.calls[0].url, 'http://127.0.0.1:8765/');
    assert.equal(JSON.parse(h.calls[0].options.body).params.note.deckName, 'LinguaPlay');
  }
});

test('Anki worker rejects untrusted senders before reading settings or fetching', async () => {
  const h = ankiWorker();
  for (const sender of [
    {id: 'other', url: 'https://www.youtube.com/watch?v=A'},
    {id: 'fixture-extension', url: 'https://youtube.com.example.com/watch'},
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

test('Anki worker rejects invalid URLs and embedded credentials', async () => {
  for (const url of ['not a url', 'file:///anki', 'ftp://localhost/anki', 'http://user:secret@localhost:8765', 'https://user@anki.example']) {
    const h = ankiWorker({linguaplay_ankiconnect_url: url});
    const result = await h.request();
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid AnkiConnect URL/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.permissions.length, 0);
  }
});

test('Anki worker requires saved endpoint permission and explains how to grant it', async () => {
  const h = ankiWorker({linguaplay_ankiconnect_url: 'https://anki.example:8765/api'});
  const result = await h.request();
  assert.equal(result.success, false);
  assert.match(result.error, /saving it in Extension Settings/);
  assert.deepEqual(h.permissions, [{origins: ['https://anki.example/*']}]);
  assert.equal(h.calls.length, 0);
});

test('Anki worker supports an HTTPS endpoint after optional permission is granted', async () => {
  const h = ankiWorker({linguaplay_ankiconnect_url: 'https://anki.example:8765/api'});
  h.worker.sandbox.chrome.permissions.contains = async request => {
    assert.deepEqual(clone(request), {origins: ['https://anki.example/*']});
    return true;
  };
  assert.deepEqual(clone(await h.request()), {success: true});
  assert.equal(h.calls[0].url, 'https://anki.example:8765/api');
});

test('Anki worker accepts only bounded Front and Back strings', async () => {
  const h = ankiWorker();
  for (const invalid of [undefined, null, [], {}, {Front: 'x'}, {Front: 3, Back: 'y'}, {Front: 'x', Back: {}},
    {Front: '', Back: 'y'}, {Front: 'x', Back: ' '}, {Front: 'x'.repeat(64001), Back: 'y'},
    {Front: 'x', Back: 'y'.repeat(64001)}, {...fields, deckName: 'Injected'}]) {
    const result = await h.request({fields: invalid});
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid Anki note fields/);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.local.reads.length, 0);
  assert.deepEqual(clone(await h.request({fields: {Front: 'x'.repeat(64000), Back: 'y'.repeat(64000)}})), {success: true});
});

for (const [name, data, expected, status = 200] of [
  ['confirmed note', {result: 123, error: null}, {success: true}],
  ['duplicate', {result: null, error: 'cannot create note because it is a duplicate'}, {success: true, duplicate: true}],
  ['missing deck', {result: null, error: 'deck was not found'}, {success: false, error: 'deck was not found; create the configured deck in Anki, then retry'}],
  ['API error', {result: null, error: 'offline'}, {success: false, error: 'offline'}],
  ['unconfirmed note', {result: null, error: null}, {success: false, error: 'AnkiConnect did not confirm a note'}],
  ['absent note result', {}, {success: false, error: 'AnkiConnect did not confirm a note'}],
  ['HTTP error', {error: 'unavailable'}, {success: false, error: 'HTTP 503'}, 503],
]) {
  test('Anki worker preserves save result semantics: ' + name, async () => {
    const h = ankiWorker();
    h.worker.sandbox.fetch = async () => ({ok: status === 200, status, json: async () => data});
    assert.deepEqual(clone(await h.request()), expected);
  });
}

test('Anki worker aborts fetch at its five-second deadline and acknowledges failure', async () => {
  const h = ankiWorker();
  const deadlines = [];
  h.worker.sandbox.AbortSignal = {timeout(ms) { deadlines.push(ms); return AbortSignal.timeout(10); }};
  h.worker.sandbox.fetch = (_url, {signal}) => new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('Fetch was not aborted')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(guard); reject(signal.reason); }, {once: true});
  });
  const result = await h.request();
  assert.deepEqual(deadlines, [5000]);
  assert.equal(result.success, false);
  assert.match(result.error, /timeout/i);
});

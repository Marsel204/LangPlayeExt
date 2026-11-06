'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {parseSubtitleFile} = require('./content_subtitle_helpers');
const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
function worker(fetcher, key = 'fixture-jimaku-key') {
  let listener;
  const calls = [];
  const sandbox = {URL, URLSearchParams, AbortSignal, TextEncoder, TextDecoder, console,
    chrome: {runtime: {id: 'fixture', onInstalled: {addListener() {}}, onMessage: {addListener(fn) {listener = fn;}}},
      action: {onClicked: {addListener() {}}}, storage: {local: {get: async () => ({linguaplay_jimaku_key: key})}}},
    fetch: async (url, options) => { calls.push({url, options}); return fetcher(url, options); }};
  vm.runInNewContext(source, sandbox);
  return {calls, request: (request, sender = {id: 'fixture', url: 'https://www.netflix.com/watch/12345'}) => new Promise(resolve => {
    const kept = listener(request, sender, resolve); if (kept !== true) resolve({success: false});
  })};
}
const json = data => Response.json(data);
const file = {name: 'Show.01.ja.ass', url: 'https://jimaku.cc/entry/12/Show.01.ja.ass', size: 200};

test('Jimaku uses the saved raw Authorization key, title/type search and optional episode filter', async () => {
  const h = worker(async url => url.includes('/search') ? json([{id: 12, name: 'Show', japanese_name: '作品'}]) : json([file]));
  const found = await h.request({action: 'JIMAKU_SEARCH', query: '作品', anime: false});
  assert.equal(found.entries[0].id, 12);
  assert.equal(h.calls[0].options.headers.Authorization, 'fixture-jimaku-key');
  assert.equal(new URL(h.calls[0].url).searchParams.get('anime'), 'false');
  const files = await h.request({action: 'JIMAKU_FILES', entryId: 12, episode: 3});
  assert.equal(new URL(h.calls[1].url).searchParams.get('episode'), '3');
  assert.equal(files.files[0].supported, true);
});

test('missing keys and untrusted sites cannot make a Jimaku request', async () => {
  const h = worker(() => {throw Error('No network expected');}, '');
  assert.match((await h.request({action: 'JIMAKU_SEARCH', query: 'Show'})).error, /API key/);
  const hostile = await h.request({action: 'JIMAKU_SEARCH', query: 'Show'}, {id: 'fixture', url: 'https://netflix.com.evil.test/watch/123'});
  assert.equal(hostile.success, false);
  assert.equal(h.calls.length, 0);
});

for (const [code, message] of [[401, /API key/], [429, /rate limit/], [503, /HTTP 503/]]) {
  test('Jimaku HTTP ' + code + ' gives an actionable error', async () => {
    const h = worker(() => new Response('', {status: code}));
    assert.match((await h.request({action: 'JIMAKU_SEARCH', query: 'Show'})).error, message);
  });
}

test('unsupported archives and external or credential-bearing file URLs cannot be downloaded', async () => {
  const h = worker(() => json([file, {...file, name: 'Show.zip'}, {...file, name: 'external.srt', url: 'https://example.com/entry/file.srt'}, {...file, name: 'credentials.srt', url: 'https://user:pass@jimaku.cc/entry/file.srt'}]));
  const result = await h.request({action: 'JIMAKU_FILES', entryId: 12});
  assert.deepEqual(Array.from(result.files, f => f.supported), [true, false, false, false]);
  assert.equal((await h.request({action: 'JIMAKU_DOWNLOAD', entryId: 12, name: 'external.srt'})).success, false);
  assert.ok(h.calls.every(c => new URL(c.url).origin === 'https://jimaku.cc'));
});

test('downloads re-resolve files after a worker restart, omit the API key and decode Shift_JIS', async () => {
  const subtitle = {...file, name: 'Show.01.ja.srt'};
  const bytes = Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n'), Buffer.from([0x94, 0x4c])]);
  const h = worker(url => url.includes('/api/') ? json([subtitle]) : new Response(bytes));
  const downloaded = await h.request({action: 'JIMAKU_DOWNLOAD', entryId: 12, name: subtitle.name, url: 'https://evil.test/stolen'});
  assert.equal(downloaded.success, true);
  assert.equal(parseSubtitleFile(downloaded.text, downloaded.name)[0].text, '猫');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].url, subtitle.url);
  assert.equal(h.calls[1].options.headers, undefined);
  assert.equal(h.calls[1].options.redirect, 'error');
});

test('subtitle download bounds apply even without a Content-Length header', async () => {
  let cancelled = false;
  const stream = new ReadableStream({pull(controller) {controller.enqueue(new Uint8Array(1024 * 1024));}, cancel() {cancelled = true;}});
  const h = worker(url => url.includes('/api/') ? json([file]) : new Response(stream));
  const result = await h.request({action: 'JIMAKU_DOWNLOAD', entryId: 12, name: file.name});
  assert.equal(result.success, false);
  assert.match(result.error, /10 MB/);
  assert.equal(cancelled, true);
});

test('ASS and SSA dialogue preserves Japanese, line breaks and commas while removing styling and drawings', () => {
  const ass = '[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
    'Dialogue: 0,0:00:02.00,0:00:04.50,Default,,0,0,0,,{\\k20}世界\\Nこんにちは,友達\n' +
    'Comment: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,無視\n' +
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}猫{\\i0}\\hがいる\n' +
    'Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 1 1\n';
  const cues = parseSubtitleFile(ass, 'show.ass');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '猫 がいる');
  assert.equal(cues[1].text, '世界\nこんにちは,友達');
  assert.equal(cues[1].end, 4.5);
  const ssa = '[Events]\nFormat: Marked, End, Start, Text\nDialogue: Marked=0,0:00:03.00,0:00:01.00,猫';
  assert.equal(parseSubtitleFile(ssa, 'show.ssa')[0].start, 1);
});

test('shared translation work deduplicates requests and enforces four concurrent Google calls', async () => {
  const pending = [];
  const h = worker(() => new Promise(resolve => pending.push(resolve)));
  const a = h.request({action: 'TRANSLATE_JAPANESE', text: '猫'});
  const same = h.request({action: 'TRANSLATE_JAPANESE', text: '猫'});
  const other = Array.from({length: 6}, (_, i) => h.request({action: 'TRANSLATE_JAPANESE', text: '犬' + i}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 4);
  for (let i = 0; i < 7; i++) {
    await new Promise(resolve => setImmediate(resolve));
    pending[i](json([[['English']]]));
  }
  const results = await Promise.all([a, same, ...other]);
  assert.ok(results.every(r => r.success && r.translation === 'English'));
  assert.equal(h.calls.length, 7);
});

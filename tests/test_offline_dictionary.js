'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {create, flush, response} = require('./perf/lib/shipped');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/jmdict-common.json'), 'utf8'));
const googleLines = call => (new URL(call.url).searchParams.get('q') || '').split('\n');

// Serve the bundled dictionary to the worker; Google echoes each line as "google <line>".
async function harness({dictionary = () => response(DATA), config = {}} = {}) {
  const h = await create(config, {fetch: async call => {
    if (call.url === 'chrome-extension://fixture/data/jmdict-common.json') return dictionary();
    if (call.category === 'translate') return response([googleLines(call).map(line => ['google ' + line, line])]);
    return response({}, '', false);
  }});
  h.worker.sandbox.chrome.runtime.getURL = name => 'chrome-extension://fixture/' + name;
  return h;
}
const translateCalls = h => h.calls.filter(call => call.category === 'translate');

test('the bundled dictionary is valid JMdict data with attribution', () => {
  assert.match(DATA.source, /JMdict.*CC BY-SA 4\.0/);
  assert.ok(DATA.entries.length > 20000);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'data/JMDICT-LICENSE.md')));
});

test('word definitions come from the offline dictionary without Google', async () => {
  const h = await harness();
  for (const [word, expected] of [['自画像', /^self-portrait/], ['描く', /^to draw/], ['いる', /^to be \(of animate/], ['くる', /^to come/], ['よい', /^good/], ['勉強する', /^study/]]) {
    const result = await h.worker.request({action: 'TRANSLATE_JAPANESE', text: word, dictionary: true});
    assert.equal(result.success, true, word);
    assert.match(result.translation, expected, word);
  }
  assert.equal(translateCalls(h).length, 0);
});

test('Study glosses use the dictionary and send only unknown words to Google', async () => {
  const h = await harness();
  const result = await h.worker.request({action: 'TRANSLATE_WORDS', words: ['自画像', '描く', 'ぴよぴよぴ']});
  assert.match(result.meanings['自画像'], /^self-portrait/);
  assert.match(result.meanings['描く'], /^to draw/);
  assert.equal(result.meanings['ぴよぴよぴ'], 'google ぴよぴよぴ');
  assert.deepEqual(translateCalls(h).map(googleLines), [['ぴよぴよぴ']]);
});

test('a missing or broken dictionary falls back to Google', async () => {
  for (const dictionary of [() => response({}, '', false), () => response({entries: 'broken'}), () => new Promise(() => {})]) {
    const h = await harness({dictionary});
    h.worker.sandbox.setTimeout = (fn, ms) => setTimeout(fn, ms === 5000 ? 0 : ms);
    const result = await h.worker.request({action: 'TRANSLATE_WORDS', words: ['自画像']});
    assert.equal(result.meanings['自画像'], 'google 自画像');
  }
});

test('opening Study shows dictionary glosses without any translation request', async () => {
  const h = await harness();
  h.select('自画像', '自画像を描く');
  for (let i = 0; i < 20; i++) await flush();
  await h.worker.drain();
  const glosses = h.all.filter(element => element.className === 'lp-word-gloss').map(element => element.textContent);
  assert.ok(glosses.includes('self-portrait'), glosses.join(', '));
  assert.match(h.elements.get('lp-active-def').textContent, /^self-portrait/);
  assert.equal(translateCalls(h).filter(call => call.url.includes('dt=bd')).length, 0, 'No Google dictionary lookups');
});

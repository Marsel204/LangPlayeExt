'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush, response} = require('./perf/lib/shipped');

test('sentence meaning works after navigating from YouTube home or search to a video', async () => {
  for (const originalPath of ['/', '/results?search_query=Eve']) {
    const h = await create();
    const result = await h.worker.request({action: 'TRANSLATE_JAPANESE', text: '世界は綺麗'}, {
      id: 'fixture-extension',
      url: 'https://www.youtube.com' + originalPath,
      frameId: 0,
      tab: {url: 'https://www.youtube.com/watch?v=video'}
    });
    assert.equal(result.success, true);
    assert.equal(result.translation, 'translation');
  }
});

test('a current watch tab cannot authorize an untrusted document or subframe', async () => {
  const h = await create();
  const original = {id: 'fixture-extension', url: 'https://www.youtube.com/', frameId: 0, tab: {url: 'https://www.youtube.com/watch?v=video'}};
  for (const changes of [
    {id: 'another-extension'},
    {url: 'https://untrusted.example/'},
    {url: 'http://www.youtube.com/'},
    {frameId: 1},
    {frameId: undefined},
    {tab: {url: 'https://www.youtube.com/results?search_query=Eve'}},
    {tab: {url: 'https://www.youtube.com.attacker.example/watch?v=video'}},
    {tab: {url: 'http://www.youtube.com/watch?v=video'}},
    {tab: {url: 'https://m.youtube.com/watch?v=video'}},
    {tab: {url: 'invalid URL'}},
    {url: 'https://www.youtube.com/watch?v=old', tab: {url: 'https://www.youtube.com/'}}
  ]) {
    const result = await h.worker.request({action: 'TRANSLATE_JAPANESE', text: '世界は綺麗'}, {...original, ...changes});
    assert.equal(result.success, false);
    assert.match(result.error, /Untrusted subtitle request/);
  }
  assert.equal(h.calls.length, 0);
});

test('a Google rate limit falls back to the saved AI model and displays the sentence meaning', async () => {
  const sentence = '誰かが作り上げた私の自画像なんかで微笑みはしない';
  const meaning = 'I will not smile at a self-portrait of me that someone else created.';
  const h = await create({linguaplay_9router_model: 'study-combo', linguaplay_9router_key: 'test-router-key'}, {
    fetch: async call => call.category === 'translate'
      ? {...response({}, '', false), status: 429}
      : response({choices: [{message: {content: meaning}}]})
  });
  h.renderSentenceTokens(sentence);
  await flush();
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, meaning);
  assert.ok(h.elements.get('linguaplay-yt-tokens').children.length > 0);
  const ai = h.calls.find(call => call.category === 'router');
  assert.equal(ai.context, 'worker');
  assert.equal(ai.url, 'http://127.0.0.1:20128/v1/chat/completions');
  assert.equal(ai.options.headers.Authorization, 'Bearer test-router-key');
  const body = JSON.parse(ai.options.body);
  assert.equal(body.model, 'study-combo');
  assert.equal(body.messages.at(-1).content, sentence);
  assert.match(body.messages[0].content, /English/);
  assert.equal(await h.fetchSentenceTranslation(sentence), meaning);
  assert.equal(h.calls.filter(call => call.category === 'router').length, 1);
});

test('rate-limited Google requests pause across sentences and dictionary lookups, then recover', async () => {
  let now = 100000;
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category === 'translate'
      ? (now < 220000 ? {...response({}, '', false), status: 429, headers: {get: name => name === 'retry-after' ? '120' : null}} : response([[['I learn.']]]))
      : response({choices: [{message: {content: 'The world is beautiful.'}}]})
  });
  h.worker.sandbox.Date = {now: () => now, parse: Date.parse};
  assert.equal(await h.fetchSentenceTranslation('世界は綺麗'), 'The world is beautiful.');
  assert.equal(await h.fetchSentenceTranslation('今日は晴れ'), 'The world is beautiful.');
  const dictionary = await h.worker.request({action: 'TRANSLATE_JAPANESE', text: '綺麗', dictionary: true});
  assert.equal(dictionary.success, false);
  // Each client ID is tried once, then both stay paused for Retry-After.
  assert.deepEqual(h.calls.filter(call => call.category === 'translate').map(call => new URL(call.url).searchParams.get('client')), ['dict-chrome-ex', 'gtx']);
  assert.equal(h.calls.filter(call => call.category === 'router').length, 2);
  now = 220001;
  assert.equal(await h.fetchSentenceTranslation('私は学ぶ'), 'I learn.');
  assert.equal(h.calls.filter(call => call.category === 'translate').length, 3);
  assert.equal(h.calls.filter(call => call.category === 'router').length, 2);
});

test('sentence translation shares pending requests and caches successful worker results', async () => {
  let finish;
  const h = await create({}, {fetch: call => call.category === 'translate' ? new Promise(resolve => finish = resolve) : Promise.resolve(response({}, '', false))});
  const first = h.fetchSentenceTranslation('世界は綺麗');
  const second = h.fetchSentenceTranslation('世界は綺麗');
  await flush();
  assert.equal(h.calls.filter(call => call.category === 'translate').length, 1);
  finish(response([[['The world is beautiful.']]]));
  assert.deepEqual(await Promise.all([first, second]), ['The world is beautiful.', 'The world is beautiful.']);
  assert.equal(await h.fetchSentenceTranslation('世界は綺麗'), 'The world is beautiful.');
  assert.equal(h.calls.filter(call => call.category === 'translate').length, 1);
  assert.equal(h.calls.filter(call => call.category === 'router').length, 0);
});

for (const [name, failGoogle] of [
  ['network failure', () => { throw new TypeError('Failed to fetch'); }],
  ['timeout', () => { throw new DOMException('Timed out', 'TimeoutError'); }],
  ['malformed response', () => response({unexpected: true})],
]) test(`sentence meaning uses AI after a Google ${name}`, async () => {
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category === 'translate' ? failGoogle() : response({choices: [{message: {content: 'I learn.'}}]})
  });
  assert.equal(await h.fetchSentenceTranslation('私は学ぶ'), 'I learn.');
});

test('pending AI fallback is shared and a late result cannot replace a newer caption', async () => {
  const pending = new Map();
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category === 'translate' ? {...response({}, '', false), status: 429}
      : new Promise(resolve => pending.set(JSON.parse(call.options.body).messages.at(-1).content, resolve))
  });
  h.renderSentenceTokens('世界は綺麗');
  const same = h.fetchSentenceTranslation('世界は綺麗');
  h.renderSentenceTokens('私は学ぶ');
  await flush();
  assert.equal(h.calls.filter(call => call.category === 'router').length, 2);
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, 'Translating…');
  pending.get('私は学ぶ')(response({choices: [{message: {content: 'I learn.'}}]}));
  await flush();
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, 'I learn.');
  pending.get('世界は綺麗')(response({choices: [{message: {content: 'The world is beautiful.'}}]}));
  assert.equal(await same, 'The world is beautiful.');
  await flush();
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, 'I learn.');
});

test('fallback requires a saved model and permission for the saved router origin', async () => {
  for (const [config, error] of [
    [{}, /Choose a 9Router model/],
    [{linguaplay_9router_model: 'study-combo', linguaplay_9router_url: 'https://router.example/v1'}, /Allow access/]
  ]) {
    const h = await create(config, {fetch: async () => ({...response({}, '', false), status: 429})});
    h.renderSentenceTokens('世界は綺麗');
    await flush();
    assert.match(h.elements.get('linguaplay-caption-english').innerHTML, /Retry sentence meaning/);
    assert.match(h.elements.get('linguaplay-caption-english').title, error);
    assert.equal(h.calls.filter(call => call.category === 'router').length, 0);
  }
});

test('a late caption translation cannot replace the current sentence meaning', async () => {
  const pending = new Map();
  const h = await create({}, {fetch: call => call.category === 'translate' ? new Promise(resolve => pending.set(new URL(call.url).searchParams.get('q'), resolve)) : Promise.resolve(response({}, '', false))});
  h.renderSentenceTokens('世界は綺麗');
  h.renderSentenceTokens('私は学ぶ');
  await flush();
  pending.get('私は学ぶ')(response([[['I learn.']]]));
  await flush();
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, 'I learn.');
  pending.get('世界は綺麗')(response([[['The world is beautiful.']]]));
  await flush();
  assert.equal(h.elements.get('linguaplay-caption-english').textContent, 'I learn.');
});

test('failed sentence meanings retain Japanese and retry only on explicit request', async () => {
  const h = await create({}, {fetch: async () => response({}, '', false)});
  h.renderSentenceTokens('世界は綺麗');
  await flush();
  const count = h.calls.length;
  assert.ok(h.elements.get('linguaplay-yt-tokens').children.length > 0);
  assert.match(h.elements.get('linguaplay-caption-english').innerHTML, /Retry sentence meaning/);
  for (let i = 0; i < 5; i++) h.renderSentenceTokens('世界は綺麗');
  await flush();
  assert.equal(h.calls.length, count);
});

test('when both providers fail, retry explains the connection error and can recover', async () => {
  let online = false;
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category === 'translate' ? {...response({}, '', false), status: 429}
      : online ? response({choices: [{message: {content: 'The world is beautiful.'}}]})
      : response({error: {message: 'Router is offline'}}, '', false)
  });
  h.renderSentenceTokens('世界は綺麗');
  await flush();
  const line = h.elements.get('linguaplay-caption-english');
  assert.match(line.innerHTML, /Retry sentence meaning/);
  assert.match(line.title, /Google.*429.*AI fallback.*Router is offline/);
  online = true;
  assert.equal(await h.fetchSentenceTranslation('世界は綺麗'), 'The world is beautiful.');
  h.renderSentenceTokens('世界は綺麗');
  await flush();
  assert.equal(line.textContent, 'The world is beautiful.');
  assert.equal(line.title, 'The world is beautiful.');
});

const clientOf = call => new URL(call.url).searchParams.get('client');
const googleLines = call => (new URL(call.url).searchParams.get('q') || '').split('\n');

test('a rate limit on one Google client uses the next client before AI', async () => {
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category !== 'translate' ? response({choices: [{message: {content: 'AI'}}]})
      : clientOf(call) === 'dict-chrome-ex' ? {...response({}, '', false), status: 429} : response([[['The world is beautiful.', '世界は綺麗']]])
  });
  assert.equal(await h.fetchSentenceTranslation('世界は綺麗'), 'The world is beautiful.');
  assert.equal(await h.fetchSentenceTranslation('私は学ぶ'), 'The world is beautiful.');
  // The paused client is skipped for the second sentence.
  assert.deepEqual(h.calls.filter(call => call.category === 'translate').map(clientOf), ['dict-chrome-ex', 'gtx', 'gtx']);
  assert.equal(h.calls.filter(call => call.category === 'router').length, 0);
});

test('Study word glosses use one Google request per sentence and are cached across requests', async () => {
  const h = await create({}, {fetch: async call => call.category === 'translate'
    ? response([googleLines(call).map((line, index, all) => [line === '自画像' ? 'self-portrait' : 'gloss ' + line + (index < all.length - 1 ? '\n' : ''), line + (index < all.length - 1 ? '\n' : '')])])
    : response({}, '', false)});
  const first = await h.worker.request({action: 'TRANSLATE_WORDS', words: ['自画像', '微笑む', '自画像']});
  assert.deepEqual({...first.meanings}, {'自画像': 'self-portrait', '微笑む': 'gloss 微笑む'});
  assert.equal(h.calls.filter(call => call.category === 'translate').length, 1);
  assert.deepEqual(googleLines(h.calls[0]), ['自画像', '微笑む']);
  const second = await h.worker.request({action: 'TRANSLATE_WORDS', words: ['微笑む']});
  assert.equal(second.meanings['微笑む'], 'gloss 微笑む');
  assert.equal(h.calls.filter(call => call.category === 'translate').length, 1);
});

test('Study word glosses fall back to one AI request while Google is rate limited', async () => {
  const h = await create({linguaplay_9router_model: 'study-combo'}, {fetch: async call => call.category === 'translate'
    ? {...response({}, '', false), status: 429}
    : response({choices: [{message: {content: JSON.stringify({'自画像': 'self-portrait', '微笑む': 'to smile', 'extra': 'ignored'})}}]})});
  const result = await h.worker.request({action: 'TRANSLATE_WORDS', words: ['自画像', '微笑む']});
  assert.deepEqual({...result.meanings}, {'自画像': 'self-portrait', '微笑む': 'to smile'});
  const ai = h.calls.filter(call => call.category === 'router');
  assert.equal(ai.length, 1);
  const body = JSON.parse(ai[0].options.body);
  assert.deepEqual(body.response_format, {type: 'json_object'});
  assert.deepEqual(JSON.parse(body.messages.at(-1).content), ['自画像', '微笑む']);
  for (const words of [[], 'word', ['a\nb'], ['x'.repeat(65)], Array(41).fill('語')]) {
    const invalid = await h.worker.request({action: 'TRANSLATE_WORDS', words});
    assert.equal(invalid.success, false);
  }
});

test('opening Study glosses the sentence with one worker request', async () => {
  const h = await create({}, {fetch: async call => call.category === 'translate'
    ? response([googleLines(call).map(line => ['meaning of ' + line, line])])
    : response({}, '', false)});
  h.select('自画像', '自画像を描く');
  await h.worker.drain();
  await flush();
  const wordRequests = h.messages.filter(message => message.action === 'TRANSLATE_WORDS');
  assert.equal(wordRequests.length, 1);
  assert.equal(h.messages.filter(message => message.action === 'TRANSLATE_JAPANESE' && message.dictionary).length <= 1, true, 'Only the header definition may use a dictionary lookup');
  const glosses = h.all.filter(element => element.className === 'lp-word-gloss').map(element => element.textContent);
  assert.ok(glosses.length > 0);
  assert.ok(glosses.every(text => text !== 'Loading…' && text !== 'No definition'), glosses.join(', '));
});

test('a queued sentence displaces word lookups instead of failing when the queue is full', async () => {
  const pending = [];
  const h = await create({}, {fetch: call => call.category === 'translate'
    ? new Promise(resolve => pending.push(() => resolve(response([[['ok', googleLines(call)[0]]]]))))
    : Promise.resolve(response({}, '', false))});
  const words = Array.from({length: 46}, (_, i) => h.worker.request({action: 'TRANSLATE_JAPANESE', text: '語' + i, dictionary: true}));
  await flush();
  // Words hold at most two Google slots.
  assert.equal(pending.length, 2);
  const sentence = h.worker.request({action: 'TRANSLATE_JAPANESE', text: '世界は綺麗'});
  await flush();
  assert.equal(pending.length, 3, 'A sentence starts in a free slot while words are queued');
  while (pending.length) { pending.shift()(); await flush(); }
  assert.equal((await sentence).success, true);
  const results = await Promise.all(words);
  assert.ok(results.some(result => !result.success && /busy/.test(result.error)), 'Only overflowing word lookups are refused');
  assert.ok(results.filter(result => result.success).length >= 44);
});

test('a failed caption meaning retries by itself after the pause', async () => {
  let now = 1000000, online = false;
  const h = await create({}, {fetch: async call => call.category === 'translate' && online
    ? response([[['The world is beautiful.', '世界は綺麗']]]) : response({}, '', false)});
  h.sandbox.Date = {now: () => now, parse: Date.parse};
  h.renderSentenceTokens('世界は綺麗');
  await h.worker.drain();
  await flush();
  const line = h.elements.get('linguaplay-caption-english');
  assert.match(line.innerHTML, /Retry sentence meaning/);
  const timer = h.timeouts.filter(timeout => timeout.active && timeout.ms === 30000).at(-1);
  assert.ok(timer, 'A retry is scheduled');
  online = true;
  now += 30000;
  timer.fn();
  await h.worker.drain();
  await flush();
  assert.equal(line.textContent, 'The world is beautiful.');
});

test('a transient Google server error tries the next client without pausing the first', async () => {
  let failures = 1;
  const h = await create({}, {fetch: async call => call.category !== 'translate' ? response({}, '', false)
    : clientOf(call) === 'dict-chrome-ex' && failures-- > 0 ? {...response({}, '', false), status: 500} : response([[['I learn.', '私は学ぶ']]])});
  assert.equal(await h.fetchSentenceTranslation('私は学ぶ'), 'I learn.');
  assert.equal(await h.fetchSentenceTranslation('世界は綺麗'), 'I learn.');
  assert.deepEqual(h.calls.filter(call => call.category === 'translate').map(clientOf), ['dict-chrome-ex', 'gtx', 'dict-chrome-ex']);
});

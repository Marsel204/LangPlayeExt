'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush} = require('./perf/lib/shipped');
const {storage} = require('./perf/lib/fakes');
const {background} = require('./perf/lib/worker-fixture');

const tokens = h => h.elements.get('linguaplay-yt-tokens').children.filter(child => child.dataset?.word);
const statusOf = (h, word) => {
  const token = tokens(h).find(child => child.dataset.word === word);
  assert.ok(token, 'token ' + word);
  return ['new', 'learning', 'known'].find(status => token.className.split(' ').includes('lp-word-' + status)) || 'none';
};
const pressed = h => ['new', 'learning', 'known'].filter(status => h.elements.get('lp-status-' + status).getAttribute('aria-pressed') === 'true');
const choose = (h, status) => h.elements.get('lp-status-' + status).click();

test('content words are marked new, saved cards learning, and particles are not marked', async () => {
  const h = await create({linguaplay_cards: [{word: '世界'}]});
  await flush();
  h.renderSentenceTokens('世界は綺麗');
  assert.equal(statusOf(h, '世界'), 'learning');
  assert.equal(statusOf(h, '綺麗'), 'new');
  assert.equal(statusOf(h, 'は'), 'none');
});

test('choosing a status in Study saves it through the worker and updates the subtitle at once', async () => {
  const h = await create();
  await flush();
  h.renderSentenceTokens('世界は綺麗');
  h.select('綺麗', '世界は綺麗');
  assert.equal(h.elements.get('lp-word-status').hidden, false);
  assert.deepEqual(pressed(h), ['new']);
  choose(h, 'known');
  assert.deepEqual(pressed(h), ['known']);
  assert.equal(statusOf(h, '綺麗'), 'known');
  await h.worker.drain();
  await flush();
  assert.deepEqual(h.storage.state.linguaplay_word_status, {'綺麗': 'known'});
});

test('an explicit New overrides a saved card, and statuses use the dictionary form', async () => {
  const h = await create({linguaplay_cards: [{word: '食べる'}], linguaplay_word_status: {'食べる': 'new'}});
  await flush();
  // The card makes 食べる learning, but the saved explicit choice is New.
  h.select('食べた', '食べた', {baseForm: '食べる'});
  assert.deepEqual(pressed(h), ['new']);
  choose(h, 'learning');
  await h.worker.drain();
  await flush();
  assert.deepEqual(h.storage.state.linguaplay_word_status, {'食べる': 'learning'});
});

test('a failed save restores the previous status', async () => {
  const h = await create({}, {message: request => request.action === 'SET_WORD_STATUS' ? {success: false, error: 'quota'} : undefined});
  await flush();
  h.renderSentenceTokens('世界は綺麗');
  h.select('綺麗', '世界は綺麗');
  choose(h, 'known');
  await flush();
  assert.deepEqual(pressed(h), ['new']);
  assert.equal(statusOf(h, '綺麗'), 'new');
});

test('highlighting can be turned off and the choice is remembered', async () => {
  const h = await create();
  await flush();
  h.renderSentenceTokens('世界は綺麗');
  await h.click('linguaplay-highlight-btn');
  assert.equal(h.elements.get('linguaplay-highlight-btn').getAttribute('aria-pressed'), 'false');
  assert.equal(statusOf(h, '綺麗'), 'none');
  await flush();
  assert.equal(h.storage.state.linguaplay_word_highlight, false);
  const restored = await create({linguaplay_word_highlight: false});
  await flush();
  restored.renderSentenceTokens('世界は綺麗');
  assert.equal(statusOf(restored, '綺麗'), 'none');
});

test('the worker validates statuses, rejects other senders and serializes writes', async () => {
  const s = storage({linguaplay_word_status: {'猫': 'known'}});
  const worker = background(s);
  const sender = {id: 'fixture-extension', url: 'https://www.youtube.com/watch?v=A'};
  for (const [word, status] of [['', 'known'], ['犬', 'mastered'], ['a\nb', 'new'], ['x'.repeat(65), 'new'], [42, 'new']]) {
    assert.equal((await worker.request({action: 'SET_WORD_STATUS', word, status}, sender)).success, false);
  }
  assert.equal((await worker.request({action: 'SET_WORD_STATUS', word: '犬', status: 'known'}, {...sender, id: 'other'})).success, false);
  const results = await Promise.all(['犬', '鳥', '魚'].map(word => worker.request({action: 'SET_WORD_STATUS', word, status: 'learning'}, sender)));
  assert.ok(results.every(result => result.success));
  assert.deepEqual(s.state.linguaplay_word_status, {'猫': 'known', '犬': 'learning', '鳥': 'learning', '魚': 'learning'});
  const corrupt = storage({linguaplay_word_status: ['broken']});
  assert.equal((await background(corrupt).request({action: 'SET_WORD_STATUS', word: '犬', status: 'known'}, sender)).success, false);
  assert.deepEqual(corrupt.state.linguaplay_word_status, ['broken']);
});

test('two failed choices in a row fall back to the confirmed status, not the earlier failed choice', async () => {
  const replies = [];
  const h = await create({}, {message: request => request.action === 'SET_WORD_STATUS' ? new Promise(resolve => replies.push(resolve)) : undefined});
  await flush();
  h.renderSentenceTokens('世界は綺麗');
  h.select('綺麗', '世界は綺麗');
  choose(h, 'learning');
  choose(h, 'known');
  assert.deepEqual(pressed(h), ['known']);
  replies[0]({success: false, error: 'quota'});
  await flush();
  assert.deepEqual(pressed(h), ['known'], 'The newer pending choice stays visible');
  replies[1]({success: false, error: 'quota'});
  await flush();
  assert.deepEqual(pressed(h), ['new']);
  assert.equal(statusOf(h, '綺麗'), 'new');
});

test('a confirmed earlier choice survives a later failed one', async () => {
  const replies = [];
  const h = await create({}, {message: request => request.action === 'SET_WORD_STATUS' ? new Promise(resolve => replies.push(resolve)) : undefined});
  await flush();
  h.select('綺麗', '世界は綺麗');
  choose(h, 'learning');
  choose(h, 'known');
  replies[0]({success: true});
  replies[1]({success: false, error: 'quota'});
  await flush();
  assert.deepEqual(pressed(h), ['learning']);
});

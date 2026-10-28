'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {create, response, flush, storage} = require('./perf/lib/shipped');

for (const [name, localFails, reply, expected] of [
  ['both confirmed', false, {result: 123, error: null}, /Added to Anki · stored locally/],
  ['Anki failed', false, {result: null, error: 'deck was not found'}, /Kept locally — Anki:.*create the configured deck/],
  ['local failed', true, {result: 123, error: null}, /Added to Anki — local copy failed/],
  ['both failed', true, {result: null, error: 'offline'}, /Not added: local:.*Anki: offline/],
  ['duplicate', false, {result: null, error: 'cannot create note because it is a duplicate'}, /Already in Anki · stored locally/],
]) {
  test('Quick Add reports durable outcomes: ' + name, async () => {
    const s = storage({}, {fail: localFails});
    const h = await create({}, {storage: s, fetch: async c => c.category === 'anki' ? response(reply) : response([[['translation']]])});
    h.select('猫', '選んだ猫の文', {furigana: 'ねこ', romaji: 'neko'});
    h.renderSentenceTokens('次の字幕');
    await h.click('lp-quick-anki-btn');
    await h.worker.drain();
    await flush();
    assert.match(h.elements.get('lp-quick-anki-btn').textContent, expected);
    if (!localFails) {
      assert.equal(s.state.linguaplay_cards[0].sentence, '選んだ猫の文');
      assert.equal(s.state.linguaplay_cards[0].reading, 'ねこ');
    }
  });
}

test('card HTML highlights source text without splitting generated entities', async () => {
  const h = await create({}, {fetch: async c => c.category === 'anki' ? response({result: 123}) : response([[['translation']]])});
  h.select('amp', '& amp');
  await h.click('lp-quick-anki-btn');
  const note = JSON.parse(h.calls.find(c => c.category === 'anki').options.body).params.note;
  assert.ok(note.fields.Back.includes('&amp; <b>amp</b>'));
});

test('shared TSV highlights source text and preserves four safe columns', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/card-export.js'), 'utf8'), sandbox);
  const row = sandbox.buildAnkiTsv([{word: 'amp', sentence: '& amp', reading: 'a\tb', meaning: '<img>\rline', sentence_en: '<&>'}]).split('\n')[3];
  const columns = row.split('\t');
  assert.equal(columns.length, 4);
  assert.equal(columns[0], '&amp; <b>amp</b>');
  assert.equal(columns[2], 'a b');
  assert.ok(columns[3].includes('&lt;img&gt; line'));
  assert.ok(columns[3].includes('&lt;&amp;&gt;'));
});

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

test('Quick Add sends only fields to the worker, which owns Anki settings', async () => {
  const h = await create({linguaplay_ankiconnect_url: 'http://localhost:8765/anki', linguaplay_anki_deck: 'Configured deck'}, {
    fetch: async c => c.category === 'anki' ? response({result: 123, error: null}) : response([[['translation']]])
  });
  h.select('猫', '猫がいる', {furigana: 'ねこ', romaji: 'neko'});
  await h.click('lp-quick-anki-btn');
  await h.worker.drain();
  await flush();
  assert.equal(h.elements.get('lp-quick-anki-btn').textContent, '✓ Added to Anki · stored locally');
  const requests = h.calls.filter(c => c.category === 'anki');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].context, 'worker');
  assert.equal(requests[0].url, 'http://localhost:8765/anki');
  const {note} = JSON.parse(requests[0].options.body).params;
  assert.equal(note.deckName, 'Configured deck');
  assert.equal(note.modelName, 'Basic');
  assert.deepEqual(note.tags, ['linguaplay', 'youtube']);
  const message = h.messages.find(m => m.action === 'ADD_ANKI_NOTE');
  assert.deepEqual(message, {action: 'ADD_ANKI_NOTE', fields: note.fields});
});

const WORD = '猫', SENTENCE = '猫がいる', KANA = 'ねこ', ROMAJI = 'neko', EN = 'There is a cat.';
async function saveEnrichedCard(ai, {reading = {furigana: KANA, romaji: ROMAJI}, withoutWanakana = false} = {}) {
  let prompt;
  const h = await create({linguaplay_9router_model: 'fixture-study'}, {fetch: async c => {
    if (c.category === 'router') {
      prompt = JSON.parse(c.options.body).messages[0].content;
      return response({choices: [{message: {content: JSON.stringify(ai)}}]});
    }
    return c.category === 'anki' ? response({result: 123, error: null}) : response([[['translation']]]);
  }});
  h.select(WORD, SENTENCE, reading);
  if (withoutWanakana) delete h.window.wanakana;
  const shown = h.elements.get('lp-active-romaji').textContent;
  await h.click('lp-ai-btn');
  await h.worker.drain();
  await flush();
  assert.equal(h.elements.get('lp-ai-anki-btn').style.display, 'block', 'AI analysis must finish');
  await h.click('lp-ai-anki-btn');
  await h.worker.drain();
  await flush();
  assert.equal(h.elements.get('lp-ai-anki-btn').textContent, '✓ Added to Anki · stored locally');
  const request = h.calls.find(c => c.category === 'anki');
  assert.equal(request.context, 'worker');
  return {h, prompt, shown, card: h.storage.state.linguaplay_cards[0], note: JSON.parse(request.options.body).params.note};
}

for (const [name, values] of [
  ['model echoes the display string', {reading: 'ねこ (neko)', romaji: 'ねこ (neko)', sentence_translation: {jp: SENTENCE, en: EN}}],
  ['schema-compliant translation object', {reading: KANA, romaji: ROMAJI, sentence_translation: {jp: SENTENCE, en: EN}}],
  ['legacy translation string', {reading: KANA, romaji: ROMAJI, sentence_translation: EN}],
]) {
  test('enriched cards preserve translations and separate readings: ' + name, async () => {
    const {card, note} = await saveEnrichedCard({contextual_meaning: 'cat', sentence_fit: {role_in_sentence: 'Subject marked by が'}, ...values});
    assert.equal(card.sentence_en, EN);
    assert.ok(note.fields.Back.includes(EN));
    assert.equal(card.reading, KANA);
    assert.equal(card.romaji, ROMAJI);
    assert.ok(note.fields.Front.includes('>neko</span>'));
    assert.ok(!note.fields.Front.includes('ねこ (neko)'));
    assert.equal(card.meaning, 'cat [Role: Subject marked by が]');
  });
}

for (const [name, translation] of [
  ['missing', undefined], ['null', null], ['number', 42], ['array', [EN]],
  ['non-string English', {jp: SENTENCE, en: 42}], ['nested English', {en: {text: EN}}],
  ['Japanese only', {jp: SENTENCE}], ['array with English property', [{en: EN}]],
]) {
  test('enriched cards safely ignore invalid translations: ' + name, async () => {
    const {card, note} = await saveEnrichedCard({sentence_translation: translation});
    assert.equal(card.sentence_en, '');
    assert.ok(!note.fields.Back.includes('[object Object]'));
    assert.ok(!note.fields.Back.includes('There is a cat.'));
    assert.ok(!note.fields.Back.includes('font-size:0.9em'));
  });
}

test('enriched cards retain legacy data, target_word, meaning, and grammar_role', async () => {
  const {card, note} = await saveEnrichedCard({data: {
    target_word: {reading: KANA, romaji: ROMAJI, meaning: 'cat'}, grammar_role: 'subject', sentence_translation: EN
  }});
  assert.equal(card.meaning, 'cat [Role: subject]');
  assert.equal(card.sentence_en, EN);
  assert.equal(card.reading, KANA);
  assert.equal(card.romaji, ROMAJI);
  assert.ok(note.fields.Back.includes('cat [Role: subject]'));
  const legacy = await saveEnrichedCard({meaning: 'cat', grammar_role: 'subject'});
  assert.equal(legacy.card.meaning, 'cat [Role: subject]');
});

test('enriched cards keep the app reading authoritative over valid AI alternatives', async () => {
  const {card} = await saveEnrichedCard({reading: 'いぬ', romaji: 'inu', target_word: {reading: 'とり', romaji: 'tori'}});
  assert.equal(card.reading, KANA);
  assert.equal(card.romaji, ROMAJI);
});

for (const [name, ai] of [
  ['romaji in reading', {reading: ROMAJI, romaji: ROMAJI}],
  ['kana in romaji', {reading: KANA, romaji: KANA}],
  ['echoed display strings', {reading: 'ねこ (neko)', romaji: 'ねこ (neko)'}],
  ['non-string values', {reading: {}, romaji: [ROMAJI], contextual_meaning: {}, grammar_role: 42, target_word: {meaning: []}}],
]) {
  test('enriched cards reject mixed or malformed AI readings: ' + name, async () => {
    const {card} = await saveEnrichedCard(ai);
    assert.equal(card.reading, KANA);
    assert.equal(card.romaji, ROMAJI);
    assert.ok(!card.meaning.includes('[object Object]'));
  });
}

for (const withoutWanakana of [false, true]) {
  test('AI reading fallback validates scripts ' + (withoutWanakana ? 'without' : 'with') + ' wanakana', async () => {
    const options = {reading: {furigana: '?', romaji: '?'}, withoutWanakana};
    const valid = await saveEnrichedCard({target_word: {reading: KANA, romaji: ROMAJI}}, options);
    assert.equal(valid.card.reading, KANA);
    assert.equal(valid.card.romaji, ROMAJI);
    for (const [reading, romaji] of [[ROMAJI, KANA], ['ねこ (neko)', 'neko (neko)'], ['猫', 'nek0'], [42, {}]]) {
      const invalid = await saveEnrichedCard({reading, romaji}, options);
      assert.equal(invalid.card.reading, WORD, 'The word is the last resort when no kana reading is available');
      assert.equal(invalid.card.romaji, '', 'Invalid AI and drawer values must not be stored as romaji');
    }
  });
}

test('Sensei analysis and chat prompts use separate kana and romaji values', async () => {
  const {h, prompt, shown} = await saveEnrichedCard({reading: KANA, romaji: ROMAJI});
  assert.equal(shown, 'ねこ (neko)');
  assert.ok(!prompt.includes(shown));
  assert.match(prompt, /Kana Reading: ねこ/);
  assert.match(prompt, /Hepburn Romaji: neko/);
  assert.match(prompt, /"reading": "Kana only/);
  assert.match(prompt, /"romaji": "Hepburn romaji only/);
  assert.match(prompt, /"sentence_translation":\s*\{\s*"jp":/);
  h.elements.get('lp-chat-input').value = 'Explain the target word';
  await h.click('lp-chat-send-btn');
  await h.worker.drain();
  const messages = JSON.parse(h.calls.filter(c => c.category === 'router').at(-1).options.body).messages;
  assert.equal(messages[0].role, 'system');
  assert.ok(!messages[0].content.includes(shown));
  assert.match(messages[0].content, /Kana Reading: ねこ/);
  assert.match(messages[0].content, /Hepburn Romaji: neko/);
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

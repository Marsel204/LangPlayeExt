'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const grammar = require('../js/grammar-patterns.js');
const { create, flush, response } = require('./perf/lib/shipped');

const ids = sentence => grammar.detectGrammarPatterns(sentence).map(m => m.id);
const levels = sentence => grammar.detectGrammarPatterns(sentence).map(m => m.level);

test('grammar catalog covers every JLPT level from N5 through N1 with complete metadata', () => {
  assert.deepEqual(grammar.LEVELS, ['N5', 'N4', 'N3', 'N2', 'N1']);
  for (const level of grammar.LEVELS) {
    const entries = grammar.PATTERNS.filter(p => p.level === level);
    assert.ok(entries.length >= 25, `${level} should have rich coverage (got ${entries.length})`);
    for (const entry of entries) {
      assert.ok(entry.id && entry.pattern && entry.reading && entry.meaning && entry.structure && entry.note, entry.id);
    }
  }
  const uniqueIds = new Set(grammar.PATTERNS.map(p => p.id));
  assert.equal(uniqueIds.size, grammar.PATTERNS.length, 'Pattern IDs must be unique');
});

test('detects split 〜しか〜ない patterns including shika + wakaranai and skips lexical false friends', () => {
  for (const [sentence, expectedSnippet] of [
    ['日本語しか分からない', 'しか分からない'],
    ['日本語しかできない', 'しかできない'],
    ['私しかもらえない', 'しかもらえない'],
    ['私しかもっていない', 'しかもっていない'],
    ['彼しかこの本をもっていない', 'しか … もっていない'],
    ['私しかしていない', 'しかしていない'],
    ['私しかここには住んでいない', 'しか … 住んでいない'],
    ['私しかこうえんで遊べない', 'しか … 遊べない'],
    ['これしかしない', 'しかしない'],
    ['これしかわからない', 'しかわからない'],
    ['これしか私には見えない', 'しか … 見えない'],
    ['英語しか話せません', 'しか話せません'],
    ['少ししか食べなかった', 'しか食べなかった'],
    ['100円しかない', 'しかない'],
    ['今はこの近くしかない', 'しかない'],
    ['一つしかない', 'しかない'],
    ['パンしか食べずに学校へ行った', 'しか食べずに'],
    ['あなたしか信じられない', 'しか信じられない'],
  ]) {
    const matches = grammar.detectGrammarPatterns(sentence);
    const shika = matches.find(m => m.id === 'n4-shika-nai');
    assert.ok(shika, `Expected 〜しか〜ない for "${sentence}", got ${JSON.stringify(matches.map(m => m.id))}`);
    assert.equal(shika.level, 'N4');
    assert.equal(shika.matched, expectedSnippet);
    assert.equal(shika.spans.length, 2);
  }

  // Aspect inside a 〜しか〜ない predicate (e.g. 〜ている) is preserved alongside 〜しか〜ない.
  assert.deepEqual(ids('私しかしていない'), ['n4-shika-nai', 'n5-te-iru']);

  // Non-verb nouns before しかない must not be misclassified as N3 "have no choice but to".
  assert.ok(!ids('今はこの近くしかない').includes('n3-shika-nai-choice'));
  assert.ok(!ids('一つしかない').includes('n3-shika-nai-choice'));

  // Verb(dict) + しかない ("have no choice but to") maps to N3 〜しかない, not duplicated as N4.
  for (const sentence of ['行くしかない', '諦めるしかなかった', 'やるしかない']) {
    const found = ids(sentence);
    assert.ok(found.includes('n3-shika-nai-choice'), sentence);
    assert.ok(!found.includes('n4-shika-nai'), `Should not duplicate N4 on "${sentence}"`);
  }

  // Lexical false friends must never trigger 〜しか〜ない.
  for (const sentence of [
    'しかし雨が降らない',
    'しかも分からない',
    'たしかに分からない',
    'もしかしたら来ないかもしれない',
    'しかたがない',
    'しかるべきではない',
  ]) {
    assert.ok(!ids(sentence).includes('n4-shika-nai'), `False positive on "${sentence}"`);
  }
});

test('identifies representative JLPT N5, N4, N3, N2, and N1 patterns with accurate levels', () => {
  const cases = [
    ['日本語を話すことができる', 'N5', 'n5-koto-ga-dekiru'],
    ['日本に行ったことがある', 'N5', 'n5-ta-koto-ga-aru'],
    ['本を読んだり映画を見たりする', 'N5', 'n5-tari-tari'],
    ['あまり美味しくない', 'N5', 'n5-amari-nai'],
    ['全然分からない', 'N5', 'n5-zenzen-nai'],
    ['まだ食べていない', 'N5', 'n5-mada-teinai'],
    ['冷たい水が飲みたい', 'N5', 'n5-tai'],
    ['雨が降っているのに出かけてしまった', 'N5', 'n5-te-iru'],
    ['雨が降っているのに出かけてしまった', 'N4', 'n4-noni'],
    ['雨が降っているのに出かけてしまった', 'N4', 'n4-te-shimau'],
    ['勉強しなければならない', 'N4', 'n4-nakereba-naranai'],
    ['もし雨が降ったら家にいることにする', 'N4', 'n4-moshi-tara'],
    ['もし雨が降ったら家にいることにする', 'N4', 'n4-koto-ni-suru'],
    ['触れ合えば指先が熱くて', 'N4', 'n4-ba'],
    ['食べたらいい', 'N4', 'n4-tara'],
    ['雨が降ったらすぐ帰る', 'N4', 'n4-tara'],
    ['食べたらくだらない話をしよう', 'N4', 'n4-tara'],
    ['努力すればするほど上手になる', 'N3', 'n3-ba-hodo'],
    ['せっかく作ったのに食べてくれなかった', 'N3', 'n3-sekkaku-noni'],
    ['せっかく作ったのに食べてくれなかった', 'N4', 'n4-te-kureru-ageru-morau'],
    ['彼のことだからきっと遅れるに違いない', 'N2', 'n2-koto-dakara'],
    ['彼のことだからきっと遅れるに違いない', 'N3', 'n3-ni-chigainai'],
    ['雨が降っているにもかかわらず、出かけざるを得ない', 'N2', 'n2-ni-mo-kakawarazu'],
    ['雨が降っているにもかかわらず、出かけざるを得ない', 'N2', 'n2-zaru-wo-enai'],
    ['日本語どころか英語も話せない', 'N2', 'n2-dokoroka'],
    ['涙を禁じ得ない', 'N1', 'n1-wo-kinji-enai'],
    ['雨が止むや否や走り出した', 'N1', 'n1-ya-inaya'],
    ['彼ならではのアイデアだ', 'N1', 'n1-naradewa'],
    ['漢字はおろかひらがなさえ書けない', 'N1', 'n1-wa-oroka'],
    ['食べるそばから忘れてしまう', 'N1', 'n1-soba-kara'],
  ];

  for (const [sentence, expectedLevel, expectedId] of cases) {
    const matches = grammar.detectGrammarPatterns(sentence);
    const hit = matches.find(m => m.id === expectedId);
    assert.ok(hit, `Expected ${expectedLevel}:${expectedId} in "${sentence}", got ${JSON.stringify(matches.map(m => m.id))}`);
    assert.equal(hit.level, expectedLevel);
  }
});

test('suppresses subsumed sub-patterns and rejects plain sentences without grammar patterns', () => {
  // にもかかわらず subsumes のに; もし〜たら subsumes たら; せっかく〜のに subsumes のに.
  assert.ok(!ids('雨が降っているにもかかわらず、出かけざるを得ない').includes('n4-noni'));
  assert.ok(!ids('もし雨が降ったら家にいる').includes('n4-tara'));
  assert.ok(!ids('せっかく作ったのに食べなかった').includes('n4-noni'));
  assert.ok(!ids('勉強しなければならない').includes('n4-ba'));

  // Plain / lexical traps should return zero matches.
  for (const sentence of ['', '   ', 'Hello world', '猫がいる', '頭が痛い', 'とても綺麗だった', '新しい言葉', 'さようなら']) {
    assert.deepEqual(grammar.detectGrammarPatterns(sentence), [], `Unexpected match for "${sentence}"`);
  }
});

test('level filter, maxResults, and the 1,000-character cutoff behave deterministically', () => {
  const sentence = '雨が降っているにもかかわらず、出かけざるを得ない';
  assert.deepEqual(levels(sentence), ['N5', 'N2', 'N2']);
  assert.deepEqual(grammar.detectGrammarPatterns(sentence, { levels: ['N2'] }).map(m => m.level), ['N2', 'N2']);
  assert.equal(grammar.detectGrammarPatterns(sentence, { maxResults: 1 }).length, 1);
  assert.equal(grammar.detectGrammarPatterns('あ'.repeat(1000) + '日本語しか分からない').length, 0);
  assert.equal(grammar.detectGrammarPatterns('私は食べていませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'ていませんでした');
  assert.equal(grammar.detectGrammarPatterns('食べてませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'てませんでした');
  assert.equal(grammar.detectGrammarPatterns('読んでませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'でませんでした');
  const moshi = grammar.detectGrammarPatterns('もし食べたらくだらない話をしよう');
  assert.deepEqual(moshi.map(m => [m.id, m.matched]), [['n4-moshi-tara', 'もし … たら']]);
});

test('Study translation panel renders detected JLPT patterns, highlights tokens, and wires Ask Sensei', async () => {
  const h = await create({ linguaplay_9router_model: 'study-combo' }, {
    fetch: async call => call.category === 'router'
      ? response({ choices: [{ message: { content: 'Here is how 〜しか〜ない works.' } }] })
      : response([[['I only understand Japanese']]])
  });
  h.window.LinguaPlayGrammar = grammar;

  // 1. Sentence with N4 〜しか〜ない shows the Grammar patterns section in Study.
  h.select('分からない', '日本語しか分からない');
  await flush();

  const section = h.elements.get('lp-grammar-section');
  const list = h.elements.get('lp-grammar-list');
  const count = h.elements.get('lp-grammar-count');
  assert.equal(section.hidden, false);
  assert.equal(count.textContent, '1 pattern');
  assert.equal(list.children.length, 1);

  const card = list.children[0];
  assert.equal(card.dataset.level, 'N4');
  assert.equal(card.dataset.patternId, 'n4-shika-nai');
  assert.match(card.textContent, /N4/);
  assert.match(card.textContent, /〜しか〜ない/);
  assert.match(card.textContent, /しか分からない/);

  // 2. Hovering/opening the grammar card highlights the matching sentence tokens.
  card.emit('mouseenter');
  const highlighted = h.elements.get('lp-sentence-jp')
    .querySelectorAll('.lp-sentence-word')
    .filter(el => el.classList.contains('is-grammar-match'))
    .map(el => el.textContent);
  assert.ok(highlighted.some(t => t.includes('しか')), `Expected しか highlighted, got ${JSON.stringify(highlighted)}`);
  assert.ok(highlighted.some(t => t.includes('ない')), `Expected negative ending highlighted, got ${JSON.stringify(highlighted)}`);

  card.emit('mouseleave');
  assert.equal(
    h.elements.get('lp-sentence-jp').querySelectorAll('.lp-sentence-word').filter(el => el.classList.contains('is-grammar-match')).length,
    0
  );

  // 3. Clicking "Ask Sensei about this pattern" sends a contextual question to Sensei Chat.
  const askBtn = card.querySelector('.lp-grammar-ask-btn');
  assert.ok(askBtn);
  askBtn.click();
  await h.worker.drain();
  await flush();
  const chatCall = h.calls
    .filter(c => c.category === 'router')
    .map(c => JSON.parse(c.options.body))
    .find(body => body.messages.some(m => m.role === 'user' && m.content.includes('〜しか〜ない')));
  assert.ok(chatCall, 'Ask Sensei button should send a contextual grammar chat request');
  const userMessage = chatCall.messages.find(m => m.role === 'user');
  assert.match(userMessage.content, /N4.*〜しか〜ない/);

  // 4. Switching to a sentence without grammar patterns hides the Grammar section cleanly.
  h.select('猫', '猫がいる');
  await flush();
  assert.equal(section.hidden, true);
  assert.equal(list.children.length, 0);
  assert.equal(count.textContent, '');
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, flush } = require('./perf/lib/shipped');
const { storage, dom } = require('./perf/lib/fakes');
const { background } = require('./perf/lib/worker-fixture');
const grammar = require('../js/grammar-patterns');
const {
  buildVocabularyEntries,
  buildGrammarSummary,
  buildProgressBackup,
  serializeProgressBackup,
  parseProgressBackup,
  mountProgressDashboard
} = require('../js/progress-dashboard');

const videoSender = { id: 'fixture-extension', url: 'https://www.youtube.com/watch?v=A' };
const optionsSender = { id: 'fixture-extension', url: 'chrome-extension://fixture-extension/options.html' };

function createDashboardFixture(initialStorage = {}, { confirmResult = true, worker } = {}) {
  const s = storage(initialStorage);
  const bg = worker || background(s);
  const d = dom();
  const ids = [
    'progress-settings',
    'progress-known-count', 'progress-learning-count', 'progress-new-count', 'progress-grammar-seen-count',
    'progress-status-text',
    'progress-word-search', 'progress-word-filter', 'progress-word-list', 'progress-word-empty',
    'progress-word-more', 'progress-word-count-note',
    'export-progress-btn', 'import-progress-btn', 'progress-import-mode', 'progress-import-file', 'clear-vocab-btn',
    'progress-grammar-levels', 'progress-grammar-search', 'progress-grammar-scope',
    'progress-grammar-list', 'progress-grammar-empty', 'progress-grammar-more', 'progress-grammar-count-note',
    'clear-grammar-btn'
  ];
  for (const id of ids) {
    const tag = id.endsWith('-list') ? 'ul' : id.endsWith('-btn') || id.endsWith('-more') ? 'button' : 'div';
    const el = d.document.createElement(tag);
    el.id = id;
    if (id === 'progress-word-filter') el.value = 'all';
    if (id === 'progress-grammar-scope') el.value = 'seen';
    if (id === 'progress-import-mode') el.value = 'merge';
    d.document.body.appendChild(el);
  }
  const blobs = [];
  const confirms = [];
  const runtime = {
    id: 'fixture-extension',
    sendMessage: (message, cb) => {
      bg.request(message, optionsSender).then(res => cb(res));
    }
  };
  const listeners = [];
  const rawSet = s.api.set;
  s.api.set = (values, cb) => rawSet(values, () => {
    const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }]));
    for (const fn of listeners) fn(changes, 'local');
    cb?.();
  });
  const onChanged = { addListener: fn => listeners.push(fn) };
  const env = {
    ...d,
    ...d.clock,
    chrome: { runtime, storage: { local: s.api, onChanged } },
    URL: class extends URL {
      static createObjectURL(blob) { blobs.push(blob); return 'blob:progress'; }
      static revokeObjectURL() {}
    },
    Blob,
    confirm: message => { confirms.push(message); return confirmResult; },
    grammar
  };
  return { ...d, env, storage: s, worker: bg, blobs, confirms };
}

test('worker records encountered JLPT grammar patterns, enforces trust, and preserves corrupt data', async () => {
  const s = storage();
  const worker = background(s);

  // Untrusted sender rejected
  const untrusted = await worker.request({ action: 'RECORD_GRAMMAR_SEEN', patternIds: ['n4-shika-nai'] }, { id: 'other', url: 'https://www.youtube.com/watch?v=A' });
  assert.equal(untrusted.success, false);

  // Invalid pattern IDs / prototype keys rejected
  for (const bad of [[], ['__proto__'], ['Bad ID!'], ['a'.repeat(65)], Array.from({ length: 13 }, (_, i) => 'n5-p' + i)]) {
    const res = await worker.request({ action: 'RECORD_GRAMMAR_SEEN', patternIds: bad }, videoSender);
    assert.equal(res.success, false);
  }

  // First record deduplicates repeated IDs within one message and cleans example newlines
  const r1 = await worker.request({
    action: 'RECORD_GRAMMAR_SEEN',
    patternIds: ['n4-shika-nai', 'n4-shika-nai', 'n5-te-iru'],
    example: '  日本語しか\n勉強していない。  '
  }, videoSender);
  assert.equal(r1.success, true);
  assert.equal(r1.recorded, 2);
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].count, 1);
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].example, '日本語しか 勉強していない。');
  assert.equal(s.state.linguaplay_grammar_seen['n5-te-iru'].count, 1);

  // Second encounter increments count and updates example
  const r2 = await worker.request({
    action: 'RECORD_GRAMMAR_SEEN',
    patternIds: ['n4-shika-nai'],
    example: '水しか飲まない。'
  }, videoSender);
  assert.equal(r2.success, true);
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].count, 2);
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].example, '水しか飲まない。');

  // Corrupt storage is never overwritten
  const corrupt = storage({ linguaplay_grammar_seen: ['broken'] });
  const rCorrupt = await background(corrupt).request({ action: 'RECORD_GRAMMAR_SEEN', patternIds: ['n4-shika-nai'] }, videoSender);
  assert.equal(rCorrupt.success, false);
  assert.deepEqual(corrupt.state.linguaplay_grammar_seen, ['broken']);
});

test('worker restricts destructive/bulk progress management to extension Settings and handles merge/replace', async () => {
  const s = storage({
    linguaplay_word_status: { '猫': 'known', '犬': 'learning' },
    linguaplay_grammar_seen: { 'n4-shika-nai': { count: 3, lastSeen: 2000, example: '水しか飲まない。' } }
  });
  const worker = background(s);

  // Video site tab cannot call Options-only actions
  for (const action of ['REMOVE_WORD_STATUS', 'CLEAR_WORD_STATUS', 'CLEAR_GRAMMAR_SEEN', 'IMPORT_PROGRESS']) {
    const res = await worker.request({ action, word: '猫', data: { wordStatus: {} }, mode: 'merge' }, videoSender);
    assert.equal(res.success, false, `${action} must reject video-site sender`);
  }

  // Options sender can remove a single word status
  const removed = await worker.request({ action: 'REMOVE_WORD_STATUS', word: '犬' }, optionsSender);
  assert.equal(removed.success, true);
  assert.equal(removed.removed, true);
  assert.deepEqual(s.state.linguaplay_word_status, { '猫': 'known' });

  // Merge import combines words and keeps max grammar count idempotently
  const merged = await worker.request({
    action: 'IMPORT_PROGRESS',
    mode: 'merge',
    data: {
      wordStatus: { '鳥': 'new', '猫': 'learning' },
      grammarSeen: {
        'n4-shika-nai': { count: 2, lastSeen: 1000, example: '古い例' },
        'n3-tatoe-temo': { count: 1, lastSeen: 3000, example: 'たとえ雨でも行く。' }
      }
    }
  }, optionsSender);
  assert.equal(merged.success, true);
  assert.equal(merged.importedWords, 2);
  assert.equal(merged.importedGrammar, 2);
  assert.deepEqual(s.state.linguaplay_word_status, { '鳥': 'new', '猫': 'learning' });
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].count, 3);
  assert.equal(s.state.linguaplay_grammar_seen['n4-shika-nai'].example, '水しか飲まない。');
  assert.equal(s.state.linguaplay_grammar_seen['n3-tatoe-temo'].count, 1);

  // Replace import overwrites cleanly
  const replaced = await worker.request({
    action: 'IMPORT_PROGRESS',
    mode: 'replace',
    data: { wordStatus: { '魚': 'known' }, grammarSeen: {} }
  }, optionsSender);
  assert.equal(replaced.success, true);
  assert.deepEqual(s.state.linguaplay_word_status, { '魚': 'known' });
  assert.deepEqual(s.state.linguaplay_grammar_seen, {});

  // Invalid backup payloads are rejected without touching stored state
  for (const badData of [{}, { wordStatus: { '犬': 'mastered' } }, { wordStatus: ['bad'] }, { grammarSeen: { 'n5-desu': { count: 0 } } }]) {
    const res = await worker.request({ action: 'IMPORT_PROGRESS', mode: 'merge', data: badData }, optionsSender);
    assert.equal(res.success, false);
  }
  assert.deepEqual(s.state.linguaplay_word_status, { '魚': 'known' });

  // Clear actions work from Options
  assert.equal((await worker.request({ action: 'CLEAR_WORD_STATUS' }, optionsSender)).success, true);
  assert.deepEqual(s.state.linguaplay_word_status, {});
  assert.equal((await worker.request({ action: 'CLEAR_GRAMMAR_SEEN' }, optionsSender)).success, true);
  assert.deepEqual(s.state.linguaplay_grammar_seen, {});
});

test('Study panel logs detected JLPT grammar patterns once per sentence without double-counting clicks', async () => {
  const h = await create();
  h.window.LinguaPlayGrammar = grammar;
  await flush();

  // Click two different words in the same sentence containing 〜しか〜ない
  h.select('日本語', '日本語しか勉強していない');
  await h.worker.drain();
  await flush();
  h.select('勉強', '日本語しか勉強していない');
  await h.worker.drain();
  await flush();

  const seen = h.storage.state.linguaplay_grammar_seen;
  assert.ok(seen && seen['n4-shika-nai'], 'n4-shika-nai should be logged');
  assert.equal(seen['n4-shika-nai'].count, 1, 'same sentence should not double-count');
  assert.equal(seen['n4-shika-nai'].example, '日本語しか勉強していない');

  // Studying a different sentence with 〜しか〜ない increments the count
  h.select('水', '水しか飲まない');
  await h.worker.drain();
  await flush();
  assert.equal(h.storage.state.linguaplay_grammar_seen['n4-shika-nai'].count, 2);
  assert.equal(h.storage.state.linguaplay_grammar_seen['n4-shika-nai'].example, '水しか飲まない');
});

test('vocabulary and grammar summary builders match Study semantics and validate backups', () => {
  const vocab = buildVocabularyEntries(
    { '綺麗': 'known', '食べる': 'new' },
    [{ word: '食べる' }, { word: '世界' }]
  );
  assert.equal(vocab.counts.known, 1);
  assert.equal(vocab.counts.new, 1);
  assert.equal(vocab.counts.learning, 1);
  assert.equal(vocab.counts.cardDerivedCount, 1);
  assert.deepEqual(
    vocab.entries.map(e => [e.word, e.status, e.source]),
    [['食べる', 'new', 'explicit'], ['綺麗', 'known', 'explicit'], ['世界', 'learning', 'card']]
  );

  const summary = buildGrammarSummary(grammar.PATTERNS, {
    'n4-shika-nai': { count: 2, lastSeen: 1000, example: '水しか飲まない' },
    'unknown-pattern-id': { count: 5, lastSeen: 2000, example: 'ignored' }
  });
  assert.equal(summary.seenCount, 1);
  assert.equal(summary.totalCount, grammar.PATTERNS.length);
  const n4 = summary.levels.find(l => l.level === 'N4');
  assert.equal(n4.seen, 1);

  const backup = buildProgressBackup({ '猫': 'known' }, { 'n4-shika-nai': { count: 2, lastSeen: 1000, example: '水しか飲まない' } });
  const parsed = parseProgressBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.wordStatus, { '猫': 'known' });
  assert.equal(parsed.grammarSeen['n4-shika-nai'].count, 2);
  assert.throws(() => parseProgressBackup('not json'), /JSON/);
  assert.throws(() => parseProgressBackup('{}'), /no vocabulary or grammar/);
});

test('Progress dashboard mounts, filters, updates word statuses, exports/imports JSON, and syncs live', async () => {
  const h = createDashboardFixture({
    linguaplay_word_status: { '綺麗': 'new', '猫': 'known' },
    linguaplay_cards: [{ word: '世界' }],
    linguaplay_grammar_seen: {
      'n4-shika-nai': { count: 3, lastSeen: 2000, example: '水しか飲まない' },
      'n2-wo-hajime': { count: 1, lastSeen: 1000, example: '東京をはじめ多くの都市' }
    }
  });
  await mountProgressDashboard(h.env);

  assert.equal(h.elements.get('progress-known-count').textContent, '1');
  assert.equal(h.elements.get('progress-learning-count').textContent, '1');
  assert.equal(h.elements.get('progress-new-count').textContent, '1');
  assert.equal(h.elements.get('progress-grammar-seen-count').textContent, `2 / ${grammar.PATTERNS.length}`);

  // Flip 綺麗 from New to Known
  const wordRows = h.elements.get('progress-word-list').children;
  const kireiRow = wordRows.find(row => row.dataset.word === '綺麗');
  assert.ok(kireiRow);
  const knownBtn = kireiRow.querySelectorAll('button').find(btn => btn.dataset.statusValue === 'known');
  knownBtn.click();
  await h.worker.drain();
  await flush();
  assert.equal(h.storage.state.linguaplay_word_status['綺麗'], 'known');
  assert.equal(h.elements.get('progress-known-count').textContent, '2');
  assert.equal(h.elements.get('progress-new-count').textContent, '0');

  // Filter vocabulary by search
  const search = h.elements.get('progress-word-search');
  search.value = '世界';
  search.dispatchEvent({ type: 'input' });
  assert.equal(h.elements.get('progress-word-list').children.length, 1);
  assert.equal(h.elements.get('progress-word-list').children[0].dataset.word, '世界');
  search.value = '';
  search.dispatchEvent({ type: 'input' });

  // Remove explicit status for 猫
  const nekoRow = h.elements.get('progress-word-list').children.find(row => row.dataset.word === '猫');
  const removeBtn = nekoRow.querySelectorAll('button').find(btn => btn.className.includes('progress-remove-btn'));
  removeBtn.click();
  await h.worker.drain();
  await flush();
  assert.equal(h.storage.state.linguaplay_word_status['猫'], undefined);
  assert.equal(h.elements.get('progress-known-count').textContent, '1');

  // Filter grammar by JLPT level N4
  const n4Pill = h.elements.get('progress-grammar-levels').children.find(btn => btn.dataset.level === 'N4');
  n4Pill.click();
  assert.equal(h.elements.get('progress-grammar-list').children.length, 1);
  assert.equal(h.elements.get('progress-grammar-list').children[0].dataset.patternId, 'n4-shika-nai');

  // Export JSON backup
  h.elements.get('export-progress-btn').click();
  await flush();
  assert.equal(h.blobs.length, 1);
  const exported = JSON.parse(await h.blobs[0].text());
  assert.equal(exported.app, 'LinguaPlay');
  assert.deepEqual(exported.wordStatus, { '綺麗': 'known' });
  assert.equal(exported.grammarSeen['n4-shika-nai'].count, 3);

  // Import JSON backup (merge mode)
  const fileInput = h.elements.get('progress-import-file');
  const incomingJson = JSON.stringify({
    version: 1,
    wordStatus: { '図書館': 'learning' },
    grammarSeen: { 'n5-te-iru': { count: 4, lastSeen: 5000, example: '今食べている' } }
  });
  fileInput.files = [{ size: incomingJson.length, text: async () => incomingJson }];
  fileInput.dispatchEvent({ type: 'change' });
  await flush();
  await h.worker.drain();
  await flush();
  assert.equal(h.storage.state.linguaplay_word_status['図書館'], 'learning');
  assert.equal(h.storage.state.linguaplay_grammar_seen['n5-te-iru'].count, 4);
  assert.equal(h.elements.get('progress-grammar-seen-count').textContent, `3 / ${grammar.PATTERNS.length}`);

  // Live storage update from another tab refreshes counts automatically
  await h.worker.request({ action: 'SET_WORD_STATUS', word: '電車', status: 'known' }, videoSender);
  await h.worker.drain();
  await flush();
  assert.equal(h.elements.get('progress-known-count').textContent, '2');
});

test('large multibyte backup round-trips cleanly between export and import', () => {
  const bigWords = {};
  for (let i = 0; i < 30000; i++) {
    const suffix = String(i).padStart(6, '0');
    bigWords['語'.repeat(58) + suffix] = i % 3 === 0 ? 'known' : i % 3 === 1 ? 'learning' : 'new';
  }
  const backup = buildProgressBackup(bigWords, {
    'n4-shika-nai': { count: 2, lastSeen: 1700000000000, example: '水しか飲まない' }
  });
  const text = serializeProgressBackup(backup);
  const parsed = parseProgressBackup(text);
  assert.equal(Object.keys(parsed.wordStatus).length, 30000);
  assert.equal(parsed.grammarSeen['n4-shika-nai'].count, 2);
});

test('reimporting a backup with omitted or explicit timestamps is strictly idempotent and rejects fractional lastSeen', async () => {
  const s = storage();
  const worker = background(s);

  for (const badLastSeen of [0.1, 12.5, -1, NaN, Infinity]) {
    const res = await worker.request({
      action: 'IMPORT_PROGRESS',
      mode: 'merge',
      data: { grammarSeen: { 'n4-shika-nai': { count: 1, lastSeen: badLastSeen } } }
    }, optionsSender);
    assert.equal(res.success, false, `lastSeen=${badLastSeen} should fail`);
  }

  const payload = {
    wordStatus: { '猫': 'known' },
    grammarSeen: {
      'n4-shika-nai': { count: 2, example: '水しか飲まない' },
      'n5-te-iru': { count: 5, lastSeen: 1700000000000, example: '食べている' }
    }
  };

  assert.equal((await worker.request({ action: 'IMPORT_PROGRESS', mode: 'merge', data: payload }, optionsSender)).success, true);
  const afterFirstMerge = JSON.parse(JSON.stringify(s.state));
  assert.equal(afterFirstMerge.linguaplay_grammar_seen['n4-shika-nai'].lastSeen, 0);

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await worker.request({ action: 'IMPORT_PROGRESS', mode: 'merge', data: payload }, optionsSender)).success, true);
  assert.deepEqual(s.state, afterFirstMerge, 'second merge import must leave stored state identical');

  assert.equal((await worker.request({ action: 'IMPORT_PROGRESS', mode: 'replace', data: payload }, optionsSender)).success, true);
  const afterFirstReplace = JSON.parse(JSON.stringify(s.state));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await worker.request({ action: 'IMPORT_PROGRESS', mode: 'replace', data: payload }, optionsSender)).success, true);
  assert.deepEqual(s.state, afterFirstReplace, 'second replace import must leave stored state identical');
});

test('worker preserves entry-level corrupt maps without overwriting or dropping forbidden keys', async () => {
  // Corrupt grammar entry inside valid outer object
  const badGrammar = storage({ linguaplay_grammar_seen: { 'n4-shika-nai': { count: 'bad' } } });
  const bgGrammar = background(badGrammar);
  assert.equal((await bgGrammar.request({ action: 'RECORD_GRAMMAR_SEEN', patternIds: ['n5-te-iru'] }, videoSender)).success, false);
  assert.equal((await bgGrammar.request({ action: 'IMPORT_PROGRESS', mode: 'merge', data: { grammarSeen: { 'n5-te-iru': { count: 1 } } } }, optionsSender)).success, false);
  assert.deepEqual(badGrammar.state.linguaplay_grammar_seen, { 'n4-shika-nai': { count: 'bad' } });

  // Corrupt word status entry (invalid status value)
  const badWordVal = storage({ linguaplay_word_status: { '猫': 'mastered' } });
  const bgWordVal = background(badWordVal);
  assert.equal((await bgWordVal.request({ action: 'SET_WORD_STATUS', word: '犬', status: 'known' }, videoSender)).success, false);
  assert.equal((await bgWordVal.request({ action: 'REMOVE_WORD_STATUS', word: '犬' }, optionsSender)).success, false);
  assert.deepEqual(badWordVal.state.linguaplay_word_status, { '猫': 'mastered' });

  // Own __proto__ key in stored word status map
  const protoMap = JSON.parse('{"__proto__":"known","猫":"known"}');
  const badProto = storage({ linguaplay_word_status: protoMap });
  const bgProto = background(badProto);
  assert.equal((await bgProto.request({ action: 'SET_WORD_STATUS', word: '犬', status: 'known' }, videoSender)).success, false);
  assert.equal(Object.prototype.hasOwnProperty.call(badProto.state.linguaplay_word_status, '__proto__'), true);
});

test('Study retries grammar logging after a failed worker write', async () => {
  let attempts = 0;
  const h = await create({}, {
    message: request => {
      if (request.action !== 'RECORD_GRAMMAR_SEEN') return undefined;
      attempts++;
      if (attempts === 1) return { success: false, error: 'quota' };
      return h.worker.request(request);
    }
  });
  h.window.LinguaPlayGrammar = grammar;
  await flush();

  h.select('日本語', '日本語しか勉強していない');
  await flush();
  assert.equal(attempts, 1);
  assert.equal(h.storage.state.linguaplay_grammar_seen, undefined);

  // Reopening the same sentence retries and persists once the failure clears
  h.select('勉強', '日本語しか勉強していない');
  await h.worker.drain();
  await flush();
  assert.equal(attempts, 2);
  assert.equal(h.storage.state.linguaplay_grammar_seen['n4-shika-nai'].count, 1);

  // Subsequent click on the same sentence is deduplicated now that it succeeded
  h.select('日本語', '日本語しか勉強していない');
  await flush();
  assert.equal(attempts, 2);
});

test('delayed older clear acknowledgement cannot overwrite a newer live storage snapshot', async () => {
  const s = storage({
    linguaplay_grammar_seen: { 'n4-shika-nai': { count: 2, lastSeen: 1000, example: '水しか飲まない' } }
  });
  const bg = background(s);
  const d = dom();
  const ids = [
    'progress-settings',
    'progress-known-count', 'progress-learning-count', 'progress-new-count', 'progress-grammar-seen-count',
    'progress-status-text',
    'progress-word-search', 'progress-word-filter', 'progress-word-list', 'progress-word-empty',
    'progress-word-more', 'progress-word-count-note',
    'export-progress-btn', 'import-progress-btn', 'progress-import-mode', 'progress-import-file', 'clear-vocab-btn',
    'progress-grammar-levels', 'progress-grammar-search', 'progress-grammar-scope',
    'progress-grammar-list', 'progress-grammar-empty', 'progress-grammar-more', 'progress-grammar-count-note',
    'clear-grammar-btn'
  ];
  for (const id of ids) {
    const el = d.document.createElement(id.endsWith('-list') ? 'ul' : id.endsWith('-btn') ? 'button' : 'div');
    el.id = id;
    if (id === 'progress-word-filter') el.value = 'all';
    if (id === 'progress-grammar-scope') el.value = 'seen';
    d.document.body.appendChild(el);
  }
  const listeners = [];
  const rawSet = s.api.set;
  s.api.set = (values, cb) => rawSet(values, () => {
    const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }]));
    for (const fn of listeners) fn(changes, 'local');
    cb?.();
  });
  let finishClearReply;
  const runtime = {
    id: 'fixture-extension',
    sendMessage: (message, cb) => {
      if (message.action === 'CLEAR_GRAMMAR_SEEN') {
        bg.request(message, optionsSender).then(res => {
          finishClearReply = () => cb(res);
        });
        return;
      }
      bg.request(message, optionsSender).then(cb);
    }
  };
  await mountProgressDashboard({
    ...d, ...d.clock,
    chrome: { runtime, storage: { local: s.api, onChanged: { addListener: fn => listeners.push(fn) } } },
    confirm: () => true,
    grammar
  });

  // Trigger clear; worker clears storage, then BEFORE reply arrives another tab records a new encounter
  d.elements.get('clear-grammar-btn').click();
  await bg.drain();
  await flush();
  assert.equal(typeof finishClearReply, 'function');

  await bg.request({ action: 'RECORD_GRAMMAR_SEEN', patternIds: ['n5-te-iru'], example: '食べている' }, videoSender);
  await bg.drain();
  await flush();
  assert.equal(d.elements.get('progress-grammar-seen-count').textContent, `1 / ${grammar.PATTERNS.length}`);

  // Deliver the delayed clear reply now — newer grammar encounter MUST survive
  finishClearReply();
  await flush();
  assert.equal(d.elements.get('progress-grammar-seen-count').textContent, `1 / ${grammar.PATTERNS.length}`);
  assert.equal(d.elements.get('progress-grammar-list').children[0].dataset.patternId, 'n5-te-iru');
});

test('saved cards over 64 characters stay in Learning count with explicit controls safely disabled', async () => {
  const longPhrase = 'あ'.repeat(65);
  const vocab = buildVocabularyEntries({}, [{ word: longPhrase }]);
  assert.equal(vocab.counts.learning, 1);
  assert.equal(vocab.entries[0].word, longPhrase);
  assert.equal(vocab.entries[0].canSetStatus, false);

  const h = createDashboardFixture({ linguaplay_cards: [{ word: longPhrase }] });
  await mountProgressDashboard(h.env);
  assert.equal(h.elements.get('progress-learning-count').textContent, '1');
  const row = h.elements.get('progress-word-list').children[0];
  assert.equal(row.dataset.word, longPhrase);
  const buttons = row.querySelectorAll('button');
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every(btn => btn.disabled), 'over-64-char card buttons should be disabled');
});

test('50,000-word cap preserves newly merged or updated numeric-like keys in insertion order', async () => {
  const full = {};
  for (let i = 0; i < 50000; i++) {
    full[`w${i}`] = 'known';
  }
  const s = storage({ linguaplay_word_status: full });
  const worker = background(s);

  const merged = await worker.request({
    action: 'IMPORT_PROGRESS',
    mode: 'merge',
    data: { wordStatus: { '123': 'learning' } }
  }, optionsSender);
  assert.equal(merged.success, true);
  assert.equal(merged.importedWords, 1);
  assert.equal(merged.totalWords, 50000);
  assert.equal(s.state.linguaplay_word_status['123'], 'learning', 'numeric-like merged word must not be evicted');
  assert.equal(s.state.linguaplay_word_status['w0'], undefined, 'oldest entry should be evicted instead');

  const updated = await worker.request({
    action: 'SET_WORD_STATUS',
    word: '456',
    status: 'known'
  }, videoSender);
  assert.equal(updated.success, true);
  assert.equal(s.state.linguaplay_word_status['123'], 'learning', 'earlier numeric-like word must survive subsequent writes');
  assert.equal(s.state.linguaplay_word_status['456'], 'known', 'numeric-like SET_WORD_STATUS word must not be evicted');
  assert.equal(s.state.linguaplay_word_status['w1'], undefined, 'second oldest entry should be evicted instead of 123');
  assert.equal(Object.keys(s.state.linguaplay_word_status).length, 50000);

  // A third write continues evicting oldest non-numeric entries while preserving both 123 and 456
  const third = await worker.request({
    action: 'SET_WORD_STATUS',
    word: '789',
    status: 'new'
  }, videoSender);
  assert.equal(third.success, true);
  assert.equal(s.state.linguaplay_word_status['123'], 'learning');
  assert.equal(s.state.linguaplay_word_status['456'], 'known');
  assert.equal(s.state.linguaplay_word_status['789'], 'new');
  assert.equal(s.state.linguaplay_word_status['w2'], undefined);
  assert.equal(Object.keys(s.state.linguaplay_word_status).length, 50000);
});

test('a grammar-only storage event during initial load does not leave vocabulary blank', async () => {
  const d = dom();
  const ids = [
    'progress-settings',
    'progress-known-count', 'progress-learning-count', 'progress-new-count', 'progress-grammar-seen-count',
    'progress-status-text',
    'progress-word-search', 'progress-word-filter', 'progress-word-list', 'progress-word-empty',
    'progress-word-more', 'progress-word-count-note',
    'export-progress-btn', 'import-progress-btn', 'progress-import-mode', 'progress-import-file', 'clear-vocab-btn',
    'progress-grammar-levels', 'progress-grammar-search', 'progress-grammar-scope',
    'progress-grammar-list', 'progress-grammar-empty', 'progress-grammar-more', 'progress-grammar-count-note',
    'clear-grammar-btn'
  ];
  for (const id of ids) {
    const el = d.document.createElement(id.endsWith('-list') ? 'ul' : id.endsWith('-btn') ? 'button' : 'div');
    el.id = id;
    if (id === 'progress-word-filter') el.value = 'all';
    if (id === 'progress-grammar-scope') el.value = 'seen';
    d.document.body.appendChild(el);
  }
  const listeners = [];
  let resolveInitialGet;
  const local = {
    get: (_keys, cb) => {
      resolveInitialGet = () => cb({
        linguaplay_word_status: { '猫': 'known', '犬': 'new' },
        linguaplay_cards: [{ word: '世界' }],
        linguaplay_grammar_seen: { 'n4-shika-nai': { count: 1, lastSeen: 1000, example: '古い例' } }
      });
    }
  };
  const mountPromise = mountProgressDashboard({
    ...d, ...d.clock,
    chrome: {
      runtime: { id: 'fixture-extension', sendMessage: (_m, cb) => cb({ success: true }) },
      storage: { local, onChanged: { addListener: fn => listeners.push(fn) } }
    },
    confirm: () => true,
    grammar
  });

  // Deliver a grammar-only live update BEFORE initial storageGet finishes
  for (const fn of listeners) {
    fn({
      linguaplay_grammar_seen: {
        newValue: { 'n4-shika-nai': { count: 2, lastSeen: 2000, example: '新しい例' } }
      }
    }, 'local');
  }
  resolveInitialGet();
  await mountPromise;

  // Vocabulary from initial load must appear AND newer grammar update must not be overwritten
  assert.equal(d.elements.get('progress-known-count').textContent, '1');
  assert.equal(d.elements.get('progress-learning-count').textContent, '1');
  assert.equal(d.elements.get('progress-new-count').textContent, '1');
  assert.match(d.elements.get('progress-grammar-list').children[0].textContent, /Seen 2×/);
});

test('delayed word status reply does not steal keyboard focus if user moved focus elsewhere', async () => {
  const s = storage({ linguaplay_word_status: { '綺麗': 'new', '猫': 'known' } });
  const bg = background(s);
  const d = dom();
  // Wire minimal focus tracking onto fake document elements
  d.document.activeElement = d.document.body;
  const origCreate = d.document.createElement.bind(d.document);
  d.document.createElement = tag => {
    const el = origCreate(tag);
    el.focus = () => { d.document.activeElement = el; };
    return el;
  };
  const ids = [
    'progress-settings',
    'progress-known-count', 'progress-learning-count', 'progress-new-count', 'progress-grammar-seen-count',
    'progress-status-text',
    'progress-word-search', 'progress-word-filter', 'progress-word-list', 'progress-word-empty',
    'progress-word-more', 'progress-word-count-note',
    'export-progress-btn', 'import-progress-btn', 'progress-import-mode', 'progress-import-file', 'clear-vocab-btn',
    'progress-grammar-levels', 'progress-grammar-search', 'progress-grammar-scope',
    'progress-grammar-list', 'progress-grammar-empty', 'progress-grammar-more', 'progress-grammar-count-note',
    'clear-grammar-btn'
  ];
  for (const id of ids) {
    const el = d.document.createElement(id.endsWith('-list') ? 'ul' : id.endsWith('-btn') ? 'button' : 'div');
    el.id = id;
    if (id === 'progress-word-filter') el.value = 'all';
    if (id === 'progress-grammar-scope') el.value = 'seen';
    d.document.body.appendChild(el);
  }
  let finishWordReply;
  const runtime = {
    id: 'fixture-extension',
    sendMessage: (message, cb) => {
      bg.request(message, optionsSender).then(res => { finishWordReply = () => cb(res); });
    }
  };
  await mountProgressDashboard({
    ...d, ...d.clock,
    chrome: { runtime, storage: { local: s.api, onChanged: { addListener() {} } } },
    confirm: () => true,
    grammar
  });

  const kireiRow = d.elements.get('progress-word-list').children.find(r => r.dataset.word === '綺麗');
  const knownBtn = kireiRow.querySelectorAll('button').find(b => b.dataset.statusValue === 'known');
  knownBtn.focus();
  knownBtn.click();
  await bg.drain();
  await flush();

  // User moves focus to search input before the delayed reply arrives
  const searchEl = d.elements.get('progress-word-search');
  searchEl.focus();
  assert.equal(d.document.activeElement, searchEl);

  finishWordReply();
  await flush();
  assert.equal(d.document.activeElement, searchEl, 'Delayed reply must not pull focus away from search input');
});

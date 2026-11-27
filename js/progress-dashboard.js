(function (root) {
  'use strict';

  const WORD_STATUS_KEY = 'linguaplay_word_status';
  const CARDS_KEY = 'linguaplay_cards';
  const GRAMMAR_SEEN_KEY = 'linguaplay_grammar_seen';
  const VALID_STATUSES = ['new', 'learning', 'known'];
  const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  // 50,000 64-char multibyte Japanese words + 500 grammar entries fits comfortably under 20 MiB.
  const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
  const WORD_PAGE_SIZE = 60;
  const GRAMMAR_PAGE_SIZE = 40;

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanWord(word) {
    if (typeof word !== 'string' || word.length > 64 || /[\r\n]/.test(word)) return '';
    const trimmed = word.trim();
    if (!trimmed || FORBIDDEN_KEYS.has(trimmed)) return '';
    return trimmed;
  }

  function cleanCardWord(word) {
    return typeof word === 'string' ? word.trim() : '';
  }

  function isValidGrammarId(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && !FORBIDDEN_KEYS.has(id);
  }

  function cleanExample(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  }

  function isStoredWordStatusCorrupt(value) {
    if (value === undefined) return false;
    if (!isPlainObject(value)) return true;
    for (const key of Object.getOwnPropertyNames(value)) {
      const clean = cleanWord(key);
      if (!clean || clean !== key || !VALID_STATUSES.includes(value[key])) return true;
    }
    return false;
  }

  function isStoredGrammarSeenCorrupt(value) {
    if (value === undefined) return false;
    if (!isPlainObject(value)) return true;
    for (const key of Object.getOwnPropertyNames(value)) {
      const entry = value[key];
      if (!isValidGrammarId(key) || !isPlainObject(entry)) return true;
      if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 1000000) return true;
      if (entry.lastSeen !== undefined && (!Number.isSafeInteger(entry.lastSeen) || entry.lastSeen < 0)) return true;
      if (entry.example !== undefined && typeof entry.example !== 'string') return true;
    }
    return false;
  }

  function buildVocabularyEntries(wordStatus, cards) {
    const entries = [];
    const seen = new Set();
    const counts = { known: 0, learning: 0, new: 0, total: 0, explicitCount: 0, cardDerivedCount: 0 };

    if (isPlainObject(wordStatus)) {
      const pairs = Object.entries(wordStatus).reverse();
      for (const [rawWord, status] of pairs) {
        const word = cleanWord(rawWord);
        if (!word || !VALID_STATUSES.includes(status) || seen.has(word)) continue;
        seen.add(word);
        entries.push({ word, status, source: 'explicit', canSetStatus: true });
        counts[status]++;
        counts.explicitCount++;
      }
    }

    if (Array.isArray(cards)) {
      for (let i = cards.length - 1; i >= 0; i--) {
        const word = cleanCardWord(cards[i]?.word);
        if (!word || seen.has(word)) continue;
        seen.add(word);
        entries.push({ word, status: 'learning', source: 'card', canSetStatus: Boolean(cleanWord(word)) });
        counts.learning++;
        counts.cardDerivedCount++;
      }
    }

    counts.total = entries.length;
    return { entries, counts };
  }

  function buildGrammarSummary(patterns, grammarSeen) {
    const catalog = Array.isArray(patterns) ? patterns : [];
    const seenMap = isPlainObject(grammarSeen) ? grammarSeen : {};
    const levelStats = Object.fromEntries(JLPT_LEVELS.map(level => [level, { level, seen: 0, total: 0 }]));
    const items = [];
    let seenCount = 0;

    for (const pattern of catalog) {
      if (!pattern || typeof pattern.id !== 'string' || !levelStats[pattern.level]) continue;
      levelStats[pattern.level].total++;
      const raw = Object.prototype.hasOwnProperty.call(seenMap, pattern.id) ? seenMap[pattern.id] : null;
      const validSeen = isPlainObject(raw) && Number.isInteger(raw.count) && raw.count > 0;
      const count = validSeen ? raw.count : 0;
      const lastSeen = validSeen && Number.isSafeInteger(raw.lastSeen) && raw.lastSeen >= 0 ? raw.lastSeen : 0;
      const example = validSeen ? cleanExample(raw.example) : '';
      if (validSeen) {
        seenCount++;
        levelStats[pattern.level].seen++;
      }
      items.push({
        id: pattern.id,
        level: pattern.level,
        pattern: pattern.pattern || '',
        reading: pattern.reading || '',
        meaning: pattern.meaning || '',
        structure: pattern.structure || '',
        note: pattern.note || '',
        seen: validSeen,
        count,
        lastSeen,
        example
      });
    }

    return {
      levels: JLPT_LEVELS.map(level => levelStats[level]),
      items,
      seenCount,
      totalCount: items.length
    };
  }

  function buildProgressBackup(wordStatus, grammarSeen, now = new Date()) {
    const cleanWords = {};
    if (isPlainObject(wordStatus)) {
      for (const [rawWord, status] of Object.entries(wordStatus)) {
        const word = cleanWord(rawWord);
        if (word && VALID_STATUSES.includes(status)) cleanWords[word] = status;
      }
    }
    const cleanGrammar = {};
    if (isPlainObject(grammarSeen)) {
      for (const [id, entry] of Object.entries(grammarSeen)) {
        if (!isValidGrammarId(id)) continue;
        if (!isPlainObject(entry) || !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 1000000) continue;
        cleanGrammar[id] = {
          count: entry.count,
          lastSeen: Number.isSafeInteger(entry.lastSeen) && entry.lastSeen >= 0 ? entry.lastSeen : 0,
          example: cleanExample(entry.example)
        };
      }
    }
    return {
      version: 1,
      app: 'LinguaPlay',
      exportedAt: now.toISOString(),
      wordStatus: cleanWords,
      grammarSeen: cleanGrammar
    };
  }

  function serializeProgressBackup(backup) {
    const wordCount = isPlainObject(backup?.wordStatus) ? Object.keys(backup.wordStatus).length : 0;
    return wordCount > 1000 ? JSON.stringify(backup) : JSON.stringify(backup, null, 2);
  }

  function parseProgressBackup(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('The selected backup file is empty.');
    const byteLength = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
    if (byteLength > MAX_IMPORT_BYTES) throw new Error('Backup file is larger than 20 MB.');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Could not read JSON from this file.');
    }
    if (!isPlainObject(parsed)) throw new Error('Backup file must contain a JSON object.');
    const hasWords = Object.prototype.hasOwnProperty.call(parsed, 'wordStatus') && parsed.wordStatus !== undefined;
    const hasGrammar = Object.prototype.hasOwnProperty.call(parsed, 'grammarSeen') && parsed.grammarSeen !== undefined;
    if (!hasWords && !hasGrammar) {
      throw new Error('Backup file has no vocabulary or grammar progress.');
    }
    const payload = {};
    if (hasWords) payload.wordStatus = parsed.wordStatus;
    if (hasGrammar) payload.grammarSeen = parsed.grammarSeen;
    return payload;
  }

  function storageGet(chrome, keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, result => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function sendWorkerMessage(chrome, message, setTimeoutFn, clearTimeoutFn) {
    return new Promise(resolve => {
      const timer = setTimeoutFn(() => resolve({ success: false, error: 'Timed out waiting for extension storage.' }), 8000);
      try {
        chrome.runtime.sendMessage(message, result => {
          clearTimeoutFn(timer);
          const error = chrome.runtime?.lastError;
          resolve(error ? { success: false, error: error.message } : result || { success: false, error: 'No response from extension.' });
        });
      } catch (error) {
        clearTimeoutFn(timer);
        resolve({ success: false, error: error.message });
      }
    });
  }

  async function mountProgressDashboard(env) {
    const {
      document,
      chrome,
      URL: UrlCtor = globalThis.URL,
      Blob: BlobCtor = globalThis.Blob,
      confirm: confirmFn = globalThis.confirm,
      setTimeout: setTimeoutFn = globalThis.setTimeout,
      clearTimeout: clearTimeoutFn = globalThis.clearTimeout,
      grammar = root.LinguaPlayGrammar
    } = env;

    const section = document.getElementById('progress-settings');
    if (!section) return null;

    const knownCountEl = document.getElementById('progress-known-count');
    const learningCountEl = document.getElementById('progress-learning-count');
    const newCountEl = document.getElementById('progress-new-count');
    const grammarCountEl = document.getElementById('progress-grammar-seen-count');
    const statusTextEl = document.getElementById('progress-status-text');

    const wordSearchEl = document.getElementById('progress-word-search');
    const wordFilterEl = document.getElementById('progress-word-filter');
    const wordListEl = document.getElementById('progress-word-list');
    const wordEmptyEl = document.getElementById('progress-word-empty');
    const wordMoreBtn = document.getElementById('progress-word-more');
    const wordCountNoteEl = document.getElementById('progress-word-count-note');

    const exportBtn = document.getElementById('export-progress-btn');
    const importBtn = document.getElementById('import-progress-btn');
    const importModeEl = document.getElementById('progress-import-mode');
    const importFileEl = document.getElementById('progress-import-file');
    const clearVocabBtn = document.getElementById('clear-vocab-btn');

    const grammarLevelBarEl = document.getElementById('progress-grammar-levels');
    const grammarSearchEl = document.getElementById('progress-grammar-search');
    const grammarScopeEl = document.getElementById('progress-grammar-scope');
    const grammarListEl = document.getElementById('progress-grammar-list');
    const grammarEmptyEl = document.getElementById('progress-grammar-empty');
    const grammarMoreBtn = document.getElementById('progress-grammar-more');
    const grammarCountNoteEl = document.getElementById('progress-grammar-count-note');
    const clearGrammarBtn = document.getElementById('clear-grammar-btn');

    const patterns = Array.isArray(grammar?.PATTERNS) ? grammar.PATTERNS : [];

    let rawWordStatus = {};
    let rawCards = [];
    let rawGrammarSeen = {};
    let corruptWordStatus = false;
    let corruptGrammarSeen = false;
    let wordLimit = WORD_PAGE_SIZE;
    let grammarLimit = GRAMMAR_PAGE_SIZE;
    let selectedLevel = 'ALL';
    let busyAction = false;
    const keyVersions = {
      [WORD_STATUS_KEY]: 0,
      [CARDS_KEY]: 0,
      [GRAMMAR_SEEN_KEY]: 0
    };
    let pendingFocusRestore = null;
    const pendingWords = new Set();

    function setStatus(text, tone = 'info') {
      if (!statusTextEl) return;
      statusTextEl.textContent = text;
      statusTextEl.style.color = tone === 'muted' ? 'var(--muted)' : `var(--status-${tone})`;
    }

    function applyStorageSnapshot(data) {
      let vocabChanged = false;
      let grammarChanged = false;
      if (Object.prototype.hasOwnProperty.call(data, WORD_STATUS_KEY)) {
        const val = data[WORD_STATUS_KEY];
        corruptWordStatus = isStoredWordStatusCorrupt(val);
        rawWordStatus = isPlainObject(val) ? val : {};
        vocabChanged = true;
      }
      if (Object.prototype.hasOwnProperty.call(data, CARDS_KEY)) {
        rawCards = Array.isArray(data[CARDS_KEY]) ? data[CARDS_KEY] : [];
        vocabChanged = true;
      }
      if (Object.prototype.hasOwnProperty.call(data, GRAMMAR_SEEN_KEY)) {
        const val = data[GRAMMAR_SEEN_KEY];
        corruptGrammarSeen = isStoredGrammarSeenCorrupt(val);
        rawGrammarSeen = isPlainObject(val) ? val : {};
        grammarChanged = true;
      }
      return { vocabChanged, grammarChanged };
    }

    async function refreshFromStorage() {
      const readVersions = { ...keyVersions };
      try {
        const data = await storageGet(chrome, [WORD_STATUS_KEY, CARDS_KEY, GRAMMAR_SEEN_KEY]);
        // Only apply keys that did not receive a newer storage.onChanged while this read was in flight.
        const freshPatch = {};
        let appliedAny = false;
        for (const key of [WORD_STATUS_KEY, CARDS_KEY, GRAMMAR_SEEN_KEY]) {
          if (keyVersions[key] === readVersions[key]) {
            freshPatch[key] = data[key];
            appliedAny = true;
          }
        }
        if (!appliedAny) return;
        const { vocabChanged, grammarChanged } = applyStorageSnapshot(freshPatch);
        if (vocabChanged) renderVocabulary();
        if (grammarChanged) renderGrammar();
        renderBackupControls();
        if (corruptWordStatus || corruptGrammarSeen) {
          setStatus('Stored progress data looks invalid. Clear or replace it from a backup to repair.', 'error');
        }
      } catch (error) {
        setStatus(`Could not read saved progress: ${error.message}`, 'error');
      }
    }

    function isFocusElsewhere() {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) return false;
      if (!wordListEl) return true;
      for (const row of wordListEl.children) {
        const buttons = row.querySelectorAll ? [...row.querySelectorAll('button')] : [];
        if (buttons.includes(active)) return false;
      }
      return true;
    }

    function captureWordListFocus() {
      const active = document.activeElement;
      if (!active || !wordListEl) return null;
      const rows = [...wordListEl.children];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const buttons = row.querySelectorAll ? [...row.querySelectorAll('button')] : [];
        if (buttons.includes(active)) {
          return {
            word: row.dataset.word,
            role: active.dataset?.statusValue || (active.className?.includes('progress-remove-btn') ? 'remove' : ''),
            rowIndex: i
          };
        }
      }
      return null;
    }

    function restoreWordListFocus(target) {
      if (!target || !wordListEl) return;
      const rows = [...wordListEl.children];
      if (!rows.length) {
        wordSearchEl?.focus?.();
        return;
      }
      const sameRow = rows.find(row => row.dataset.word === target.word);
      const chosenRow = sameRow || rows[Math.min(target.rowIndex, rows.length - 1)];
      const buttons = chosenRow.querySelectorAll ? [...chosenRow.querySelectorAll('button')] : [];
      const enabled = buttons.filter(btn => !btn.disabled);
      if (!enabled.length) return;
      let match = null;
      if (sameRow && target.role === 'remove') {
        match = enabled.find(btn => btn.className?.includes('progress-remove-btn'));
      } else if (sameRow && target.role) {
        match = enabled.find(btn => btn.dataset?.statusValue === target.role);
      }
      (match || enabled[0]).focus?.();
    }

    function renderVocabulary() {
      const liveFocus = captureWordListFocus();
      if (!liveFocus && isFocusElsewhere()) {
        pendingFocusRestore = null;
      }
      const focusTarget = liveFocus || pendingFocusRestore;
      const { entries, counts } = buildVocabularyEntries(rawWordStatus, rawCards);
      if (knownCountEl) knownCountEl.textContent = counts.known.toLocaleString();
      if (learningCountEl) learningCountEl.textContent = counts.learning.toLocaleString();
      if (newCountEl) newCountEl.textContent = counts.new.toLocaleString();
      if (clearVocabBtn) clearVocabBtn.disabled = busyAction || (!corruptWordStatus && counts.explicitCount === 0);

      const query = (wordSearchEl?.value || '').trim().toLowerCase();
      const filter = wordFilterEl?.value || 'all';
      const filtered = entries.filter(item => {
        if (filter !== 'all' && item.status !== filter) return false;
        if (query && !item.word.toLowerCase().includes(query)) return false;
        return true;
      });

      if (wordCountNoteEl) {
        if (!counts.total) {
          wordCountNoteEl.textContent = '0 tracked words';
        } else if (filtered.length === counts.total) {
          wordCountNoteEl.textContent = counts.total === 1 ? '1 tracked word' : `${counts.total.toLocaleString()} tracked words`;
        } else {
          wordCountNoteEl.textContent = `Showing ${filtered.length.toLocaleString()} of ${counts.total.toLocaleString()} tracked words`;
        }
      }

      if (!wordListEl) return;
      wordListEl.innerHTML = '';

      if (!filtered.length) {
        if (wordEmptyEl) {
          wordEmptyEl.hidden = false;
          wordEmptyEl.textContent = counts.total === 0
            ? 'No tracked words yet. Click a word in a Japanese subtitle and choose New, Learning, or Known in Study.'
            : 'No tracked words match this search or filter.';
        }
        if (wordMoreBtn) wordMoreBtn.hidden = true;
        if (focusTarget && !pendingWords.size) {
          pendingFocusRestore = null;
          restoreWordListFocus(focusTarget);
        }
        return;
      }

      if (wordEmptyEl) wordEmptyEl.hidden = true;
      const visible = filtered.slice(0, wordLimit);

      for (const item of visible) {
        const row = document.createElement('li');
        row.className = 'progress-word-row';
        row.dataset.word = item.word;
        row.dataset.status = item.status;

        const info = document.createElement('div');
        info.className = 'progress-word-info';
        const wordSpan = document.createElement('span');
        wordSpan.className = 'progress-word-term';
        wordSpan.lang = 'ja';
        wordSpan.textContent = item.word;
        info.appendChild(wordSpan);

        if (item.source === 'card') {
          const tag = document.createElement('span');
          tag.className = 'progress-word-source';
          tag.textContent = 'From card';
          info.appendChild(tag);
        }

        const controls = document.createElement('div');
        controls.className = 'progress-word-controls';

        const seg = document.createElement('div');
        seg.className = 'progress-status-group';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', `Status for ${item.word}`);

        const isBusyWord = busyAction || pendingWords.has(item.word);
        const statusEditable = item.canSetStatus !== false;
        for (const [value, label] of [['new', 'New'], ['learning', 'Learning'], ['known', 'Known']]) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `progress-status-btn is-${value}`;
          btn.textContent = label;
          btn.dataset.statusValue = value;
          btn.setAttribute('aria-pressed', item.status === value ? 'true' : 'false');
          btn.disabled = isBusyWord || !statusEditable;
          if (!statusEditable) {
            btn.title = 'Explicit status is limited to words up to 64 characters.';
          }
          btn.addEventListener('click', () => updateWordStatus(item.word, value));
          seg.appendChild(btn);
        }
        controls.appendChild(seg);

        if (item.source === 'explicit') {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'btn-text progress-remove-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.setAttribute('aria-label', `Remove status for ${item.word}`);
          removeBtn.disabled = isBusyWord;
          removeBtn.addEventListener('click', () => removeWordStatus(item.word));
          controls.appendChild(removeBtn);
        } else {
          const spacer = document.createElement('span');
          spacer.className = 'progress-remove-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          controls.appendChild(spacer);
        }

        row.appendChild(info);
        row.appendChild(controls);
        wordListEl.appendChild(row);
      }

      if (wordMoreBtn) {
        const remaining = filtered.length - visible.length;
        wordMoreBtn.hidden = remaining <= 0;
        if (remaining > 0) {
          wordMoreBtn.textContent = `Show more (${remaining.toLocaleString()} remaining)`;
        }
      }

      if (focusTarget && !pendingWords.has(focusTarget.word)) {
        pendingFocusRestore = null;
        restoreWordListFocus(focusTarget);
      }
    }

    function renderGrammar() {
      const summary = buildGrammarSummary(patterns, rawGrammarSeen);
      if (grammarCountEl) {
        grammarCountEl.textContent = `${summary.seenCount} / ${summary.totalCount}`;
      }
      if (clearGrammarBtn) {
        clearGrammarBtn.disabled = busyAction || (!corruptGrammarSeen && Object.keys(rawGrammarSeen).length === 0);
      }

      if (grammarLevelBarEl) {
        const pills = [
          { key: 'ALL', label: `All (${summary.seenCount}/${summary.totalCount})` },
          ...summary.levels.map(item => ({ key: item.level, label: `${item.level} ${item.seen}/${item.total}` }))
        ];
        const existingButtons = new Map();
        for (const child of grammarLevelBarEl.children) {
          if (child?.dataset?.level) existingButtons.set(child.dataset.level, child);
        }
        if (existingButtons.size !== pills.length || pills.some(pill => !existingButtons.has(pill.key))) {
          grammarLevelBarEl.innerHTML = '';
          for (const pill of pills) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'grammar-level-pill';
            btn.dataset.level = pill.key;
            btn.addEventListener('click', () => {
              selectedLevel = pill.key;
              grammarLimit = GRAMMAR_PAGE_SIZE;
              renderGrammar();
            });
            grammarLevelBarEl.appendChild(btn);
            existingButtons.set(pill.key, btn);
          }
        }
        for (const pill of pills) {
          const btn = existingButtons.get(pill.key);
          btn.setAttribute('aria-pressed', selectedLevel === pill.key ? 'true' : 'false');
          btn.textContent = pill.label;
        }
      }

      const scope = grammarScopeEl?.value || 'seen';
      const query = (grammarSearchEl?.value || '').trim().toLowerCase();
      let filtered = summary.items.filter(item => {
        if (selectedLevel !== 'ALL' && item.level !== selectedLevel) return false;
        if (scope === 'seen' && !item.seen) return false;
        if (scope === 'unseen' && item.seen) return false;
        if (query) {
          const haystack = `${item.pattern} ${item.reading} ${item.meaning} ${item.structure} ${item.example}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      if (scope === 'seen') {
        filtered = [...filtered].sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count);
      }

      if (grammarCountNoteEl) {
        grammarCountNoteEl.textContent = filtered.length === 1
          ? '1 grammar pattern shown'
          : `${filtered.length} grammar patterns shown`;
      }

      if (!grammarListEl) return;
      grammarListEl.innerHTML = '';

      if (!filtered.length) {
        if (grammarEmptyEl) {
          grammarEmptyEl.hidden = false;
          if (scope === 'seen' && summary.seenCount === 0 && !query) {
            grammarEmptyEl.textContent = 'No grammar patterns logged yet. Open Study on a Japanese subtitle line to log patterns automatically, or switch the filter to All patterns.';
          } else {
            grammarEmptyEl.textContent = 'No grammar patterns match this filter.';
          }
        }
        if (grammarMoreBtn) grammarMoreBtn.hidden = true;
        return;
      }

      if (grammarEmptyEl) grammarEmptyEl.hidden = true;
      const visible = filtered.slice(0, grammarLimit);

      for (const item of visible) {
        const row = document.createElement('li');
        row.className = 'progress-grammar-row';
        row.dataset.patternId = item.id;
        row.dataset.level = item.level;

        const top = document.createElement('div');
        top.className = 'progress-grammar-top';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'progress-grammar-title';

        const badge = document.createElement('span');
        badge.className = `progress-jlpt-badge is-${item.level.toLowerCase()}`;
        badge.textContent = item.level;

        const patternEl = document.createElement('strong');
        patternEl.className = 'progress-grammar-pattern';
        patternEl.lang = 'ja';
        patternEl.textContent = item.pattern;

        const readingEl = document.createElement('span');
        readingEl.className = 'progress-grammar-reading';
        readingEl.lang = 'ja-Latn';
        readingEl.textContent = item.reading;

        titleWrap.appendChild(badge);
        titleWrap.appendChild(patternEl);
        titleWrap.appendChild(readingEl);

        const countBadge = document.createElement('span');
        countBadge.className = item.seen ? 'progress-grammar-seen is-seen' : 'progress-grammar-seen';
        countBadge.textContent = item.seen ? `Seen ${item.count}×` : 'Not seen yet';

        top.appendChild(titleWrap);
        top.appendChild(countBadge);
        row.appendChild(top);

        const meaningEl = document.createElement('p');
        meaningEl.className = 'progress-grammar-meaning';
        meaningEl.textContent = item.meaning;
        row.appendChild(meaningEl);

        if (item.structure) {
          const structEl = document.createElement('p');
          structEl.className = 'progress-grammar-meta';
          structEl.textContent = `Form: ${item.structure}`;
          row.appendChild(structEl);
        }

        if (item.seen && item.example) {
          const exEl = document.createElement('p');
          exEl.className = 'progress-grammar-example';
          exEl.lang = 'ja';
          exEl.textContent = `Last seen: 「${item.example}」`;
          row.appendChild(exEl);
        }

        grammarListEl.appendChild(row);
      }

      if (grammarMoreBtn) {
        const remaining = filtered.length - visible.length;
        grammarMoreBtn.hidden = remaining <= 0;
        if (remaining > 0) {
          grammarMoreBtn.textContent = `Show more (${remaining} remaining)`;
        }
      }
    }

    function renderBackupControls() {
      if (exportBtn) exportBtn.disabled = busyAction;
      if (importBtn) importBtn.disabled = busyAction;
      if (importModeEl) importModeEl.disabled = busyAction;
    }

    function renderAll() {
      renderVocabulary();
      renderGrammar();
      renderBackupControls();
    }

    async function updateWordStatus(word, status) {
      if (busyAction || pendingWords.has(word)) return;
      const captured = captureWordListFocus();
      if (captured) pendingFocusRestore = { ...captured, word, role: status };
      pendingWords.add(word);
      renderVocabulary();
      const result = await sendWorkerMessage(chrome, { action: 'SET_WORD_STATUS', word, status }, setTimeoutFn, clearTimeoutFn);
      pendingWords.delete(word);
      if (result.success) {
        const label = { new: 'New', learning: 'Learning', known: 'Known' }[status];
        setStatus(`Marked 「${word}」 as ${label}.`, 'success');
        renderVocabulary();
        await refreshFromStorage();
      } else {
        setStatus(`Could not update 「${word}」: ${result.error || 'Storage error'}`, 'error');
        renderVocabulary();
      }
    }

    async function removeWordStatus(word) {
      if (busyAction || pendingWords.has(word)) return;
      const captured = captureWordListFocus();
      if (captured) pendingFocusRestore = captured;
      pendingWords.add(word);
      renderVocabulary();
      const result = await sendWorkerMessage(chrome, { action: 'REMOVE_WORD_STATUS', word }, setTimeoutFn, clearTimeoutFn);
      pendingWords.delete(word);
      if (result.success) {
        renderVocabulary();
        await refreshFromStorage();
        const hasCard = rawCards.some(card => cleanCardWord(card?.word) === word);
        setStatus(
          hasCard
            ? `Removed explicit status for 「${word}」; still learning from saved cards.`
            : `Removed 「${word}」 from tracked vocabulary.`,
          'success'
        );
      } else {
        setStatus(`Could not remove 「${word}」: ${result.error || 'Storage error'}`, 'error');
        renderVocabulary();
      }
    }

    async function exportProgress() {
      if (busyAction) return;
      busyAction = true;
      renderAll();
      try {
        const data = await storageGet(chrome, [WORD_STATUS_KEY, GRAMMAR_SEEN_KEY]);
        const backup = buildProgressBackup(data[WORD_STATUS_KEY], data[GRAMMAR_SEEN_KEY]);
        const wordCount = Object.keys(backup.wordStatus).length;
        const grammarCount = Object.keys(backup.grammarSeen).length;
        const blob = new BlobCtor([serializeProgressBackup(backup)], { type: 'application/json;charset=utf-8' });
        const url = UrlCtor.createObjectURL(blob);
        try {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'linguaplay_progress.json';
          link.click();
        } finally {
          UrlCtor.revokeObjectURL(url);
        }
        setStatus(`Exported ${wordCount.toLocaleString()} tracked words and ${grammarCount} grammar patterns.`, 'success');
      } catch (error) {
        setStatus(`Export failed: ${error.message}`, 'error');
      } finally {
        busyAction = false;
        renderAll();
      }
    }

    async function handleImportFile(file) {
      if (!file || busyAction) return;
      const mode = importModeEl?.value === 'replace' ? 'replace' : 'merge';
      if (mode === 'replace' && !confirmFn('Replace your existing vocabulary statuses and grammar log with this backup file?')) {
        return;
      }
      busyAction = true;
      setStatus('Importing progress backup…', 'busy');
      renderAll();
      try {
        if (Number.isFinite(file.size) && file.size > MAX_IMPORT_BYTES) {
          throw new Error('Backup file is larger than 20 MB.');
        }
        const text = await file.text();
        const payload = parseProgressBackup(text);
        const result = await sendWorkerMessage(chrome, { action: 'IMPORT_PROGRESS', data: payload, mode }, setTimeoutFn, clearTimeoutFn);
        if (!result.success) throw new Error(result.error || 'Could not save imported progress.');
        await refreshFromStorage();
        const verb = mode === 'replace' ? 'Restored' : 'Merged';
        setStatus(`${verb} ${result.importedWords.toLocaleString()} words and ${result.importedGrammar} grammar patterns.`, 'success');
      } catch (error) {
        setStatus(`Import failed: ${error.message}`, 'error');
      } finally {
        busyAction = false;
        renderAll();
      }
    }

    async function clearVocabulary() {
      if (busyAction) return;
      if (!confirmFn('Clear all explicit vocabulary statuses (New, Learning, Known)? Saved flashcards will stay in your collection.')) return;
      busyAction = true;
      renderAll();
      try {
        const result = await sendWorkerMessage(chrome, { action: 'CLEAR_WORD_STATUS' }, setTimeoutFn, clearTimeoutFn);
        if (!result.success) throw new Error(result.error || 'Storage error');
        await refreshFromStorage();
        setStatus('Cleared tracked vocabulary statuses.', 'success');
      } catch (error) {
        setStatus(`Clear failed: ${error.message}`, 'error');
      } finally {
        busyAction = false;
        renderAll();
      }
    }

    async function clearGrammar() {
      if (busyAction) return;
      if (!confirmFn('Clear your logged JLPT grammar encounters?')) return;
      busyAction = true;
      renderAll();
      try {
        const result = await sendWorkerMessage(chrome, { action: 'CLEAR_GRAMMAR_SEEN' }, setTimeoutFn, clearTimeoutFn);
        if (!result.success) throw new Error(result.error || 'Storage error');
        await refreshFromStorage();
        setStatus('Cleared JLPT grammar log.', 'success');
      } catch (error) {
        setStatus(`Clear failed: ${error.message}`, 'error');
      } finally {
        busyAction = false;
        renderAll();
      }
    }

    wordSearchEl?.addEventListener('input', () => {
      wordLimit = WORD_PAGE_SIZE;
      renderVocabulary();
    });
    wordFilterEl?.addEventListener('change', () => {
      wordLimit = WORD_PAGE_SIZE;
      renderVocabulary();
    });
    wordMoreBtn?.addEventListener('click', () => {
      wordLimit += WORD_PAGE_SIZE;
      renderVocabulary();
    });

    grammarSearchEl?.addEventListener('input', () => {
      grammarLimit = GRAMMAR_PAGE_SIZE;
      renderGrammar();
    });
    grammarScopeEl?.addEventListener('change', () => {
      grammarLimit = GRAMMAR_PAGE_SIZE;
      renderGrammar();
    });
    grammarMoreBtn?.addEventListener('click', () => {
      grammarLimit += GRAMMAR_PAGE_SIZE;
      renderGrammar();
    });

    exportBtn?.addEventListener('click', exportProgress);
    importBtn?.addEventListener('click', () => {
      if (!busyAction) importFileEl?.click();
    });
    importFileEl?.addEventListener('change', async () => {
      const file = importFileEl.files?.[0];
      try {
        await handleImportFile(file);
      } finally {
        importFileEl.value = '';
      }
    });
    clearVocabBtn?.addEventListener('click', clearVocabulary);
    clearGrammarBtn?.addEventListener('click', clearGrammar);

    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const patch = {};
      let relevant = false;
      for (const key of [WORD_STATUS_KEY, CARDS_KEY, GRAMMAR_SEEN_KEY]) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          patch[key] = changes[key].newValue;
          relevant = true;
        }
      }
      if (!relevant) return;
      for (const key of Object.keys(patch)) {
        keyVersions[key]++;
      }
      const { vocabChanged, grammarChanged } = applyStorageSnapshot(patch);
      if (vocabChanged) renderVocabulary();
      if (grammarChanged) renderGrammar();
    });

    await refreshFromStorage();
    return { refresh: refreshFromStorage, render: renderAll };
  }

  const api = {
    MAX_IMPORT_BYTES,
    buildVocabularyEntries,
    buildGrammarSummary,
    buildProgressBackup,
    serializeProgressBackup,
    parseProgressBackup,
    mountProgressDashboard
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      mountProgressDashboard({
        document,
        chrome,
        URL,
        Blob,
        confirm: window.confirm.bind(window),
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        grammar: root.LinguaPlayGrammar
      });
    });
  }
})(globalThis);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLRC, cleanSongTitle, parseSubtitleFile } from '../js/subtitles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('parseLRC parses standard and multi-timestamp LRC cues with duration calculations', () => {
  const lrcSample = `
[ti:愛の賞味期限]
[ar:tuki.]
[al:愛の賞味期限]
[length:03:30]
[00:12.34]自己嫌悪に落ちてく
[00:16.78]また君に恋を知る
[00:22.50]世界はとても綺麗だったな
[00:30.00][00:45.00]君が僕に見せてくれた
[00:50.00]
`;

  const cues = parseLRC(lrcSample);
  assert.ok(Array.isArray(cues), 'Cues must be an array');
  assert.equal(cues.length, 5, 'Should have 5 valid cues (12.34, 16.78, 22.50, 30.00, 45.00)');

  // Cue 1
  assert.equal(cues[0].text, '自己嫌悪に落ちてく');
  assert.ok(Math.abs(cues[0].start - 12.34) < 0.01, 'Start time should be 12.34s');
  assert.ok(Math.abs(cues[0].end - 16.78) < 0.01, 'End time should match next cue start');

  // Cue 2
  assert.equal(cues[1].text, 'また君に恋を知る');
  assert.ok(Math.abs(cues[1].start - 16.78) < 0.01);
  assert.ok(Math.abs(cues[1].end - 22.50) < 0.01);

  // Cue 3
  assert.equal(cues[2].text, '世界はとても綺麗だったな');
  assert.ok(Math.abs(cues[2].start - 22.50) < 0.01);
  assert.ok(Math.abs(cues[2].end - 30.00) < 0.01);

  // Multi-timestamp cues (sorted chronologically)
  assert.equal(cues[3].text, '君が僕に見せてくれた');
  assert.ok(Math.abs(cues[3].start - 30.00) < 0.01);

  assert.equal(cues[4].text, '君が僕に見せてくれた');
  assert.ok(Math.abs(cues[4].start - 45.00) < 0.01);
  assert.ok(cues[4].end > 45.00, 'Last cue should have default duration');
});

test('parseSubtitleFile recognizes .lrc files and LRC content', () => {
  const lrcContent = `[00:05.50]こんにちは\n[00:10.00]さようなら`;
  const cuesByName = parseSubtitleFile(lrcContent, 'song.lrc');
  assert.equal(cuesByName.length, 2);
  assert.equal(cuesByName[0].text, 'こんにちは');

  const cuesByContent = parseSubtitleFile(lrcContent, '');
  assert.equal(cuesByContent.length, 2);
  assert.equal(cuesByContent[0].text, 'こんにちは');
});

test('cleanSongTitle sanitizes YouTube music video titles and extracts artist/track', () => {
  // Case 1: Japanese quote format
  const t1 = cleanSongTitle('tuki.『愛の賞味期限』Official Music Video', 'tuki. Official Channel');
  assert.equal(t1.trackName, '愛の賞味期限');
  assert.equal(t1.artistName, 'tuki.');

  // Case 2: Japanese brackets and title
  const t2 = cleanSongTitle('【Official MV】YOASOBI「アイドル」 / YOASOBI - Idol', 'Ayase / YOASOBI');
  assert.equal(t2.trackName, 'アイドル');
  assert.equal(t2.artistName, 'YOASOBI');

  // Case 3: Hyphen separated with MV tag
  const t3 = cleanSongTitle('Eve - 廻廻奇譚 (Music Video)', 'Eve');
  assert.equal(t3.trackName, '廻廻奇譚');
  assert.equal(t3.artistName, 'Eve');

  // Case 4: THE FIRST TAKE format
  const t4 = cleanSongTitle('LiSA - 炎 / THE FIRST TAKE', 'THE FIRST TAKE');
  assert.equal(t4.trackName, '炎');
  assert.equal(t4.artistName, 'LiSA');

  // Case 5: Feat with Japanese fullwidth slash
  const t5 = cleanSongTitle('【MV】可愛くてごめん feat. ちゅーたん（CV：早見沙織）／HoneyWorks', 'HoneyWorks OFFICIAL');
  assert.equal(t5.trackName, '可愛くてごめん');
  assert.equal(t5.artistName, 'HoneyWorks');

  // Case 6: Anime metadata with sumitsuki brackets
  const t6 = cleanSongTitle('土岐麻子 / HOME【TVアニメ「フルーツバスケット」2nd Season 第2クール OP ver.】', '土岐麻子');
  assert.equal(t6.trackName, 'HOME');
  assert.equal(t6.artistName, '土岐麻子');

  // Case 7: Title with trailing - YouTube suffix
  const t7 = cleanSongTitle('土岐麻子 / HOME【TVアニメ「フルーツバスケット」2nd Season 第2クール OP ver.】 - YouTube', '土岐麻子');
  assert.equal(t7.trackName, 'HOME');
  assert.equal(t7.artistName, '土岐麻子');

  // Case 8: Anime OP theme in parentheses with quoted anime title
  const t8 = cleanSongTitle('Beverly（ビバリー） / Again（TVアニメ「フルーツバスケット」OPテーマ） - YouTube', 'avex');
  assert.equal(t8.trackName, 'Again');
  assert.equal(t8.artistName, 'Beverly');
});

test('manifest.json includes host permissions for https://lrclib.net/* and arbitrary lyrics URLs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://lrclib.net/*'), 'Manifest must allow https://lrclib.net/*');
  assert.ok(
    manifest.host_permissions.includes('<all_urls>') ||
    (manifest.host_permissions.includes('http://*/*') && manifest.host_permissions.includes('https://*/*')),
    'Manifest must permit fetching user-provided lyrics URLs'
  );
});

test('background.js registers and dispatches FETCH_LRCLIB_LYRICS correctly', async () => {
  const bgCode = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener, 'Message listener should be registered in background.js');

  // Test FETCH_LRCLIB_LYRICS dispatch with mock fetch
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.ok(url.includes('lrclib.net'), 'Must request lrclib.net');
      return {
        ok: true,
        json: async () => ({
          trackName: '愛の賞味期限',
          artistName: 'tuki.',
          syncedLyrics: '[00:10.00]テスト歌詞'
        })
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: '愛の賞味期限',
        artistName: 'tuki.'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.trackName, '愛の賞味期限');
    assert.equal(response.syncedLyrics, '[00:10.00]テスト歌詞');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('background.js handles FETCH_LYRICS_URL action to fetch external lyrics from links', async () => {
  const bgCode = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, 'https://example.com/custom_song.lrc');
      return {
        ok: true,
        text: async () => '[00:05.00]テスト歌詞リンク'
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LYRICS_URL',
        url: 'https://example.com/custom_song.lrc'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.ok(response.content.includes('[00:05.00]テスト歌詞リンク'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('background.js falls back to querying without duration if duration query fails', async () => {
  const bgCode = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      if (url.includes('duration=')) {
        return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
      }
      return {
        ok: true,
        json: async () => ({
          trackName: 'HOME',
          artistName: '土岐麻子',
          syncedLyrics: '[00:14.62]胸の奥で人知れず 揺れていた'
        })
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: 'HOME',
        artistName: '土岐麻子',
        duration: 90
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.trackName, 'HOME');
    assert.equal(fetchCalls.length, 2, 'Should attempt with duration, then retry without duration');
    assert.ok(fetchCalls[0].includes('duration=90'));
    assert.ok(!fetchCalls[1].includes('duration='));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content.js includes lyrics modal UI, search inputs, and retry polling state', () => {
  const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

  assert.ok(contentJs.includes('linguaplay-lyrics-modal'), 'content.js must define #linguaplay-lyrics-modal');
  assert.ok(contentJs.includes('lp-search-track-input'), 'content.js must define track search input');
  assert.ok(contentJs.includes('lp-search-artist-input'), 'content.js must define artist search input');
  assert.ok(contentJs.includes('lp-search-submit-btn'), 'content.js must define search submit button');
  assert.ok(contentJs.includes('lyricsFetchAttemptedVid'), 'content.js must track lyricsFetchAttemptedVid for retry on SPA DOM load');
  assert.ok(!contentJs.includes('lp-lyrics-url-input'), 'content.js must not include removed Option 1 URL input');
  assert.ok(!contentJs.includes('lp-paste-lyrics-input'), 'content.js must not include removed Option 3 paste input');
});

test('background.js falls back to Kugou Music when LRCLIB has no synced lyrics', async () => {
  const bgCode = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  try {
    globalThis.fetch = async (url) => {
      fetchUrls.push(url);
      if (url.includes('lrclib.net')) {
        // LRCLIB returns 404 / empty search
        return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
      }
      if (url.includes('lyrics.kugou.com/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 200,
            candidates: [
              {
                id: '62589475',
                accesskey: '5DC756726B71A4435EA15921245BC375',
                singer: '土岐麻子',
                song: 'HOME',
                duration: 291
              }
            ]
          })
        };
      }
      if (url.includes('lyrics.kugou.com/download')) {
        // Base64 encoding for "[00:14.71]胸の奥で人知れず\n[00:18.52]揺れていた\n"
        const rawLrc = '[00:14.71]胸の奥で人知れず\n[00:18.52]揺れていた\n';
        const b64 = Buffer.from(rawLrc, 'utf8').toString('base64');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 200,
            content: b64
          })
        };
      }
      return { ok: false, status: 500 };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: 'HOME',
        artistName: '土岐麻子',
        query: '土岐麻子 HOME'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true, 'Kugou fallback should return success: true');
    assert.equal(response.provider, 'kugou', 'Response provider should be kugou');
    assert.equal(response.trackName, 'HOME');
    assert.equal(response.artistName, '土岐麻子');
    assert.ok(response.syncedLyrics.includes('[00:14.71]胸の奥で人知れず'), 'syncedLyrics should contain decoded UTF-8 Japanese');
    assert.ok(fetchUrls.some(u => u.includes('lyrics.kugou.com/search')), 'Must have searched Kugou');
    assert.ok(fetchUrls.some(u => u.includes('lyrics.kugou.com/download')), 'Must have downloaded from Kugou');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content.js includes Audio Timing 1-click anchor sync, macro buttons, and storage persistence', () => {
  const contentJs = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.ok(contentJs.includes('lp-sync-playhead-btn'), 'content.js must define 1-click anchor sync button #lp-sync-playhead-btn');
  assert.ok(contentJs.includes('lp-offset-manual-input'), 'content.js must define direct numeric offset input #lp-offset-manual-input');
  assert.ok(contentJs.includes('lp_offset_'), 'content.js must persist timing offset per video in storage');
});




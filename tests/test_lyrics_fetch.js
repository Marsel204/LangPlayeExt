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
});

test('manifest.json includes host permissions for https://lrclib.net/*', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://lrclib.net/*'), 'Manifest must allow https://lrclib.net/*');
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

/**
 * LinguaPlay Chrome Extension — Service Worker (background.js)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinguaPlay Extension installed.');
});

const serverStarts = new Map();
const serverStartFailures = new Map();
const parserRequests = new Map();

function canRequestServerStart(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url || sender.origin);
    return (url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && url.pathname === '/options.html') ||
      (url.protocol === 'https:' && (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) && url.pathname === '/watch');
  } catch { return false; }
}

async function ensureLocalServer() {
  const config = await chrome.storage.local.get(['linguaplay_server_url', 'linguaplay_auto_start_server']);
  if (config.linguaplay_auto_start_server === false) return { success: true, skipped: true };
  const url = new URL(config.linguaplay_server_url || 'http://127.0.0.1:8000');
  // Only the fixed local Python server can be launched. Remote endpoints are
  // managed by their owners and must never cause a local process to start.
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || !['', '/'].includes(url.pathname)) {
    return { success: true, skipped: true };
  }
  const port = Number(url.port || 80);
  const key = `http://127.0.0.1:${port}`;
  if (serverStarts.has(key)) return serverStarts.get(key);
  const pending = (async () => {
    try {
      const response = await fetch(`${key}/api/parse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '猫' }), signal: AbortSignal.timeout(2500)
      });
      const data = await response.json();
      if (response.ok && data.status === 'success' && Array.isArray(data.tokens)) {
        serverStartFailures.delete(key);
        return { success: true, started: false };
      }
    } catch { /* An offline server is the expected startup case. */ }
    const previousFailure = serverStartFailures.get(key);
    if (previousFailure && Date.now() - previousFailure.time < 30000) return previousFailure.response;
    const response = await new Promise(resolve => {
      chrome.runtime.sendNativeMessage('com.linguaplay.server', { action: 'ensure_server', port }, result => {
        const error = chrome.runtime.lastError;
        resolve(error ? { success: false, error: `Local launcher unavailable: ${error.message}. Install native/install_host.py for this extension.` } : result || { success: false, error: 'Local launcher did not respond' });
      });
    });
    if (!response.success) serverStartFailures.set(key, { time: Date.now(), response });
    else serverStartFailures.delete(key);
    return { success: !!response.success, started: !!response.started, ...(response.error ? { error: response.error } : {}) };
  })();
  serverStarts.set(key, pending);
  try { return await pending; } finally { serverStarts.delete(key); }
}

// Cards and expendable lyric caches have one mutation owner across all tabs.
let storageMutations = Promise.resolve();
function enqueueStorage(task) {
  const next = storageMutations.then(task);
  storageMutations = next.catch(() => {});
  return next;
}
function localStorageCall(method, value) {
  return new Promise((resolve, reject) => {
    try { chrome.storage.local[method](value, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result);
    }); } catch (error) { reject(error); }
  });
}
const lyricsCachePrefix = 'lp_lyrics_cache_';
const lyricsCacheIndexKey = 'lp_lyrics_cache_index';
function isLyricsCacheKey(key) { return key.startsWith(lyricsCachePrefix) && key !== lyricsCacheIndexKey; }
async function evictLyricsCaches() {
  const all = await localStorageCall('get', null);
  await localStorageCall('remove', Object.keys(all).filter(key => isLyricsCacheKey(key) || key === lyricsCacheIndexKey));
}
function validatedCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid card');
  const allowed = new Set(['word','reading','romaji','meaning','sentence','sentence_en','date']);
  if (typeof value.word !== 'string' || !value.word.trim()) throw new Error('Card word is required');
  const card = {};
  for (const [key, text] of Object.entries(value)) {
    if (!allowed.has(key) || typeof text !== 'string' || text.length > 4000) throw new Error('Invalid card field: ' + key);
    card[key] = text;
  }
  return card;
}
async function saveOwnedCard(card) {
  const result = await localStorageCall('get', ['linguaplay_cards']);
  if (result.linguaplay_cards !== undefined && !Array.isArray(result.linguaplay_cards)) throw new Error('Stored card collection is invalid; it was left unchanged');
  const cards = [...(result.linguaplay_cards || []), card];
  try { await localStorageCall('set', {linguaplay_cards: cards}); }
  catch {
    await evictLyricsCaches();
    await localStorageCall('set', {linguaplay_cards: cards});
  }
  return {success: true, count: cards.length};
}
function validateCacheId(vid) {
  if (typeof vid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(vid)) throw new Error('Invalid video cache id');
}
async function cacheOwnedLyrics(vid, payload) {
  validateCacheId(vid);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.syncedLyrics !== 'string') throw new Error('Invalid lyrics cache');
  const key = lyricsCachePrefix + vid;
  const bytes = new TextEncoder().encode(key + JSON.stringify(payload)).length;
  if (bytes > 512000) return {success: false, skipped: true, error: 'Lyrics exceed the cache entry limit'};
  // Reconcile actual keys on every mutation, including caches written by older
  // extension versions before an index existed. The index is never an authority
  // for which storage keys may evade eviction.
  const all = await localStorageCall('get', null);
  const previous = Array.isArray(all[lyricsCacheIndexKey]) ? all[lyricsCacheIndexKey] : [];
  const times = new Map(previous.filter(e => e && typeof e.id === 'string' && Number.isFinite(e.t)).map(e => [e.id,e.t]));
  const entries = Object.keys(all).filter(isLyricsCacheKey).filter(k => k !== key).map(k => ({
    id: k.slice(lyricsCachePrefix.length), bytes: new TextEncoder().encode(k + JSON.stringify(all[k])).length,
    t: times.get(k.slice(lyricsCachePrefix.length)) || Number(all[k]?.cachedAt) || 0
  })).sort((a,b) => a.t - b.t);
  const newestTime = Math.max(Date.now(), ...entries.map(e => Number.isFinite(e.t) ? e.t : 0));
  entries.push({id:vid, bytes, t:newestTime + 1});
  let total = entries.reduce((n,e) => n + e.bytes, 0);
  const evicted = [];
  while (entries.length > 50 || total > 2000000) {
    const entry = entries.shift(); total -= entry.bytes; evicted.push(lyricsCachePrefix + entry.id);
  }
  if (evicted.length) await localStorageCall('remove', evicted);
  await localStorageCall('set', {[key]: payload, [lyricsCacheIndexKey]: entries});
  return {success:true, entries:entries.length, bytes:total};
}
async function removeOwnedLyrics(vid) {
  validateCacheId(vid);
  await localStorageCall('remove', [lyricsCachePrefix + vid]);
  const stored = await localStorageCall('get', [lyricsCacheIndexKey]);
  const entries = Array.isArray(stored[lyricsCacheIndexKey]) ? stored[lyricsCacheIndexKey].filter(e => e.id !== vid) : [];
  await localStorageCall('set', {[lyricsCacheIndexKey]: entries});
  return {success:true};
}

// Innertube Android VR Caption Extraction Bridge in Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (['SAVE_CARD','CLEAR_CARDS','CACHE_LYRICS','REMOVE_LYRICS_CACHE'].includes(request.action)) {
    if (sender.id !== chrome.runtime.id) { sendResponse({success:false, error:'Untrusted storage request'}); return false; }
    enqueueStorage(async () => {
      if (request.action === 'SAVE_CARD') return saveOwnedCard(validatedCard(request.card));
      if (request.action === 'CLEAR_CARDS') { await localStorageCall('set', {linguaplay_cards: []}); return {success:true, count:0}; }
      if (request.action === 'CACHE_LYRICS') return cacheOwnedLyrics(request.vid, request.payload);
      return removeOwnedLyrics(request.vid);
    }).then(sendResponse, error => sendResponse({success:false, error:error.message}));
    return true;
  }
  if (request.action === 'PARSE_JAPANESE') {
    (async () => {
      try {
        if (!canRequestServerStart(sender)) throw new Error('Untrusted parser request');
        if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 4096) throw new Error('Invalid parser text');
        const config = await chrome.storage.local.get(['linguaplay_server_url']);
        const endpoint = new URL(config.linguaplay_server_url || 'http://127.0.0.1:8000');
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid server URL');
        const origin = `${endpoint.protocol}//${endpoint.hostname}/*`;
        if (!await chrome.permissions.contains({ origins: [origin] })) throw new Error('Server endpoint permission is missing');
        endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/api/parse';
        endpoint.search = ''; endpoint.hash = '';
        const key = JSON.stringify([endpoint.href, request.text]);
        let pending = parserRequests.get(key);
        if (!pending) {
          if (parserRequests.size >= 32) throw new Error('Parser is busy');
          pending = (async () => {
            const response = await fetch(endpoint.href, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: request.text }), signal: AbortSignal.timeout(2500),
            });
            if (!response.ok) throw new Error(`Parser unavailable (HTTP ${response.status})`);
            const data = await response.json();
            if (data.status !== 'success' || !Array.isArray(data.tokens)) throw new Error('Invalid parser response');
            return { success: true, tokens: data.tokens, engine: data.engine };
          })().finally(() => parserRequests.delete(key));
          parserRequests.set(key, pending);
        }
        sendResponse(await pending);
      } catch (error) { sendResponse({ success: false, error: error.message }); }
    })();
    return true;
  }
  if (request.action === 'ENSURE_LOCAL_SERVER') {
    if (!canRequestServerStart(sender)) {
      sendResponse({ success: false, error: 'Untrusted server startup request' });
      return false;
    }
    ensureLocalServer().then(sendResponse, error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'CALL_9ROUTER_AI') {
    (async () => {
      try {
        if (sender.id !== chrome.runtime.id) throw new Error('Untrusted request');
        if (!Array.isArray(request.messages) || request.messages.length === 0 ||
            !request.messages.every(message => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')) {
          throw new Error('Invalid chat messages');
        }
        const config = await chrome.storage.local.get(['linguaplay_9router_url', 'linguaplay_9router_key', 'linguaplay_9router_model']);
        const endpoint = new URL((config.linguaplay_9router_url || 'http://127.0.0.1:20128/v1').trim());
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
          throw new Error('9Router must be an HTTP or HTTPS URL without embedded credentials');
        }
        const origin = `${endpoint.protocol}//${endpoint.hostname}/*`;
        if (!await chrome.permissions.contains({ origins: [origin] })) {
          throw new Error('Allow access to this endpoint by saving it in Extension Settings');
        }
        endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
        if (endpoint.pathname === '/') endpoint.pathname = '/v1';
        endpoint.search = ''; endpoint.hash = '';
        if (!endpoint.pathname.endsWith('/chat/completions')) endpoint.pathname += '/chat/completions';
        const model = (config.linguaplay_9router_model || '').trim();
        if (!model) throw new Error('Choose a 9Router model or combo in Extension Settings. Use Load Models to see available IDs.');
        const headers = { 'Content-Type': 'application/json' };
        const key = (config.linguaplay_9router_key || '').trim();
        if (key) headers.Authorization = `Bearer ${key}`;
        const response = await fetch(endpoint.href, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: request.messages,
            stream: false,
            response_format: request.isJson ? { type: 'json_object' } : undefined
          }),
          signal: AbortSignal.timeout(30000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error?.message || `9Router returned status ${response.status}`);
        }
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Empty response from 9Router');
        sendResponse({ success: true, content });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

function decodeKugouLrc(base64Content) {
  if (!base64Content || typeof base64Content !== 'string') return '';
  let decoded = '';
  if (typeof Buffer !== 'undefined') {
    decoded = Buffer.from(base64Content, 'base64').toString('utf8');
  } else {
    const bin = atob(base64Content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded = new TextDecoder('utf-8').decode(bytes);
  }
  return decoded
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchKugouLyrics(keyword, duration = 0) {
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return null;
  const cleanQ = keyword.trim();
  try {
    const searchUrl = `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(cleanQ)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    if (!searchData || !Array.isArray(searchData.candidates) || searchData.candidates.length === 0) {
      return null;
    }

    let candidate = null;
    if (duration && Number(duration) > 0) {
      candidate = searchData.candidates.find(c => Math.abs(Number(c.duration) - Number(duration)) < 5);
    }
    if (!candidate) candidate = searchData.candidates[0];
    if (!candidate || !candidate.id || !candidate.accesskey) return null;

    const downloadUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`;
    const dlRes = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!dlRes.ok) return null;
    const dlData = await dlRes.json();
    if (!dlData || !dlData.content) return null;

    const lrcText = decodeKugouLrc(dlData.content);
    if (!lrcText) return null;

    return {
      provider: 'kugou',
      trackName: candidate.song || candidate.singer || cleanQ,
      artistName: candidate.singer || '',
      syncedLyrics: lrcText
    };
  } catch (err) {
    console.warn('[LinguaPlay] Kugou lyrics fetch error:', err);
    return null;
  }
}

  if (request.action === 'FETCH_LRCLIB_LYRICS') {
    (async () => {
      try {
        const { trackName, artistName, query, duration } = request;
        const headers = {
          'User-Agent': 'LinguaPlay/1.0.0 (https://github.com/Marsel204/LangPlayeExt)'
        };

        // 1. Try exact get if trackName is provided (with duration, then without duration)
        if (trackName) {
          const fetchExact = async (includeDuration) => {
            const params = new URLSearchParams();
            params.set('track_name', trackName);
            if (artistName) params.set('artist_name', artistName);
            if (includeDuration && duration && Number(duration) > 0) {
              params.set('duration', Math.round(Number(duration)));
            }
            const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
              headers,
              signal: AbortSignal.timeout(4000)
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.syncedLyrics) return data;
            }
            return null;
          };

          try {
            let data = null;
            if (duration && Number(duration) > 0) {
              data = await fetchExact(true);
            }
            if (!data) {
              data = await fetchExact(false);
            }
            if (data && data.syncedLyrics) {
              sendResponse({
                success: true,
                provider: 'lrclib',
                trackName: data.trackName || trackName,
                artistName: data.artistName || artistName,
                syncedLyrics: data.syncedLyrics,
                plainLyrics: data.plainLyrics
              });
              return;
            }
          } catch (e) { /* fallback to search */ }
        }

        // 2. LRCLIB Search fallback (Composite query, then track-only fallback)
        const searchQ = (query || `${artistName || ''} ${trackName || ''}`).trim();
        const pickCandidate = (list) => {
          if (!Array.isArray(list) || list.length === 0) return null;
          let candidate = list.find(item => item.syncedLyrics && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(item.syncedLyrics));
          if (!candidate) candidate = list.find(item => item.syncedLyrics);
          if (!candidate) candidate = list[0];
          return candidate && (candidate.syncedLyrics || candidate.plainLyrics) ? candidate : null;
        };

        if (searchQ) {
          try {
            const searchParams = new URLSearchParams();
            searchParams.set('q', searchQ);
            const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
              headers,
              signal: AbortSignal.timeout(5000)
            });
            if (searchRes.ok) {
              const list = await searchRes.json();
              const candidate = pickCandidate(list);
              if (candidate) {
                sendResponse({
                  success: true,
                  provider: 'lrclib',
                  trackName: candidate.trackName || trackName,
                  artistName: candidate.artistName || artistName,
                  syncedLyrics: candidate.syncedLyrics,
                  plainLyrics: candidate.plainLyrics
                });
                return;
              }
            }
          } catch (e) { /* ignore and try track-only */ }
        }

        // 2b. LRCLIB Track-only search fallback
        const cleanTrack = (trackName || '').trim();
        if (cleanTrack && cleanTrack.length >= 2 && cleanTrack.toLowerCase() !== searchQ.toLowerCase()) {
          try {
            const trackParams = new URLSearchParams();
            trackParams.set('q', cleanTrack);
            const trackRes = await fetch(`https://lrclib.net/api/search?${trackParams.toString()}`, {
              headers,
              signal: AbortSignal.timeout(5000)
            });
            if (trackRes.ok) {
              const list = await trackRes.json();
              const candidate = pickCandidate(list);
              if (candidate && candidate.syncedLyrics) {
                sendResponse({
                  success: true,
                  provider: 'lrclib',
                  trackName: candidate.trackName || cleanTrack,
                  artistName: candidate.artistName || artistName,
                  syncedLyrics: candidate.syncedLyrics,
                  plainLyrics: candidate.plainLyrics
                });
                return;
              }
            }
          } catch (e) { /* fallback to Kugou */ }
        }

        // 3. Kugou Music fallback (High coverage for Anime, Covers & J-Pop)
        const kugouQ = (query || `${artistName || ''} ${trackName || ''}`).trim();
        if (kugouQ) {
          let kugouResult = await fetchKugouLyrics(kugouQ, duration);
          if (!kugouResult && cleanTrack && cleanTrack.length >= 2 && cleanTrack.toLowerCase() !== kugouQ.toLowerCase()) {
            kugouResult = await fetchKugouLyrics(cleanTrack, duration);
          }
          if (kugouResult && kugouResult.syncedLyrics) {
            sendResponse({
              success: true,
              provider: 'kugou',
              trackName: kugouResult.trackName || trackName,
              artistName: kugouResult.artistName || artistName,
              syncedLyrics: kugouResult.syncedLyrics
            });
            return;
          }
        }

        sendResponse({ success: false, error: 'No matching synced lyrics found on LRCLIB or Kugou Music' });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async sendResponse
  }

  if (request.action === 'OPEN_OPTIONS_PAGE') {
    const optionsUrl = chrome.runtime.getURL('options.html');
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: optionsUrl, active: true }, (tab) => {
        sendResponse({ success: true, tabId: tab ? tab.id : null });
      });
      return true;
    }
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
    sendResponse({ success: true });
    return false;
  }
});

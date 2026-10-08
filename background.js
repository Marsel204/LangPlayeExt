/**
 * LinguaPlay Chrome Extension — Service Worker (background.js)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinguaPlay Extension installed.');

  // Create context menu for analyzing selected Japanese text
  try {
    if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.create) {
      chrome.contextMenus.create({
        id: 'linguaplay-analyze-selection',
        title: 'Analyze "%s" in LinguaPlay',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore duplicate item error on reload
        }
      });
    }
  } catch (e) {
    console.warn('[LinguaPlay Background] Failed to create context menu:', e);
  }
});

try {
  if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'linguaplay-analyze-selection' && info.selectionText) {
        const word = encodeURIComponent(info.selectionText.trim());
        chrome.tabs.create({
          url: chrome.runtime.getURL(`player.html?word=${word}`)
        });
      }
    });
  }
} catch (e) {
  console.warn('[LinguaPlay Background] Failed to register contextMenus onClicked listener:', e);
}

const serverStarts = new Map();
const serverStartFailures = new Map();
const parserRequests = new Map();

function canRequestServerStart(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url || sender.origin);
    return (url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && ['/player.html', '/options.html'].includes(url.pathname)) ||
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
      const response = await fetch(`${key}/api/ai/status`, { signal: AbortSignal.timeout(1000) });
      const data = await response.json();
      if (response.ok && data.status === 'success' && typeof data.antigravity_available === 'boolean') {
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

// Innertube Android VR Caption Extraction Bridge in Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  if (request.action === 'CALL_CUSTOM_AI') {
    (async () => {
      try {
        if (sender.id !== chrome.runtime.id) throw new Error('Untrusted request');
        if (!Array.isArray(request.messages) || request.messages.length === 0 ||
            !request.messages.every(message => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')) {
          throw new Error('Invalid chat messages');
        }
        const config = await chrome.storage.local.get([
          'linguaplay_opencode_url', 'linguaplay_opencode_key', 'linguaplay_opencode_model'
        ]);
        const endpoint = new URL((config.linguaplay_opencode_url || 'http://127.0.0.1:11434/v1').trim());
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
          throw new Error('Custom endpoint must be an HTTP or HTTPS URL without embedded credentials');
        }
        const origin = `${endpoint.protocol}//${endpoint.hostname}/*`;
        if (!await chrome.permissions.contains({ origins: [origin] })) {
          throw new Error('Allow access to this endpoint by saving it in Extension Settings');
        }
        endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
        if (!endpoint.pathname.endsWith('/chat/completions')) endpoint.pathname += '/chat/completions';
        const headers = { 'Content-Type': 'application/json' };
        const key = (config.linguaplay_opencode_key || '').trim();
        if (key) headers.Authorization = `Bearer ${key}`;
        const response = await fetch(endpoint.href, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: (config.linguaplay_opencode_model || 'deepseek-chat').trim(),
            messages: request.messages,
            response_format: request.isJson ? { type: 'json_object' } : undefined
          }),
          signal: AbortSignal.timeout(30000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const originHint = response.status === 403 && ['127.0.0.1', 'localhost'].includes(endpoint.hostname)
            ? ' If using Ollama, set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama to allow the extension.' : '';
          throw new Error((data.error?.message || `Custom endpoint returned status ${response.status}`) + originHint);
        }
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Empty response from custom endpoint');
        sendResponse({ success: true, content });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'FETCH_YOUTUBE_CAPTIONS' && request.videoId) {
    (async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          'X-YouTube-Client-Name': '28',
          'X-YouTube-Client-Version': '1.65.10',
          'Origin': 'https://www.youtube.com'
        };
        if (request.visitorData) headers['X-Goog-Visitor-Id'] = request.visitorData;

        const payload = {
          context: {
            client: {
              clientName: 'ANDROID_VR',
              clientVersion: '1.65.10',
              deviceMake: 'Oculus',
              deviceModel: 'Quest 3',
              androidSdkVersion: 32,
              osName: 'Android',
              osVersion: '12L',
              hl: 'en',
              timeZone: 'UTC',
              utcOffsetMinutes: 0
            }
          },
          videoId: request.videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: 'HTML5_PREF_WANTS',
              signatureTimestamp: 20717
            }
          },
          contentCheckOk: true,
          racyCheckOk: true
        };

        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          sendResponse({ success: true, tracks: tracks });
          return;
        }
        sendResponse({ success: false, error: `Status ${res.status}` });
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

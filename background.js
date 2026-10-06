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

// Innertube Android VR Caption Extraction Bridge in Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

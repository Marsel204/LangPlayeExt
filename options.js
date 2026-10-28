/**
 * LinguaPlay Chrome Extension — Options Script (options.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const routerUrl = document.getElementById('9router-url');
  const routerKey = document.getElementById('9router-key');
  const routerModel = document.getElementById('9router-model');
  const routerModels = document.getElementById('9router-models');
  const loadRouterModelsBtn = document.getElementById('load-9router-models-btn');
  const testRouterBtn = document.getElementById('test-9router-btn');
  const routerStatusText = document.getElementById('9router-status-text');
  const serverUrl = document.getElementById('server-url');
  const autoStartServer = document.getElementById('auto-start-server');
  const ankiDeck = document.getElementById('anki-deck');
  const ankiConnectUrl = document.getElementById('ankiconnect-url');
  const readingMode = document.getElementById('reading-mode');
  const savedCardCounter = document.getElementById('saved-card-counter');
  
  const testServerBtn = document.getElementById('test-server-btn');
  const serverStatusText = document.getElementById('server-status-text');
  const testAnkiBtn = document.getElementById('test-anki-btn');
  const ankiStatusText = document.getElementById('anki-status-text');
  
  const exportTsvBtn = document.getElementById('export-tsv-btn');
  const clearCardsBtn = document.getElementById('clear-cards-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const saveToast = document.getElementById('save-toast');

  // 1. Load saved settings
  chrome.storage.local.get([
    'linguaplay_9router_url',
    'linguaplay_9router_key',
    'linguaplay_9router_model',
    'linguaplay_server_url',
    'linguaplay_auto_start_server',
    'linguaplay_anki_deck',
    'linguaplay_ankiconnect_url',
    'linguaplay_reading_mode',
    'linguaplay_cards'
  ], (res) => {
    if (res.linguaplay_9router_url) routerUrl.value = res.linguaplay_9router_url;
    if (res.linguaplay_9router_key) routerKey.value = res.linguaplay_9router_key;
    if (res.linguaplay_9router_model) routerModel.value = res.linguaplay_9router_model;
    if (res.linguaplay_server_url) serverUrl.value = res.linguaplay_server_url;
    autoStartServer.checked = res.linguaplay_auto_start_server !== false;
    if (res.linguaplay_anki_deck) ankiDeck.value = res.linguaplay_anki_deck;
    if (res.linguaplay_ankiconnect_url) ankiConnectUrl.value = res.linguaplay_ankiconnect_url;
    if (res.linguaplay_reading_mode) readingMode.value = res.linguaplay_reading_mode;

    const cards = res.linguaplay_cards || [];
    savedCardCounter.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} in storage`;
  });

  async function allowEndpointAccess(urls) {
    const origins = new Set();
    for (const value of urls) {
      const endpoint = new URL(value);
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
        throw new Error('Use an HTTP or HTTPS endpoint URL without embedded credentials');
      }
      // HTTP loopback access is declared in the manifest, on every port.
      if (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname)) continue;
      origins.add(`${endpoint.protocol}//${endpoint.hostname}/*`);
    }
    const missing = [];
    for (const origin of origins) {
      if (!await chrome.permissions.contains({origins: [origin]})) missing.push(origin);
    }
    if (missing.length && !await chrome.permissions.request({origins: missing})) {
      throw new Error('Endpoint access was not allowed. Settings were not saved.');
    }
  }

  async function allowEndpoint(endpoint) {
    return allowEndpointAccess([endpoint.href]);
  }

  function getRouterEndpoint() {
    const endpoint = new URL(routerUrl.value.trim() || 'http://127.0.0.1:20128/v1');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('Use an HTTP or HTTPS endpoint URL without embedded credentials');
    }
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') || '/v1';
    endpoint.search = ''; endpoint.hash = '';
    return endpoint;
  }

  // 2. Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    let normalizedRouterUrl;
    try {
      const endpoint = getRouterEndpoint();
      await allowEndpointAccess([endpoint.href, serverUrl.value.trim() || 'http://127.0.0.1:8000', ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765']);
      normalizedRouterUrl = endpoint.href;
    } catch (error) {
      routerStatusText.textContent = error.message;
      routerStatusText.style.color = '#f87171';
      saveToast.textContent = `❌ ${error.message}`;
      saveToast.classList.add('show');
      return;
    }
    chrome.storage.local.set({
      linguaplay_9router_url: normalizedRouterUrl,
      linguaplay_9router_key: routerKey.value.trim(),
      linguaplay_9router_model: routerModel.value.trim(),
      linguaplay_server_url: serverUrl.value.trim() || 'http://127.0.0.1:8000',
      linguaplay_auto_start_server: autoStartServer.checked,
      linguaplay_anki_deck: ankiDeck.value.trim() || 'LinguaPlay',
      linguaplay_ankiconnect_url: ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765',
      linguaplay_reading_mode: readingMode.value
    }, () => {
      const error = chrome.runtime?.lastError;
      saveToast.textContent = error ? `❌ Settings write failed: ${error.message}` : '✓ Settings saved successfully!';
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 2500);
    });
  });

  async function checkRouter(loadModels) {
    loadRouterModelsBtn.disabled = true;
    testRouterBtn.disabled = true;
    routerStatusText.textContent = loadModels ? 'Loading models from 9Router…' : 'Testing 9Router…';
    routerStatusText.style.color = '#a78bfa';
    try {
      const endpoint = getRouterEndpoint();
      const model = routerModel.value.trim();
      if (!loadModels && !model) throw new Error('Choose a model or enter your combo name first. Click Load Models to see available IDs.');
      await allowEndpoint(endpoint);
      const headers = { 'Content-Type': 'application/json' };
      const key = routerKey.value.trim();
      if (key) headers.Authorization = `Bearer ${key}`;
      endpoint.pathname += loadModels ? '/models' : '/chat/completions';
      const response = await fetch(endpoint.href, {
        method: loadModels ? 'GET' : 'POST',
        headers,
        ...(loadModels ? {} : { body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Respond with the word OK' }], stream: false }) }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `9Router returned HTTP ${response.status}. Check the router key and provider configuration.`);
      if (loadModels) {
        if (!Array.isArray(data.data)) throw new Error('9Router did not return a model list. Check that the base URL points to its /v1 API.');
        const ids = [...new Set(data.data.filter(item => !item?.kind || item.kind === 'llm').map(item => item?.id).filter(id => typeof id === 'string' && id.trim()))].sort();
        routerModels.replaceChildren();
        for (const id of ids) {
          const option = document.createElement('option');
          option.value = id;
          routerModels.appendChild(option);
        }
        routerStatusText.textContent = ids.length
          ? `Loaded ${ids.length} model${ids.length === 1 ? '' : 's'}. Choose one in Model or Combo, or type your combo name, then save.`
          : 'No models available. Connect a provider in the 9Router dashboard, then load models again, or enter your combo name.';
      } else {
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('9Router returned an empty reply. Check the model or combo in its dashboard.');
        routerStatusText.textContent = `9Router is working with ${model}. Click Save Settings to use it for Sensei.`;
      }
      routerStatusText.style.color = '#34d399';
    } catch (error) {
      routerStatusText.textContent = `${error.message} Ensure 9Router is running and the URL is reachable.`;
      routerStatusText.style.color = '#f87171';
    } finally {
      loadRouterModelsBtn.disabled = false;
      testRouterBtn.disabled = false;
    }
  }

  loadRouterModelsBtn.addEventListener('click', () => checkRouter(true));
  testRouterBtn.addEventListener('click', () => checkRouter(false));

  // Test the optional Sudachi parser
  testServerBtn.addEventListener('click', async () => {
    serverStatusText.textContent = 'Testing connection…';
    serverStatusText.style.color = '#a78bfa';
    const url = serverUrl.value.trim() || 'http://127.0.0.1:8000';
    try {
      await allowEndpointAccess([url]);
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/parse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '猫' }), signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status !== 'success' || !Array.isArray(data.tokens)) throw new Error('Invalid parser response');
        serverStatusText.textContent = 'Sudachi parser is online.';
        serverStatusText.style.color = '#34d399';
      } else {
        serverStatusText.textContent = `Server replied with HTTP ${res.status}`;
        serverStatusText.style.color = '#f87171';
      }
    } catch (e) {
      serverStatusText.textContent = `❌ ${e.message}. Check the Sudachi parser at ${url}.`;
      serverStatusText.style.color = '#f87171';
    }
  });

  // 8. Test AnkiConnect
  testAnkiBtn.addEventListener('click', async () => {
    ankiStatusText.textContent = 'Testing AnkiConnect…';
    ankiStatusText.style.color = '#a78bfa';
    const url = ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765';
    try {
      await allowEndpointAccess([url]);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'version', version: 6 }),
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        ankiStatusText.textContent = `✓ AnkiConnect is active (API version ${data.result})!`;
        ankiStatusText.style.color = '#34d399';
      } else {
        ankiStatusText.textContent = `HTTP error ${res.status}`;
        ankiStatusText.style.color = '#f87171';
      }
    } catch (e) {
      ankiStatusText.textContent = `❌ ${e.message}. Check that Anki and AnkiConnect are running.`;
      ankiStatusText.style.color = '#f87171';
    }
  });

  // 9. Export TSV
  exportTsvBtn.addEventListener('click', () => {
    chrome.storage.local.get(['linguaplay_cards'], (res) => {
      const cards = res.linguaplay_cards || [];
      if (cards.length === 0) {
        alert('No cards in collection yet.');
        return;
      }

      const tsv = buildAnkiTsv(cards);

      const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lingua_anki_cards.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // 10. Clear cards
  clearCardsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all locally saved cards in extension storage?')) {
      const timeout = setTimeout(() => { savedCardCounter.textContent = 'Could not confirm clear; please retry'; }, 8000);
      chrome.runtime.sendMessage({action:'CLEAR_CARDS'}, result => {
        clearTimeout(timeout);
        const error = chrome.runtime?.lastError;
        savedCardCounter.textContent = !error && result?.success ? '0 cards in storage' : `Clear failed: ${error?.message || result?.error || 'No acknowledgement'}`;
      });
    }
  });
});

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
  const saveState = document.getElementById('settings-save-state');
  let savedFormState = null;
  let isSaving = false;
  let saveError = null;
  // No real setup connects this many providers; 9Router's full catalogue lists ~85.
  const CATALOGUE_PROVIDER_THRESHOLD = 25;
  let routerModelIds = new Set();
  let activeRouterCheck = null;

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
    savedFormState = formState();
    updateSaveState();
    updateReadingPreview();
    // Discovery is read-only and never opens a host-permission prompt on page load.
    void checkRouter(true, false);
  });

  function formState() {
    return JSON.stringify([routerUrl.value.trim(), routerKey.value.trim(), routerModel.value.trim(),
      serverUrl.value.trim(), autoStartServer.checked, ankiDeck.value.trim(), ankiConnectUrl.value.trim(), readingMode.value]);
  }

  function updateSaveState() {
    const dirty = savedFormState !== null && formState() !== savedFormState;
    const text = isSaving ? 'Saving settings…' : saveError ? 'Could not save changes' : dirty ? 'Unsaved changes' : 'No pending changes';
    if (saveState.textContent !== text) saveState.textContent = text;
    saveState.style.color = saveError ? 'var(--status-error)' : dirty ? 'var(--status-busy)' : 'var(--muted)';
    saveSettingsBtn.disabled = isSaving;
  }

  function formChanged() {
    saveError = null;
    updateSaveState();
  }

  function updateReadingPreview() {
    const mode = ['furigana', 'romaji', 'hidden'].includes(readingMode.value) ? readingMode.value : 'furigana';
    for (const name of ['furigana', 'romaji', 'hidden']) {
      document.getElementById(`preview-${name}`).hidden = name !== mode;
      document.getElementById(`reading-example-${name}`).hidden = name !== mode;
    }
    document.getElementById('reading-preview-label').textContent = { furigana: 'Furigana', romaji: 'Romaji', hidden: 'Japanese only' }[mode];
  }

  readingMode.addEventListener('change', () => { updateReadingPreview(); formChanged(); });
  autoStartServer.addEventListener('change', formChanged);
  for (const field of [serverUrl, ankiDeck, ankiConnectUrl]) field.addEventListener('input', formChanged);
  for (const id of ['open-setup-guide', 'nav-setup-guide']) {
    document.getElementById(id).addEventListener('click', () => { document.getElementById('setup-guide').open = true; });
  }

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
    if (isSaving) return;
    isSaving = true;
    saveError = null;
    updateSaveState();
    const submittedFormState = formState();
    let submittedValues;
    try {
      const endpoint = getRouterEndpoint();
      submittedValues = {
        linguaplay_9router_url: endpoint.href,
        linguaplay_9router_key: routerKey.value.trim(),
        linguaplay_9router_model: routerModel.value.trim(),
        linguaplay_server_url: serverUrl.value.trim() || 'http://127.0.0.1:8000',
        linguaplay_auto_start_server: autoStartServer.checked,
        linguaplay_anki_deck: ankiDeck.value.trim() || 'LinguaPlay',
        linguaplay_ankiconnect_url: ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765',
        linguaplay_reading_mode: readingMode.value
      };
      await allowEndpointAccess([endpoint.href, submittedValues.linguaplay_server_url, submittedValues.linguaplay_ankiconnect_url]);
    } catch (error) {
      routerStatusText.textContent = error.message;
      routerStatusText.style.color = 'var(--status-error)';
      saveToast.textContent = `${error.message}`;
      saveToast.classList.add('show');
      isSaving = false;
      saveError = error.message;
      updateSaveState();
      return;
    }
    chrome.storage.local.set(submittedValues, () => {
      const error = chrome.runtime?.lastError;
      isSaving = false;
      saveError = error ? error.message : null;
      if (!error) savedFormState = submittedFormState;
      updateSaveState();
      saveToast.textContent = error ? `Settings write failed: ${error.message}` : 'Settings saved successfully.';
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 2500);
    });
  });

  function cancelRouterCheck() {
    const previous = activeRouterCheck;
    activeRouterCheck = null;
    previous?.controller.abort();
    loadRouterModelsBtn.disabled = false;
    testRouterBtn.disabled = false;
  }

  function syncModelPicker() {
    const model = routerModel.value.trim();
    routerModels.value = routerModelIds.has(model) ? model : '';
  }

  function renderModelPicker(ids, placeholderText) {
    routerModelIds = new Set(ids);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderText;
    placeholder.disabled = true;
    routerModels.replaceChildren(placeholder);
    for (const id of ids) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      routerModels.appendChild(option);
    }
    routerModels.disabled = ids.length === 0;
    syncModelPicker();
  }

  function modelChanged() {
    syncModelPicker();
    formChanged();
    if (activeRouterCheck && !activeRouterCheck.loadModels) cancelRouterCheck();
    if (!activeRouterCheck) {
      routerStatusText.textContent = routerModel.value.trim()
        ? 'Model selected. Test 9Router, then click Save Settings.'
        : 'Choose an available model or enter your combo name.';
      routerStatusText.style.color = 'var(--muted)';
    }
  }

  routerModels.addEventListener('change', () => {
    if (!routerModels.value) return;
    routerModel.value = routerModels.value;
    modelChanged();
  });
  routerModel.addEventListener('input', modelChanged);
  for (const field of [routerUrl, routerKey]) {
    field.addEventListener('input', () => {
      cancelRouterCheck();
      renderModelPicker([], 'Click Load Models to refresh');
      routerStatusText.textContent = 'Connection settings changed. Click Load Models to refresh the list.';
      routerStatusText.style.color = 'var(--muted)';
      formChanged();
    });
  }

  async function checkRouter(loadModels, interactive = true) {
    cancelRouterCheck();
    const request = { controller: new AbortController(), loadModels };
    activeRouterCheck = request;
    loadRouterModelsBtn.disabled = true;
    testRouterBtn.disabled = true;
    if (loadModels) renderModelPicker([], 'Loading models…');
    routerStatusText.textContent = loadModels ? 'Loading models from 9Router…' : 'Testing 9Router…';
    routerStatusText.style.color = 'var(--status-info)';
    let statusColor = 'var(--status-success)';
    try {
      const endpoint = getRouterEndpoint();
      const model = routerModel.value.trim();
      if (!loadModels && !model) throw new Error('Choose a model or enter your combo name first. Click Load Models to see available IDs.');
      if (interactive) {
        await allowEndpoint(endpoint);
      } else if (!(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
        const origin = `${endpoint.protocol}//${endpoint.hostname}/*`;
        if (!await chrome.permissions.contains({ origins: [origin] })) {
          if (activeRouterCheck !== request) return;
          renderModelPicker([], 'Click Load Models to connect');
          routerStatusText.textContent = 'Click Load Models to allow access to this router and discover its models.';
          routerStatusText.style.color = 'var(--muted)';
          return;
        }
      }
      if (activeRouterCheck !== request) return;
      const headers = { 'Content-Type': 'application/json' };
      const key = routerKey.value.trim();
      if (key) headers.Authorization = `Bearer ${key}`;
      endpoint.pathname += loadModels ? '/models' : '/chat/completions';
      const response = await fetch(endpoint.href, {
        method: loadModels ? 'GET' : 'POST',
        headers,
        ...(loadModels ? {} : { body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Respond with the word OK' }], stream: false }) }),
        signal: AbortSignal.any([request.controller.signal, AbortSignal.timeout(30000)])
      });
      const data = await response.json().catch(() => ({}));
      if (activeRouterCheck !== request) return;
      if (!response.ok) throw new Error(data.error?.message || `9Router returned HTTP ${response.status}. Check the router key and provider configuration.`);
      if (loadModels) {
        if (!Array.isArray(data.data)) throw new Error('9Router did not return a model list. Check that the base URL points to its /v1 API.');
        const ids = [...new Set(data.data.filter(item => !item?.kind || item.kind === 'llm').map(item => item?.id).filter(id => typeof id === 'string' && id.trim()))].sort();
        renderModelPicker(ids, ids.length ? `Choose from ${ids.length} available models` : 'No models available');
        // 9Router lists its whole built-in catalogue when no provider connection is
        // saved, and gives no marker for connected providers. Surface that case.
        const providers = new Set(ids.filter(id => id.includes('/')).map(id => id.slice(0, id.indexOf('/'))));
        const catalogueFallback = providers.size >= CATALOGUE_PROVIDER_THRESHOLD;
        routerStatusText.textContent = !ids.length
          ? 'No models available. Connect a provider in the 9Router dashboard, then load models again, or enter your combo name.'
          : catalogueFallback
            ? `9Router listed ${ids.length} models from ${providers.size} providers. That is its full catalogue, which it returns when no provider is saved as connected, so many of these will not work. Connect a provider in the 9Router dashboard and click Load Models again, or choose a model you know works and click Test 9Router.`
            : `Loaded ${ids.length} model${ids.length === 1 ? '' : 's'}. Choose from Available Models, or type a combo below. Test 9Router, then save.`;
        statusColor = catalogueFallback ? 'var(--status-busy)' : 'var(--status-success)';
      } else {
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('9Router returned an empty reply. Check the model or combo in its dashboard.');
        routerStatusText.textContent = `9Router is working with ${model}. Click Save Settings to use it for Sensei.`;
      }
      routerStatusText.style.color = statusColor;
    } catch (error) {
      if (activeRouterCheck !== request) return;
      if (loadModels) renderModelPicker([], 'Could not load models. Click Load Models to retry.');
      routerStatusText.textContent = `${error.message} Ensure 9Router is running and the URL is reachable.`;
      routerStatusText.style.color = 'var(--status-error)';
    } finally {
      if (activeRouterCheck === request) {
        activeRouterCheck = null;
        loadRouterModelsBtn.disabled = false;
        testRouterBtn.disabled = false;
      }
    }
  }

  loadRouterModelsBtn.addEventListener('click', () => checkRouter(true));
  testRouterBtn.addEventListener('click', () => checkRouter(false));

  // Test the optional Sudachi parser
  testServerBtn.addEventListener('click', async () => {
    serverStatusText.textContent = 'Testing connection…';
    serverStatusText.style.color = 'var(--status-info)';
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
        serverStatusText.style.color = 'var(--status-success)';
      } else {
        serverStatusText.textContent = `Server replied with HTTP ${res.status}`;
        serverStatusText.style.color = 'var(--status-error)';
      }
    } catch (e) {
      serverStatusText.textContent = `${e.message}. Check the Sudachi parser at ${url}.`;
      serverStatusText.style.color = 'var(--status-error)';
    }
  });

  // 8. Test AnkiConnect
  testAnkiBtn.addEventListener('click', async () => {
    ankiStatusText.textContent = 'Testing AnkiConnect…';
    ankiStatusText.style.color = 'var(--status-info)';
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
        const data = await res.json().catch(() => null);
        if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'AnkiConnect returned an API error');
        if (!Number.isInteger(data?.result) || data.result < 6) {
          throw new Error('Invalid AnkiConnect response: expected API version 6 or newer');
        }
        ankiStatusText.textContent = `AnkiConnect is active (API version ${data.result}).`;
        ankiStatusText.style.color = 'var(--status-success)';
      } else {
        ankiStatusText.textContent = `HTTP error ${res.status}`;
        ankiStatusText.style.color = 'var(--status-error)';
      }
    } catch (e) {
      ankiStatusText.textContent = `${e.message}. Check the URL and that Anki is open with AnkiConnect.`;
      ankiStatusText.style.color = 'var(--status-error)';
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

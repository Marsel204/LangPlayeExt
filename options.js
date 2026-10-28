/**
 * LinguaPlay Chrome Extension — Options Script (options.js)
 */

// Display labels from 9Router's public provider registry (0.5.112). These do not
// determine access or membership; new and custom prefixes still appear as-is.
// https://github.com/decolua/9router/blob/master/src/shared/constants/providers.js
const ROUTER_PROVIDER_NAMES = Object.freeze({
  "gc": "Gemini CLI",
  "kr": "Kiro AI",
  "mmf": "MiMo Code Free",
  "oc": "OpenCode Free",
  "bpm": "BytePlus ModelArk",
  "cf": "Cloudflare",
  "coqui": "Coqui TTS",
  "edge-tts": "Edge TTS",
  "gemini": "Gemini",
  "google-tts": "Google TTS",
  "kimchi": "Kimchi",
  "local-device": "Local Device",
  "nvidia": "NVIDIA NIM",
  "ollama": "Ollama Cloud",
  "openrouter": "OpenRouter",
  "searxng": "SearXNG",
  "tortoise": "Tortoise TTS",
  "vx": "Vertex AI",
  "af": "API.airforce",
  "bzl": "Bazaarlink",
  "kgw": "Kilo Gateway",
  "ps": "Poolside",
  "agnes": "Agnes AI",
  "nous": "Nous Research",
  "ag": "Antigravity",
  "cc": "Claude Code",
  "cl": "Cline",
  "clinepass": "ClinePass",
  "cbcn": "CodeBuddy CN",
  "cx": "OpenAI Codex",
  "cu": "Cursor IDE",
  "gh": "GitHub Copilot",
  "glm": "Zai GLM Coding",
  "gcli": "Grok CLI (Grok Build)",
  "if": "iFlow AI",
  "kc": "Kilo Code",
  "kimi": "Kimi",
  "qdcn": "Qoder CN",
  "qd": "Qoder",
  "xai": "xAI (Grok)",
  "mimo": "Xiaomi MiMo",
  "cbai": "CodeBuddy",
  "zd": "Zed",
  "muse": "Muse (Meta Model API)",
  "mm": "MiniMax Code",
  "mmg": "MiniMax Code (Global)",
  "alicode-intl": "Alibaba Coding",
  "alicode": "Alibaba",
  "anthropic": "Anthropic",
  "aai": "AssemblyAI",
  "polly": "AWS Polly",
  "azure": "Azure OpenAI",
  "bfl": "Black Forest Labs",
  "bb": "Blackbox AI",
  "brave": "Brave Search",
  "cartesia": "Cartesia",
  "cerebras": "Cerebras",
  "ch": "Chutes AI",
  "cohere": "Cohere",
  "comfyui": "ComfyUI",
  "cmc": "Command Code",
  "dg": "Deepgram",
  "ds": "DeepSeek",
  "el": "ElevenLabs",
  "exa": "Exa",
  "fal": "Fal.ai",
  "fl": "Featherless",
  "firecrawl": "Firecrawl",
  "fireworks": "Fireworks AI",
  "glm-cn": "GLM (China)",
  "gpse": "Google PSE",
  "groq": "Groq",
  "hf": "HuggingFace",
  "hyp": "Hyperbolic",
  "inworld": "Inworld TTS",
  "jina": "Jina AI",
  "jina-reader": "Jina Reader",
  "linkup": "Linkup",
  "minimax-cn": "Minimax (China)",
  "minimax": "Minimax Coding",
  "mistral": "Mistral",
  "nb": "NanoBanana API",
  "nebius": "Nebius AI",
  "ollama-local": "Ollama Local",
  "ollama-search": "Ollama Search",
  "openai": "OpenAI",
  "ocg": "OpenCode Go",
  "ocz": "OpenCode Zen",
  "pplx": "Perplexity",
  "pa": "Perplexity Agent",
  "playht": "PlayHT",
  "recraft": "Recraft",
  "runway": "Runway ML",
  "sdwebui": "SD WebUI",
  "searchapi": "SearchAPI",
  "serper": "Serper",
  "siliconflow": "SiliconFlow",
  "sensenova": "SenseNova",
  "stability": "Stability AI",
  "tavily": "Tavily",
  "together": "Together AI",
  "topaz": "Topaz",
  "venice": "Venice AI",
  "vercel": "Vercel AI Gateway",
  "vxp": "Vertex Partner",
  "ark": "Volcengine Ark",
  "voyage": "Voyage AI",
  "xmtp": "Xiaomi MiMo (Token Plan)",
  "youcom": "You.com Search",
  "alims-intl": "Alibaba Studio",
  "qianfan": "Baidu Qianfan",
  "bm": "BluesMinds",
  "llm7": "LLM7",
  "samba": "SambaNova",
  "hunyuan": "Tencent Hunyuan",
  "morph": "Morph",
  "tokenrouter": "TokenRouter",
  "selfhosted-stt": "Self-hosted STT",
  "selfhosted-tts": "Self-hosted TTS",
  "selfhosted-embedding": "Self-hosted Embedding",
  "fish": "Fish Audio",
  "alitp-intl": "Alibaba Token Plan",
  "xquik": "Xquik",
  "tokenharbor": "Token Harbor",
  "dahl": "Dahl Inference",
  "atria": "Atria Dawn",
  "bai": "B.AI",
  "tinyfish": "TinyFish",
  "v1m": "v1m (System One)",
  "br": "AWS Bedrock",
  "brx": "AWS Bedrock (xAI)",
  "veo-free": "Veo AI Free Web",
  "rc": "Runcrate",
  "nace": "Nace Drex",
  "gw": "Grok Web (Subscription)",
  "pw": "Perplexity Web (Pro/Max)",
  "deepseek-web": "DeepSeek Web",
  "gemini-web": "Gemini Web",
  "muse-web": "Muse Web",
  "chatgpt-web": "ChatGPT Web",
  "uc": "UC Web"
});

document.addEventListener('DOMContentLoaded', () => {
  const routerUrl = document.getElementById('9router-url');
  const routerKey = document.getElementById('9router-key');
  const routerModel = document.getElementById('9router-model');
  const routerModels = document.getElementById('9router-models');
  const routerProviderSearch = document.getElementById('9router-provider-search');
  const routerProvider = document.getElementById('9router-provider');
  const routerProviderHelp = document.getElementById('9router-provider-help');
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
  let routerModelIds = new Set();
  let routerProviders = new Map();
  let modelProviders = new Map();
  let selectedProvider = '';
  let catalogPlaceholder = 'Load models to choose a provider';
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

  function currentModelProvider() {
    const model = routerModel.value.trim();
    const exact = modelProviders.get(model);
    if (exact) return exact;
    const prefix = model.includes('/') ? `provider:${model.slice(0, model.indexOf('/'))}` : '';
    return routerProviders.has(prefix) ? prefix : '';
  }

  function renderProviderModels() {
    const provider = routerProviders.get(selectedProvider);
    renderModelPicker(provider?.models || [], provider
      ? `Choose from ${provider.models.length} model${provider.models.length === 1 ? '' : 's'}`
      : routerProviders.size ? 'Choose a provider above' : catalogPlaceholder);
  }

  function renderProviderMenu() {
    const normalize = value => value.toLowerCase().replace(/[\s_-]+/g, '');
    const query = normalize(routerProviderSearch.value.trim());
    const providers = [...routerProviders.entries()]
      .filter(([, provider]) => normalize(`${provider.name} ${provider.prefix}`).includes(query))
      .sort((a, b) => a[1].name.localeCompare(b[1].name) || a[0].localeCompare(b[0]));
    if (routerProviders.size && !providers.some(([key]) => key === selectedProvider)) selectedProvider = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = providers.length ? 'Choose your provider' : routerProviders.size ? 'No matching providers' : catalogPlaceholder;
    routerProvider.replaceChildren(placeholder);
    for (const [key, provider] of providers) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${provider.name}${provider.prefix ? ` (${provider.prefix})` : ''} — ${provider.models.length} model${provider.models.length === 1 ? '' : 's'}`;
      routerProvider.appendChild(option);
    }
    routerProvider.value = providers.some(([key]) => key === selectedProvider) ? selectedProvider : '';
    routerProvider.disabled = providers.length === 0;
    routerProviderSearch.disabled = routerProviders.size === 0;
    routerProviderHelp.textContent = !routerProviders.size
      ? 'Load models, then choose your provider to narrow the list below.'
      : !providers.length
        ? 'No providers match. Try a different name or prefix, or clear the search.'
        : `${providers.length}${query ? ' matching' : ''} provider${providers.length === 1 ? '' : 's'}${query ? '' : ' listed by 9Router'}. Choose one to see its models.`;
    renderProviderModels();
  }

  function clearModelCatalog(message, resetProvider = false) {
    routerProviders = new Map();
    modelProviders = new Map();
    catalogPlaceholder = message;
    if (resetProvider) {
      selectedProvider = '';
      routerProviderSearch.value = '';
    }
    renderProviderMenu();
  }

  function loadModelCatalog(items) {
    const models = new Map();
    for (const item of items) {
      if ((item?.kind && item.kind !== 'llm') || typeof item?.id !== 'string' || !item.id.trim()) continue;
      if (!models.has(item.id) || item.owned_by === 'combo') models.set(item.id, item);
    }
    routerProviders = new Map();
    modelProviders = new Map();
    for (const [id, item] of [...models].sort((a, b) => a[0].localeCompare(b[0]))) {
      const prefix = item.owned_by === 'combo' || !id.includes('/') ? '' : id.slice(0, id.indexOf('/'));
      const key = prefix ? `provider:${prefix}` : 'combos';
      if (!routerProviders.has(key)) routerProviders.set(key, {
        prefix,
        name: prefix ? Object.hasOwn(ROUTER_PROVIDER_NAMES, prefix) ? ROUTER_PROVIDER_NAMES[prefix] : prefix : 'Combos & unprefixed models',
        models: []
      });
      routerProviders.get(key).models.push(id);
      modelProviders.set(id, key);
    }
    if (!routerProviders.has(selectedProvider)) selectedProvider = currentModelProvider()
      || (routerProviders.size === 1 ? routerProviders.keys().next().value : '');
    catalogPlaceholder = 'No models available';
    renderProviderMenu();
  }

  function updateCatalogStatus() {
    if (activeRouterCheck && !activeRouterCheck.loadModels) return;
    const provider = routerProviders.get(selectedProvider);
    routerStatusText.textContent = !modelProviders.size
      ? 'No models available. Connect a provider in the 9Router dashboard, then load models again, or enter your combo name.'
      : provider
        ? `Showing ${provider.models.length} model${provider.models.length === 1 ? '' : 's'} for ${provider.name}. Select a model, click Test 9Router, then save.`
        : `Loaded ${modelProviders.size} models. Search for your provider above, then choose a model. You can also enter a model ID or combo manually.`;
    routerStatusText.style.color = 'var(--status-info)';
  }

  routerProviderSearch.addEventListener('input', () => {
    renderProviderMenu();
    updateCatalogStatus();
  });
  routerProvider.addEventListener('change', () => {
    selectedProvider = routerProviders.has(routerProvider.value) ? routerProvider.value : '';
    renderProviderModels();
    updateCatalogStatus();
  });

  function modelChanged() {
    const provider = currentModelProvider();
    if (provider && provider !== selectedProvider) {
      selectedProvider = provider;
      routerProviderSearch.value = '';
      renderProviderMenu();
    }
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
      clearModelCatalog('Click Load Models to refresh', true);
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
    if (loadModels) clearModelCatalog('Loading models…');
    routerStatusText.textContent = loadModels ? 'Loading models from 9Router…' : 'Testing 9Router…';
    routerStatusText.style.color = 'var(--status-info)';
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
          clearModelCatalog('Click Load Models to connect');
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
        loadModelCatalog(data.data);
        updateCatalogStatus();
      } else {
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('9Router returned an empty reply. Check the model or combo in its dashboard.');
        routerStatusText.textContent = `9Router is working with ${model}. Click Save Settings to use it for Sensei.`;
        routerStatusText.style.color = 'var(--status-success)';
      }
    } catch (error) {
      if (activeRouterCheck !== request) return;
      if (loadModels) clearModelCatalog('Could not load models. Click Load Models to retry.');
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

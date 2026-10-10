const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('the unpacked extension has valid entry points without the standalone player', () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup,
    manifest.options_ui.page, manifest.options_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]),
    ...manifest.web_accessible_resources.flatMap(entry => entry.resources).filter(file => !file.includes('*'))];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `Missing extension resource: ${file}`);
  for (const file of ['player.html', 'css/styles.css', 'js/app.js', 'js/ai.js', 'js/anki.js', 'js/subtitles.js', 'lib/kuromoji.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), `Standalone resource still bundled: ${file}`);
  }
  assert.ok(!manifest.permissions.includes('contextMenus'));
  for (const file of ['background.js', 'popup.js', 'content.js']) {
    assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes('player.html'), `${file} still launches the removed app`);
  }
});

async function popup(activeUrl) {
  const elements = new Map();
  const tabs = [];
  const downloads = [];
  for (const [, id] of fs.readFileSync(path.join(root, 'popup.html'), 'utf8').matchAll(/id="([^"]+)"/g)) {
    elements.set(id, { listeners: {}, style: {}, value: '', addEventListener(name, callback) { this.listeners[name] = callback; } });
  }
  let ready;
  const sandbox = {
    URL, Blob,
    document: {
      getElementById: id => elements.get(id),
      addEventListener(_name, callback) { ready = callback; },
      createElement() { return { click() { downloads.push({ href: this.href, name: this.download }); } }; },
    },
    chrome: {
      tabs: { create(options) { tabs.push(options.url); }, query: async () => [{ url: activeUrl }] },
      runtime: { getURL: file => `chrome-extension://test/${file}`, openOptionsPage(callback) { callback(); } },
      storage: { local: { get(_keys, callback) { callback({ linguaplay_cards: [{ word: '猫', sentence: '猫がいる', reading: 'neko', meaning: 'cat' }] }); } } },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'), sandbox);
  await ready();
  return { elements, tabs, downloads, click: id => elements.get(id).listeners.click() };
}

test('popup opens YouTube and searches encoded Japanese queries directly', async () => {
  const h = await popup('https://www.youtube.com/watch?v=example');
  h.click('open-youtube-btn');
  assert.equal(h.tabs[0], 'https://www.youtube.com/');
  h.elements.get('popup-search-input').value = ' 日本語 & music? ';
  h.elements.get('popup-search-form').listeners.submit({ preventDefault() {} });
  assert.equal(new URL(h.tabs[1]).hostname, 'www.youtube.com');
  assert.equal(new URL(h.tabs[1]).pathname, '/results');
  assert.equal(new URL(h.tabs[1]).searchParams.get('search_query'), '日本語 & music?');
  h.elements.get('popup-search-input').value = ' ';
  h.elements.get('popup-search-form').listeners.submit({ preventDefault() {} });
  assert.equal(h.tabs.length, 2);
  assert.equal(h.elements.get('anki-card-count').textContent, '1 card');
});

test('popup study guidance appears only on YouTube watch pages', async () => {
  for (const [url, expected] of [
    ['https://www.youtube.com/watch?v=example', 'block'],
    ['https://youtube.com/watch?v=example', 'block'],
    ['https://www.youtube.com/results?search_query=日本語', undefined],
    ['https://www.youtube.com/watch', undefined],
    ['https://youtube.com.example.org/watch?v=example', undefined],
    ['https://example.org/?url=youtube.com/watch?v=example', undefined],
    ['invalid-url', undefined],
  ]) {
    assert.equal((await popup(url)).elements.get('yt-active-box').style.display, expected, url);
  }
});

test('saved cards still export from the extension popup after removing the app', async () => {
  const h = await popup('https://example.org/');
  h.click('export-tsv-btn');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].name, 'lingua_anki_cards.txt');
  assert.ok(h.downloads[0].href.startsWith('blob:'));
});

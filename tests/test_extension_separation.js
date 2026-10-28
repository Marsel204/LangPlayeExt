const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('the unpacked extension has valid entry points without the standalone player', () => {
  const files = [manifest.background.service_worker,
    manifest.options_ui.page, manifest.options_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]),
    ...manifest.web_accessible_resources.flatMap(entry => entry.resources).filter(file => !file.includes('*'))];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `Missing extension resource: ${file}`);
  for (const file of ['player.html', 'css/styles.css', 'js/app.js', 'js/ai.js', 'js/anki.js', 'js/subtitles.js', 'lib/kuromoji.js', 'popup.html', 'popup.css', 'popup.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), `Removed interface resource still bundled: ${file}`);
  }
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(!manifest.permissions.includes('contextMenus'));
  for (const file of ['background.js', 'content.js']) {
    assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes('player.html'), `${file} still launches the removed app`);
  }
});

test('clicking the toolbar icon opens Settings directly', () => {
  let clicked;
  let opened = 0;
  const sandbox = {
    chrome: {
      action: { onClicked: { addListener(callback) { clicked = callback; } } },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
        openOptionsPage() { opened++; }
      }
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), sandbox);
  assert.equal(typeof clicked, 'function');
  clicked({ id: 1, url: 'https://www.youtube.com/watch?v=example' });
  clicked({ id: 2, url: 'https://example.org/' });
  assert.equal(opened, 2);
});

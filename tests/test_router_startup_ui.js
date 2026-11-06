'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {dom, flush} = require('./perf/lib/fakes');
const {buildLinuxSetup, mountRouterStartup} = require('../js/router-startup');

const root = path.resolve(__dirname, '..');
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
function fixture(config = {}) {
  const d = dom();
  const ids = ['router-startup', '9router-url', 'enable-router-startup', 'disable-router-startup', 'check-router-startup', 'download-router-setup', 'router-setup-instruction', 'router-startup-status'];
  for (const id of ids) { const el = d.document.createElement('div'); el.id = id; d.document.body.appendChild(el); }
  d.elements.get('9router-url').value = config.url || 'http://127.0.0.1:20128/v1';
  d.elements.get('router-startup').hidden = true;
  const messages = [], blobs = [];
  const runtime = {id: extensionId, getURL: name => 'chrome-extension://fixture/' + name,
    getPlatformInfo: async () => ({os: config.os || 'linux'}),
    sendMessage: (message, callback) => { messages.push(message); callback(config.reply?.(message) || {success: false, setupRequired: true, error: 'Install the Linux helper'}); }};
  const env = {...d, ...d.clock, chrome: {runtime, storage: {local: {get: async () => ({linguaplay_9router_url: config.url})}}},
    URL: class extends URL { static createObjectURL(blob) { blobs.push(blob); return 'blob:fixture'; } static revokeObjectURL() {} }, Blob,
    fetch: async url => ({ok: true, text: async () => readFileSync(path.join(root, url.split('/native/')[1] ? 'native/' + url.split('/native/')[1] : 'missing'), 'utf8')})};
  return {...d, env, runtime, messages, blobs, click: async id => { d.elements.get(id).click(); await flush(); }};
}

test('missing helper offers a self-contained setup download for this extension', async () => {
  const h = fixture();
  await mountRouterStartup(h.env);
  assert.equal(h.elements.get('download-router-setup').hidden, false);
  assert.equal(h.elements.get('enable-router-startup').disabled, true);
  await h.click('download-router-setup');
  assert.equal(h.blobs.length, 1);
  const script = await h.blobs[0].text();
  assert.ok(script.startsWith('#!/usr/bin/env bash'));
  assert.match(script, /enable_autostart/);
  assert.equal(h.elements.get('router-setup-instruction').hidden, false);
  assert.match(h.elements.get('router-startup-status').textContent, /downloaded/);
  assert.deepEqual(h.messages.map(message => message.action), ['GET_9ROUTER_STARTUP']);
});

test('Settings enables and disables startup without saving or changing the parser', async () => {
  let enabled = false, active = false;
  const h = fixture({reply: message => {
    if (message.action === 'ENABLE_9ROUTER_STARTUP') enabled = active = true;
    if (message.action === 'DISABLE_9ROUTER_STARTUP') enabled = false;
    return {success: true, installed: true, enabled, active};
  }});
  await mountRouterStartup(h.env);
  assert.equal(h.elements.get('enable-router-startup').disabled, false);
  await h.click('enable-router-startup');
  assert.match(h.elements.get('router-startup-status').textContent, /starts at login and is running/);
  assert.equal(h.elements.get('disable-router-startup').hidden, false);
  await h.click('disable-router-startup');
  assert.match(h.elements.get('router-startup-status').textContent, /startup is off/);
  assert.deepEqual(h.messages.map(message => message.action), ['GET_9ROUTER_STARTUP', 'ENABLE_9ROUTER_STARTUP', 'DISABLE_9ROUTER_STARTUP']);
});

test('remote endpoints and other operating systems do not call the Linux helper', async () => {
  for (const config of [{url: 'https://router.example/v1'}, {os: 'win'}]) {
    const h = fixture(config);
    await mountRouterStartup(h.env);
    await h.click('enable-router-startup');
    assert.equal(h.messages.length, 0);
    if (config.os === 'win') assert.equal(h.elements.get('router-startup').hidden, true);
    else assert.equal(h.elements.get('enable-router-startup').disabled, true);
  }
});

test('downloaded script registers the helper and enables startup in an isolated Linux home', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'langplay-router-'));
  try {
    const bin = path.join(home, '.local/bin');
    mkdirSync(bin, {recursive: true});
    writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nprintf "%s\\n" "$0"\n', {mode: 0o700});
    writeFileSync(path.join(bin, 'systemctl'), `#!/usr/bin/python3
import os, pathlib, sys
home = pathlib.Path.home()
args = sys.argv[1:]
unit = home / '.config/systemd/user/9router.service'
if 'enable' in args: (home / 'enabled').touch()
if 'start' in args: (home / 'active').touch()
if 'disable' in args: (home / 'enabled').unlink(missing_ok=True)
if 'show' in args:
 print('LoadState=' + ('loaded' if unit.exists() else 'not-found'))
 print('UnitFileState=' + ('enabled' if (home / 'enabled').exists() else 'disabled'))
 print('ActiveState=' + ('active' if (home / 'active').exists() else 'inactive'))
`, {mode: 0o700});
    const app = path.join(home, '.local/lib/node_modules/9router/app');
    mkdirSync(app, {recursive: true});
    writeFileSync(path.join(app, 'custom-server.js'), '// fixture');
    const sources = Object.fromEntries(['native_host.py', 'install_host.py', 'router_autostart.py'].map(name => [name, readFileSync(path.join(root, 'native', name), 'utf8')]));
    const script = path.join(home, 'setup.sh');
    writeFileSync(script, buildLinuxSetup(extensionId, sources));
    const result = spawnSync('/bin/bash', [script], {env: {...process.env, HOME: home, PATH: bin + ':/usr/bin:/bin'}, encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(path.join(home, 'enabled')));
    const config = JSON.parse(readFileSync(path.join(home, '.local/share/linguaplay/native/config.json'), 'utf8'));
    assert.deepEqual(config.allowed_origins, ['chrome-extension://' + extensionId + '/']);
    assert.equal(config.server_path, null);
    const manifest = JSON.parse(readFileSync(path.join(home, '.config/chromium/NativeMessagingHosts/com.linguaplay.server.json'), 'utf8'));
    assert.deepEqual(manifest.allowed_origins, config.allowed_origins);
    assert.match(readFileSync(path.join(home, '.config/systemd/user/9router.service'), 'utf8'), /HOSTNAME=127.0.0.1/);
    assert.match(result.stdout, /start automatically/);
    const request = message => {
      const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4);
      if (os.endianness() === 'LE') header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
      const response = spawnSync(manifest.path, ['chrome-extension://' + extensionId + '/'], {
        input: Buffer.concat([header, body]), env: {...process.env, HOME: home, PATH: bin + ':/usr/bin:/bin'}, timeout: 15000
      });
      assert.equal(response.status, 0, response.stderr.toString());
      return JSON.parse(response.stdout.subarray(4).toString());
    };
    assert.equal(request({action: 'router_startup_status'}).enabled, true);
    assert.equal(request({action: 'disable_router_startup'}).enabled, false);
    assert.equal(request({action: 'enable_router_startup'}).enabled, true);
    assert.equal(request({action: 'enable_router_startup', command: 'unexpected'}).success, false);
  } finally { rmSync(home, {recursive: true, force: true}); }
});

test('setup download refuses missing assets and invalid extension identities', () => {
  assert.throws(() => buildLinuxSetup('unexpected', {}), /identify this extension/);
  assert.throws(() => buildLinuxSetup(extensionId, {}), /incomplete/);
});

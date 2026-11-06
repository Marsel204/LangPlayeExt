(function () {
  'use strict';

  function buildLinuxSetup(extensionId, files) {
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Could not identify this extension. Reload Settings and try again.');
    const names = ['native_host.py', 'install_host.py', 'router_autostart.py'];
    if (!names.every(name => typeof files[name] === 'string' && files[name])) throw new Error('The Linux setup files are incomplete. Reload or update the extension.');
    const payload = btoa(Array.from(new TextEncoder().encode(JSON.stringify({extensionId, files: Object.fromEntries(names.map(name => [name, files[name]]))})), byte => String.fromCharCode(byte)).join(''));
    return `#!/usr/bin/env bash
# LinguaPlay: register this extension's Linux helper and enable 9Router at login.
# Uses the installed Node.js and 9Router; no downloads or administrator access.
set -euo pipefail
python3 - <<'LANGPLAY_SETUP'
import base64, json, pathlib, subprocess, sys, tempfile
payload = json.loads(base64.b64decode('${payload}'))
try:
    with tempfile.TemporaryDirectory(prefix='langplay-setup-') as directory:
        for name, source in payload['files'].items():
            pathlib.Path(directory, name).write_text(source, encoding='utf-8')
        subprocess.run([sys.executable, str(pathlib.Path(directory, 'install_host.py')), '--router-only', '--extension-id', payload['extensionId']], check=True)
        sys.path.insert(0, directory)
        from router_autostart import enable_autostart
        status = enable_autostart()
    print('9Router will start automatically when you log in.')
    if status.get('portBusy'):
        print('Port 20128 is already in use, so no second process was started. The service will start at your next login.')
    else:
        print('The 9Router service is running now.')
    print('Return to LangPlay Settings and click Check startup.')
except Exception as error:
    sys.exit('Setup could not finish: ' + str(error))
LANGPLAY_SETUP
`;
  }

  async function mountRouterStartup({document, chrome, fetch, URL, Blob, setTimeout, clearTimeout}) {
    const group = document.getElementById('router-startup');
    if (!group) return;
    const platform = await chrome.runtime.getPlatformInfo();
    if (platform.os !== 'linux') return;
    group.hidden = false;
    const input = document.getElementById('9router-url');
    const enable = document.getElementById('enable-router-startup');
    const disable = document.getElementById('disable-router-startup');
    const check = document.getElementById('check-router-startup');
    const download = document.getElementById('download-router-setup');
    const instruction = document.getElementById('router-setup-instruction');
    const status = document.getElementById('router-startup-status');
    let busy = false, generation = 0, setupRequired = false, lastStatus = null;
    let savedUrl = (await chrome.storage.local.get(['linguaplay_9router_url'])).linguaplay_9router_url || 'http://127.0.0.1:20128/v1';
    function isLocal(value) {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '20128' && !url.username && !url.password;
      } catch { return false; }
    }
    function available() { return isLocal(input.value) && isLocal(savedUrl); }
    function controls() {
      enable.disabled = busy || !available() || setupRequired || lastStatus?.enabled === true;
      disable.hidden = !lastStatus?.enabled;
      disable.disabled = busy || !available();
      check.disabled = busy || !available();
      download.hidden = !setupRequired || !available();
      download.disabled = busy;
    }
    function show(text, color = 'info') {
      status.textContent = text;
      status.style.color = `var(--status-${color})`;
    }
    function request(action) {
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve({success: false, error: 'The Linux helper timed out. Check startup again.'}), 60000);
        chrome.runtime.sendMessage({action}, result => {
          clearTimeout(timer);
          const error = chrome.runtime.lastError;
          resolve(error ? {success: false, error: error.message} : result || {success: false, error: 'No response from the Linux helper'});
        });
      });
    }
    async function run(action) {
      if (busy || !available()) return;
      const owner = ++generation;
      busy = true;
      show(action === 'GET_9ROUTER_STARTUP' ? 'Checking login startup…' : action === 'ENABLE_9ROUTER_STARTUP' ? 'Enabling login startup…' : 'Turning off login startup…', 'busy');
      controls();
      try {
        const result = await request(action);
        if (owner !== generation || !available()) return;
        setupRequired = result.setupRequired === true;
        if (!result.success) { show(result.error || 'Could not read login startup. Try Check startup again.', setupRequired ? 'info' : 'error'); return; }
        lastStatus = result;
        instruction.hidden = true;
        if (result.portBusy) show('Login startup enabled. Port 20128 is already in use, so no second process was started. The service will start at your next login.', 'success');
        else if (result.enabled) show(result.active ? '9Router starts at login and is running now.' : '9Router starts at login. The service is not running now.', result.active ? 'success' : 'info');
        else show(result.active ? '9Router is running. Login startup is off.' : 'Login startup is off. Enable it to keep 9Router running in the background.');
      } catch (error) { if (owner === generation) show(error.message, 'error'); }
      finally { busy = false; controls(); }
    }
    function endpointChanged() {
      generation++;
      if (!available()) show('These controls manage 9Router on this computer at port 20128. Use and save the local API address to enable them.');
      controls();
    }
    input.addEventListener('input', endpointChanged);
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes.linguaplay_9router_url) { savedUrl = changes.linguaplay_9router_url.newValue || 'http://127.0.0.1:20128/v1'; endpointChanged(); }
    });
    enable.addEventListener('click', () => run('ENABLE_9ROUTER_STARTUP'));
    disable.addEventListener('click', () => run('DISABLE_9ROUTER_STARTUP'));
    check.addEventListener('click', () => run('GET_9ROUTER_STARTUP'));
    download.addEventListener('click', async () => {
      if (busy || !available()) return;
      busy = true; controls();
      try {
        const entries = await Promise.all(['native_host.py', 'install_host.py', 'router_autostart.py'].map(async name => {
          const response = await fetch(chrome.runtime.getURL('native/' + name));
          if (!response.ok) throw new Error('Could not load the Linux setup files. Reload the extension and try again.');
          return [name, await response.text()];
        }));
        const script = buildLinuxSetup(chrome.runtime.id, Object.fromEntries(entries));
        const blobUrl = URL.createObjectURL(new Blob([script], {type: 'text/x-shellscript'}));
        const link = document.createElement('a');
        link.href = blobUrl; link.download = 'langplay-9router-setup.sh';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        instruction.hidden = false;
        show('Setup script downloaded. Run it once on this computer, then click Check startup.');
      } catch (error) { show(error.message, 'error'); }
      finally { busy = false; controls(); }
    });
    if (available()) await run('GET_9ROUTER_STARTUP');
    else endpointChanged();
  }

  if (typeof module === 'object' && module.exports) module.exports = {buildLinuxSetup, mountRouterStartup};
  else document.addEventListener('DOMContentLoaded', () => mountRouterStartup(globalThis).catch(error => {
    const status = document.getElementById('router-startup-status');
    if (status) status.textContent = error.message;
  }));
})();

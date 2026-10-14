const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

test('disabling the real bridge stops polling and requested caption changes until re-enabled', () => {
  const source = fs.readFileSync(require.resolve('../js/youtube-bridge.js'), 'utf8');
  const listeners = new Map();
  const polls = [];
  const calls = [];
  const english = { languageCode: 'en', vssId: '.en' };
  const japanese = { languageCode: 'ja', vssId: '.ja' };
  let selected = english;
  let ccEnabled = false;
  const player = {
    loadModule(name) { calls.push(['load', name]); },
    getOption(_module, key) { return key === 'tracklist' ? [english, japanese] : selected; },
    setOption(_module, _key, track) { calls.push(['track', track]); selected = track; },
  };
  const cc = {
    getAttribute() { return String(ccEnabled); },
    click() { calls.push(['CC']); ccEnabled = !ccEnabled; },
  };
  const sandbox = {
    console: { log() {} },
    window: {
      addEventListener(name, callback) { listeners.set(name, callback); },
      dispatchEvent(event) { listeners.get(event.type)?.(event); },
    },
    document: {
      getElementById(id) { return id === 'movie_player' ? player : null; },
      querySelector(selector) { return selector === '.ytp-subtitles-button' ? cc : null; },
      addEventListener() {},
    },
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    setInterval(callback) { polls.push(callback); },
    setTimeout() {},
  };
  vm.runInNewContext(source, sandbox);
  const setEnabled = enabled => sandbox.window.dispatchEvent({ type: 'LINGUAPLAY_SET_APP_STATE', detail: { enabled } });
  const requestSwitch = () => sandbox.window.dispatchEvent({ type: 'LINGUAPLAY_REQUEST_TRACK_SWITCH', detail: { vssId: '.ja' } });
  setEnabled(false);
  polls.forEach(poll => poll());
  requestSwitch();
  assert.deepEqual(calls, []);
  assert.equal(selected, english);
  assert.equal(ccEnabled, false);
  setEnabled(true);
  polls.forEach(poll => poll());
  assert.equal(selected, japanese);
  assert.equal(ccEnabled, true);
  setEnabled(false);
  selected = english; // The user selects original captions while the app is off.
  ccEnabled = false;
  calls.length = 0;
  polls.forEach(poll => poll());
  requestSwitch();
  assert.deepEqual(calls, []);
  assert.equal(selected, english);
  setEnabled(true);
  requestSwitch();
  assert.equal(selected, japanese);
  assert.equal(ccEnabled, true);
});

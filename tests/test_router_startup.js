'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone} = require('./perf/lib/fakes');

const sender = {id: 'fixture-extension', url: 'chrome-extension://fixture-extension/options.html'};
function setup(config = {}) {
  const worker = background(storage(config));
  const native = [];
  worker.sandbox.chrome.runtime.sendNativeMessage = (name, message, callback) => {
    native.push({name, message: clone(message)});
    callback({success: true, installed: true, enabled: true, active: true});
  };
  return {worker, native, request: (action, values = {}, origin = sender) => worker.request({action, ...values}, origin)};
}

test('only Settings can manage local 9Router login startup through the fixed native action', async () => {
  const h = setup();
  for (const [action, expected] of [['GET_9ROUTER_STARTUP', 'router_startup_status'], ['ENABLE_9ROUTER_STARTUP', 'enable_router_startup'], ['DISABLE_9ROUTER_STARTUP', 'disable_router_startup']]) {
    assert.equal((await h.request(action)).success, true);
    assert.deepEqual(h.native.at(-1), {name: 'com.linguaplay.server', message: {action: expected}});
  }
  for (const origin of [{...sender, url: 'https://www.youtube.com/watch?v=A'}, {...sender, id: 'other'}, {...sender, url: 'https://www.netflix.com/watch/123'}, {...sender, url: 'chrome-extension://fixture-extension/elsewhere.html'}]) {
    assert.equal((await h.request('ENABLE_9ROUTER_STARTUP', {}, origin)).success, false);
  }
  assert.equal((await h.request('ENABLE_9ROUTER_STARTUP', {command: 'unexpected'})).success, false);
  assert.equal(h.native.length, 3);
});

test('remote and nonstandard router endpoints cannot configure a local login service', async () => {
  for (const url of ['https://router.example/v1', 'http://localhost:9999/v1', 'http://user:secret@localhost:20128/v1']) {
    const h = setup({linguaplay_9router_url: url});
    const result = await h.request('ENABLE_9ROUTER_STARTUP');
    assert.equal(result.success, false);
    assert.match(result.error, /local|127.0.0.1/);
    assert.equal(h.native.length, 0);
  }
});

test('missing and outdated helpers offer one-time Linux setup without changing settings', async () => {
  const h = setup();
  h.worker.sandbox.chrome.runtime.sendNativeMessage = (_name, _message, callback) => {
    h.worker.sandbox.chrome.runtime.lastError = {message: 'Specified native messaging host not found.'};
    callback();
    delete h.worker.sandbox.chrome.runtime.lastError;
  };
  const result = await h.request('GET_9ROUTER_STARTUP');
  assert.equal(result.success, false);
  assert.equal(result.setupRequired, true);
  h.worker.sandbox.chrome.runtime.sendNativeMessage = (_name, _message, callback) => callback({success: false, error: 'Invalid startup request or port does not match the installed launcher'});
  assert.equal((await h.request('GET_9ROUTER_STARTUP')).setupRequired, true);
});

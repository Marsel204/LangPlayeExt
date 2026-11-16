'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone} = require('./perf/lib/fakes');

const sender = {id: 'fixture-extension', url: 'https://www.youtube.com/watch?v=A'};
const answer = content => ({ok: true, status: 200, json: async () => ({choices: [{message: {content}}]})});
const refused = () => Promise.reject(new TypeError('Failed to fetch'));

// The router is down until the helper starts it; the helper reply is configurable.
function setup({config = {linguaplay_9router_model: 'study-combo'}, helper = () => ({success: true, installed: true, enabled: true, active: true, started: true}), lastError = null} = {}) {
  const worker = background(storage(config));
  const state = {running: false, native: [], chats: 0, probes: 0, now: 1000000};
  worker.sandbox.Date = {now: () => state.now, parse: Date.parse};
  worker.sandbox.chrome.runtime.sendNativeMessage = (name, message, callback) => {
    state.native.push({name, message: clone(message)});
    const result = helper(message);
    if (result?.success && !lastError) state.running = true;
    if (lastError) worker.sandbox.chrome.runtime.lastError = {message: lastError};
    try { callback(lastError ? undefined : result); } finally { delete worker.sandbox.chrome.runtime.lastError; }
  };
  worker.sandbox.fetch = async (url, options) => {
    if (url.endsWith('/v1/models')) { state.probes++; return state.running ? {ok: false, status: 401, json: async () => ({})} : refused(); }
    if (!state.running) return refused();
    state.chats++;
    return answer('ok ' + JSON.parse(options.body).messages.at(-1).content);
  };
  const ask = (content = 'hi') => worker.request({action: 'CALL_9ROUTER_AI', messages: [{role: 'user', content}]}, sender).then(clone);
  return {worker, state, ask};
}

test('a stopped local 9Router is started once through the helper and the request is retried', async () => {
  const h = setup();
  const [first, second] = await Promise.all([h.ask('one'), h.ask('two')]);
  assert.deepEqual([first, second], [{success: true, content: 'ok one'}, {success: true, content: 'ok two'}]);
  assert.deepEqual(h.state.native, [{name: 'com.linguaplay.server', message: {action: 'start_router'}}], 'Concurrent calls share one start');
  assert.ok(h.state.probes >= 1, 'The worker waits until 9Router answers before retrying');
  assert.equal(h.state.chats, 2);
  assert.deepEqual(await h.ask('three'), {success: true, content: 'ok three'});
  assert.equal(h.state.native.length, 1, 'A running router is not started again');
});

test('a missing or outdated helper explains the setup and is not asked again during the cooldown', async () => {
  for (const variant of [{lastError: 'Specified native messaging host not found.'}, {helper: () => ({success: false, error: 'Invalid startup request or port does not match the installed launcher'})}]) {
    const h = setup(variant);
    const result = await h.ask();
    assert.equal(result.success, false);
    assert.match(result.error, /9Router is not running.*Download Linux setup/);
    assert.equal((await h.ask()).success, false);
    assert.equal(h.state.native.length, 1, 'No helper storm while the cooldown lasts');
    h.state.now += 60000;
    await h.ask();
    assert.equal(h.state.native.length, 2, 'The start is tried again after the cooldown');
  }
});

test('a helper without an installed service reports its reason', async () => {
  const h = setup({helper: () => ({success: false, notInstalled: true, error: '9Router is not set up as a service. Enable login startup in Settings, or start 9Router yourself.'})});
  const result = await h.ask();
  assert.equal(result.success, false);
  assert.match(result.error, /could not be started: 9Router is not set up as a service/);
  assert.equal(h.state.chats, 0);
});

test('remote endpoints, other ports and timeouts never start the local service', async () => {
  for (const url of ['https://router.example/v1', 'http://localhost:9999/v1']) {
    const h = setup({config: {linguaplay_9router_model: 'study-combo', linguaplay_9router_url: url}});
    h.worker.sandbox.chrome.permissions.contains = async () => true;
    const result = await h.ask();
    assert.equal(result.success, false);
    assert.match(result.error, /Failed to fetch/);
    assert.equal(h.state.native.length, 0, url);
  }
  const h = setup();
  h.worker.sandbox.fetch = async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); };
  assert.equal((await h.ask()).success, false);
  assert.equal(h.state.native.length, 0, 'A slow router is not restarted');
});

test('an HTTP error from a running 9Router is reported without starting it', async () => {
  const h = setup();
  h.state.running = true;
  h.worker.sandbox.fetch = async () => ({ok: false, status: 502, json: async () => ({error: {message: 'Upstream provider failed'}})});
  assert.deepEqual(await h.ask(), {success: false, error: 'Upstream provider failed'});
  assert.equal(h.state.native.length, 0);
});

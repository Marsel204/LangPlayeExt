'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone, flush} = require('./perf/lib/fakes');

const sender = {id: 'fixture-extension', url: 'https://www.youtube.com/watch?v=A'};
const refused = () => Promise.reject(new TypeError('Failed to fetch'));
const ready = {success: true, installed: true, enabled: true, active: true, started: true};

// chrome.storage.session outlives a worker restart but not the browser.
function sessionStore(values = {}) {
  return {values, get: async key => key in values ? {[key]: clone(values[key])} : {}, set: async items => { Object.assign(values, clone(items)); }, remove: async key => { delete values[key]; }};
}

// The router is down until the helper starts it. Readiness is controlled by
// state.listening, separately from the helper's systemd answer.
function setup({config = {linguaplay_9router_model: 'study-combo'}, helper = () => ready, lastError = null, session = sessionStore(), state: shared} = {}) {
  const worker = background(storage(config));
  const state = shared || {listening: false, native: [], posts: 0, probes: 0, now: 1000000, listenOnStart: true};
  worker.sandbox.Date = {now: () => state.now, parse: Date.parse};
  worker.sandbox.chrome.storage.session = session;
  worker.sandbox.chrome.runtime.sendNativeMessage = (name, message, callback) => {
    state.native.push({name, message: clone(message)});
    const result = helper(message);
    if (result?.success && !lastError && state.listenOnStart) state.listening = true;
    if (lastError) worker.sandbox.chrome.runtime.lastError = {message: lastError};
    try { callback(lastError ? undefined : result); } finally { delete worker.sandbox.chrome.runtime.lastError; }
  };
  worker.sandbox.fetch = async (url, options) => {
    if (url.endsWith('/v1/models')) { state.probes++; return state.probe ? state.probe() : state.listening ? {ok: false, status: 401, json: async () => ({})} : refused(); }
    if (!state.listening) return refused();
    state.posts++;
    if (state.post) return state.post(options);
    return {ok: true, status: 200, json: async () => ({choices: [{message: {content: 'ok ' + JSON.parse(options.body).messages.at(-1).content}}]})};
  };
  const ask = (content = 'hi') => worker.request({action: 'CALL_9ROUTER_AI', messages: [{role: 'user', content}]}, sender).then(clone);
  return {worker, state, session, ask};
}

test('a stopped local 9Router is started once through the helper and the request is retried', async () => {
  const h = setup();
  const [first, second] = await Promise.all([h.ask('one'), h.ask('two')]);
  assert.deepEqual([first, second], [{success: true, content: 'ok one'}, {success: true, content: 'ok two'}]);
  assert.deepEqual(h.state.native, [{name: 'com.linguaplay.server', message: {action: 'start_router'}}], 'Concurrent calls share one start');
  assert.equal(h.state.posts, 2);
  assert.deepEqual(await h.ask('three'), {success: true, content: 'ok three'});
  assert.equal(h.state.native.length, 1, 'A running router is not started again');
});

test('the retry waits until the started router answers', async () => {
  const h = setup();
  h.state.listenOnStart = false;
  let answer;
  h.state.probe = () => {
    // Refused before the helper runs; afterwards the probe stays pending.
    if (!h.state.native.length) return refused();
    return new Promise(resolve => { answer = () => { h.state.listening = true; resolve({ok: false, status: 401, json: async () => ({})}); }; });
  };
  const result = h.ask('cold start');
  for (let i = 0; i < 20; i++) await flush();
  assert.equal(h.state.native.length, 1);
  assert.equal(h.state.posts, 0, 'No retry is sent before 9Router answers');
  answer();
  assert.deepEqual(await result, {success: true, content: 'ok cold start'});
  assert.equal(h.state.posts, 1);
});

test('a router that never answers fails after the wait and shares the failure', async () => {
  const h = setup();
  h.state.listenOnStart = false;
  h.worker.sandbox.setTimeout = (fn) => { h.state.now += 500; return setImmediate(fn); };
  const results = await Promise.all([h.ask(), h.ask()]);
  for (const result of results) assert.match(result.error, /did not answer within 15 seconds/);
  assert.equal(h.state.native.length, 1);
  assert.equal(h.state.posts, 0);
});

test('a network error from a running router is not replayed and does not start it', async () => {
  const h = setup();
  h.state.listening = true;
  h.state.post = () => Promise.reject(new TypeError('network error'));
  const result = await h.ask();
  assert.deepEqual(result, {success: false, error: 'network error'});
  assert.equal(h.state.posts, 1, 'An accepted request is sent only once');
  assert.equal(h.state.native.length, 0);
});

test('a missing or outdated helper explains the setup and the cooldown survives a worker restart', async () => {
  for (const variant of [{lastError: 'Specified native messaging host not found.'}, {helper: () => ({success: false, error: 'Invalid startup request or port does not match the installed launcher'})}]) {
    const session = sessionStore();
    const h = setup({...variant, session});
    const result = await h.ask();
    assert.equal(result.success, false);
    assert.match(result.error, /9Router is not running.*Download Linux setup/);
    await flush();
    // A fresh worker realm shares session storage but no globals.
    const restarted = setup({...variant, session, state: h.state});
    h.state.now += 40000;
    assert.match((await restarted.ask()).error, /Download Linux setup/);
    assert.equal(h.state.native.length, 1, 'No helper call while the cooldown lasts');
    h.state.now += 20000;
    await restarted.ask();
    assert.equal(h.state.native.length, 2, 'The start is tried again after the cooldown');
  }
});

test('a helper without an installed service reports its reason', async () => {
  const h = setup({helper: () => ({success: false, notInstalled: true, error: '9Router is not set up as a service. Enable login startup in Settings, or start 9Router yourself.'})});
  const result = await h.ask();
  assert.equal(result.success, false);
  assert.match(result.error, /could not be started: 9Router is not set up as a service/);
  assert.equal(h.state.posts, 0);
});

test('a successful start clears an earlier failure', async () => {
  const session = sessionStore();
  let fail = true;
  const h = setup({session, helper: () => fail ? {success: false, error: 'busy'} : ready});
  assert.equal((await h.ask()).success, false);
  await flush();
  assert.ok(session.values.linguaplay_router_start_failure);
  h.state.now += 60000;
  fail = false;
  assert.deepEqual(await h.ask('again'), {success: true, content: 'ok again'});
  await flush();
  assert.equal(session.values.linguaplay_router_start_failure, undefined);
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
  h.state.listening = true;
  h.state.post = async () => ({ok: false, status: 502, json: async () => ({error: {message: 'Upstream provider failed'}})});
  assert.deepEqual(await h.ask(), {success: false, error: 'Upstream provider failed'});
  assert.equal(h.state.native.length, 0);
});

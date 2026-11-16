'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {background} = require('./perf/lib/worker-fixture');
const {storage, clone} = require('./perf/lib/fakes');
const {create, flush} = require('./perf/lib/shipped');

const fields = {Front: '猫', Back: '<div>cat</div>'};
const IMAGE = Buffer.from('jpeg-bytes').toString('base64');
const AUDIO = Buffer.from('webm-bytes').toString('base64');

function ankiWorker(reply = () => ({result: 1, error: null})) {
  const worker = background(storage());
  const calls = [];
  worker.sandbox.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return {ok: true, json: async () => reply(body)};
  };
  return {calls, request: values => worker.request({action: 'ADD_ANKI_NOTE', fields, ...values}).then(clone)};
}

test('media is stored under worker-chosen names before the note that references it', async () => {
  const h = ankiWorker(body => ({result: body.action === 'storeMediaFile' ? body.params.filename : 1, error: null}));
  assert.deepEqual(await h.request({media: [{kind: 'image', data: IMAGE}, {kind: 'audio', data: AUDIO}]}), {success: true, media: 2});
  assert.deepEqual(h.calls.map(call => call.action), ['storeMediaFile', 'storeMediaFile', 'addNote']);
  const [image, audio] = h.calls.map(call => call.params.filename);
  assert.match(image, /^linguaplay-\d+-[a-z0-9]+\.jpg$/);
  assert.match(audio, /^linguaplay-\d+-[a-z0-9]+\.webm$/);
  assert.deepEqual([h.calls[0].params.data, h.calls[1].params.data], [IMAGE, AUDIO]);
  assert.equal(h.calls[2].params.note.fields.Back, `<div>cat</div><br><img src="${image}"><br>[sound:${audio}]`);
});

test('an unsafe filename from AnkiConnect is replaced by the generated one', async () => {
  const h = ankiWorker(body => ({result: body.action === 'storeMediaFile' ? '"><script>x</script>' : 1, error: null}));
  await h.request({media: [{kind: 'image', data: IMAGE}]});
  const generated = h.calls[0].params.filename;
  assert.equal(h.calls[1].params.note.fields.Back, `<div>cat</div><br><img src="${generated}">`);
});

test('invalid media is rejected before anything reaches Anki', async () => {
  for (const media of [
    'x', [{kind: 'video', data: IMAGE}], [{kind: 'image', data: IMAGE}, {kind: 'image', data: IMAGE}],
    [{kind: 'image', data: 'not base64!'}], [{kind: 'image', data: 'abc'}], [{kind: 'image', data: ''}],
    [{kind: 'image', data: 'A'.repeat(4000004)}], [{kind: 'image', data: IMAGE, filename: '../../evil'}],
    [{kind: 'image', data: IMAGE}, {kind: 'audio', data: AUDIO}, {kind: 'audio', data: AUDIO}]
  ]) {
    const h = ankiWorker();
    const result = await h.request({media});
    assert.deepEqual(result, {success: false, error: 'Invalid card media'});
    assert.equal(h.calls.length, 0);
  }
});

test('stored media is removed when the note is a duplicate or fails', async () => {
  for (const [noteReply, expected] of [[{result: null, error: 'cannot create note because it is a duplicate'}, {success: true, duplicate: true}], [{result: null, error: 'model was not found'}, {success: false, error: 'model was not found'}]]) {
    const h = ankiWorker(body => body.action === 'addNote' ? noteReply : {result: body.params.filename, error: null});
    assert.deepEqual(await h.request({media: [{kind: 'image', data: IMAGE}, {kind: 'audio', data: AUDIO}]}), expected);
    const stored = h.calls.filter(call => call.action === 'storeMediaFile').map(call => call.params.filename);
    assert.deepEqual(h.calls.filter(call => call.action === 'deleteMediaFile').map(call => call.params.filename), stored);
  }
});

test('a media store failure removes earlier media and adds no note', async () => {
  let stores = 0;
  const h = ankiWorker(body => body.action === 'storeMediaFile' ? (stores++ ? {result: null, error: 'disk full'} : {result: body.params.filename, error: null}) : {result: 1, error: null});
  const result = await h.request({media: [{kind: 'image', data: IMAGE}, {kind: 'audio', data: AUDIO}]});
  assert.deepEqual(result, {success: false, error: 'Anki could not store card media: disk full'});
  assert.equal(h.calls.some(call => call.action === 'addNote'), false);
  assert.deepEqual(h.calls.filter(call => call.action === 'deleteMediaFile').map(call => call.params.filename), [h.calls[0].params.filename]);
});

// Content: a canvas, captureStream and MediaRecorder stand in for the browser.
async function study({config = {}, pixels = [10, 20, 30, 255], capture = true} = {}) {
  const h = await create({linguaplay_ankiconnect_url: 'http://127.0.0.1:8765', ...config}, {fetch: async call => {
    if (call.category === 'anki') { const body = JSON.parse(call.options.body); return {ok: true, json: async () => ({result: body.action === 'storeMediaFile' ? body.params.filename : 1, error: null})}; }
    return {ok: false, status: 500, json: async () => ({}), text: async () => ''};
  }});
  const createElement = h.document.createElement.bind(h.document);
  h.document.createElement = tag => tag !== 'canvas' ? createElement(tag) : {
    width: 0, height: 0,
    getContext: () => ({drawImage() {}, getImageData: (x, y, w, hgt) => ({data: Uint8ClampedArray.from({length: w * hgt * 4}, (_, i) => pixels[i % 4])})}),
    toDataURL: () => 'data:image/jpeg;base64,' + IMAGE
  };
  const video = h.video;
  Object.assign(video, {videoWidth: 1280, videoHeight: 720, playbackRate: 1});
  const seeks = [];
  const originalAdd = video.addEventListener?.bind(video);
  video.addEventListener = (type, fn) => { if (type === 'seeked') { seeks.push(video.currentTime); queueMicrotask(fn); } else originalAdd?.(type, fn); };
  video.play = () => { video.paused = false; video.currentTime = 99; return Promise.resolve(); };
  if (capture) video.captureStream = () => ({getAudioTracks: () => [{stop() { video.trackStopped = true; }}]});
  h.sandbox.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
  h.sandbox.MediaRecorder = class {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({data: {size: 10}}); this.onstop(); }
  };
  h.sandbox.Blob = class { constructor(parts) { this.size = parts.length ? 10 : 0; } async arrayBuffer() { return Buffer.from('webm-bytes'); } };
  h.sandbox.btoa = btoa;
  h.setPlayback(video, [{start: 4, end: 6, text: '猫がいる'}]);
  video.currentTime = 5;
  h.onTimeUpdate();
  h.select('猫', '猫がいる');
  video.currentTime = 5.2;
  return {h, video, seeks};
}
const ankiMessage = h => h.messages.find(message => message.action === 'ADD_ANKI_NOTE');

test('Save card adds a screenshot and the replayed sentence audio, then restores playback', async () => {
  const {h, video, seeks} = await study();
  await h.click('lp-quick-anki-btn');
  for (let i = 0; i < 10; i++) await flush();
  await h.worker.drain();
  assert.deepEqual(ankiMessage(h).media, [{kind: 'image', data: IMAGE}, {kind: 'audio', data: AUDIO}]);
  assert.deepEqual(seeks, [3.85], 'Recording starts just before the pinned line');
  assert.equal(video.currentTime, 5.2, 'Playback returns to where it was');
  assert.equal(video.paused, true, 'A paused video stays paused');
  assert.equal(video.trackStopped, true);
  assert.match(h.elements.get('lp-quick-anki-btn').textContent, /Added to Anki/);
  const note = h.calls.find(call => call.category === 'anki' && JSON.parse(call.options.body).action === 'addNote');
  assert.match(JSON.parse(note.options.body).params.note.fields.Back, /<img src="linguaplay-.*\.jpg"><br>\[sound:linguaplay-.*\.webm\]$/);
});

test('turned-off media, protected video and missing capture save a text-only card', async () => {
  for (const [options, reason] of [
    [{config: {linguaplay_card_screenshot: false, linguaplay_card_audio: false}}, 'settings off'],
    [{pixels: [0, 0, 0, 255], capture: false}, 'black frame and no captureStream']
  ]) {
    const {h} = await study(options);
    await flush();
    await h.click('lp-quick-anki-btn');
    for (let i = 0; i < 10; i++) await flush();
    await h.worker.drain();
    assert.equal(ankiMessage(h).media, undefined, reason);
    assert.match(h.elements.get('lp-quick-anki-btn').textContent, /Added to Anki/, reason);
  }
});

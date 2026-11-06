'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush} = require('./perf/lib/shipped');
const {subtitles} = require('./perf/fixtures');

async function open(h, video = 'A') {
  h.navigate(video); h.checkAndInitVideo(); await flush();
  await h.click('linguaplay-jimaku-btn');
  h.elements.get('lp-jimaku-query').value = 'Fixture';
  h.elements.get('lp-jimaku-type').value = 'anime';
}
const search = h => h.elements.get('lp-jimaku-form').emit('submit');

test('Jimaku service errors are shown as recovery text rather than empty search results', async () => {
  const h = await create({}, {message: request => request.action === 'JIMAKU_SEARCH' ? {success: false, error: 'Add your Jimaku API key in Settings.'} : undefined});
  await open(h); search(h); await flush();
  assert.match(h.elements.get('lp-jimaku-status').textContent, /API key/);
  assert.equal(h.elements.get('lp-jimaku-results').children.length, 0);
});

test('later title searches and episode navigation reject old Jimaku responses', async () => {
  const pending = [];
  const h = await create({}, {message: request => request.action === 'JIMAKU_SEARCH' ? new Promise(resolve => pending.push(resolve)) : undefined});
  await open(h); search(h); search(h);
  pending[1]({success: true, entries: [{id: 2, name: 'New title'}]}); await flush();
  pending[0]({success: true, entries: [{id: 1, name: 'Old title'}]}); await flush();
  assert.match(h.elements.get('lp-jimaku-results').textContent, /New title/);
  assert.doesNotMatch(h.elements.get('lp-jimaku-results').textContent, /Old title/);
  search(h);
  await open(h, 'B');
  pending[2]({success: true, entries: [{id: 1, name: 'Old episode title'}]}); await flush();
  assert.equal(h.elements.get('lp-jimaku-results').children.length, 0);
});

test('Jimaku preview preserves active subtitles and explicit application beats delayed automatic captions', async () => {
  const h = await create({}, {message: request => {
    if (request.action === 'JIMAKU_SEARCH') return {success: true, entries: [{id: 12, name: 'Fixture'}]};
    if (request.action === 'JIMAKU_FILES') return {success: true, files: [{name: 'fixture.srt', size: 100, supported: true}]};
    if (request.action === 'JIMAKU_DOWNLOAD') return {success: true, text: '1\n00:00:00,000 --> 00:00:05,000\n新しい字幕', name: 'fixture.srt'};
  }});
  await open(h); await h.waitForFetch('captions');
  h.setPlayback(h.video, [{start: 0, end: 5, text: '現在の字幕'}]);
  search(h); await flush();
  h.elements.get('lp-jimaku-results').children[0].click(); await flush();
  h.elements.get('lp-jimaku-results').children[0].click(); await flush();
  assert.equal(h.timeline()[0].text, '現在の字幕');
  assert.equal(h.elements.get('lp-jimaku-apply').disabled, false);
  await h.click('lp-jimaku-apply');
  assert.equal(h.timeline()[0].text, '新しい字幕');
  h.resolve('captions', {}, subtitles(1, 'vtt', '古い自動字幕')); await flush();
  assert.equal(h.timeline()[0].text, '新しい字幕');
});

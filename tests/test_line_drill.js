'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush} = require('./perf/lib/shipped');

const CUES = [{start: 0, end: 2, text: '一行目です'}, {start: 2, end: 4, text: '二行目です'}];

async function playing(time = 1) {
  const h = await create();
  h.setPlayback(h.video, CUES.map(cue => ({...cue})));
  h.video.paused = false;
  h.video.currentTime = time;
  h.onTimeUpdate();
  const key = (key, extra = {}) => h.window.dispatchEvent({type: 'keydown', key, target: {tagName: 'BODY'}, preventDefault() {}, stopPropagation() {}, ...extra});
  const boundary = () => h.timeouts.filter(timer => timer.active && String(timer.fn).includes('lineBoundaryTimer = null')).at(-1);
  const fire = timer => { timer.active = false; timer.fn(); };
  return {h, key, boundary, fire};
}

test('A pauses at the end of each line once, then arms again for the next line', async () => {
  const {h, key, boundary, fire} = await playing(1);
  key('a');
  await flush();
  assert.equal(h.storage.state.linguaplay_auto_pause, true);
  assert.equal(h.elements.get('linguaplay-autopause-btn').getAttribute('aria-pressed'), 'true');
  const timer = boundary();
  assert.equal(timer.ms, 960, 'Aimed 40 ms before the line ends');
  h.video.currentTime = 1.97;
  fire(timer);
  assert.equal(h.video.paused, true);
  // Resuming near the end of the same line must not pause again immediately.
  h.video.paused = false;
  h.onTimeUpdate();
  assert.equal(boundary(), undefined);
  h.video.currentTime = 2.5;
  h.onTimeUpdate();
  assert.ok(boundary(), 'The next line is armed');
});

test('Q loops the current line instead of moving on', async () => {
  const {h, key, boundary, fire} = await playing(0.5);
  key('q');
  assert.equal(h.elements.get('linguaplay-loop-btn').getAttribute('aria-pressed'), 'true');
  h.video.currentTime = 1.98;
  fire(boundary());
  assert.equal(h.video.currentTime, 0);
  assert.equal(h.video.paused, false);
  h.onTimeUpdate();
  assert.ok(boundary(), 'The loop arms again');
  key('q');
  assert.equal(boundary(), undefined, 'Turning the loop off clears the timer');
});

test('R replays the current or most recent line, including the subtitle offset', async () => {
  const {h, key} = await playing(3);
  key(']');
  h.video.pause();
  key('r');
  assert.equal(h.video.currentTime, 2.1);
  assert.equal(h.video.paused, false);
  // In a gap after the last line, R replays that line.
  h.video.currentTime = 10;
  h.onTimeUpdate();
  key('r');
  assert.equal(h.video.currentTime, 2.1);
});

test('a seek before the timer fires does not pause or loop the wrong moment', async () => {
  const {h, key, boundary, fire} = await playing(1);
  key('a');
  h.video.currentTime = 0.2;
  fire(boundary());
  assert.equal(h.video.paused, false);
  assert.ok(boundary(), 'An early timer arms again');
  h.video.currentTime = 3.5;
  fire(boundary());
  assert.equal(h.video.paused, false, 'A forward seek past the line is not paused');
});

test('drill keys are ignored while typing, with modifiers, or without timed subtitles', async () => {
  const {h, key, boundary} = await playing(1);
  key('a', {target: {tagName: 'INPUT'}});
  key('a', {ctrlKey: true});
  key('a', {shiftKey: true});
  await flush();
  assert.equal(h.storage.state.linguaplay_auto_pause, undefined);
  assert.equal(boundary(), undefined);
  h.setPlayback(h.video, []);
  key('q');
  assert.equal(h.elements.get('linguaplay-loop-btn').getAttribute('aria-pressed'), 'false');
});

test('a saved auto-pause preference is restored', async () => {
  const h = await create({linguaplay_auto_pause: true});
  await flush();
  assert.equal(h.elements.get('linguaplay-autopause-btn').getAttribute('aria-pressed'), 'true');
});

test('a seek clears the pending boundary, so it cannot pause inside the next line', async () => {
  const h = await create();
  // Production attaches the video listeners when it adopts the watch page's video.
  h.navigate('drillvideo1');
  await h.tick();
  h.setPlayback(h.video, CUES.map(cue => ({...cue})));
  h.video.paused = false;
  h.video.currentTime = 1;
  h.onTimeUpdate();
  h.window.dispatchEvent({type: 'keydown', key: 'a', target: {tagName: 'BODY'}, preventDefault() {}, stopPropagation() {}});
  const boundary = () => h.timeouts.filter(timer => timer.active && String(timer.fn).includes('lineBoundaryTimer = null')).at(-1);
  const stale = boundary();
  assert.ok(stale);
  h.video.currentTime = 2.2;
  h.video.emit('seeking');
  assert.equal(stale.active, false, 'seeking clears the timer');
  // Even if a stale callback still runs mid-seek, it does nothing.
  h.video.seeking = true;
  stale.fn();
  assert.equal(h.video.paused, false);
  h.video.seeking = false;
  h.onTimeUpdate();
  assert.ok(boundary(), 'timeupdate arms the line now playing');
});

// Real DOM/CSS and trusted keyboard/fullscreen checks, called by browser_custom_ai.mjs.
// Uses the production bundle in a YouTube-shaped fixture on an extension page.
// Only caption/translation network responses and playback cues are controlled.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkSubtitleVisibility({ root, evaluate, rpc, sessionId }) {
  const [content, css] = await Promise.all([
    readFile(path.join(root, 'content.js'), 'utf8'),
    readFile(path.join(root, 'content.css'), 'utf8'),
  ]);
  const instrumented = content.replace(/\}\)\(\);\s*$/, `
    window.visibilityTestApi = {
      injectUI, checkAndInitVideo,
      setTimeline(cues) {
        activeVideoEl = document.querySelector('video');
        subtitleTimeline = cues;
        currentSubIndex = -1;
        onTimeUpdate();
      }
    };
  })();`);
  await evaluate(`(async () => {
    await chrome.storage.local.set({ linguaplay_reading_mode: 'furigana', linguaplay_panel_collapsed: true });
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
    document.body.innerHTML = '<main><div id="movie_player" class="html5-video-player"><video></video><div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment">猫がいる</span></div></div></div><aside id="secondary-inner"></aside></main>';
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(css)} + 'body {margin:0;background:#171526;} main {display:flex;gap:20px;padding:20px;} #movie_player {position:relative;width:900px;height:510px;background:#252039;flex-shrink:0;} #secondary-inner {width:360px;} video {width:100%;height:100%;} .ytp-caption-window-container {position:absolute;bottom:100px;color:white;}';
    document.head.appendChild(style);
    window.playerEvents = [];
    const player = document.getElementById('movie_player');
    ['click', 'keydown', 'keyup', 'pointerdown', 'pointerup'].forEach(name => player.addEventListener(name, () => window.playerEvents.push(name)));
    window.translationResolvers = [];
    window.completeTranslation = () => window.translationResolvers.splice(0).forEach(resolve => resolve({ok:true,json:async () => [[['A cat is here']]]}));
    window.fetch = (url) => {
      if (url.includes('translate.googleapis.com')) {
        return new Promise(resolve => window.translationResolvers.push(resolve));
      }
      if (url.includes('/api/captions')) {
        return Promise.resolve({ok:true,text:async () => 'WEBVTT\\n\\n00:00:00.000 --> 00:00:02.000\\n犬がいる\\n'});
      }
      return Promise.resolve({ok:false,json:async () => ({}),text:async () => ''});
    };
  })()`);
  await evaluate(instrumented);
  await evaluate('window.visibilityTestApi.injectUI()');
  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "猫がいる"');

  async function waitFor(expression) {
    for (let i = 0; i < 50; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Timed out waiting for ${expression}; state: ${JSON.stringify(await state())}`);
  }
  const stateExpression = `(() => {
    const button = document.getElementById('linguaplay-visibility-toggle');
    const display = selector => getComputedStyle(document.querySelector(selector)).display;
    const box = button.getBoundingClientRect();
    const playerBox = document.getElementById('movie_player').getBoundingClientRect();
    return {
      pressed: button.getAttribute('aria-pressed'), label: button.getAttribute('aria-label'), title: button.title,
      overlay: display('#linguaplay-yt-tokens-overlay'), drawer: display('#linguaplay-yt-drawer'),
      button: display('#linguaplay-visibility-toggle'), toolbar: display('#linguaplay-yt-bar'),
      eye: display('.linguaplay-eye-open'), eyeOff: display('.linguaplay-eye-off'),
      nativeOpacity: getComputedStyle(document.querySelector('.ytp-caption-window-container')).opacity,
      fallbackOpacity: getComputedStyle(document.querySelector('.caption-window')).opacity,
      tokens: document.getElementById('linguaplay-yt-tokens').textContent,
      translation: document.getElementById('lp-sentence-en').textContent,
      playerEvents: window.playerEvents,
      insidePlayer: box.left >= playerBox.left && box.right <= playerBox.right && box.top >= playerBox.top && box.bottom <= playerBox.bottom
    };
  })()`;
  const state = () => evaluate(stateExpression);
  const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  // The actual live-caption MutationObserver populates the overlay.
  await waitFor('document.getElementById("linguaplay-yt-tokens").textContent.includes("猫")');
  let current = await state();
  assert.equal(current.button, 'flex');
  assert.equal(current.toolbar, 'none');
  assert.equal(current.overlay, 'flex');
  assert.equal(current.drawer, 'none');
  assert.equal(current.eyeOff, 'none');
  assert.equal(current.insidePlayer, true);
  await evaluate('document.querySelector(".linguaplay-yt-token").click()');
  assert.notEqual((await state()).drawer, 'none');
  if (process.env.VISIBILITY_SCREENSHOT_PATH) {
    const screenshot = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(process.env.VISIBILITY_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  }
  await click('linguaplay-visibility-toggle');
  current = await state();
  assert.equal(current.pressed, 'true');
  assert.equal(current.label, 'Show subtitles and translation');
  assert.equal(current.title, current.label);
  assert.equal(current.overlay, 'none');
  assert.equal(current.drawer, 'none');
  assert.equal(current.nativeOpacity, '0');
  assert.equal(current.fallbackOpacity, '0');
  assert.equal(current.eye, 'none');
  assert.notEqual(current.eyeOff, 'none');
  assert.deepEqual(current.playerEvents, []);

  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "犬がいる"; window.completeTranslation()');
  await waitFor('document.getElementById("linguaplay-yt-tokens").textContent.includes("犬") && document.getElementById("lp-sentence-en").textContent === "A cat is here"');
  current = await state();
  assert.equal(current.overlay, 'none');
  assert.equal(current.drawer, 'none');
  await click('linguaplay-toggle-trigger');
  current = await state();
  assert.equal(current.toolbar, 'flex');
  assert.equal(current.button, 'flex');
  assert.equal(current.pressed, 'true');

  // Trusted input exercises the native button's Enter and Space activation.
  async function pressKey(key, code, virtualKey) {
    await evaluate('document.getElementById("linguaplay-visibility-toggle").focus()');
    for (const type of ['keyDown', 'keyUp']) {
      await rpc('Input.dispatchKeyEvent', {
        type, key, code, windowsVirtualKeyCode: virtualKey,
        ...(type === 'keyDown' ? { text: key === 'Enter' ? '\r' : ' ' } : {}),
      }, sessionId);
    }
  }
  await pressKey('Enter', 'Enter', 13);
  current = await state();
  assert.equal(current.pressed, 'false');
  assert.equal(current.overlay, 'flex');
  assert.notEqual(current.drawer, 'none');
  assert.ok(current.tokens.includes('犬'));
  assert.equal(current.translation, 'A cat is here');
  assert.deepEqual(current.playerEvents, []);
  await pressKey(' ', 'Space', 32);
  assert.equal((await state()).pressed, 'true');
  assert.deepEqual((await state()).playerEvents, []);

  // Native captions stay suppressed even when the Japanese overlay disappears.
  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "English caption"');
  await waitFor('!document.getElementById("linguaplay-yt-tokens-overlay").classList.contains("active")');
  assert.equal((await state()).nativeOpacity, '0');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).nativeOpacity, '1');
  await click('lp-dismiss-btn');
  await click('linguaplay-visibility-toggle');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).drawer, 'none');

  await click('linguaplay-visibility-toggle');
  await evaluate('history.pushState({}, "", "?v=next-video"); window.visibilityTestApi.checkAndInitVideo()');
  await evaluate('window.visibilityTestApi.setTimeline([{ start:0, end:2, text:"犬がいる" }])');
  current = await state();
  assert.equal(current.pressed, 'true');
  assert.ok(current.tokens.includes('犬'));
  assert.equal(current.overlay, 'none');
  const fullscreen = await rpc('Runtime.evaluate', {
    expression: 'document.getElementById("movie_player").requestFullscreen().then(() => !!document.fullscreenElement)',
    userGesture: true, awaitPromise: true, returnByValue: true,
  }, sessionId);
  assert.equal(fullscreen.result.value, true, JSON.stringify(fullscreen));
  await click('linguaplay-collapse-btn');
  current = await state();
  assert.equal(current.button, 'flex');
  assert.equal(current.insidePlayer, true);
  assert.equal(current.pressed, 'true');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).overlay, 'flex');
  await evaluate('document.exitFullscreen()');

  // Recreate all page DOM and rerun the bundle as on a full refresh.
  await rpc('Page.reload', {}, sessionId);
  await waitFor('document.readyState === "complete" && !document.getElementById("linguaplay-yt-widget")');
  assert.equal(await evaluate('document.documentElement.classList.contains("linguaplay-subtitles-hidden")'), false);
  return { liveCaptions: true, asyncTranslation: true, toolbar: true, keyboard: true, fullscreen: true, navigation: true, refresh: true };
}

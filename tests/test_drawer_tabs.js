// The former tabbed drawer is now LangPlay's single study surface.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush} = require('./perf/lib/shipped');

test('word selection keeps chat and sentence study together with the selected context', async () => {
  const h = await create();
  h.select('猫', '猫がいる');
  await flush();
  assert.equal(h.elements.get('lp-view-chat').style.display, 'block');
  assert.equal(h.elements.get('lp-active-word').textContent, '猫');
  assert.ok(h.elements.get('lp-resume-btn'));
  await h.click('lp-dismiss-btn');
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), true);
  assert.equal(h.snapshot().drawerContextSentence, '猫がいる');
});

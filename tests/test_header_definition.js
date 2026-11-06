const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush} = require('./perf/lib/shipped');

test('the study surface shows the selected dictionary meaning and updates it on another selection', async () => {
  const h = await create();
  h.select('世界', '世界は綺麗');
  await flush();
  assert.match(h.elements.get('lp-active-def').innerHTML, /world/);
  h.select('私', '私は学生');
  await flush();
  assert.equal(h.elements.get('lp-active-word').textContent, '私');
  assert.doesNotMatch(h.elements.get('lp-active-def').innerHTML, /world/);
});

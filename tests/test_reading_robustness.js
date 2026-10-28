'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('./perf/lib/shipped');
const wanakana = require('../lib/wanakana.min.js');

test('long ASCII runs preserve WanaKana output without repeated kana conversion', async () => {
  const h = await create({}, {extra: ['toRomajiSafe']});
  const ascii = Array.from({length: 128}, (_,i) => String.fromCharCode(i)).join('');
  assert.equal(wanakana.toRomaji(ascii), ascii);
  const input = 'ねこ' + ascii.repeat(1600) + 'んあ';
  const before = h.spies.wanakana.toRomaji || 0;
  assert.equal(h.toRomajiSafe(input), 'neko' + ascii.repeat(1600) + "n'a");
  assert.ok((h.spies.wanakana.toRomaji || 0) - before <= 2, 'only chunks containing kana need conversion');
});

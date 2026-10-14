// Exercise the subtitle helpers shipped on YouTube, without booting its DOM.
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
const start = source.indexOf('  // ── Subtitle Parser');
const end = source.indexOf('  // ── Language Detection Helper', start);
if (start < 0 || end < 0) throw new Error('YouTube subtitle helpers were not found');
module.exports = vm.runInNewContext(
  `${source.slice(start, end)}\n({parseVTT, parseSRT, parseLRC, parseSubtitleFile, cleanSongTitle})`
);

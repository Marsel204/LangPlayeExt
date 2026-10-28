// HTML-safe four-column Anki TSV export for Settings.
(function () {
  'use strict';
  const clean = value => String(value ?? '').replace(/[\t\r\n]/g, ' ');
  const escape = value => clean(value).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  globalThis.buildAnkiTsv = function buildAnkiTsv(cards) {
    let tsv = '#separator:Tab\n#html:true\n#deck:LinguaPlay Japanese Immersion\n';
    for (const card of cards) {
      const sourceWord = clean(card.word), sourceSentence = clean(card.sentence);
      const word = escape(sourceWord), reading = escape(card.reading), sentence = escape(sourceSentence);
      const translation = escape(card.sentence_en);
      // Legacy meanings may already contain entities. Neutralize markup while
      // preserving those entities so older cards do not become double-escaped.
      const meaning = clean(card.meaning).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const boldSentence = sourceWord && sourceSentence.includes(sourceWord)
        ? sourceSentence.split(sourceWord).map(escape).join('<b>' + word + '</b>') : sentence;
      const fullMeaning = translation ? meaning + '<br><small style="color:#94a3b8">' + translation + '</small>' : meaning;
      tsv += [boldSentence, word, reading, fullMeaning].join('\t') + '\n';
    }
    return tsv;
  };
})();

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create, response, flush} = require('./perf/lib/shipped');
const explanation = require('./fixtures/sentence-explanation.json');

test('Explain this sentence shows meaning, grammar connections and takeaway before optional vocabulary', async () => {
  const h = await create({linguaplay_9router_model: 'study-combo'}, {
    fetch: async call => call.category === 'router'
      ? response({choices: [{message: {content: JSON.stringify(explanation)}}]})
      : response([[['translation']]])
  });
  h.select('触れ合えば', explanation.sentence_translation.jp, {furigana: 'ふれあえば', romaji: 'fureaeba'});
  await h.click('lp-ai-btn');
  await h.worker.drain();
  await flush();
  const html = h.elements.get('lp-ai-results').innerHTML;
  assert.match(html, />Meaning<\/h3>/);
  assert.match(html, /When we touch, our fingertips are hot, and…/);
  assert.match(html, />How it works<\/h3>/);
  assert.match(html, /makes it ‘if\/when/);
  assert.match(html, />Main takeaway<\/h3>/);
  assert.match(html, /sets the condition/);
  assert.ok(html.indexOf('Main takeaway') < html.indexOf('Word details'));
  assert.match(html, /<details class="lp-explanation-words">/);
  assert.doesNotMatch(html, /Horizontal Word-by-Word Gloss/);
  assert.match(html, /触れ合う<rt[^>]*>fureau<\/rt>/);
  assert.match(html, /ば<rt[^>]*>ba<\/rt>/);
  assert.match(html, /熱い<rt[^>]*>atsui<\/rt>/);
  const prompt = JSON.parse(h.calls.find(call => call.category === 'router').options.body).messages[0].content;
  assert.match(prompt, /ENTIRE JAPANESE SENTENCE/);
  assert.match(prompt, /"phrase_breakdown"/);
  assert.match(prompt, /"main_takeaway"/);
  assert.match(prompt, /"japanese_readings"/);
});

test('older structured replies still show the translation and grammar instead of hiding them', () => {
  const render = require('./shipped_engine')().renderPedagogicalBreakdown;
  const html = render({data: {
    sentence_translation: {en: 'The world was beautiful.'},
    sentence_fit: {phrase_connection: '世界は is the topic.', role_in_sentence: '綺麗 describes the world.', context_nuance: 'だった places the description in the past.'},
    conjugation: {explanation: 'The copula is in the past form.'},
    word_by_word: [{word: '世界', reading: 'せかい', romaji: 'sekai'}]
  }}, 'fixture');
  assert.match(html, /The world was beautiful/);
  assert.match(html, /is the topic/);
  assert.match(html, /copula is in the past/);
  assert.match(html, /places the description in the past/);
  assert.doesNotMatch(html, /incomplete sentence explanation/);
});

test('provider prose is escaped and malformed or vocabulary-only replies report an incomplete explanation', () => {
  const render = require('./shipped_engine')().renderPedagogicalBreakdown;
  const html = render({...explanation, main_takeaway: '<img src=x onerror=alert(1)> 熱い', japanese_readings: [null, {word:'熱い',romaji:'<svg>'}]}, '<provider>');
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;svg&gt;/);
  assert.match(html, /&lt;provider&gt;/);
  assert.doesNotMatch(html, /<img|<svg/);
  for (const value of [null, [], {phrase_breakdown:[null,{},'bad'],japanese_readings:[null]}, {word_by_word:[{word:'猫',reading:'ねこ'}]}]) {
    assert.match(render(value, 'fixture'), /incomplete sentence explanation/);
  }
});

test('the explanation receives neighboring captions without substituting the current playback sentence', async () => {
  const h = await create({linguaplay_9router_model:'study-combo'}, {
    fetch: async call => call.category === 'router'
      ? response({choices:[{message:{content:JSON.stringify(explanation)}}]}) : response([[['translation']]])
  });
  h.setPlayback(h.video, [
    {start:0,end:2,text:'君が笑う'},
    {start:2,end:4,text:explanation.sentence_translation.jp},
    {start:4,end:6,text:'離れられない'}
  ]);
  h.select('触れ合えば', explanation.sentence_translation.jp);
  h.renderSentenceTokens('別の字幕');
  await h.click('lp-ai-btn');
  await h.worker.drain();
  const prompt = JSON.parse(h.calls.find(call=>call.category==='router').options.body).messages[0].content;
  assert.match(prompt, /Context Sentence: "触れ合えば指先が熱くて"/);
  assert.match(prompt, /"previous":"君が笑う","next":"離れられない"/);
  assert.doesNotMatch(prompt, /別の字幕/);
});

test('repeated captions retain the selected occurrence’s neighbors after playback moves', async () => {
  for (const [selectedTime, playbackTime, expected] of [
    [2.5, 8.5, {previous: '最初の場面', next: '最初の続き'}],
    [8.5, 6.5, {previous: '別の場面', next: '別の続き'}]
  ]) {
    const h = await create({linguaplay_9router_model: 'study-combo'}, {
      fetch: async call => call.category === 'router'
        ? response({choices: [{message: {content: JSON.stringify(explanation)}}]})
        : response([[['translation']]])
    });
    h.setPlayback(h.video, [
      {start: 0, end: 2, text: '最初の場面'},
      {start: 2, end: 4, text: '君が笑う'},
      {start: 4, end: 6, text: '最初の続き'},
      {start: 6, end: 8, text: '別の場面'},
      {start: 8, end: 10, text: '君が笑う'},
      {start: 10, end: 12, text: '別の続き'}
    ]);
    h.video.currentTime = selectedTime;
    h.onTimeUpdate();
    h.document.querySelector('.linguaplay-yt-token').click();
    h.video.currentTime = playbackTime;
    h.onTimeUpdate();
    await h.click('lp-ai-btn');
    await h.worker.drain();
    const prompt = JSON.parse(h.calls.find(call => call.category === 'router').options.body).messages[0].content;
    assert.match(prompt, /Context Sentence: "君が笑う"/);
    const neighbors = JSON.parse(prompt.match(/Neighboring captions \(may be empty\): (.*)/)[1]);
    assert.deepEqual(neighbors, expected);
  }
});

test('explanations get a visible text budget based on the response budget and available panel height', async () => {
  for (const [height,tokens,words,phrases] of [[600,2048,64,3],[400,2048,40,2],[600,1024,40,2]]) {
    const h = await create({linguaplay_9router_model:'study-combo',linguaplay_9router_token_budget:tokens}, {
      fetch:async call=>call.category==='router'?response({choices:[{message:{content:JSON.stringify(explanation)}}]}):response([[['translation']]])
    });
    h.elements.get('linguaplay-yt-drawer').clientHeight=height;
    h.select('触れ合えば',explanation.sentence_translation.jp);
    await h.click('lp-ai-btn'); await h.worker.drain();
    const prompt=JSON.parse(h.calls.find(call=>call.category==='router').options.body).messages[0].content;
    assert.ok(prompt.includes(`Visible text budget: at most ${words} English words`));
    assert.ok(prompt.includes(`at most ${phrases} meaningful phrases`));
    assert.doesNotMatch(prompt,/2–6 meaningful phrases|1–2 short sentences/);
  }
});

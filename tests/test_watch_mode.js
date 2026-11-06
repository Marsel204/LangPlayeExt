'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create, flush, response} = require('./perf/lib/shipped');

test('the active song-lyrics badge opens the lyrics workflow instead of Jimaku', async () => {
  const h = await create({}, {message: request => request.action === 'FETCH_LRCLIB_LYRICS' ? {success: true, trackName: 'Song', artistName: 'Artist', syncedLyrics: '[00:00.00]歌を歌う'} : undefined});
  h.navigate('song'); h.checkAndInitVideo(); await flush();
  h.elements.get('lp-search-track-input').value = 'Song';
  h.elements.get('lp-search-artist-input').value = 'Artist';
  await h.click('lp-search-submit-btn');
  assert.equal(h.timeline()[0].text, '歌を歌う');
  await h.click('linguaplay-sub-status');
  assert.equal(h.elements.get('linguaplay-lyrics-modal').classList.contains('hidden'), false);
  assert.equal(h.elements.get('linguaplay-subtitle-panel').hidden, true);
  assert.equal(h.timeline()[0].text,'歌を歌う','Opening the active lyrics manager preserves the working song');
  assert.equal(h.storage.state.lp_watch_mode_song,'song','The explicit lyrics workflow becomes the saved choice');
});

test('a saved Episode choice ignores old song caches and never starts a lyrics search', async () => {
  const h = await create({lp_watch_mode_episode: 'episode', lp_lyrics_cache_episode: {trackName:'Old song',syncedLyrics:'[00:00.00]古い歌'}}, {
    fetch: async () => response({}, '', false),
    message: request => request.action === 'FETCH_LRCLIB_LYRICS' ? {success:true,syncedLyrics:'[00:00.00]間違った歌詞'} : undefined
  });
  h.navigate('episode'); await h.checkAndInitVideo(); await flush();
  assert.equal(h.timeline().length, 0, 'Episode playback must not restore a cached song');
  assert.equal(h.messages.some(message => message.action === 'FETCH_LRCLIB_LYRICS'), false);
});

test('a saved Song choice restores synced lyrics without requesting episode captions', async () => {
  const h = await create({lp_watch_mode_song:'song',lp_lyrics_cache_song:{trackName:'Saved song',syncedLyrics:'[00:00.00]歌を歌う'}});
  h.navigate('song'); await h.checkAndInitVideo(); await flush();
  assert.equal(h.timeline()[0].text,'歌を歌う');
  assert.equal(h.messages.some(m=>m.action==='FETCH_BACKEND_CAPTIONS'),false);
  assert.equal(h.calls.some(c=>['captions','innertube','watchHtml'].includes(c.category)),false);
  await h.click('linguaplay-jimaku-btn');
  assert.equal(h.elements.get('lp-watch-mode').value,'song');
  assert.equal(h.elements.get('lp-episode-sources').hidden,true);
  assert.equal(h.elements.get('lp-song-sources').hidden,false);
  await h.click('linguaplay-sub-status');
  assert.equal(h.elements.get('linguaplay-lyrics-modal').classList.contains('hidden'),false);
});

test('manual mode switching is saved per video and rejects the previous caption response', async () => {
  const h = await create({}, {message: request => request.action==='FETCH_LRCLIB_LYRICS' ? {success:true,trackName:'Song',syncedLyrics:'[00:00.00]新しい歌詞'} : undefined});
  h.navigate('mixed'); h.checkAndInitVideo(); await h.waitForFetch('captions');
  h.elements.get('lp-watch-mode').value='song'; h.elements.get('lp-watch-mode').emit('change',{target:h.elements.get('lp-watch-mode')}); await flush();
  assert.equal(h.timeline()[0]?.text,'新しい歌詞');
  assert.equal(h.storage.state.lp_watch_mode_mixed,'song');
  h.resolve('captions',{},'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n古い字幕'); await flush();
  assert.equal(h.timeline()[0]?.text,'新しい歌詞');
  const searches=h.messages.filter(m=>m.action==='FETCH_LRCLIB_LYRICS').length;
  h.elements.get('lp-watch-mode').value='episode'; h.elements.get('lp-watch-mode').emit('change',{target:h.elements.get('lp-watch-mode')}); await h.waitForFetch('captions',2); await flush();
  assert.equal(h.storage.state.lp_watch_mode_mixed,'episode');
  assert.equal(h.timeline().length,0,'Changing to Episode clears the previous song');
  assert.equal(h.messages.filter(m=>m.action==='FETCH_LRCLIB_LYRICS').length,searches);
  const reloaded=await create({...h.storage.state},{fetch:async()=>response({},'',false)});
  reloaded.navigate('mixed'); await reloaded.checkAndInitVideo(); await flush();
  assert.equal(reloaded.elements.get('lp-watch-mode').value,'episode');
  assert.equal(reloaded.timeline().length,0);
});

test('a song lookup finishing after an Episode switch cannot install or cache its lyrics', async () => {
  let finish;
  const h=await create({lp_watch_mode_video:'song'},{fetch:async()=>response({},'',false),message:request=>request.action==='FETCH_LRCLIB_LYRICS'?new Promise(resolve=>finish=resolve):undefined});
  h.navigate('video'); h.checkAndInitVideo(); await flush();
  assert.equal(typeof finish,'function');
  h.elements.get('lp-watch-mode').value='episode'; h.elements.get('lp-watch-mode').emit('change',{target:h.elements.get('lp-watch-mode')}); await flush();
  finish({success:true,syncedLyrics:'[00:00.00]古い歌詞'}); await flush();
  assert.equal(h.timeline().length,0);
  assert.equal(h.storage.state.lp_lyrics_cache_video,undefined);
  assert.equal(h.elements.get('lp-watch-mode').value,'episode');
});

test('an abandoned song lookup cannot start AI identification after switching to Episode', async () => {
  let finish;
  const h=await create({lp_watch_mode_video:'song'},{fetch:async()=>response({},'',false),message:request=>{
    if(request.action==='FETCH_LRCLIB_LYRICS')return new Promise(resolve=>finish=resolve);
    if(request.action==='CALL_9ROUTER_AI')return {success:false,error:'Should not run'};
  }});
  h.navigate('video');h.checkAndInitVideo();await flush();
  assert.equal(typeof finish,'function');
  h.elements.get('lp-watch-mode').value='episode';h.elements.get('lp-watch-mode').emit('change',{target:h.elements.get('lp-watch-mode')});await flush();
  finish({success:false,error:'No match'});await flush();
  assert.equal(h.messages.some(message=>message.action==='CALL_9ROUTER_AI'),false);
});

test('returning to Song can start a new explicit lookup while an old mode lookup is pending', async () => {
  const pending=[];
  const h=await create({}, {message:request=>request.action==='CALL_9ROUTER_AI'?new Promise(resolve=>pending.push(resolve)):undefined});
  h.navigate('video');h.checkAndInitVideo();await h.waitForFetch('captions');
  await h.click('linguaplay-fetch-lyrics-btn');
  assert.equal(pending.length,1);
  h.elements.get('lp-watch-mode').value='episode';h.elements.get('lp-watch-mode').emit('change',{target:h.elements.get('lp-watch-mode')});await flush();
  assert.equal(h.elements.get('lp-ai-identify-btn').disabled,false,'A cancelled song request must not leave its action disabled');
  await h.click('linguaplay-fetch-lyrics-btn');
  assert.equal(pending.length,2,'A request for the previous source cannot block the new lyrics workflow');
  pending.forEach(finish=>finish({success:false,error:'Fixture finished'}));await flush();
});

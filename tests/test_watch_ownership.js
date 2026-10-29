'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {create,flush,response}=require('./perf/lib/shipped'),{subtitles}=require('./perf/fixtures');
test('a later manual file selection owns the timeline even if the earlier read finishes last',async()=>{
 const h=await create();h.navigate('A');h.checkAndInitVideo();await h.waitForFetch('captions');await flush();const input=h.elements.get('linguaplay-manual-sub-input');let first,second;
 const upload=(name,set)=>{input.files=[{name:name+'.vtt',text:()=>new Promise(set)}];input.emit('change',{target:input});};upload('first',r=>first=r);upload('second',r=>second=r);
 second(subtitles(1,'vtt','新しい手動字幕'));await flush();first(subtitles(1,'vtt','古い手動字幕'));await flush();assert.equal(h.timeline()[0]?.text,'新しい手動字幕');h.resolve('captions',{},subtitles(1,'vtt','自動字幕'));await flush();assert.equal(h.timeline()[0]?.text,'新しい手動字幕');
});
test('overlapping manual lyric searches keep the later choice and its cache',async()=>{
 const pending=[];const h=await create({}, {message:req=>req.action==='FETCH_LRCLIB_LYRICS'?new Promise(resolve=>pending.push({req,resolve})):undefined});h.navigate('A');h.checkAndInitVideo();await h.waitForFetch('captions');await flush();for(const track of ['first','second']){h.elements.get('lp-search-track-input').value=track;await h.click('lp-search-submit-btn');}assert.equal(pending.length,2);
 pending[1].resolve({success:true,trackName:'second',syncedLyrics:'[00:00.00]新しい歌詞'});await flush();pending[0].resolve({success:true,trackName:'first',syncedLyrics:'[00:00.00]古い歌詞'});await flush();assert.equal(h.timeline()[0]?.text,'新しい歌詞');h.resolve('captions',{},subtitles(1,'vtt','自動字幕'));await flush();assert.equal(h.timeline()[0]?.text,'新しい歌詞');assert.equal(h.storage.state.lp_lyrics_cache_A?.trackName,'second');
});
test('navigation A to B to A rejects the first A acquisition',async()=>{
 const h=await create();for(const vid of ['A','B','A']){h.navigate(vid);h.checkAndInitVideo();await flush();}await h.waitForFetch('captions',3);const pending=h.pending.filter(p=>p.call.category==='captions');assert.equal(pending.length,3);pending[0].resolve(response({},subtitles(1,'vtt','古い動画')));await flush();assert.equal(h.timeline().length,0);pending[2].resolve(response({},subtitles(1,'vtt','現在の動画')));await flush();assert.equal(h.timeline()[0]?.text,'現在の動画');
});
test('embedded caption data filters other videos and preserves nested strings and arrays',async()=>{
 const h=await create();const tracks=[{baseUrl:'https://fixture.invalid/c?v=A',languageCode:'ja',name:{runs:[{text:'old ] " name'}]}},{baseUrl:'https://fixture.invalid/c?v=B',languageCode:'ja',name:{runs:[{text:'new \\ ] name'}]}}];h.document.scripts=[{textContent:'var p={"captionTracks":'+JSON.stringify(tracks)+'};'}];assert.equal(JSON.stringify(h.getOnPageCaptionTracks('B')),JSON.stringify([tracks[1]]));
});
test('timeline lookup preserves first-array semantics for unsorted and non-finite input',async()=>{
 const h=await create();for(const cues of [[{start:2,end:4,text:'先'},{start:0,end:5,text:'後'}],[{start:NaN,end:4,text:'無効'},{start:0,end:Infinity,text:'有効'}]]){h.setPlayback(h.video,cues);for(const t of [-1,0,2,4,5,6]){h.video.currentTime=t;h.onTimeUpdate();assert.equal(h.snapshot().currentSubIndex,cues.findIndex(c=>c.start<=t&&t<=c.end));}}
});

test('unrelated player mutations cannot resurrect the previous video live caption',async()=>{
 const h=await create();h.navigate('A');h.checkAndInitVideo();await flush();h.segment.textContent='古い字幕';const observer=h.observers.find(o=>o.connected&&o.target===h.player);observer.deliver();assert.equal(h.snapshot().renderedSentence,'古い字幕');h.navigate('B');h.checkAndInitVideo();await flush();observer.deliver([{target:h.player,type:'childList',addedNodes:[]}]);assert.equal(h.snapshot().renderedSentence,'');h.segment.textContent='現在の字幕';observer.deliver();assert.equal(h.snapshot().renderedSentence,'現在の字幕');
});

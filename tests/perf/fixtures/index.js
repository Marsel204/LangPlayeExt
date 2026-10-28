const {rng}=require('../lib/stats');
const phrases=['猫がいる','犬が走る','食べました','今日はいい天気です','日本語を勉強しています','学校に行きます','明日も頑張ります','音楽を聞く','新しい本を読む','友達と話す'];
function corpus(n=1000){const r=rng();return Array.from({length:n},(_,i)=>phrases[Math.floor(r()*phrases.length)]+'、'+phrases[Math.floor(r()*phrases.length)]+'。'+i);}
function timeline(n){return Array.from({length:n},(_,i)=>({start:i*3,end:i*3+2,text:i%2?'犬がいる':'猫がいる'}));}
function stamp(sec,srt=false){const ms=Math.round(sec*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${srt?',':'.'}${String(ms%1000).padStart(3,'0')}`;}
function subtitles(n,format='vtt',text='猫がいる'){if(format==='lrc'){if(n>1980)throw Error('HARNESS_ERROR LRC_FIXTURE_RANGE');return Array.from({length:n},(_,i)=>`[${String(Math.floor(i*3/60)).padStart(2,'0')}:${String(i*3%60).padStart(2,'0')}.00]${text}`).join('\n');}return (format==='vtt'?'WEBVTT\n\n':'')+Array.from({length:n},(_,i)=>`${i+1}\n${stamp(i*3,format==='srt')} --> ${stamp(i*3+2,format==='srt')}\n${text}\n`).join('\n');}
module.exports={corpus,timeline,subtitles,stamp};

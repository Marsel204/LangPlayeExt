// Supplemental X01: use native manifest-injected code, no driver tail or dependency spies.
import {browserFixture,delay} from '../perf/lib/browser.mjs';
let b;const exceptions=[];const timer=setTimeout(()=>{console.error('HARNESS_ERROR native reading watchdog');process.exit(2);},45000);
try{
 b=await browserFixture();b.on('Runtime.exceptionThrown',(p,s)=>{if(s===b.page)exceptions.push({description:p.exceptionDetails.exception?.description,text:p.exceptionDetails.text});});
 await b.evalContent(`window.__readingErrors=[];window.addEventListener('error',e=>__readingErrors.push({message:e.message,name:e.error?.name}));window.fetch=async()=>({ok:false,json:async()=>({}),text:async()=>''});`);
 const observations=[];
 for(const n of [100,10000]){
  await b.evalMain(`document.querySelector('.ytp-caption-segment').textContent='あ'.repeat(${n})`);
  await b.wait(()=>b.evalContent(`document.querySelectorAll('.linguaplay-yt-token').length>0 && document.getElementById('linguaplay-yt-tokens').textContent.length>=${n}`),'native rendered kana '+n);
  await b.evalContent(`document.getElementById('lp-dismiss-btn').click();__readingErrors=[];document.querySelector('.linguaplay-yt-token').click()`);await delay(30);
  observations.push(await b.evalContent(`({n:${n},tokenCount:document.querySelectorAll('.linguaplay-yt-token').length,drawerHidden:document.getElementById('linguaplay-yt-drawer').classList.contains('hidden'),errors:[...__readingErrors]})`));
 }
 const control=observations[0],long=observations[1];if(control.drawerHidden||control.errors.length)throw Error('HARNESS_ERROR native short-kana control '+JSON.stringify(control));const stack=long.errors.some(e=>e.name==='RangeError'||/call stack/.test(e.message));console.log(JSON.stringify({id:'R-X01-native-browser',fixtureMode:b.fixtureMode,control,observation:long,exceptionEvents:exceptions,ok:!stack&&!long.drawerHidden,status:stack&&long.drawerHidden?(process.argv.includes('--after')?'UNEXPECTED_RED':'EXPECTED_RED'):!stack&&!long.drawerHidden?(process.argv.includes('--after')?'GREEN':'UNEXPECTED_GREEN'):'HARNESS_ERROR',witness:'NATIVE_TOKEN_CLICK_STACK_OVERFLOW'}));
}catch(e){console.log(JSON.stringify({id:'R-X01-native-browser',status:'HARNESS_ERROR',harnessError:e.stack}));process.exitCode=2;}finally{await b?.close();clearTimeout(timer);}

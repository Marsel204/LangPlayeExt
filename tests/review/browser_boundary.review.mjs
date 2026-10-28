import {browserFixture} from '../perf/lib/browser.mjs';import {boundaryCases} from '../perf/lib/browser-cases.mjs';
let b;const timer=setTimeout(()=>{console.error('HARNESS_ERROR browser watchdog');process.exit(2);},90000);
try{b=await browserFixture();for(const r of await boundaryCases(b))console.log(JSON.stringify(r));if(b.errors.length)throw Error(JSON.stringify(b.errors));}catch(e){console.log(JSON.stringify({id:'BROWSER.HARNESS_ERROR',harnessError:e.stack}));process.exitCode=2;}finally{await b?.close();clearTimeout(timer);}

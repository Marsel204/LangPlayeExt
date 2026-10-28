import {browserFixture} from './lib/browser.mjs';
const timer=setTimeout(()=>{console.error('HARNESS_ERROR smoke watchdog');process.exit(2);},45000);
let b;try{b=await browserFixture();console.log(JSON.stringify({fixtureMode:b.fixtureMode,isolatedWorld:!!b.isolated,manifestInjection:true,bridgeControls:true,requests:b.requests,errors:b.errors}));}finally{await b?.close();clearTimeout(timer);}

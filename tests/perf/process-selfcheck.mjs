import assert from 'node:assert/strict';import {bounded} from './lib/process.mjs';
const code="process.stdout.write(Buffer.from([0xe7]));setTimeout(()=>process.stdout.write(Buffer.from([0x8c,0xab])),30)";
const r=await bounded(process.execPath,['-e',code],{timeout:2000});assert.equal(r.code,0);assert.equal(r.stdout,'猫','UTF-8 split across subprocess chunks must remain byte-exact');console.log('PASS split-chunk UTF-8 decoding');

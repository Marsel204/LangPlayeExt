'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Load the complete shipped closure. Only forward the engine's own functions.
module.exports=function loadShippedEngine(){
 const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
 const tail='\nglobalThis.engine = Object.freeze({getWordReading,generateSentenceRomaji,resolveToHiragana,renderPedagogicalBreakdown});\n';
 if(!/\}\)\(\);\s*$/.test(source))throw Error('Shipped closure trailer missing');
 const sandbox={window:{wanakana:require('../lib/wanakana.min.js'),addEventListener(){},location:{search:'',href:''}},document:{addEventListener(){},querySelector(){return null;},getElementById(){return null;}},chrome:{storage:{local:{get(){}}}},setInterval(){},setTimeout(){},URLSearchParams,URL,Intl,console};
 vm.runInNewContext(source.replace(/(?=\}\)\(\);\s*$)/,tail),sandbox,{filename:'content.js',timeout:10000});
 return sandbox.engine;
};

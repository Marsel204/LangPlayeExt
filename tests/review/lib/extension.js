const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,precondition,flush,response}=require('../../perf/lib/shipped');
const {dom}=require('../../perf/lib/fakes');
async function extensionPage(name,s,options={}){
 const {worker,runtime}=require('../../perf/lib/worker-fixture').wire(s);const requests=[];
 const d=dom();const blobs=[];for(const match of fs.readFileSync(path.join(root,name+'.html'),'utf8').matchAll(/id="([^"]+)"/g)){const e=new d.Element();e.id=match[1];d.document.body.appendChild(e);}
 const sandbox={document:d.document,chrome:{storage:{local:s.api},runtime,permissions:{contains:async()=>options.granted!==false,request:async r=>{requests.push(r);return options.grant!==false;}},tabs:{query:async()=>[]}},URL:class extends URL{static createObjectURL(b){blobs.push(b);return 'blob:fixture';}static revokeObjectURL(){}},Blob,fetch:async()=>response({},'',false),console:{log(){},warn(){},error(){}},alert(){},confirm:()=>true,setTimeout(){},clearTimeout(){},AbortSignal};
 for(const src of fs.readFileSync(path.join(root,name+'.html'),'utf8').matchAll(/<script[^>]+src="([^"]+)"/g)){if(src[1]===name+'.js')continue;vm.runInNewContext(fs.readFileSync(path.join(root,src[1]),'utf8'),sandbox,{filename:src[1]});}
 vm.runInNewContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),sandbox,{filename:name+'.js'});d.document.emit('DOMContentLoaded');await flush();return {...d,sandbox,blobs,worker,requests};
}
const {background}=require('../../perf/lib/worker-fixture');
module.exports={extensionPage,background};

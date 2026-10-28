import {spawn} from 'node:child_process';
export async function bounded(command,args,{timeout=60000,cwd,env,stdoutFile,stderrFile}={}){
 const {open}=await import('node:fs/promises');const out=stdoutFile?await open(stdoutFile,'w'):null,err=stderrFile?await open(stderrFile,'w'):null;const started=Date.now();let output='',errors='',timedOut=false;
 const child=spawn(command,args,{cwd,env:env?{...process.env,...env}:process.env,detached:true,stdio:['ignore','pipe','pipe']});
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 const kill=()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{}};const timer=setTimeout(kill,timeout);
 child.stdout.on('data',d=>{if(output.length<20000000)output+=d;out?.write(d);});child.stderr.on('data',d=>{if(errors.length<2000000)errors+=d;err?.write(d);});
 const done=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:String(error)}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);await out?.close();await err?.close();return {...done,timedOut,durationMs:Date.now()-started,stdout:output,stderr:errors};
}

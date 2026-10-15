import {printInstanceSource} from './source.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {newInstanceProject,parseInstanceProject,serializeInstanceProject} from '../studio/instance-project.mjs';
import {buildInstanceUIPackage} from '../compiler/instance-ui-package.mjs';
import {createInstanceUIRuntime} from './ui.mjs';
import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {fail} from '../reference/errors.mjs';
export async function applicationCLI(command,file,args){
 const source=await readFile(file,'utf8'),project=file.endsWith('.ems')?newInstanceProject(source):parseInstanceProject(source);if(!project.ui)fail('INSTANCE_UI_PROFILE_REQUIRED','Application commands require native UI');
 const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
 if(['application-project','application-build','application-source'].includes(command)){
  if(args.length!==2||args[0]!=='--out')throw Error('Use --out <path>');const out=resolve(args[1]);
  if(command==='application-source'){await mkdir(dirname(out),{recursive:true});await writeFile(out,printInstanceSource(project.module,project.ui));}
  else if(command==='application-project'){await mkdir(dirname(out),{recursive:true});await writeFile(out,serializeInstanceProject(project));}
  else{const files=buildInstanceUIPackage(serializeInstanceProject(project),{policy});await mkdir(out,{recursive:true});for(const [name,contents]of Object.entries(files))await writeFile(join(out,name),contents);}
  console.log('Built '+out);return;
 }
 if(args.length!==2||args[0]!=='--events')throw Error('Use --events <JSON array>');const events=JSON.parse(args[1]);if(!Array.isArray(events)||events.length>1000)fail('INSTANCE_LIMIT','At most1000 UI events');
 const runtime=await createInstanceUIRuntime(project.module,project.ui,undefined,{policy}),initial=runtime.snapshot(),outcomes=[];
 try{for(const event of events){try{const value=await runtime.dispatch(event?.node,event?.event,event?.value);outcomes.push({status:'committed',value,snapshot:runtime.snapshot()});}catch(error){process.exitCode=1;outcomes.push({status:'failed',error:{code:error.code??'HOST_ERROR',details:error.details??{}},snapshot:runtime.snapshot()});}}console.log(formatFiniteJSON({initial,events:outcomes,final:runtime.snapshot(),view:runtime.view()}));}finally{await runtime.close();}
}

import {importInstanceProject} from '../studio/instance-project.mjs';
import {printInstanceSource} from './source.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createCoreRegistry} from '../reference/registry.mjs';
import {compileInstanceModule} from './frontend.mjs';
import {parseInstanceModule,serializeInstanceModule} from './module.mjs';
import {createInstanceSession} from './runtime.mjs';
import {compileInstanceModuleJS} from './compiler.mjs';
export async function instanceCLI(command,file,args){
 const base=createCoreRegistry(),source=await readFile(file,'utf8');if(command==='instance-source'){if(args.length!==2||args[0]!=='--out')throw Error('Use --out <file>');const project=importInstanceProject(source,base),target=resolve(args[1]);await mkdir(dirname(target),{recursive:true});await writeFile(target,printInstanceSource(project.module,project.ui,base));console.log('Built '+target);return;}const module=file.endsWith('.ems')?compileInstanceModule(source,base):parseInstanceModule(source,base);
 if(command==='instance-ir'||command==='instance-build'){if(args.length!==2||args[0]!=='--out')throw Error('Use --out <file>');const target=resolve(args[1]);await mkdir(dirname(target),{recursive:true});await writeFile(target,command==='instance-ir'?serializeInstanceModule(module,base):compileInstanceModuleJS(module,base));console.log('Built '+target);return;}
 if(args.length!==2||args[0]!=='--events')throw Error('Use --events <JSON array>');const events=JSON.parse(args[1]);if(!Array.isArray(events)||events.length>1000)throw Error('At most1000 events');
 const session=await createInstanceSession(module,base,{policy:{capabilities:['state.read','state.write'],allowedEffects:['state.read','state.write']},recordTrace:true}),initial=session.snapshot(),outcomes=[];
 try{for(const event of events){try{const result=await session.dispatch(event.instance,event.transition,event.inputs??{});outcomes.push({...event,status:'committed',result,after:session.snapshot()});}catch(error){outcomes.push({...event,status:'failed',error:{code:error.code??'HOST_ERROR',details:error.details??{}},after:session.snapshot()});process.exitCode=1;}}console.log(JSON.stringify({initial,events:outcomes,final:session.snapshot()},null,2));}finally{await session.close();}
}

#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {compileWorkspaceModule,compileWorkspaceApplication} from '../src/studio/workspace-modules.mjs';
import {executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {compileInstanceModuleJS} from '../src/instances/compiler.mjs';
import {createInstanceUIRuntime} from '../src/instances/ui.mjs';
import {serializeInstanceProject} from '../src/studio/instance-project.mjs';
import {buildInstanceUIPackage} from '../src/compiler/instance-ui-package.mjs';
import {formatFiniteJSON} from '../src/semantics/data-json.mjs';
import {fail} from '../src/reference/errors.mjs';
const [command,input,...args]=process.argv.slice(2);
try{
 if(!['run','build','native-run','native-build','application-run','application-build','application-project'].includes(command)||!input)throw Error('Usage: node tools/workspace.mjs run|build|native-run|native-build|application-run|application-build|application-project <project.json> [--file <path>] [--entry <contract>] [--inputs <json>] [--events <json>] [--out <path>]');
 const accepted=new Set(['--file',...(['run','build'].includes(command)?['--entry']:[]),...(command==='run'?['--inputs']:[]),...(command.endsWith('-run')?['--events']:[]),...(!command.endsWith('run')?['--out']:[])]),options=new Map();
 for(let i=0;i<args.length;i+=2){if(!accepted.has(args[i])||args[i+1]===undefined||options.has(args[i]))throw Error('Invalid workspace CLI options');options.set(args[i],args[i+1]);}
 const info=await stat(input);if(info.size>8*1024*1024)fail('MODULE_LIMIT','Source project exceeds 8 MiB');
 const source=await readFile(input,'utf8'),file=options.get('--file'),out=options.get('--out');
 if(!command.endsWith('run')&&!out)throw Error('--out is required');
 if(['run','build'].includes(command)){
  const bundle=compileWorkspaceModule(source,file,options.get('--entry'));
  if(command==='run')console.log(formatFiniteJSON(await executeIR(bundle.ir,JSON.parse(options.get('--inputs')??'{}'),bundle.registry)));
  else{const artifact=compileIRToJS(bundle.ir,bundle.registry);await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,artifact);console.log('Built '+resolve(out));}
 }else{
  const compiled=compileWorkspaceApplication(source,file),project=compiled.project;
  const application=command.startsWith('application-');if(application&&!compiled.ui)fail('INSTANCE_UI_PROFILE_REQUIRED','Application commands require a UI root');
  const policy={capabilities:[...(application?['ui.render']:[]),'state.read','state.write'],allowedEffects:[...(application?['ui.render']:[]),'state.read','state.write']};
  if(command.endsWith('-run')){
   const events=JSON.parse(options.get('--events')??'[]');if(!Array.isArray(events)||events.length>1000)fail('INSTANCE_LIMIT','At most1000 events');
   const runtime=application?await createInstanceUIRuntime(compiled.module,compiled.ui,undefined,{policy}):await createInstanceSession(compiled.module,undefined,{policy}),initial=runtime.snapshot(),outcomes=[];
   try{for(const event of events){try{const value=application?await runtime.dispatch(event?.node,event?.event,event?.value):await runtime.dispatch(event?.instance,event?.transition,event?.inputs??{});outcomes.push({status:'committed',value,snapshot:runtime.snapshot()});}catch(error){process.exitCode=1;outcomes.push({status:'failed',error:{code:error.code??'HOST_ERROR',details:error.details??{}},snapshot:runtime.snapshot()});}}console.log(formatFiniteJSON({initial,events:outcomes,final:runtime.snapshot(),...(application?{view:runtime.view()}:{} )}));}finally{await runtime.close();}
  }else if(command==='application-build'){
   const files=buildInstanceUIPackage(serializeInstanceProject(project),{policy});await mkdir(out,{recursive:true});for(const [name,contents]of Object.entries(files))await writeFile(join(out,name),contents);console.log('Built '+resolve(out));
  }else{const artifact=command==='application-project'?serializeInstanceProject(project):compileInstanceModuleJS(compiled.module);await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,artifact);console.log('Built '+resolve(out));}
 }
}catch(error){console.error((error.code??'ERROR')+': '+error.message+(error.details?.file?' ['+error.details.file+(error.details.location?':'+error.details.location.start.line+':'+error.details.location.start.column:'')+']':''));process.exitCode=1;}

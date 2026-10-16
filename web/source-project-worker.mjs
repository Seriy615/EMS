import {fail} from '../src/reference/errors.mjs';
import {sourceProjectGraphs} from '../src/studio/source-project-graphs.mjs';
import {executeIR,compileIRToJS} from '../src/ir/index.mjs';
import {createInstanceSession} from '../src/instances/runtime.mjs';
import {compileInstanceModuleJS} from '../src/instances/compiler.mjs';
import {serializeInstanceProject} from '../src/studio/instance-project.mjs';
import {buildInstanceUIPackage} from '../src/compiler/instance-ui-package.mjs';
const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
self.onmessage=async({data})=>{
 try{
  if(!data||!['check','run','build'].includes(data.action)||typeof data.source!=='string'||data.source.length>4*1024*1024)throw Error('Invalid source compiler request');
  const context=sourceProjectGraphs(data.source,data.options),{kind,bundle}=context.compiled,result={kind,targets:context.targets.map(({file,name,kind,instance,operation})=>({file,name,kind,...(instance?{instance,operation}:{})}))};
  if(kind==='pure'){
   if(data.action==='run')result.value=await executeIR(bundle.ir,data.inputs??{},bundle.registry,{maxSteps:10000,maxDepth:32});
   if(data.action==='build')result.code=compileIRToJS(bundle.ir,bundle.registry);
  }else{
   result.project=serializeInstanceProject(bundle.project);result.hasUI=!!bundle.ui;
   if(data.action==='build'){if(bundle.ui)result.files=buildInstanceUIPackage(result.project,{policy});else result.code=compileInstanceModuleJS(bundle.module);}
   if(data.action==='run'&&!bundle.ui){if(!Array.isArray(data.inputs)||data.inputs.length>1000)fail('SOURCE_PROJECT_INPUTS','Для программы без UI нужен JSON-массив событий (или []).');const runtime=await createInstanceSession(bundle.module,undefined,{policy});try{const values=[];for(const event of data.inputs)values.push(await runtime.dispatch(event.instance,event.transition,event.inputs??{}));result.value={values,state:runtime.snapshot()};}finally{await runtime.close();}}
  }
  self.postMessage({ok:true,result});
 }catch(error){self.postMessage({ok:false,error:{code:error.code??'SOURCE_PROJECT_ERROR',message:error.name==='EmsError'?error.message:'Не удалось проверить или выполнить проект.',details:error.name==='EmsError'?error.details:{}}});}
};
self.postMessage({type:'ready',protocol:'ems-source-worker/1'});

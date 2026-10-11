import {ProjectEditor,parseProject} from '/src/studio/project.mjs';
import {hasCollections} from '/src/studio/collections.mjs';
import {GraphStepper} from '/src/studio/debugger.mjs';
import {runTextDraft} from '/src/studio/text.mjs';

let stepper=null,started=false;
self.onmessage=async event=>{
 if(event.data?.type==='debug-resume'){stepper?.resume(event.data.token,event.data.mode);return;}
 if(started)return;started=true;
 let failurePath=null;
 try{
  const request=event.data,editor=new ProjectEditor(parseProject(request.project));
  if(request.selected)editor.openContract(request.selected);
  self.postMessage({type:'validated',id:editor.workspace.graph.id});
  if(request.debug){
   if(request.debug!==true||request.action!=='graph'||hasCollections(editor.workspace.graph,editor.registry))throw Object.assign(new Error('Пошаговая отладка доступна для графов вызовов; control/Map/Filter ещё не поддержаны'),{code:'UNSUPPORTED_DEBUG_PROFILE'});
   stepper=new GraphStepper(pause=>self.postMessage({type:'paused',pause}));
  }
  let value;
  if(request.action==='graph')value=await editor.run({onNodeFailure:path=>{failurePath??=path;},onNodeEnter:stepper?event=>stepper.enter(event):undefined});
  else if(request.action==='text')value=await runTextDraft(request.draft,editor,request.inputs);
  else throw Object.assign(new Error('Unknown execution request'),{code:'INVALID_EXECUTION'});
  self.postMessage({ok:true,value});
 }catch(error){self.postMessage({ok:false,error:{code:error.code??'HOST_ERROR',message:error.name==='EmsError'?error.message:'Ошибка обработки программы',details:error.details??{},failurePath}});}
};

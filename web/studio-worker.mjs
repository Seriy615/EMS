import {ProjectEditor,parseProject} from '/src/studio/project.mjs';
import {hasCollections} from '/src/studio/collections.mjs';
import {GraphStepper} from '/src/studio/debugger.mjs';
import {prepareStudioInspection,prepareBoundStudioInspection,validateInspectionPause} from '/src/studio/inspection-transport.mjs';
import {runTextDraft} from '/src/studio/text.mjs';

let stepper=null,started=false;
self.onmessage=async event=>{
 if(event.data?.type==='debug-breakpoints'){try{stepper?.update(event.data.token,event.data.breakpoints);}catch{}return;}
 if(event.data?.type==='debug-resume'){stepper?.resume(event.data.token,event.data.mode);return;}
 if(started)return;started=true;
 let failurePath=null;
 try{
  const request=event.data;
  const editor=new ProjectEditor(parseProject(request.project));
  if(request.selected)editor.openContract(request.selected);
  const inspection=request.inspection?.policy?.originPolicy?.schemaVersion==='ems-origin-policy/2'?await prepareBoundStudioInspection(request,editor):prepareStudioInspection(request,editor);
  self.postMessage({type:'validated',id:editor.workspace.graph.id});
  if(Object.hasOwn(request,'debugOptions')&&!request.debug)throw Object.assign(new Error('Debug options need debug mode'),{code:'INVALID_DEBUG_OPTION'});
  if(request.debug){
   if(request.debug!==true||!['graph','text'].includes(request.action)||request.action==='graph'&&hasCollections(editor.workspace.graph,editor.registry)&&!inspection?.presentation)throw Object.assign(new Error('Пошаговая отладка visual Map/Filter пока не поддержана; используйте текст EMS'),{code:'UNSUPPORTED_DEBUG_PROFILE'});
   stepper=new GraphStepper(pause=>{try{self.postMessage({type:'paused',pause:inspection?validateInspectionPause((inspection.graphs||inspection.presentation)&&!Object.hasOwn(pause,'location')?{...pause,location:null}:pause,inspection):pause});}catch{self.postMessage({ok:false,error:{code:'INVALID_INSPECTION_SNAPSHOT',message:'Invalid or unauthorized inspection message',details:{}}});self.close();}},request.debugOptions);
  }
  let value;
  if(request.action==='graph')value=await editor.run({...(inspection?{[inspection.graphs?'graphInspection':'inspection']:inspection.policy}:{}),onControlExit:inspection?.presentation&&inspection.afterOperations?event=>stepper.enter(event):undefined,onControlEnter:inspection?.presentation?event=>stepper.enter(event):undefined,onFrameExit:stepper?event=>stepper.leave(event):undefined,onNodeFailure:path=>{failurePath??=path;},onNodeExit:inspection?.afterOperations?event=>stepper.enter(event):undefined,onNodeEnter:stepper?event=>stepper.enter(event):undefined});
  else if(request.action==='text')value=await runTextDraft(request.draft,editor,request.inputs,{...(inspection?{[inspection.graphs?'graphInspection':'inspection']:inspection.policy}:{}),onFrameExit:stepper?event=>stepper.leave(event):undefined,onNodeExit:inspection?.afterOperations?event=>stepper.enter(event):undefined,onNodeEnter:stepper?event=>stepper.enter(event):undefined,onControlExit:inspection?.afterOperations?event=>stepper.enter(event):undefined,onControlEnter:stepper?event=>stepper.enter(event):undefined});
  else throw Object.assign(new Error('Unknown execution request'),{code:'INVALID_EXECUTION'});
  self.postMessage({ok:true,value});
 }catch(error){self.postMessage({ok:false,error:{code:error.code??'HOST_ERROR',message:error.name==='EmsError'?error.message:'Ошибка обработки программы',details:error.details??{},failurePath}});}
};

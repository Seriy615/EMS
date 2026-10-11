import {ProjectEditor,parseProject} from '/src/studio/project.mjs';
import {runTextDraft} from '/src/studio/text.mjs';

self.onmessage=async event=>{
 let failurePath=null;
 try{
  const request=event.data,editor=new ProjectEditor(parseProject(request.project));
  if(request.selected)editor.openContract(request.selected);
  self.postMessage({type:'validated',id:editor.workspace.graph.id});
  let value;
  if(request.action==='graph')value=await editor.run({onNodeFailure:path=>{failurePath??=path;}});
  else if(request.action==='text')value=await runTextDraft(request.draft,editor,request.inputs);
  else throw Object.assign(new Error('Unknown execution request'),{code:'INVALID_EXECUTION'});
  self.postMessage({ok:true,value});
 }catch(error){self.postMessage({ok:false,error:{code:error.code??'HOST_ERROR',message:error.name==='EmsError'?error.message:'Ошибка обработки программы',details:error.details??{},failurePath}});}
};

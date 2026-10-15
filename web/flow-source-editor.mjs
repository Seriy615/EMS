import {FlowTextDraft} from '../src/studio/flow-source.mjs';
/** This is an editor of the current semantic graph, not generated dispatcher code. */
export function installFlowSourceEditor(editor,{owner,change,download,onOpen=()=>{}}){
 const $=id=>document.getElementById(id);let draft;
 function report(error){$('flow-text-error').textContent=(error.code??'ERROR')+': '+error.message;const location=error.details?.location;if(location?.start?.offset!==undefined){$('generated-source').focus();$('generated-source').setSelectionRange(location.start.offset,location.end?.offset??location.start.offset);}}
 function status(){if(draft)$('flow-text-status').textContent=draft.stale(editor.project)?'Граф изменён. Черновик сохранён отдельно; загрузите актуальный текст перед применением.':draft.dirty?'Текстовый черновик сохранён отдельно от графа.':'Текст соответствует текущим узлам и соединениям.';}
 function load(){try{if(!draft)draft=new FlowTextDraft(localStorage,owner,editor.project,editor.baseRegistry,editor.options);else draft.reset(editor.project);$('generated-source').value=draft.text;$('flow-text-error').textContent='';status();}catch(error){report(error);}}
 $('source').textContent='Код EMS';$('source').onclick=()=>{onOpen();try{if(!draft)draft=new FlowTextDraft(localStorage,owner,editor.project,editor.baseRegistry,editor.options);else if(!draft.dirty&&draft.stale(editor.project))draft.reset(editor.project);$('generated-source').value=draft.text;status();}catch(error){report(error);}$('source-dialog').showModal();};
 $('generated-source').oninput=()=>{try{if(draft)draft.save($('generated-source').value);status();}catch(error){report(error);}};
 $('load-graph-source').onclick=load;
 $('download-graph-source').onclick=()=>download($('generated-source').value,'workflow.ems','text/plain');
 $('apply-graph-source').onclick=()=>{try{if(!draft)throw Error('Загрузите актуальный текст графа.');draft.save($('generated-source').value);draft.assertCurrent(editor.project);const before=editor.project;let failure;change(()=>{try{editor.applySource(draft.text);}catch(error){failure=error;throw error;}});if(failure)throw failure;if(editor.project!==before){draft.reset(editor.project);$('generated-source').value=draft.text;$('flow-text-error').textContent='';status();}else $('flow-text-error').textContent=$('error').textContent;}catch(error){report(error);}};
 return {refresh:status};
}

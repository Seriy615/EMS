import {createStateRegistry} from '../runtime/reactor.mjs';
import {compileContractFlow} from '../compiler/contract-flow.mjs';
import {flowProjectOptions,parseFlowProject,serializeFlowProject,newFlowProject,FlowProjectEditor} from '../studio/flow-project.mjs';
/** Flow handlers share the ordinary checked IR and kernel-owned transactional state bindings. */
export function compileUIFlow(source,application,base){
 const registry=createStateRegistry(base,application.reactor.state,application.reactor.schemaVersion),project=parseFlowProject(source,registry,{allowState:true});
 return {...compileContractFlow(project.graph,registry,flowProjectOptions(project,{allowState:true})),project,flow:serializeFlowProject(project,registry,{allowState:true})};
}
/** A new graph is an explicit identity handler, without fabricated state updates or event bindings. */
export function newUIFlow(event,entry,{parameter='',type='Number'}={}){
 const project=newFlowProject('handler_'+event,event);project.graph.id=entry;
 if(parameter){const editor=new FlowProjectEditor(project);editor.addInput(parameter,type);editor.outputType(type);editor.connect({kind:'value',ref:{input:parameter}},{kind:'value',node:'result',port:'value'});return editor.serialize();}
 return serializeFlowProject(project);
}

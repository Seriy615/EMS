import {graphViewsFor,validateInstanceGraphViews} from './instance-graph-views.mjs';
import {authoredGraphsFor,validateAuthoredGraphs,clearAuthoredScope} from './authored-graphs.mjs';
import {compileInstanceSource,compileInstanceUIFragment} from '../instances/ui-source.mjs';
import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {validateInstanceUI} from '../instances/ui.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
import {compileInstanceModule} from '../instances/frontend.mjs';
import {validateInstanceModule,serializeInstanceModule,parseInstanceModule} from '../instances/module.mjs';
import {transitionFlow,applyTransitionFlow,invariantFlow,applyInvariantFlow} from '../instances/graph.mjs';
import {parseFlowProject,serializeFlowProject} from './flow-project.mjs';
import {canonicalFlowType,defaultFlowValue,flowValueSource,assertFlowValue} from '../contracts/flow-values.mjs';
const limit=4*1024*1024;
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')||!Object.getOwnPropertyDescriptor(value,key).enumerable)||Object.keys(value).sort().join(',')!==[...names].sort().join(','))fail('INVALID_INSTANCE_PROJECT','Unexpected contract document fields');}
export function newInstanceProject(source='@Main { +Run()->Number { return 0; } } @Main #main;',base=createCoreRegistry()){
 const {module,ui,authoredGraphs}=compileInstanceSource(source,base);return {schemaVersion:authoredGraphs?'ems-instance-project/3':ui?'ems-instance-project/2':'ems-instance-project/1',module,sourceArchive:source,bodyGraph:null,invariantGraphs:[],...(ui?{ui}:{}),...(authoredGraphs?{authoredGraphs}:{})};
}
/** Saved graphs are checked authoring witnesses. Import, listing and saving never execute a program. */
export function validateInstanceProject(project,base=createCoreRegistry()){
 const version=project&&typeof project==='object'?Object.getOwnPropertyDescriptor(project,'schemaVersion')?.value:undefined;
 fields(project,['schemaVersion','module','sourceArchive','bodyGraph','invariantGraphs',...(version==='ems-instance-project/2'||['ems-instance-project/3','ems-instance-project/4'].includes(version)&&Object.hasOwn(project,'ui')?['ui']:[]),...(['ems-instance-project/3','ems-instance-project/4'].includes(version)?['authoredGraphs']:[]),...(version==='ems-instance-project/4'?['graphViews']:[])]);
 if(!['ems-instance-project/1','ems-instance-project/2','ems-instance-project/3','ems-instance-project/4'].includes(project.schemaVersion)||project.sourceArchive!==null&&(typeof project.sourceArchive!=='string'||project.sourceArchive.length>1048576)||project.bodyGraph!==null&&typeof project.bodyGraph!=='string'||!Array.isArray(project.invariantGraphs)||project.invariantGraphs.length>512)fail('INVALID_INSTANCE_PROJECT','Invalid contract document');
 if(Object.hasOwn(project,'ui'))validateInstanceUI(project.module,project.ui,base);
 const checked=validateInstanceModule(project.module,base),canonical=serializeInstanceModule(project.module,base);
 if(project.bodyGraph!==null){const root=checked.transitions.find(action=>action.entry===project.module.program.entry);if(!root)fail('INSTANCE_ENTRY','Body graph must retain a public entry');const next=applyTransitionFlow(project.module,root.instance,root.name,project.bodyGraph,base);if(serializeInstanceModule(next,base)!==canonical)fail('INSTANCE_GRAPH_MISMATCH','Saved transition graph disagrees with semantic module');}
 if(['ems-instance-project/3','ems-instance-project/4'].includes(project.schemaVersion))validateAuthoredGraphs(project,checked,base);if(project.schemaVersion==='ems-instance-project/4')validateInstanceGraphViews(project);
 const seen=new Set();for(const item of project.invariantGraphs){fields(item,['contract','id','flow']);const key=JSON.stringify([item.contract,item.id]);if(seen.has(key)||typeof item.flow!=='string')fail('INVALID_INSTANCE_PROJECT','Invalid or duplicate invariant graph');seen.add(key);const next=applyInvariantFlow(project.module,item.contract,item.id,item.flow,base);if(serializeInstanceModule(next,base)!==canonical)fail('INSTANCE_GRAPH_MISMATCH','Saved invariant graph disagrees with semantic module');}
 return project;
}
export function parseInstanceProject(source,base=createCoreRegistry()){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>limit)fail('INSTANCE_LIMIT','Contract document exceeds 4 MiB');let data;try{data=JSON.parse(source);}catch{fail('INVALID_INSTANCE_PROJECT','Malformed contract document');}return validateInstanceProject(data,base);
}
export function serializeInstanceProject(project,base=createCoreRegistry()){
 validateInstanceProject(project,base);const result={...project,module:JSON.parse(serializeInstanceModule(project.module,base))},source=(project.schemaVersion!=='ems-instance-project/1'?formatFiniteJSON(result):JSON.stringify(result,null,2))+'\n';if(new TextEncoder().encode(source).length>limit)fail('INSTANCE_LIMIT','Contract document exceeds 4 MiB');return source;
}
export function importInstanceProject(source,base=createCoreRegistry()){
 let data;try{data=JSON.parse(source);}catch{return newInstanceProject(source,base);}
 if(['ems-instance-project/1','ems-instance-project/2','ems-instance-project/3','ems-instance-project/4'].includes(data?.schemaVersion))return parseInstanceProject(source,base);
 if(data?.schemaVersion==='ems-instance-module/1')return {schemaVersion:'ems-instance-project/1',module:parseInstanceModule(source,base),sourceArchive:null,bodyGraph:null,invariantGraphs:[]};
 fail('INSTANCE_VERSION','Expected native EMS or a contract module/document');
}
/** All transition scopes share one authoring graph, retaining geometry and helper definitions. */
export function instanceProjectFlow(project,target,base=createCoreRegistry()){
 const checked=validateInstanceModule(project.module,base);
 if(target.kind==='invariant'){const saved=project.invariantGraphs.find(item=>item.contract===target.contract&&item.id===target.id);if(saved)return {source:saved.flow,registry:base,options:{},activeContract:null};return {...invariantFlow(project.module,target.contract,target.id,base,{authoredGraphs:authoredGraphsFor(project,{kind:'invariant',definition:target.contract,id:target.id}),graphViews:graphViewsFor(project,{kind:'invariant',definition:target.contract,id:target.id})}),activeContract:null};}
 const root=checked.transitions.find(action=>action.entry===project.module.program.entry)??checked.transitions[0],action=checked.transitions.find(action=>action.instance===target.instance&&action.name===target.name);if(!action)fail('UNKNOWN_TRANSITION','Unknown transition');
 const view=project.bodyGraph!==null?{registry:checked.registry,options:{allowState:true},source:project.bodyGraph}:transitionFlow(project.module,root.instance,root.name,base,{authoredGraphs:authoredGraphsFor(project,{kind:'body'}),graphViews:graphViewsFor(project,{kind:'body'})});return {...view,activeContract:action.entry===root.entry?null:action.entry};
}
export function applyInstanceProjectFlow(project,target,flow,base=createCoreRegistry()){
 const next=structuredClone(project);
 if(target.kind==='invariant'){next.module=applyInvariantFlow(project.module,target.contract,target.id,flow,base);next.invariantGraphs=next.invariantGraphs.filter(item=>item.contract!==target.contract||item.id!==target.id);next.invariantGraphs.push({contract:target.contract,id:target.id,flow});clearAuthoredScope(next,{kind:'invariant',definition:target.contract,id:target.id});}
 else{const checked=validateInstanceModule(project.module,base),root=checked.transitions.find(action=>action.entry===project.module.program.entry)??checked.transitions[0];next.module=applyTransitionFlow(project.module,root.instance,root.name,flow,base);next.bodyGraph=flow;clearAuthoredScope(next,{kind:'body'});}
 validateInstanceProject(next,base);return next;
}
/** Editing an initial value changes the next session, never an already running owner. */
export function instanceInitial(project,instance,field,value,base=createCoreRegistry()){
 const checked=validateInstanceModule(project.module,base),owner=project.module.instances.find(item=>item.id===instance),spec=checked.definitions.get(owner?.contract)?.fields.find(item=>item.name===field);if(!spec)fail('UNKNOWN_STATE','Unknown instance field');
 assertFlowValue(value,spec.type,'instance initial',true);const expression=flowValueSource(value,spec.type),temporary=compileInstanceModule('@Initial { value:'+spec.type+'='+expression+'; +Read()->'+spec.type+' { return value; } } @Initial #initial;',base),next=structuredClone(project),initials=next.module.instances.find(item=>item.id===instance).initials;
 clearAuthoredScope(next,{kind:'override',instance,field});const item={field,program:temporary.definitions[0].fields[0].initializer},at=initials.findIndex(item=>item.field===field);if(at<0)initials.push(item);else initials[at]=item;validateInstanceProject(next,base);return next;
}
/** New operations start as a typed Result contract; wiring and effects are authored on the same canvas. */
export function addInstanceTransition(project,contract,name,inputs,output,base=createCoreRegistry()){
 const checked=validateInstanceModule(project.module,base),def=checked.definitions.get(contract);if(!def)fail('UNKNOWN_INSTANCE','Unknown definition');if(!/^[_A-Za-z][_A-Za-z0-9]*$/.test(name)||[...def.fields,...def.transitions].some(item=>item.name===name))fail('DUPLICATE_SYMBOL','Use a unique transition name');
 if(!Array.isArray(inputs)||inputs.length>100||new Set(inputs.map(p=>p.name)).size!==inputs.length||inputs.some(p=>!/^[_A-Za-z][_A-Za-z0-9]*$/.test(p.name)))fail('INVALID_INSTANCE_PROJECT','Invalid transition inputs');
 const type=canonicalFlowType(output),params=inputs.map(p=>p.name+':'+canonicalFlowType(p.type)).join(','),owners=project.module.instances.filter(item=>item.contract===contract),extra=compileInstanceModule('@'+contract+' { +'+name+'('+params+')->'+type+' { return '+flowValueSource(defaultFlowValue(type),type)+'; } } '+owners.map(item=>'@'+contract+' #'+item.id+';').join(' '),base),next=structuredClone(project);
 next.module.definitions.find(item=>item.id===contract).transitions.push(extra.definitions[0].transitions[0]);for(const owner of owners)next.module.instances.find(item=>item.id===owner.id).transitions.push(extra.instances.find(item=>item.id===owner.id).transitions[0]);next.module.program.functions.push(...extra.program.functions);
 const root=checked.transitions.find(action=>action.entry===project.module.program.entry)??checked.transitions[0],view=instanceProjectFlow(project,{kind:'transition',instance:root.instance,name:root.name},base),graph=parseFlowProject(view.source,view.registry,view.options),addition=transitionFlow(extra,owners[0].id,name,base),added=parseFlowProject(addition.source,addition.registry,addition.options);
 graph.contracts??=[];graph.schemaVersion='ems-flow-project/3';graph.callProfile='ems-flow-recursive/1';graph.contracts.push({graph:added.graph,inputs:added.inputs,canvas:added.canvas},...(added.contracts??[]));
 const registry=validateInstanceModule(next.module,base).registry,flow=serializeFlowProject(graph,registry,{allowState:true});return applyInstanceProjectFlow(next,{kind:'transition'},flow,base);
}
export function addInstanceInvariant(project,contract,base=createCoreRegistry()){
 const def=project.module.definitions.find(item=>item.id===contract);if(!def)fail('UNKNOWN_INSTANCE','Unknown definition');let id='invariant_0',i=0;while(def.invariants.some(item=>item.id===id))id='invariant_'+(++i);
 const temporary=compileInstanceModule('@Initial {'+def.fields.map(field=>field.name+':'+field.type+'='+flowValueSource(defaultFlowValue(field.type),field.type)+';').join('')+'+Run()->Boolean{return true;} ? true;} @Initial #initial;',base),next=structuredClone(project);next.module.definitions.find(item=>item.id===contract).invariants.push({id,program:temporary.definitions[0].invariants[0].program});validateInstanceProject(next,base);return {project:next,id};
}

export function withInstanceUI(project,ui={schemaVersion:'ems-ui/1',root:{id:'root',kind:'column',props:{gap:{literal:12},padding:{literal:16}},events:{},children:[]}},base=createCoreRegistry()){const next={...structuredClone(project),schemaVersion:['ems-instance-project/3','ems-instance-project/4'].includes(project.schemaVersion)?project.schemaVersion:'ems-instance-project/2',ui:structuredClone(ui)};validateInstanceProject(next,base);return next;}

export function applyInstanceUIFragment(project,source,{expectedUI}={},base=createCoreRegistry()){if(expectedUI!==undefined&&expectedUI!==formatFiniteJSON(project.ui))fail('STALE_UI_TEXT','UI changed since this text draft was opened');return withInstanceUI(project,compileInstanceUIFragment(source,project.module,base),base);}

import {assertAuthoredData} from '../frontend/authored-graphs.mjs';
import {authoredGraphsFor,authoredScopeKey,authoredScopeProgram} from './authored-graphs.mjs';
import {validateFlowPresentation} from './flow-project.mjs';
import {defaultFlowValue} from '../contracts/flow-values.mjs';
import {fail} from '../reference/errors.mjs';
export const graphViewsFor=(project,scope)=>project.graphViews?.find(record=>authoredScopeKey(record.scope)===authoredScopeKey(scope))?.workspaces??[];
function fields(record,names){if(!record||Array.isArray(record)||Object.keys(record).sort().join(',')!==[...names].sort().join(','))fail('INVALID_INSTANCE_GRAPH_VIEW','Unexpected graph presentation fields');}
export function validateInstanceGraphViews(project){
 assertAuthoredData(project.graphViews,{maxRecordKeys:2048});if(!Array.isArray(project.graphViews)||project.graphViews.length>2048)fail('INVALID_INSTANCE_GRAPH_VIEW','Invalid graph presentations');const seen=new Set();
 for(const record of project.graphViews){fields(record,['scope','workspaces']);if(!record.scope||typeof record.scope!=='object'||Array.isArray(record.scope))fail('INVALID_INSTANCE_GRAPH_VIEW','Expected presentation scope');const origin=project.authoredGraphs.find(item=>authoredScopeKey(item.scope)===authoredScopeKey(record.scope));if(!origin||JSON.stringify(Object.keys(record.scope).sort())!==JSON.stringify(Object.keys(origin.scope).sort()))fail('INVALID_INSTANCE_GRAPH_VIEW','Presentation requires a checked authored scope');authoredScopeProgram(project.module,record.scope);const key=authoredScopeKey(record.scope);if(seen.has(key)||!Array.isArray(record.workspaces)||record.workspaces.length>33||!record.workspaces.length)fail('INVALID_INSTANCE_GRAPH_VIEW','Duplicate or empty presentation scope');seen.add(key);const ids=new Set();
  for(const view of record.workspaces){fields(view,['id','inputs','canvas']);const graph=origin.graphs.find(graph=>graph.id===view.id);if(!graph||ids.has(view.id))fail('INVALID_INSTANCE_GRAPH_VIEW','Presentation requires a unique authored function');ids.add(view.id);validateFlowPresentation({...view,graph});}
 }
}
/** Keep matching IDs only; place explicit new nodes beside existing geometry. */
export function reconcileGraphView(old,graph){
 const ids=new Set([...graph.nodes.map(n=>n.id),...Object.keys(graph.inputs).map(name=>'input:'+name)]),previous=new Set(old?[...old.graph.nodes.map(n=>n.id),...Object.keys(old.graph.inputs).map(name=>'input:'+name)]:[]),canvas=structuredClone(old?.canvas??{positions:{},descriptions:{},view:{x:0,y:0,scale:1}});
 for(const key of ['positions','descriptions'])canvas[key]=Object.fromEntries(Object.entries(canvas[key]).filter(([id])=>ids.has(id)));
 const positions=Object.values(canvas.positions),right=positions.length?Math.max(...positions.map(p=>p.x))+300:40;let index=0;for(const id of ids)if(!previous.has(id)){Object.defineProperty(canvas.positions,id,{value:{x:right+(index%3)*290,y:80+Math.floor(index/3)*230},enumerable:true,writable:true,configurable:true});index++;}
 const inputs=Object.fromEntries(Object.entries(graph.inputs).map(([name,spec])=>[name,old?.graph.inputs[name]?.type===spec.type?structuredClone(old.inputs[name]):defaultFlowValue(spec.type)]));return {id:graph.id,inputs,canvas};
}
/** Field authoring updates the same stored presentation as its corresponding origin graph. */
export function updateInvariantViews(project,scope,before,change,entry,renames=new Map()){
 const graphs=authoredGraphsFor(project,scope),views=graphViewsFor(project,scope);
 for(const view of views){const oldGraph=before.find(graph=>graph.id===view.id);if(!oldGraph)continue;const graph=graphs.find(graph=>graph.id===(renames.get(view.id)??view.id));if(!graph)fail('INVALID_INSTANCE_GRAPH_VIEW','Guard adapter lost its authored graph');const old={graph:structuredClone(oldGraph),inputs:view.inputs,canvas:view.canvas};
  if(oldGraph.id===entry&&graph.id===entry&&change.rename){const {from,to}=change.rename;old.graph.inputs=Object.fromEntries(Object.entries(old.graph.inputs).map(([name,spec])=>[name===from?to:name,spec]));old.inputs=Object.fromEntries(Object.entries(old.inputs).map(([name,value])=>[name===from?to:name,value]));for(const key of ['positions','descriptions'])old.canvas[key]=Object.fromEntries(Object.entries(old.canvas[key]).map(([id,value])=>[id==='input:'+from?'input:'+to:id,value]));}
  Object.assign(view,reconcileGraphView(old,graph));
 }
}

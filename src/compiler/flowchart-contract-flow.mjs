import {validateContractFlow} from '../contracts/flow.mjs';
import {describeContract,validateDescription} from '../contracts/descriptions.mjs';
import {renderFlowchartSVG} from './flowchart.mjs';
/** Diagram the actual contract edges, never the compiler's dispatcher implementation. */
export function buildContractFlowchart(graph,registry,{descriptions={},allowState=false}={}){
 const checked=validateContractFlow(graph,registry,{allowState}),nodes=[],edges=[],ids=new Map(),quote=value=>Object.is(value,-0)?'-0':Array.isArray(value)?'['+value.map(quote).join(', ')+']':value&&typeof value==='object'?'{'+Object.entries(value).map(([key,child])=>JSON.stringify(key)+': '+quote(child)).join(', ')+'}':JSON.stringify(value),ref=value=>value.node??value.input??quote(value.literal);
 for(const value of Object.values(descriptions))validateDescription(value);
 const add=(kind,label)=>{const id='n'+nodes.length;nodes.push({id,kind,label});return id;},edge=(from,to,label='',back=false)=>edges.push({from,to,label,back});
 const start=add('terminal','Начало '+graph.id);let previous=start;
 if(Object.keys(graph.inputs).length){const input=add('data','Параметры: '+Object.entries(graph.inputs).map(([name,type])=>name+': '+type.type).join(', '));edge(previous,input);previous=input;}
 for(const cell of graph.nodes.filter(node=>node.uses==='std.storage.Variable')){const initial=add('process',cell.id+' := '+quote(cell.initial));edge(previous,initial);previous=initial;}
 for(const id of checked.reachable){const node=checked.nodes.get(id),spec=checked.interfaces.get(id),values=Object.fromEntries(Object.entries(node.args).map(([port,value])=>[port,ref(value)]));let kind='predefined',label=describeContract(registry.items.get(node.uses)??{id:node.uses,inputs:spec.inputs},values);
  if(node.uses==='std.control.If'){kind='decision';label=values.condition+'?';}
  if(node.uses==='std.storage.Variable'){kind='process';label=Object.hasOwn(node.args,'value')?'Записать '+values.value+' в '+id:'Прочитать '+id;}
  if(node.uses==='std.program.Result'){kind='data';label='Вернуть '+values.value;}
  if(node.uses==='std.control.IterationBegin'||node.uses==='std.control.IterationEnd'){kind='connector';label=node.uses.endsWith('Begin')?'Начало итерации':'Конец итерации';}
  ids.set(id,add(kind,Object.hasOwn(descriptions,id)&&descriptions[id].trim()?descriptions[id]:label));
 }
 edge(previous,ids.get(graph.entry));const end=add('terminal','Конец '+graph.id),active=new Set(),done=new Set();
 function walk(id){if(done.has(id))return;active.add(id);const node=checked.nodes.get(id);if(node.uses==='std.program.Result')edge(ids.get(id),end);for(const port of checked.interfaces.get(id).activation.outputs){const target=checked.outgoing.get(id+':'+port),back=active.has(target);edge(ids.get(id),ids.get(target),port==='yes'?'Да':port==='no'?'Нет':'',back);if(!back)walk(target);}active.delete(id);done.add(id);}
 walk(graph.entry);return {schemaVersion:'ems-flowchart/1',standard:'ГОСТ 19.701-90',components:[{name:graph.id,inputs:Object.entries(graph.inputs).map(([name,spec])=>({name,type:spec.type})),nodes,edges,start}]};
}
export function exportContractFlowSVG(graph,registry,options){return renderFlowchartSVG(buildContractFlowchart(graph,registry,options));}

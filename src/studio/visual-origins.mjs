import {lowerCollectionGraph} from './collections.mjs';
import {controlInspectionDeclarations} from '../runtime/inspection.mjs';
import {controlNodeEntries} from '../ir/control-addresses.mjs';
import {fail} from '../reference/errors.mjs';

const pointer=name=>String(name).replaceAll('~','~0').replaceAll('/','~1');
/** Project original visual sources onto semantic occurrences in the shared control lowering. */
export function lowerVisualOrigins(graph,registry){
 const bundle=lowerCollectionGraph(graph,registry),sources=[],identities=new Set();
 for(const view of bundle.presentation){
  if(identities.has(view.graph))fail('INVALID_VISUAL_ORIGIN','Ambiguous visual graph identity');identities.add(view.graph);
  const fn=bundle.ir.functions.find(fn=>fn.id===view.function),body=view.graph===graph.id?graph:[...registry.items.values()].find(item=>item.kind==='composite'&&item.graph.id===view.graph)?.graph;
  if(!fn||!body)fail('INVALID_VISUAL_ORIGIN','Ambiguous visual graph identity');
  const declarations=controlInspectionDeclarations(fn);
  for(const input of view.inputs){const d=declarations.find(item=>item.name===input.binding);if(!d||!d.declaration.startsWith('/inputs/'))fail('INVALID_VISUAL_ORIGIN','Missing semantic input');sources.push({graph:view.graph,path:'/graph/inputs/'+pointer(input.name),kind:'input',name:input.name,type:d.type,roots:[{kind:'input',function:fn.id,path:d.declaration}]});}
  function literals(expression,path){return [...controlNodeEntries({body:[{kind:'expression',value:expression}]})].filter(([,node])=>node.kind==='literal'||node.kind==='array'&&node.elements.length===0).map(([at])=>({kind:'literal',function:fn.id,path:path+at.slice('/body/0/value'.length)}));}
  for(const mapped of view.nodes){
   const original=body.nodes.find(n=>n.id===mapped.name),d=declarations.find(item=>item.name===mapped.binding),statement=d&&[...controlNodeEntries(fn)].find(([path])=>path===d.declaration)?.[1];
   if(!original||statement?.value.kind!=='call')fail('INVALID_VISUAL_ORIGIN','Missing semantic call declaration');
   const item=registry.resolve(original.uses);Object.keys(item.inputs).forEach((port,index)=>{
    if(!Object.hasOwn(original.args[port],'literal'))return;
    const expression=statement.value.arguments[index],roots=literals(expression,d.declaration+'/value/arguments/'+index);
    if(!roots.length)fail('INVALID_VISUAL_ORIGIN','Literal has no semantic source');
    sources.push({graph:view.graph,path:'/graph/nodes/'+pointer(original.id)+'/arguments/'+pointer(port),kind:'literal',name:original.id+' · '+port,type:typeof item.inputs[port]==='string'?item.inputs[port]:item.inputs[port].type,roots});
   });
  }
  if(Object.hasOwn(body.returns,'literal')){const index=fn.body.findIndex(s=>s.kind==='return'),roots=literals(fn.body[index].value,'/body/'+index+'/value');if(!roots.length)fail('INVALID_VISUAL_ORIGIN','Result literal has no semantic source');sources.push({graph:view.graph,path:'/graph/return',kind:'literal',name:'Ответ',type:body.output.type,roots});}
 }
 return {...bundle,visualSources:sources};
}
/** Expand one visual label into all actual literal occurrences; never label derived node outputs. */
export function visualOriginAnnotations(bundle,labels){
 if(!Array.isArray(labels)||labels.length>2048||Reflect.ownKeys(labels).length!==labels.length+1||Array.from({length:labels.length},(_,i)=>Object.getOwnPropertyDescriptor(labels,String(i))).some(d=>!d||!Object.hasOwn(d,'value')))fail('INVALID_VISUAL_ORIGIN','Invalid visual label list');const seen=new Set(),sources=[];
 for(const label of labels){if(!label||typeof label!=='object'||Array.isArray(label)||![Object.prototype,null].includes(Object.getPrototypeOf(label))||Reflect.ownKeys(label).length!==3||['classification','graph','path'].some(k=>!Object.hasOwn(label,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(label,k),'value'))||!['public','private'].includes(label.classification))fail('INVALID_VISUAL_ORIGIN','Invalid visual annotation');const key=JSON.stringify([label.graph,label.path]);if(seen.has(key))fail('INVALID_VISUAL_ORIGIN','Duplicate visual annotation');seen.add(key);const original=bundle.visualSources.find(s=>s.graph===label.graph&&s.path===label.path);if(!original)fail('INVALID_VISUAL_ORIGIN','Annotation must select an original visual source');for(const root of original.roots)sources.push({...root,classification:label.classification});}
 return {schemaVersion:'ems-origin-policy/1',sources};
}

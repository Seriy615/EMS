/** Typed ports project existing lexical values and expression spans; they add no evaluation rules. */
export function structuredPorts(graph,nodes){
 const sources=[],targets=[];
 for(const node of nodes){
  if(['LetDeclaration','Parameter'].includes(node.kind)&&node.type)sources.push({id:node.id,node:node.id,name:node.label,type:node.type});
  if(node.loop?.binding&&node.loop.bindingType)sources.push({id:node.id+'/binding',node:node.id,name:node.loop.binding,type:node.loop.bindingType});
  for(const input of node.operation?.inputs??[])targets.push({id:node.id+':'+input.name,node:node.id,label:input.name,type:input.type,...input});
  if(node.condition)targets.push({id:node.id+':condition',node:node.id,label:'Условие',type:'Boolean',...node.condition});
  if(node.loop)targets.push({id:node.id+':loop',node:node.id,label:node.loop.kind==='while'?'Условие':'Массив',type:node.loop.kind==='while'?'Boolean':node.loop.valueType,...node.loop.value});
  if(node.result)targets.push({id:node.id+':result',node:node.id,label:'Результат',...node.result});
 }
 const edges=[];for(const target of targets){const ref=graph.nodes.find(n=>n.kind==='NameExpression'&&n.location.start.offset===target.location.start.offset&&n.location.end.offset===target.location.end.offset),source=sources.find(s=>s.id===ref?.binding?.id);if(source)edges.push({from:source.id,to:target.id});}
 return {sources,targets,edges};
}
/** Candidate only. The ordinary frontend must still check types, scope and exact lexical identity. */
export function structuredConnectionSource(graph,source,target){return graph.source.slice(0,target.location.start.offset)+source.name+graph.source.slice(target.location.end.offset);}
export function hasStructuredBinding(graph,source,target){return graph.nodes.some(n=>n.kind==='NameExpression'&&n.location.start.offset===target.location.start.offset&&n.binding?.id===source.id);}

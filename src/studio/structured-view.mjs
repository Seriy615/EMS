import {storageConnections} from './storage-connections.mjs';
/** Presentation of one contract body. Syntax containers stay in source, not on the canvas. */
export function structuredView(graph,entry){
 const definition=graph.nodes.find(n=>['ContractDeclaration','FunctionDeclaration'].includes(n.kind)&&n.label===entry),nodes=[],edges=[],emptyBranches=new Map();if(!definition)return {nodes,edges};const byId=new Map(graph.nodes.map(n=>[n.id,n])),foldedWrites=new Set(graph.nodes.filter(n=>n.storage).flatMap(n=>storageConnections(graph,n.id).map(link=>link.statement.id)));
 const add=(id,x,y,label)=>{const node=byId.get(id);if(!node)return null;nodes.push({...node,viewPosition:{x,y},viewLabel:label});return id;};
 const connect=(from,to,label='')=>{if(!from||!to)return;const labels=label?[label]:emptyBranches.get(from)??[byId.get(from)?.loop?'Готово':''];for(const value of labels)edges.push({from,to,label:value,kind:'control'});};
 function block(id,x,y,regionLabel){let previous=null,first=null;if(regionLabel){previous=first=add(id,x,y,regionLabel);y+=140;}
  const statements=graph.nodes.filter(n=>n.id.startsWith(id+'/statements/')&&/^\d+$/.test(n.id.slice((id+'/statements/').length))).sort((a,b)=>Number(a.id.split('/').at(-1))-Number(b.id.split('/').at(-1)));
  let exits=previous?[previous]:[],breaks=[],continues=[];
  for(const node of statements){if(foldedWrites.has(node.id))continue;add(node.id,x,y);if(!first)first=node.id;for(const prior of exits)connect(prior,node.id);exits=[node.id];y+=node.storage?500:node.storageWrite?340:node.operation?420:node.condition?480:node.loop?400:node.result?280:240;
   if(node.kind==='IfStatement'){nodes.find(n=>n.id===node.id).controlOutputs=[{id:node.id+'/then',label:'Да'},{id:node.id+'/otherwise',label:'Нет'}];const yes=block(node.id+'/then',x,y,null),no=block(node.id+'/otherwise',x+280,y,null);connect(node.id,yes.first,'Да');connect(node.id,no.first,'Нет');exits=[...yes.exits,...no.exits];if(!yes.first||!no.first){emptyBranches.set(node.id,[...(!yes.first?['Да']:[]),...(!no.first?['Нет']:[])]);exits.push(node.id);}breaks.push(...yes.breaks,...no.breaks);continues.push(...yes.continues,...no.continues);y=Math.max(yes.y,no.y)+30;}
   else if(node.loop){nodes.find(n=>n.id===node.id).controlOutputs=[{id:node.loop.body,label:'Тело'},{id:node.id+':next',label:'Готово'}];const body=block(node.loop.body,x+40,y,null);connect(node.id,body.first,'Выполнить');for(const exit of [...body.exits,...body.continues])connect(exit,node.id,'Повторить');exits.push(...body.breaks);y=body.y+30;}
   if(node.kind==='ReturnStatement'||node.kind==='ThrowStatement')exits=[];if(node.kind==='BreakStatement'){breaks.push(node.id);exits=[];}if(node.kind==='ContinueStatement'){continues.push(node.id);exits=[];}
  }
  return {first,exits,breaks,continues,y};
 }
 for(const [index,param]of graph.nodes.filter(n=>n.kind==='Parameter'&&n.id.startsWith(definition.id+'/parameters/')).entries())add(param.id,-260,40+index*180);
 block(definition.id+'/body',40,40,null);return {nodes,edges};
}

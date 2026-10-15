/** Presentation of one contract body. Syntax containers stay in source, not on the canvas. */
export function structuredView(graph,entry){
 const definition=graph.nodes.find(n=>['ContractDeclaration','FunctionDeclaration'].includes(n.kind)&&n.label===entry),nodes=[],edges=[];if(!definition)return {nodes,edges};const byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const add=(id,x,y,label)=>{const node=byId.get(id);if(!node)return null;nodes.push({...node,viewPosition:{x,y},viewLabel:label});return id;};
 const connect=(from,to,label='')=>{if(from&&to)edges.push({from,to,label,kind:'control'});};
 function block(id,x,y,regionLabel){let previous=null,first=null;if(regionLabel){previous=first=add(id,x,y,regionLabel);y+=140;}
  const statements=graph.nodes.filter(n=>n.id.startsWith(id+'/statements/')&&/^\d+$/.test(n.id.slice((id+'/statements/').length))).sort((a,b)=>Number(a.id.split('/').at(-1))-Number(b.id.split('/').at(-1)));
  let exits=previous?[previous]:[],breaks=[],continues=[];
  for(const node of statements){add(node.id,x,y);if(!first)first=node.id;for(const prior of exits)connect(prior,node.id);exits=[node.id];y+=node.operation?340:node.condition?320:node.loop?260:node.result?210:180;
   if(node.kind==='IfStatement'){const yes=block(node.id+'/then',x,y,'Да'),no=block(node.id+'/otherwise',x+280,y,'Нет');connect(node.id,yes.first,'Да');connect(node.id,no.first,'Нет');exits=[...yes.exits,...no.exits];if(!no.first)exits.push(node.id);breaks.push(...yes.breaks,...no.breaks);continues.push(...yes.continues,...no.continues);y=Math.max(yes.y,no.y)+30;}
   else if(node.loop){const body=block(node.loop.body,x+40,y,'Тело цикла');connect(node.id,body.first,'Выполнить');for(const exit of [...body.exits,...body.continues])connect(exit,node.id,'Повторить');exits.push(...body.breaks);y=body.y+30;}
   if(node.kind==='ReturnStatement'||node.kind==='ThrowStatement')exits=[];if(node.kind==='BreakStatement'){breaks.push(node.id);exits=[];}if(node.kind==='ContinueStatement'){continues.push(node.id);exits=[];}
  }
  return {first,exits,breaks,continues,y};
 }
 for(const [index,param]of graph.nodes.filter(n=>n.kind==='Parameter'&&n.id.startsWith(definition.id+'/parameters/')).entries())add(param.id,-260,40+index*180);
 block(definition.id+'/body',40,40,null);return {nodes,edges};
}

/** Insert into the selected entry/body, preserving creation order before its terminal. */
export function controlInsertion(graph,entry,targetId=null){
 const root=graph.nodes.find(n=>['ContractDeclaration','FunctionDeclaration'].includes(n.kind)&&n.label===entry),body=graph.nodes.find(n=>n.id===root?.id+'/body');if(!body)throw Error('Missing entry body');
 if(targetId?.endsWith(':next')){const statement=graph.nodes.find(n=>n.id===targetId.slice(0,-5)&&n.id.startsWith(body.id));if(!statement?.loop)throw Error('Выход продолжения доступен только у цикла');return {block:body,offset:statement.location.end.offset};}
 const chosen=graph.nodes.find(n=>n.id===targetId&&n.id.startsWith(body.id)),blocks=graph.nodes.filter(n=>n.kind==='Block'&&n.id.startsWith(body.id));
 const block=chosen?.kind==='Block'?chosen:chosen?blocks.filter(n=>n.location.start.offset<=chosen.location.start.offset&&n.location.end.offset>=chosen.location.end.offset).sort((a,b)=>b.depth-a.depth)[0]:body;
 if(chosen&&/\/statements\/\d+$/.test(chosen.id))return {block,offset:chosen.location.start.offset};
 const terminal=graph.nodes.filter(n=>n.id.startsWith(block.id+'/statements/')&&/^\d+$/.test(n.id.slice((block.id+'/statements/').length))&&['ReturnStatement','ThrowStatement','BreakStatement','ContinueStatement'].includes(n.kind)).sort((a,b)=>a.location.start.offset-b.location.start.offset)[0];
 return {block,offset:terminal?.location.start.offset??block.location.end.offset-1};
}
/** Rebase presentation keys using exact source edit spans, not mutable AST array indices. */
export function rebaseControlPositions(previous,next,positions,{start,end,text}){
 const delta=text.length-(end-start),byLocation=new Map(next.nodes.map(n=>[n.kind+':'+n.location.start.offset,n.id])),rebased={},ids=new Map();
 for(const node of previous.nodes){if(node.location.start.offset>=start&&node.location.start.offset<end)continue;const offset=node.location.start.offset>=end?node.location.start.offset+delta:node.location.start.offset,id=byLocation.get(node.kind+':'+offset);if(!id)continue;ids.set(node.id,id);if(positions[node.id])rebased[id]={...positions[node.id]};}
 return {positions:rebased,ids};
}
/** Move a whole statement into a control body; the caller must typecheck before committing. */
export function controlRelocation(graph,entry,nodeId,blockId){
 const node=graph.nodes.find(n=>n.id===nodeId),block=graph.nodes.find(n=>n.id===blockId),after=blockId?.endsWith(':next')?graph.nodes.find(n=>n.id===blockId.slice(0,-5)):null;
 if(!node||!/\/statements\/\d+$/.test(node.id)||block?.kind!=='Block'&&!after?.loop)throw Error('Выберите выполняемый блок и ветвь');
 if((block?.id??after?.id).startsWith(node.id+'/')||after?.id===node.id)throw Error('Нельзя поместить блок внутрь самого себя');
 const {offset}=controlInsertion(graph,entry,blockId),start=node.location.start.offset,end=node.location.end.offset,length=end-start;
 if(offset>=start&&offset<=end)throw Error('Блок уже находится в выбранной позиции');
 const insertion=offset>=end?offset-length:offset,text='\n'+graph.source.slice(start,end)+'\n',without=graph.source.slice(0,start)+graph.source.slice(end),source=without.slice(0,insertion)+text+without.slice(insertion);
 const mapOffset=value=>value>=start&&value<end?insertion+1+value-start:(value>=end?value-length:value)+( (value>=end?value-length:value)>=insertion?text.length:0);
 return {source,mapOffset};
}

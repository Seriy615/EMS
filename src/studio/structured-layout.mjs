/** Insert into the selected entry/body, preserving creation order before its terminal. */
export function controlInsertion(graph,entry,targetId=null){
 const root=graph.nodes.find(n=>['ContractDeclaration','FunctionDeclaration'].includes(n.kind)&&n.label===entry),body=graph.nodes.find(n=>n.id===root?.id+'/body');if(!body)throw Error('Missing entry body');
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

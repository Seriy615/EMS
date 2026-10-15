import {fail} from '../reference/errors.mjs';

/** Existing assignments whose value comes from an ordinary graph output. */
export function storageConnections(graph,variableId){
 return graph.nodes.filter(node=>node.storageWrite?.binding?.id===variableId).flatMap(node=>{
  const value=node.storageWrite.value,reference=graph.nodes.find(ref=>ref.kind==='NameExpression'&&ref.location.start.offset===value.location.start.offset&&ref.location.end.offset===value.location.end.offset);
  return reference?.binding?[{statement:node,reference}]:[];
 });
}

/** Transaction candidate only: a data arrival writes the existing cell at the producer's execution point. */
export function storageConnectionEdit(graph,variableId,sourceId){
 const variable=graph.nodes.find(node=>node.id===variableId&&node.storage),source=graph.nodes.find(node=>node.id===sourceId),iteration=graph.nodes.find(node=>node.loop?.binding&&node.id+'/binding'===sourceId);
 if(!variable||!source&&!iteration)fail('INVALID_GRAPH_CONNECTION','Unknown variable or source');
 if(variableId===sourceId)fail('INVALID_GRAPH_CONNECTION','Connect a computed value to the variable input');
 const name=iteration?.loop.binding??source.label;
 if(source&&!['LetDeclaration','Parameter'].includes(source.kind))fail('INVALID_GRAPH_CONNECTION','The selected node has no value output');
 const offset=iteration?graph.nodes.find(node=>node.id===iteration.loop.body).location.start.offset+1:source.kind==='Parameter'?variable.location.end.offset:source.location.end.offset;
 const edits=storageConnections(graph,variableId).map(({statement})=>({start:statement.location.start.offset,end:statement.location.end.offset,text:''}));
 edits.push({start:offset,end:offset,text:'\n'+variable.storage.name+' = '+name+';\n'});
 let candidate=graph.source;for(const edit of [...edits].sort((a,b)=>b.start-a.start||b.end-a.end))candidate=candidate.slice(0,edit.start)+edit.text+candidate.slice(edit.end);
 function mapOffset(offset){if(edits.some(edit=>edit.end>edit.start&&offset>=edit.start&&offset<edit.end))return null;return offset+edits.filter(edit=>edit.end<=offset).reduce((delta,edit)=>delta+edit.text.length-(edit.end-edit.start),0);}
 return {source:candidate,mapOffset,variable,producer:iteration??source,sourceId,sourceName:name};
}

/** Reject same-spelling values from another lexical scope after the ordinary frontend has checked the candidate. */
export function verifyStorageConnection(previous,next,edit){
 const variable=next.nodes.find(node=>node.storage&&node.location.start.offset===edit.mapOffset(edit.variable.location.start.offset)),producer=next.nodes.find(node=>node.kind===edit.producer.kind&&node.location.start.offset===edit.mapOffset(edit.producer.location.start.offset)),sourceId=producer&&(edit.sourceId.endsWith('/binding')?producer.id+'/binding':producer.id);
 if(!variable||!sourceId||!storageConnections(next,variable.id).some(({reference})=>reference.binding.id===sourceId))fail('INVALID_GRAPH_BINDING','The output is not visible at this variable write');
 return {variable,producer};
}

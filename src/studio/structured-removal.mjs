import {fail} from '../reference/errors.mjs';
import {sourceDescription} from './descriptions.mjs';
const defaults={Number:'0',Boolean:'false',String:'""',NumberArray:'std.value.NumberArray([])','Array<Number>':'std.value.NumberArray([])'};
function empty(type){if(!Object.hasOwn(defaults,type))fail('UNCONNECTED_TYPE','Reconnect this value before deleting its producer',{type});return defaults[type];}
/** Delete a visual contract and disconnect its consumers, using the same explicit defaults as the finite editor. */
export function structuredRemoval(graph,id,check){
 const node=graph.nodes.find(node=>node.id===id);if(!node||!/\/statements\/\d+$/.test(id))fail('INVALID_NODE','Select a removable contract');
 const removed=graph.nodes.filter(item=>item.id===id||item.id.startsWith(id+'/')),bindings=new Set(removed.filter(item=>['LetDeclaration','UsingDeclaration'].includes(item.kind)).map(item=>item.id));
 for(const item of removed)if(item.loop?.binding)bindings.add(item.id+'/binding');
 const statements=[node];
 for(const item of graph.nodes){if(item.id===id||item.id.startsWith(id+'/'))continue;if(item.storageWrite){const targetRemoved=bindings.has(item.storageWrite.binding?.id),value=graph.nodes.find(value=>value.kind==='NameExpression'&&value.location.start.offset===item.storageWrite.value.location.start.offset&&value.location.end.offset===item.storageWrite.value.location.end.offset);if(targetRemoved||bindings.has(value?.binding?.id))statements.push(item);}}
 const ranges=statements.map(item=>({start:sourceDescription(graph.source,item.location).start,end:item.location.end.offset,text:''}));
 const inside=location=>ranges.some(range=>location.start.offset>=range.start&&location.end.offset<=range.end);
 for(const item of graph.nodes)if(item.kind==='NameExpression'&&bindings.has(item.binding?.id)&&!inside(item.location))ranges.push({start:item.location.start.offset,end:item.location.end.offset,text:empty(item.type)});
 function source(){let value=graph.source;for(const edit of [...ranges].sort((a,b)=>b.start-a.start||b.end-a.end))value=value.slice(0,edit.start)+edit.text+value.slice(edit.end);return value;}
 let candidate=source();try{check(candidate);}catch(error){if(error.code!=='MISSING_RETURN')throw error;const owner=graph.nodes.find(item=>['ContractDeclaration','FunctionDeclaration'].includes(item.kind)&&id.startsWith(item.id+'/'));if(!owner)throw error;const body=graph.nodes.find(item=>item.id===owner.id+'/body');ranges.push({start:body.location.end.offset-1,end:body.location.end.offset-1,text:'\nreturn '+empty(owner.output)+';\n'});candidate=source();check(candidate);}
 return {source:candidate,mapOffset:offset=>ranges.some(edit=>offset>=edit.start&&offset<edit.end)?null:offset+ranges.filter(edit=>edit.end<=offset).reduce((delta,edit)=>delta+edit.text.length-(edit.end-edit.start),0),disconnected:ranges.length-statements.length,removed:statements.length};
}

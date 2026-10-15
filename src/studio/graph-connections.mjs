import {fail} from '../reference/errors.mjs';
import {controlRelocation} from './structured-layout.mjs';
import {structuredConnectionSource,hasStructuredBinding} from './structured-ports.mjs';
import {storageConnectionEdit,verifyStorageConnection} from './storage-connections.mjs';

/** A single connection transaction for typed contract ports, independent of their canvas representation. */
export function contractConnectionEdit(graph,source,target,entry=graph.entry){
 const from=source.kind??'value',to=target.kind??'value';
 if(from!==to)fail('TYPE_MISMATCH','Contract ports have incompatible types');
 if(from==='activation')return {...controlRelocation(graph,entry,target.node,source.id),kind:'activation'};
 if(target.storage)return {...storageConnectionEdit(graph,target.node,source.id),kind:'storage'};
 const start=target.location.start.offset,end=target.location.end.offset,text=source.name;
 return {kind:'value',source:structuredConnectionSource(graph,source,target),valueSource:source,target,mapOffset:offset=>offset>=start&&offset<end?null:offset>=end?offset+text.length-(end-start):offset};
}
export function verifyContractConnection(previous,next,edit){
 if(edit.kind==='storage')return verifyStorageConnection(previous,next,edit);
 if(edit.kind==='value'&&!hasStructuredBinding(next,edit.valueSource,edit.target))fail('INVALID_GRAPH_BINDING','The output is not visible at the selected input');
}

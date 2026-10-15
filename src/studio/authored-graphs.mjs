import {verifyAuthoredProgramGraphs,assertAuthoredData} from '../frontend/authored-graphs.mjs';
import {fail} from '../reference/errors.mjs';
const scopeFields={body:['kind'],invariant:['kind','definition','id'],initializer:['kind','definition','field'],override:['kind','instance','field']};
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))fail('INVALID_AUTHORED_GRAPH','Unexpected authored scope fields');}
export const authoredScopeKey=scope=>JSON.stringify([scope.kind,scope.definition??null,scope.instance??null,scope.field??null,scope.id??null]);
export function authoredScopeProgram(module,scope){
 let program;if(scope.kind==='body')program=module.program;
 if(scope.kind==='initializer')program=module.definitions.find(def=>def.id===scope.definition)?.fields.find(field=>field.name===scope.field)?.initializer;
 if(scope.kind==='invariant')program=module.definitions.find(def=>def.id===scope.definition)?.invariants.find(invariant=>invariant.id===scope.id)?.program;
 if(scope.kind==='override')program=module.instances.find(instance=>instance.id===scope.instance)?.initials.find(initial=>initial.field===scope.field)?.program;
 if(!program)fail('AUTHORED_GRAPH_SCOPE','Authored graph scope does not exist');return program;
}
export const authoredGraphsFor=(project,scope)=>project.authoredGraphs?.find(record=>authoredScopeKey(record.scope)===authoredScopeKey(scope))?.graphs??[];
export function clearAuthoredScope(project,scope){if(project.authoredGraphs)project.authoredGraphs=project.authoredGraphs.filter(record=>authoredScopeKey(record.scope)!==authoredScopeKey(scope));}
export function validateAuthoredGraphs(project,checked,base){
 assertAuthoredData(project.authoredGraphs);if(!Array.isArray(project.authoredGraphs)||project.authoredGraphs.length>2048)fail('AUTHORED_GRAPH_LIMIT','Too many authored scopes');const seen=new Set();let nodes=0;
 for(const record of project.authoredGraphs){fields(record,['scope','graphs']);if(!record.scope||!Object.hasOwn(scopeFields,record.scope.kind))fail('AUTHORED_GRAPH_SCOPE','Unknown authored scope');fields(record.scope,scopeFields[record.scope.kind]);const key=authoredScopeKey(record.scope);if(seen.has(key))fail('INVALID_AUTHORED_GRAPH','Duplicate authored scope');seen.add(key);if(!Array.isArray(record.graphs)||!record.graphs.length)fail('INVALID_AUTHORED_GRAPH','Expected authored functions');nodes+=record.graphs.reduce((n,graph)=>n+(graph?.nodes?.length??0),0);if(nodes>65536)fail('AUTHORED_GRAPH_LIMIT','Authored scopes exceed65536 nodes');const body=record.scope.kind==='body';verifyAuthoredProgramGraphs(authoredScopeProgram(project.module,record.scope),record.graphs,body?checked.registry:base,{allowState:body});
 }
}

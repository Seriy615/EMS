import {fail} from '../reference/errors.mjs';
import {parseEMSModule} from './index.mjs';

import {COLLECTION_TEMPLATES} from '../stdlib/collections.mjs';

function qualified(node){if(node?.kind==='NameExpression')return node.name;if(node?.kind==='MemberExpression'){const parent=qualified(node.value);return parent?parent+'.'+node.member:null;}return null;}
/** Normalize statically typed contract-reference applications into existing semantic loops/calls. */
export function expandCollectionApplications(source,registry,{imports=new Map()}={}){
 const ast=structuredClone(source),declarations=new Set(ast.declarations.map(item=>item.name)),used=new Set([...declarations,...ast.imports.map(item=>item.alias)]),applications=[],intrinsics=new Map(),namespaces=new Map(ast.imports.map(item=>[item.alias,imports.get(item.source)]));
 let count=0,visits=0;
 const pending=[ast],seen=new Set();while(pending.length){const value=pending.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);if(seen.size>200000)fail('AST_LIMIT','Collection normalization exceeds AST limit');for(const [key,item] of Object.entries(value)){if(key==='location')continue;if(key==='name'&&typeof item==='string')used.add(item);if(Array.isArray(item))pending.push(...item);else if(item&&typeof item==='object')pending.push(item);}}

 function visit(value){
  if(!value||typeof value!=='object')return value;
  if(++visits>200000)fail('AST_LIMIT','Collection normalization exceeds AST limit');
  for(const [key,item] of Object.entries(value)){if(key==='location')continue;if(Array.isArray(item))value[key]=item.map(visit);else if(item&&typeof item==='object')value[key]=visit(item);}
  const name=value.kind==='CallExpression'?qualified(value.callee):null;const [prefix,...rest]=(name??'').split('.');const id=namespaces.has(prefix)?namespaces.get(prefix)+'.'+rest.join('.'):name,template=COLLECTION_TEMPLATES.find(item=>item.id===id);
  if(!template||declarations.has(name)||registry.items.has(id))return value;
  if(value.arguments.length!==2)fail('CALL_ARITY',`${id} requires an array and a typed contract reference`,{location:value.location});
  const callback=qualified(value.arguments[1]);if(!callback||!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(callback))fail('CONTRACT_REF_REQUIRED','Collection callback must be a static typed function or contract reference',{location:value.arguments[1].location});
  let helper;do{helper=`__ems_collection_${count++}`;}while(used.has(helper));used.add(helper);
  if(applications.length>=1000)fail('AST_LIMIT','Too many collection applications');
  function local(suffix){let candidate=helper+'_'+suffix;while(used.has(candidate))candidate+='_';used.add(candidate);return candidate;}
  const values=local('values'),result=local('result'),item=local('item');
  const body=id==='std.array.map'?`${result}=std.array.append(${result},${callback}(${item}));`:`if ${callback}(${item}) {${result}=std.array.append(${result},${item});}`;
  const declaration=parseEMSModule(`fn ${helper}(${values}:Number[])->Number[] {let mut ${result}:Number[]=[];for ${item} in ${values} {${body}}return ${result};}`).declarations[0];
  function locate(node){if(!node||typeof node!=='object')return;if(node.kind==='CallExpression'&&node.arguments.length===2&&qualified(node.callee)==='std.array.append')intrinsics.set(node,'std.array.append');for(const [key,item] of Object.entries(node)){if(key==='location'){node.location=structuredClone(value.location);continue;}if(Array.isArray(item))item.forEach(locate);else if(item&&typeof item==='object')locate(item);}}
  locate(declaration);applications.push({id,helper,callback,location:structuredClone(value.location),declaration});
  return {...value,callee:{kind:'NameExpression',name:helper,location:structuredClone(value.callee.location)},arguments:[value.arguments[0]]};
 }
 ast.declarations=ast.declarations.map(visit);ast.declarations.push(...applications.map(item=>item.declaration));
 return {ast:applications.length?ast:source,intrinsics,applications:applications.map(({declaration,...item})=>item)};
}

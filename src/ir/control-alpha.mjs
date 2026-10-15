import {fail} from '../reference/errors.mjs';
import {formatFiniteJSON} from '../semantics/data-json.mjs';
/** Structural identity of a validated finite IR function, modulo private lexical binder spelling. */
export function controlFunctionIdentity(fn){
 let next=0;const fresh=()=>'$local'+next++,lookup=(scope,name)=>{if(!scope.has(name))fail('INVALID_IR','Unbound local in function comparison');return scope.get(name);};
 function expression(value,scope){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(item=>expression(item,scope));const out={};for(const [key,item]of Object.entries(value))out[key]=key==='name'&&['local','assign'].includes(value.kind)?lookup(scope,item):expression(item,scope);return out;}
 function pattern(value,scope){if(value.kind==='binding'){const name=fresh();scope.set(value.name,name);return {...value,name};}if(value.kind==='constructor')return {...value,arguments:value.arguments.map(item=>pattern(item,scope))};return structuredClone(value);}
 function block(body,parent){const scope=new Map(parent);return body.map(node=>{
  switch(node.kind){
   case 'let':case 'using':{const value=expression(node.value,scope),name=fresh();scope.set(node.name,name);return {...node,name,value};}
   case 'if':return {...node,condition:expression(node.condition,scope),then:block(node.then,scope),otherwise:block(node.otherwise,scope)};
   case 'while':return {...node,condition:expression(node.condition,scope),body:block(node.body,scope)};
   case 'for':case 'forAwait':{const iterable=expression(node.iterable,scope),binding=fresh(),inner=new Map(scope);inner.set(node.binding,binding);return {...node,binding,iterable,body:block(node.body,inner)};}
   case 'block':return {...node,body:block(node.body,scope)};
   case 'try':{let handler=null;if(node.handler){const inner=new Map(scope),binding=fresh();inner.set(node.handler.binding,binding);handler={...node.handler,binding,body:block(node.handler.body,inner)};}return {...node,body:block(node.body,scope),handler,finalizer:node.finalizer===null?null:block(node.finalizer,scope)};}
   case 'match':return {...node,value:expression(node.value,scope),arms:node.arms.map(arm=>{const inner=new Map(scope),head=pattern(arm.pattern,inner);return {...arm,pattern:head,body:block(arm.body,inner)};})};
   case 'return':case 'throw':case 'expression':case 'break':case 'continue':return expression(node,scope);
   default:fail('UNSUPPORTED_PROFILE','Cannot compare control statement '+node.kind);
  }
 });}
 function ordered(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(ordered);return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,ordered(item)]));}
 const body=block(fn.body,new Map(fn.inputs.map((port,index)=>[port.name,'$parameter'+index])));return formatFiniteJSON(ordered({...fn,body}));
}

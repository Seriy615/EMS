import {fail} from '../reference/errors.mjs';
import {assertValueType} from '../reference/types.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {handlerSourceGraph,replaceHandlerGraphNode} from './control-graph.mjs';
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_GRAPH_EDIT','Invalid graph operation fields');}
function syntax(text,expression=false){
 if(typeof text!=='string'||!text.trim()||text.length>262144)fail('SOURCE_LIMIT','Invalid bounded graph fragment');
 const module=parseEMSModule(`fn graphEdit()->Number {${expression?'return (':''}${text}${expression?');':''}}`,{maxTokens:20000,maxDepth:128});
 if(module.declarations.length!==1||module.declarations[0].body.statements.length!==1)fail('INVALID_GRAPH_EDIT','Expected exactly one expression or statement');
 return module.declarations[0].body.statements[0];
}
/** Structured edits on checked source nodes. Semantic validity/ownership remains the original frontend/IR. */
export function editHandlerGraphNode(editor,event,expectedSource,id,operation){
 const graph=handlerSourceGraph(editor,event);if(graph.source!==expectedSource)fail('STALE_GRAPH','Handler changed since graph selection');
 const projected=graph.nodes.find(node=>node.id===id);if(!projected?.editable)fail('UNKNOWN_GRAPH_NODE','No editable graph node');
 const ast=parseEMSModule(graph.source,{maxTokens:20000,maxDepth:128});let node=ast;
 for(const key of id.split('/')){if(!Object.hasOwn(node,key))fail('UNKNOWN_GRAPH_NODE','Invalid graph path');node=node[key];}
 const text=value=>graph.source.slice(value.location.start.offset,value.location.end.offset);
 let replacement;
 switch(operation?.kind){
  case 'literal':{
   fields(operation,['kind','value']);if(node.kind!=='LiteralExpression')fail('INVALID_GRAPH_EDIT','Select a literal node');
   assertValueType(operation.value,projected.type,'graph.literal');replacement=typeof operation.value==='number'&&Object.is(operation.value,-0)?'-0':JSON.stringify(operation.value);break;
  }
  case 'operator':{
   fields(operation,['kind','operator']);const binary=node.kind==='BinaryExpression',unary=node.kind==='UnaryExpression';
   const allowed=binary?['+','-','*','/','%','<','>','<=','>=','==','!=','&&','||']:unary?['+','-','!']:[];
   if(!allowed.includes(operation.operator))fail('INVALID_GRAPH_EDIT','Unsupported operator for selected node');
   replacement=binary?`(${text(node.left)} ${operation.operator} ${text(node.right)})`:`(${operation.operator}(${text(node.value)}))`;break;
  }
  case 'call':{
   fields(operation,['kind','target','arguments']);if(node.kind!=='CallExpression'||typeof operation.target!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(operation.target)||!Array.isArray(operation.arguments)||Object.keys(operation.arguments).length!==operation.arguments.length||operation.arguments.length>100)fail('INVALID_GRAPH_EDIT','Expected a call target and dense arguments');
   for(const argument of operation.arguments)syntax(argument,true);
   replacement=`${operation.target}(${operation.arguments.map(argument=>`(${argument})`).join(',')})`;break;
  }
  case 'insert':{
   fields(operation,['kind','index','statement']);if(node.kind!=='Block'||!Number.isSafeInteger(operation.index)||operation.index<0||operation.index>node.statements.length)fail('INVALID_GRAPH_EDIT','Select a block and valid statement position');
   syntax(operation.statement);const offset=node.statements[operation.index]?.location.start.offset??node.location.end.offset-1;
   editor.applyHandler(event,graph.source.slice(0,offset)+'\n'+operation.statement+'\n'+graph.source.slice(offset),graph.entry);return;
  }
  case 'delete':{
   fields(operation,['kind']);if(!/\/statements\/\d+$/.test(id))fail('INVALID_GRAPH_EDIT','Only statements can be deleted');
   editor.applyHandler(event,graph.source.slice(0,node.location.start.offset)+graph.source.slice(node.location.end.offset),graph.entry);return;
  }
  default:fail('INVALID_GRAPH_EDIT','Unknown graph operation');
 }
 replaceHandlerGraphNode(editor,event,expectedSource,id,replacement);
}

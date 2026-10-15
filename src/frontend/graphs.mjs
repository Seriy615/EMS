import {parseEMSModule,uiSymbolSource} from './index.mjs';
import {FLOW_KERNEL,validateContractFlow} from '../contracts/flow.mjs';
import {emitFlowSource} from '../contracts/flow-source.mjs';
import {fail} from '../reference/errors.mjs';
const path=id=>id.split('.').map(uiSymbolSource).join('::');
const error=(code,message,node)=>fail(code,message,{location:node?.location});
/** Graph constants are data syntax. No evaluator, registry call or initializer runs here. */
export function graphConstant(node,depth=0){
 if(depth>64)error('FLOW_LIMIT','Graph literal depth exceeds64',node);
 if(node.kind==='LiteralExpression')return structuredClone(node.value);
 if(node.kind==='GroupExpression')return graphConstant(node.value,depth+1);
 if(node.kind==='UnaryExpression'&&['-','+'].includes(node.operator)){const value=graphConstant(node.value,depth+1);if(typeof value!=='number')error('TYPE_MISMATCH','Numeric sign requires a Number literal',node);return node.operator==='-'?-value:value;}
 if(node.kind==='ArrayExpression')return node.elements.map(item=>graphConstant(item,depth+1));
 if(node.kind==='CallExpression'&&node.callee.kind==='NameExpression'){
  const name=node.callee.name,args=node.arguments;
  if(name==='None'&&!args.length)return {tag:'None'};
  if(['Some','Ok','Err','Map'].includes(name)&&args.length===1)return {tag:name,value:graphConstant(args[0],depth+1)};
 }
 error('GRAPH_SOURCE_VALUE','Graph literals must be closed data; compute expressions in contract nodes',node);
}
/** Located source graph to the existing versioned semantic graph, without canvas metadata. */
export function readGraphDeclaration(declaration,canonical){
 const resolve=canonical;canonical=syntax=>{try{return resolve(syntax);}catch(e){e.details={...e.details,location:e.details?.location??syntax.location};throw e;}};
 const body=declaration.body,inputs=Object.create(null),locations=new Map(),names=new Set();
 for(const port of declaration.parameters){if(Object.hasOwn(inputs,port.name))error('DUPLICATE_SYMBOL','Duplicate graph input',port);inputs[port.name]={type:canonical(port.type)};}
 const nodes=body.nodes.map(node=>{
  if(names.has(node.name))error('INVALID_FLOW','Duplicate graph node',node);names.add(node.name);locations.set(node.name,node.location);
  const args=Object.create(null);for(const input of node.inputs){if(Object.hasOwn(args,input.name))error('DUPLICATE_SYMBOL','Duplicate graph node input',input);args[input.name]=input.reactive?input.value.kind==='GraphInputReference'?{input:input.value.name}:{node:input.value.name}:{literal:graphConstant(input.value)};}
  const result={id:node.name,uses:node.contract,version:node.version,args:Object.fromEntries(Object.entries(args))};
  if(node.contract==='std.storage.Variable'){
   if(!node.valueType||node.initial===null&&node.storage===null)error('GRAPH_SOURCE_STORAGE','Variable requires a type and an initial value or owner',node);
   Object.assign(result,{valueType:canonical(node.valueType)},node.storage===null?{initial:graphConstant(node.initial)}:{storage:node.storage});
  }else if(node.valueType||node.initial||node.storage!==null)error('GRAPH_SOURCE_STORAGE','Only a variable declares storage',node);
  return result;
 });
 for(const node of body.nodes)for(const binding of node.inputs)if(binding.reactive){if(binding.value.kind==='GraphNodeReference'&&!names.has(binding.value.name))error('INVALID_FLOW_PORT','Unknown graph node reference',binding.value);if(binding.value.kind==='GraphInputReference'&&!Object.hasOwn(inputs,binding.value.name))error('UNKNOWN_INPUT','Unknown graph input reference',binding.value);}
 return {graph:{schemaVersion:body.profile,id:declaration.name,version:'1.0.0',inputs:Object.fromEntries(Object.entries(inputs)),output:{type:canonical(declaration.output)},nodes,connections:body.connections.map(edge=>({from:{node:edge.from,port:edge.port},to:{node:edge.to,port:edge.targetPort}})),entry:body.entry},locations};
}
/** Expand graph bodies before the common expression/effect checker. Calls remain real AST calls. */
export function normalizeGraphBodies(ast,registry,{signatures,canonical,canonicalTerm,resolve,maxGraphs=33,maxNodes=1024}){
 const declarations=ast.declarations.filter(item=>item.body?.kind==='ContractGraph'),graphs=new Map();if(!declarations.length)return graphs;
 if(!Number.isSafeInteger(maxGraphs)||maxGraphs<1||maxGraphs>1024||!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>32768)fail('FLOW_LIMIT','Invalid bounded graph source limits');
 if(declarations.length>maxGraphs||declarations.reduce((n,item)=>n+item.body.nodes.length,0)>maxNodes)error('FLOW_LIMIT','Graph source module exceeds configured graph or node limit',ast);
 const sourceSignatures=new Map();
 for(const target of signatures.values())if(!target.parameters.length&&!target.async&&!target.declaration.external){try{sourceSignatures.set(target.name,{inputs:Object.fromEntries(target.inputs.map(port=>[port.name,canonicalTerm(port.type)])),output:canonicalTerm(target.output)});}catch{ /* Non-finite helpers are rejected if a graph actually calls them. */ }}
 for(const declaration of declarations){
  if(Object.hasOwn(FLOW_KERNEL,declaration.name))error('DUPLICATE_CONTRACT','Graph declaration shadows a kernel contract',declaration);
  const {graph,locations}=readGraphDeclaration(declaration,canonical);
  for(const node of graph.nodes)if(!Object.hasOwn(FLOW_KERNEL,node.uses)&&!signatures.has(node.uses)){try{node.uses=resolve(node.uses,{location:locations.get(node.id)}).name;}catch(e){e.details={...e.details,graph:graph.id,node:node.id};throw e;}}
  for(const node of graph.nodes)if(signatures.has(node.uses)&&!sourceSignatures.has(node.uses))error('GRAPH_SOURCE_PROFILE','Graph calls require concrete synchronous finite signatures',{location:locations.get(node.id)});
  let checked;try{checked=validateContractFlow(graph,registry,{allowState:true,sourceSignatures});}catch(e){e.details={...e.details,location:e.details?.location??locations.get(e.details?.node)??declaration.location,graph:graph.id};throw e;}
  const emitted=emitFlowSource(graph,checked,{preserveInputOrder:true,symbol:uiSymbolSource}),parsed=parseEMSModule(emitted.source).declarations[0];
  const lines=Object.entries(emitted.activations).map(([id,line])=>({line,location:locations.get(id)})).sort((a,b)=>a.line-b.line);
  function relocate(node){if(!node||typeof node!=='object')return;if(node.location){const line=node.location.start.line;node.location=lines.findLast(item=>item.line<=line)?.location??declaration.location;}for(const [key,value]of Object.entries(node))if(key!=='location'){if(Array.isArray(value))value.forEach(relocate);else relocate(value);}}
  relocate(parsed.body);declaration.body=parsed.body;graphs.set(graph.id,graph);
 }
 return graphs;
}
/** Canonical graph syntax retains node IDs, all edges, versions, shared cells and inactive nodes. */
export function printGraphDeclaration(graph,{requirements=[]}={}){
 const literal=value=>{if(typeof value==='number')return Object.is(value,-0)?'#-0':JSON.stringify(value);if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(literal).join(', ')+']';if(value?.tag==='None')return 'None()';if(['Some','Ok','Err','Map'].includes(value?.tag))return value.tag+'('+literal(value.value)+')';fail('GRAPH_SOURCE_VALUE','Unsupported graph data');};
 const symbol=uiSymbolSource,type=name=>name==='NumberArray'?'Number[]':name;
 const lines=['@'+path(graph.id)+'('+Object.entries(graph.inputs).map(([name,spec])=>symbol(name)+': '+type(spec.type)).join(', ')+') -> '+type(graph.output.type)+(requirements.length?' requires '+requirements.map(item=>item.name+'('+JSON.stringify(item.value)+')').join(', '):'')+' graph '+JSON.stringify(graph.schemaVersion)+' {'];
 for(const node of graph.nodes){let storage='';if(node.uses==='std.storage.Variable')storage=': '+type(node.valueType)+' = '+(Object.hasOwn(node,'storage')?'#'+symbol(node.storage):literal(node.initial));lines.push('  @'+path(node.uses)+'['+JSON.stringify(node.version)+'] #'+symbol(node.id)+storage+' {');for(const [name,ref]of Object.entries(node.args))lines.push('    '+symbol(name)+(Object.hasOwn(ref,'literal')?': '+literal(ref.literal):' <= '+(Object.hasOwn(ref,'input')?'input::'+symbol(ref.input):'#'+symbol(ref.node)))+';');lines.push('  }');}
 if(graph.entry!==null)lines.push('  + #'+symbol(graph.entry)+';');
 for(const edge of graph.connections)lines.push('  #'+symbol(edge.from.node)+'.'+symbol(edge.from.port)+' ~> #'+symbol(edge.to.node)+'.'+symbol(edge.to.port)+';');
 lines.push('}');return lines.join('\n');
}

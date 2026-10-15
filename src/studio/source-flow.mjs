import {typedArrayContractId} from '../stdlib/typed-array-contracts.mjs';
import {controlArrayElementType} from '../semantics/control-algebraic.mjs';
import {recursiveFlowCalls,RECURSIVE_FLOW_CALL_PROFILE} from '../contracts/flow-library.mjs';
import {validateControlIR,decodeControlLiteral} from '../ir/control.mjs';
import {newFlowProject,serializeFlowProject} from './flow-project.mjs';
import {defaultFlowValue} from '../contracts/flow-values.mjs';
import {SHARED_STORAGE_FLOW_VERSION} from '../contracts/flow.mjs';
import {fail} from '../reference/errors.mjs';

/** Project checked finite source into ordinary contracts. Never mutate the original source. */
export function sourceContractFlow(ir,registry,{id='source',name=ir.entry,allowState=false}={}){
 validateControlIR(ir,registry);
 if(!['ems-control-finite/1','ems-control-algebraic/1'].includes(ir.profile))fail('SOURCE_FLOW_UNSUPPORTED','Этот исходник пока нельзя открыть обычным графом; исходный текст сохранён.');
 const functions=new Map(ir.functions.map(fn=>[fn.id,fn]));
 function projectFunction(fn){
 if(fn.requirements.effects.length||fn.requirements.capabilities.length)fail('SOURCE_FLOW_UNSUPPORTED','Явная политика исходного контракта требует сохранения в текстовом представлении.');
 const project=newFlowProject(id,name),graph=project.graph;
 graph.id=fn.id;graph.output={...fn.output};graph.inputs=Object.fromEntries(fn.inputs.map(p=>[p.name,{type:p.type}]));project.inputs=Object.fromEntries(fn.inputs.map(p=>[p.name,defaultFlowValue(p.type)]));graph.nodes=[];graph.connections=[];project.canvas.positions={};
 let sequence=0;
 const unsupported=kind=>fail('SOURCE_FLOW_UNSUPPORTED','Операция '+kind+' пока не поддерживает преобразование в обычный граф. Исходник сохранён.');
 function node(uses,args={},extra={},hint='n'){
  if(graph.nodes.length>=256)fail('FLOW_LIMIT','Слишком большой граф обработчика');
  const item={id:hint+'_'+(++sequence),uses,version:uses.startsWith('std.control.')||uses==='std.storage.Variable'||uses==='std.program.Result'?'1.0.0':functions.has(uses)?'1.0.0':registry.resolve(uses).version,args,...extra};graph.nodes.push(item);return item;
 }
 const edge=(item,port,target)=>{if(target)graph.connections.push({from:{node:item.id,port},to:{node:target,port:'enter'}});};
 function call(uses,args,next){const item=node(uses,args);edge(item,'next',next({node:item.id}));return item.id;}
 function snapshot(ref,type,next){if(!type.includes('<'))return call('std.value.'+type,{value:ref},next);const cell=node('std.storage.Variable',{value:ref},{valueType:type,initial:defaultFlowValue(type)},'snapshot');edge(cell,'next',next({node:cell.id}));return cell.id;}
 function value(expr,scope,next){
  switch(expr.kind){
   case 'literal':return next({literal:decodeControlLiteral(expr.value,expr.type)});
   case 'array':{
    if(expr.elements.every(item=>item.kind==='literal'))return next({literal:expr.elements.map(item=>decodeControlLiteral(item.value,item.type))});
    const append=(index,values)=>index===expr.elements.length?next(values):value(expr.elements[index],scope,ref=>call(expr.type==='NumberArray'?'std.array.append':typedArrayContractId('append',controlArrayElementType(expr.type)),{values,value:ref},result=>append(index+1,result)));return append(0,{literal:[]});
   }
   case 'local':{const local=scope.get(expr.name);if(!local)unsupported('local '+expr.name);return local.mutable?snapshot(local.ref,expr.type,next):next(local.ref);}
   case 'assign':{
    const local=scope.get(expr.name);if(!local?.mutable)unsupported('immutable assignment');
    return value(expr.value,scope,ref=>{const write=node('std.storage.Variable',{value:ref},{valueType:expr.type,storage:local.ref.node},expr.name+'_write');edge(write,'next',snapshot({node:write.id},expr.type,next));return write.id;});
   }
   case 'call':{
    const target=expr.target.kind==='function'?functions.get(expr.target.id):null;
    if(expr.target.kind!=='contract'&&!target)unsupported('неизвестный исходный контракт');
    const contract=target?{id:target.id,version:'1.0.0',inputs:Object.fromEntries(target.inputs.map(port=>[port.name,port.type]))}:registry.resolve(expr.target.id);if(!target&&contract.version!==expr.target.version)fail('CONTRACT_VERSION','Source contract version differs');
    const ports=Object.keys(contract.inputs),refs=[];
    const argument=index=>index===expr.arguments.length?call(contract.id,Object.fromEntries(ports.map((port,i)=>[port,refs[i]])),next):value(expr.arguments[index],scope,ref=>{refs[index]=ref;return argument(index+1);});return argument(0);
   }
   case 'unary':return value(expr.value,scope,ref=>expr.operator==='+'?next(ref):call(expr.operator==='!'?'std.logic.not':'core.mul',expr.operator==='!'?{value:ref}:{a:ref,b:{literal:-1}},next));
   case 'binary':{
    if(['&&','||'].includes(expr.operator)){
     graph.schemaVersion=SHARED_STORAGE_FLOW_VERSION;
     return value(expr.left,scope,ref=>{const cell=node('std.storage.Variable',{value:ref},{valueType:'Boolean',initial:false},'logic'),fork=node('std.control.If',{condition:{node:cell.id}}),join=snapshot({node:cell.id},'Boolean',next),right=value(expr.right,scope,ref=>{const write=node('std.storage.Variable',{value:ref},{valueType:'Boolean',storage:cell.id},'logic_write');edge(write,'next',join);return write.id;});edge(cell,'next',fork.id);edge(fork,'yes',expr.operator==='&&'?right:join);edge(fork,'no',expr.operator==='&&'?join:right);return cell.id;});
    }
    const operators={'+':'core.add','-':'core.sub','*':'core.mul','/':'core.div','<':'std.number.less','<=':'std.number.lessEqual','>':'std.number.greater','>=':'std.number.greaterEqual','==':'std.number.equal','!=':'std.number.notEqual'},uses=operators[expr.operator];
    if(!uses||['==','!='].includes(expr.operator)&&expr.left.type!=='Number')unsupported(expr.operator);
    return value(expr.left,scope,a=>value(expr.right,scope,b=>call(uses,{a,b},next)));
   }
   default:unsupported(expr.kind);
  }
 }
 function block(statements,scope,after,loop=null){
  if(!statements.length)return after;
  const [statement,...rest]=statements,next=()=>block(rest,new Map(scope),after,loop);
  switch(statement.kind){
   case 'return':return value(statement.value,scope,ref=>node('std.program.Result',{value:ref}).id);
   case 'expression':return value(statement.value,scope,()=>next());
   case 'let':{
    if(statement.mutable){graph.schemaVersion=SHARED_STORAGE_FLOW_VERSION;return value(statement.value,scope,ref=>{const cell=node('std.storage.Variable',{value:ref},{valueType:statement.type,initial:defaultFlowValue(statement.type)},statement.name);scope.set(statement.name,{ref:{node:cell.id},mutable:true});edge(cell,'next',next());return cell.id;});}
    return value(statement.value,scope,ref=>{scope.set(statement.name,{ref,mutable:false});return next();});
   }
   case 'block':return block(statement.body,new Map(scope),next(),loop);
   case 'if':{const join=next();return value(statement.condition,scope,ref=>{const fork=node('std.control.If',{condition:ref});edge(fork,'yes',block(statement.then,new Map(scope),join,loop));edge(fork,'no',block(statement.otherwise,new Map(scope),join,loop));return fork.id;});}
   case 'while':{const begin=node('std.control.IterationBegin'),end=node('std.control.IterationEnd'),afterLoop=next();edge(end,'repeat',begin.id);edge(begin,'next',value(statement.condition,scope,ref=>{const fork=node('std.control.If',{condition:ref});edge(fork,'yes',block(statement.body,new Map(scope),end.id,{end:end.id,after:afterLoop}));edge(fork,'no',afterLoop);return fork.id;}));return begin.id;}
   case 'for':{
    graph.schemaVersion=SHARED_STORAGE_FLOW_VERSION;const afterLoop=next();
    return value(statement.iterable,scope,ref=>snapshot(ref,statement.iterable.type,values=>call(statement.iterable.type==='NumberArray'?'std.array.length':typedArrayContractId('length',controlArrayElementType(statement.iterable.type)),{values},length=>{
     const index=node('std.storage.Variable',{value:{literal:0}},{valueType:'Number',initial:0},'index'),begin=node('std.control.IterationBegin'),end=node('std.control.IterationEnd');edge(end,'repeat',begin.id);
     const increment=call('core.add',{a:{node:index.id},b:{literal:1}},ref=>{const write=node('std.storage.Variable',{value:ref},{valueType:'Number',storage:index.id},'index_write');edge(write,'next',end.id);return write.id;});
     const body=call(statement.iterable.type==='NumberArray'?'std.array.at':typedArrayContractId('at',controlArrayElementType(statement.iterable.type)),{values,index:{node:index.id}},item=>{const bindings=new Map(scope);bindings.set(statement.binding,{ref:item,mutable:false});return block(statement.body,bindings,increment,{end:increment,after:afterLoop});});
     edge(begin,'next',call('std.number.less',{a:{node:index.id},b:length},condition=>{const fork=node('std.control.If',{condition});edge(fork,'yes',body);edge(fork,'no',afterLoop);return fork.id;}));edge(index,'next',begin.id);return index.id;
    })));
   }
   case 'break':return loop.after;
   case 'continue':return loop.end;
   default:unsupported(statement.kind);
  }
 }
 graph.entry=block(fn.body,new Map(fn.inputs.map(p=>[p.name,{ref:{input:p.name},mutable:false}])),null);
 // Initial projection only; subsequent edits preserve the owner's positions exactly.
 const seen=new Set();let lastLane=0;function layout(id,column=0,lane=0){if(!id||seen.has(id))return;seen.add(id);project.canvas.positions[id]={x:40+column*340,y:40+lane*520};const outputs=graph.connections.filter(edge=>edge.from.node===id);outputs.forEach((edge,index)=>layout(edge.to.node,column+1,index?++lastLane:lane));}layout(graph.entry);
 for(const [index,p]of fn.inputs.entries())project.canvas.positions['input:'+p.name]={x:-300,y:40+index*180};
 return project;
 }
 const project=projectFunction(functions.get(ir.entry)),definitions=ir.functions.filter(fn=>fn.id!==ir.entry).map(projectFunction);
 if(definitions.length){project.schemaVersion='ems-flow-project/2';project.contracts=definitions.map(({graph,inputs,canvas})=>({graph,inputs,canvas}));}
 if(recursiveFlowCalls([project.graph,...definitions.map(item=>item.graph)])||definitions.some(item=>item.graph.nodes.some(node=>node.uses===project.graph.id))){project.schemaVersion='ems-flow-project/3';project.callProfile=RECURSIVE_FLOW_CALL_PROFILE;project.contracts??=[];}
 return serializeFlowProject(project,registry,{allowState});
}

import { fail } from '../reference/errors.mjs';
import { parseControlType, controlTypeName, controlVariants, assertControlValueType } from '../semantics/control-algebraic.mjs';

/** Runtime predicates have no eval, host calls or free-text assertions. */
export function checkContractConditions(conditions,params,result,phase,id) {
  for(let index=0;index<conditions.length;index++){
    const condition=conditions[index],value=Object.hasOwn(condition.subject,'input')?params[condition.subject.input]:result;
    const accepted=condition.kind==='nonzero'?value!==0:condition.kind==='positive'?value>0:Array.isArray(value)&&value.length>0;
    if(!accepted)fail(phase==='pre'?'PRECONDITION_FAILED':'POSTCONDITION_FAILED','Contract condition failed',{contract:id,condition:index});
  }
}
export function checkContractFailure(error,errors,id) {
  if(error?.name==='EmsError'&&['CANCELLED','STEP_LIMIT','CALL_DEPTH','EVALUATION_DEPTH','FUTURE_LIMIT','STREAM_LIMIT','STREAM_PENDING_LIMIT','RESOURCE_LIMIT','PRECONDITION_FAILED','POSTCONDITION_FAILED','TYPE_MISMATCH','RECURSIVE_COMPOSITE','CONTRACT_ERROR_TYPE','UNDECLARED_CONTRACT_ERROR'].includes(error.code))throw error;
  const declared=errors.find(item=>item.code===error?.code);
  if(!declared)fail('UNDECLARED_CONTRACT_ERROR','Implementation threw an undeclared error',{contract:id});
  if(declared.payloadType!==null){if(error.emsThrow!=='ems-user-throw/1'||error.valueType!==declared.payloadType)fail('CONTRACT_ERROR_TYPE','Incorrect declared error payload',{contract:id});assertControlValueType(error.value,declared.payloadType,'contract error');}
  throw error;
}

/** Resolve a selected composite interface; direct graph/IR execution must not bypass its boundary. */
export function resolveCompositeBoundary(graph,registry) {
  if(graph.schemaVersion!=='ems-contract-graph/1'){
    const selected=registry.items.get(graph.id);
    if(Object.hasOwn(graph,'interfaceRef')||selected?.kind==='composite'&&selected.interfaceBoundary)fail('MISSING_INTERFACE_REF','Composite boundary requires explicit contract graph format');
    return null;
  }
  const ref=graph.interfaceRef;
  if(!ref||typeof ref!=='object'||Object.keys(ref).length!==2||typeof ref.id!=='string'||typeof ref.version!=='string')fail('INVALID_GRAPH','Missing or invalid composite interface reference');
  if(ref.id!==graph.id||ref.version!==graph.version)fail('CONTRACT_VERSION','Composite graph identity disagrees with interface reference');
  const item=registry.resolve(ref.id);
  if(item.kind!=='composite'||!item.interfaceBoundary)fail('MISSING_INTERFACE','Selected contract has no composite interface boundary');
  const contract=item.interfaceBoundary.interface;
  if(graph.version!==contract.version)fail('CONTRACT_VERSION','Composite interface graph version mismatch');
  const inputs=Object.entries(graph.inputs).map(([name,spec])=>({name,type:spec.type}));
  if(inputs.length!==contract.inputs.length||inputs.some((input,index)=>input.name!==contract.inputs[index].name||input.type!==contract.inputs[index].type)||graph.output.type!==contract.output.type)
    fail('INCOMPATIBLE_BINDING','Composite interface graph signature mismatch');
  return contract;
}

/** Shared independent JS boundary for atomic expressions and inspectable composite bodies. */
export function emitContractBoundary(contract,args,render) {
  const keys=contract.inputs.map(input=>input.name);
  const params=Object.fromEntries(keys.map((name,index)=>[name,`__a${index}`]));
  const body=render(params),quote=JSON.stringify;
  const validators=[parseControlType,controlTypeName,controlVariants,assertControlValueType].map(fn=>fn.toString()).join('\n');
  return `((...__args)=>{const fail=__fail,assertPrimitiveValueType=__assertType;${validators}
${checkContractConditions.toString()}
${checkContractFailure.toString()}
const __params=Object.fromEntries(${quote(keys)}.map((key,index)=>[key,__args[index]]));
${contract.inputs.map(input=>`const ${params[input.name]}=__params[${quote(input.name)}];__assertType(${params[input.name]},${quote(input.type)},'contract input');`).join('')}
checkContractConditions(${quote(contract.conditions.pre)},__params,undefined,'pre',${quote(contract.id)});
try{${body.statements.join('\n')}
const __result=${body.result};__assertType(__result,${quote(contract.output.type)},'contract output');
checkContractConditions(${quote(contract.conditions.post)},__params,__result,'post',${quote(contract.id)});return __result;
}catch(error){checkContractFailure(error,${quote(contract.errors)},${quote(contract.id)});}})(${keys.map(name=>args[name]).join(',')})`;
}

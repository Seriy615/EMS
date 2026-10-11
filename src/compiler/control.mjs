import { parseControlType, controlTypeName, controlVariants, assertControlValueType, cloneControlValue, matchControlPattern, validateControlInputs } from '../semantics/control-algebraic.mjs';
import { createResourceScope,resourceBudgetOptions,executeResourceOperation,resourceCleanupOutcome } from '../runtime/resources.mjs';
import { createStreamScope, executeStreamOperation, streamBudgetOptions } from '../runtime/streams.mjs';
import { createFutureScope } from '../runtime/futures.mjs';
import { fail } from '../reference/errors.mjs';
import { compileStandaloneJS, standaloneHelpersJS } from '../reference/compiler.mjs';
import { validateControlIR, decodeControlLiteral, CONTROL_FUTURE_PROFILE, CONTROL_STREAM_PROFILE,CONTROL_RESOURCE_PROFILE } from '../ir/control.mjs';
import { equalControlValues, binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions } from '../semantics/control-values.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from '../runtime/cancellation.mjs';
import { makeControlThrow, matchesControlCatch, controlCatchValue, terminalControlError } from '../semantics/control-errors.mjs';

/** Generate independent pure JavaScript from checked semantic control blocks. No AST or EMS imports in output. */
export function compileControlJS(ir, registry) {
  const checked = validateControlIR(ir, registry), resources=ir.profile===CONTROL_RESOURCE_PROFILE,streams = ir.profile === CONTROL_STREAM_PROFILE || resources, futures = ir.profile === CONTROL_FUTURE_PROFILE || streams;
  for (const fn of checked.functions.values()) if (fn.policy.effects.length || fn.policy.capabilities.length)
    fail('UNSUPPORTED_TARGET', 'Control standalone target requires pure bindings');
  const functionNames = new Map([...checked.functions.keys()].map((id, index) => [id, `__fn${index}`]));
  const hosts = new Map(), wrappers = []; let nextLocal = 0;
  const quote = JSON.stringify;
  const literal = value => typeof value === 'number' && Object.is(value, -0) ? '-0' : Array.isArray(value) ? `[${value.map(literal).join(',')}]` : quote(value);
  function host(id) {
    if (hosts.has(id)) return hosts.get(id);
    const contract = registry.resolve(id);if(contract.kind==='resource')fail('UNSUPPORTED_TARGET','Native resource binding has no standalone backend');
    const wrapper = `__host${hosts.size}`;
    const graph = { schemaVersion: '0.1', id: `control:compiled:${id}`, version: contract.version,
      inputs: Object.fromEntries(Object.entries(contract.inputs).map(([name, type]) => [name, { type: typeof type === 'string' ? type : type.type }])),
      output: { type: contract.output }, nodes: [{ id: 'call', uses: id, args: Object.fromEntries(Object.keys(contract.inputs).map(name => [name, { input: name }])) }], returns: { node: 'call' } };
    const module = compileStandaloneJS(graph, registry).replace('export function execute(inputs)', 'function execute(inputs)');
    wrappers.push(`const ${wrapper}=(()=>{\n${module}\nreturn execute;})();`); hosts.set(id, wrapper); return wrapper;
  }
  function expression(node, scope) {
    let result;
    switch (node.kind) {
      case 'literal': result = literal(decodeControlLiteral(node.value, node.type)); break;
      case 'local': result = scope.get(node.name); break;
      case 'array': result = `[${node.elements.map(node => expression(node, scope)).join(',')}]`; break;
      case 'index': result = `indexControlValue(${expression(node.value, scope)},${expression(node.index, scope)})`; break;
      case 'assign': result = `(${scope.get(node.name)}=${expression(node.value, scope)})`; break;
      case 'unary': result = `unaryControlValue(${quote(node.operator)},${expression(node.value, scope)})`; break;
      case 'binary': result = ['&&', '||'].includes(node.operator) ? `(${expression(node.left, scope)} ${node.operator} ${expression(node.right, scope)})`
        : `binaryControlValue(${quote(node.operator)},${expression(node.left, scope)},${expression(node.right, scope)})`; break;
      case 'construct': result = node.arguments.length ? `({tag:${quote(node.tag)},value:${expression(node.arguments[0],scope)}})` : `({tag:${quote(node.tag)}})`; break;
      case 'resource':result=`(await executeResourceOperation(${quote(node.operation)},${quote(node.type)},[${node.arguments.map(argument=>expression(argument,scope)).join(',')}],__resources))`;break;
      case 'stream': result = `executeStreamOperation(${quote(node.operation)},${quote(node.type)},[${node.arguments.map(argument=>expression(argument,scope)).join(',')}],__streams,__futures)`;break;
      case 'await': result = `__futures.wait(${expression(node.value,scope)},${quote(node.type)})`; if (futures) result = `(await ${result})`; break;
      case 'call': {
        const args = node.arguments.map(node => expression(node, scope)).join(',');
        if (node.target.kind === 'function') {
          const target = checked.functions.get(node.target.id), name = functionNames.get(target.id);
          result = futures ? target.async ? `__futureCall(${quote(target.output.type)},${name},__frame,[${args}])` : `(await ${name}(__frame${args ? ','+args : ''}))`
            : `${name}(${args})`;
        }
        else { const contract = registry.resolve(node.target.id); const params = `__params(${quote(Object.keys(contract.inputs))},[${args}])`; result = node.target.async ? `__futureHost(${quote(contract.output)},${host(contract.id)},${params})` : `${host(contract.id)}(${params})`; } break;
      }
    }
    return futures ? `(await __value(${quote(node.type)},async()=>${result},__frame))` : `__value(${quote(node.type)},()=>${result})`;
  }
  function block(body, parent, parents=[]) {
    const scope = new Map(parent), lines = [],owned=`__owned${nextLocal++}`,owner=`__owner${nextLocal++}`,scopes=resources?[...parents,owned]:parents;
    for (const statement of body) {
      lines.push('__tick();');
      switch (statement.kind) {
        case 'using':{const local=`__local${nextLocal++}`,value=expression(statement.value,scope);scope.set(statement.name,local);lines.push(`const ${local}=__resources.claim(${value},${owner});${owned}.push(${local});`);break;}
        case 'let': { const local = `__local${nextLocal++}`, value = expression(statement.value, scope); scope.set(statement.name, local);
          lines.push(`${statement.mutable ? 'let' : 'const'} ${local}=${value};`); break; }
        case 'expression': lines.push(`${expression(statement.value, scope)};`); break;
        case 'return': if(resources){const local=`__return${nextLocal++}`;lines.push(`const ${local}=${expression(statement.value,scope)};__resources.escaping(${local},[${scopes.join(',')}].flat());return ${local};`);}else lines.push(`return ${expression(statement.value,scope)};`);break;
        case 'throw': lines.push(`throw makeControlThrow(${expression(statement.value, scope)},${quote(statement.value.type)});`); break;
        case 'try': {
          let attempted = block(statement.body, scope,scopes);
          if (statement.handler !== null) {
            const caught = `__catch${nextLocal++}`, local = `__local${nextLocal++}`, nested = new Map(scope);
            nested.set(statement.handler.binding, local);
            attempted = `try{${attempted}}catch(${caught}){if(!matchesControlCatch(${caught},${quote(statement.handler.type)}))throw ${caught};const ${local}=controlCatchValue(${caught},${quote(statement.handler.type)});${block(statement.handler.body, nested,scopes)}}`;
          }
          if (statement.finalizer !== null) {
            const saved = `__saved${nextLocal++}`, has = `__pending${nextLocal++}`, caught = `__caught${nextLocal++}`;
            lines.push(`{let ${saved},${has}=false;try{${attempted}}catch(${caught}){${saved}=${caught};${has}=true;throw ${caught};}finally{try{${block(statement.finalizer, scope,scopes)}}finally{if(${has}&&terminalControlError(${saved}))throw ${saved};}}}`);
          } else lines.push(attempted);
          break;
        }
        case 'match': {
          const value = `__match${nextLocal++}`, matched = `__matched${nextLocal++}`;
          lines.push(`{const ${value}=${expression(statement.value, scope)};let ${matched}=false;`);
          for (const arm of statement.arms) {
            const bindings = `__bindings${nextLocal++}`, nested = new Map(scope), declarations = [];
            function collect(pattern) {
              if (pattern.kind === 'binding') { const local = `__local${nextLocal++}`; nested.set(pattern.name, local); declarations.push(`const ${local}=${bindings}.get(${quote(pattern.name)});`); }
              if (pattern.kind === 'constructor') pattern.arguments.forEach(collect);
            }
            collect(arm.pattern);
            lines.push(`if(!${matched}){const ${bindings}=matchControlPattern(${quote(arm.pattern)},${value},__tick);if(${bindings}!==null){${matched}=true;${declarations.join('')}${block(arm.body,nested,scopes)}}}`);
          }
          lines.push('}'); break;
        }
        case 'break': case 'continue': lines.push(`${statement.kind};`); break;
        case 'block': lines.push(`{${block(statement.body, scope,scopes)}}`); break;
        case 'if': lines.push(`if(${expression(statement.condition, scope)}){${block(statement.then, scope,scopes)}}else{${block(statement.otherwise, scope,scopes)}}`); break;
        case 'while': lines.push(`while(${expression(statement.condition, scope)}){${block(statement.body, scope,scopes)}}`); break;
        case 'forAwait': {
          const stream=`__stream${nextLocal++}`,item=`__item${nextLocal++}`,local=`__local${nextLocal++}`,nested=new Map(scope);nested.set(statement.binding,local);
          lines.push(`{const ${stream}=${expression(statement.iterable,scope)};while(true){__tick();const ${item}=await __streams.next(${stream});checkCancellation(options.signal);if(${item}.tag==='None')break;__tick();const ${local}=${item}.value;${block(statement.body,nested,scopes)}}}`);break;
        }
        case 'for': { const local = `__local${nextLocal++}`, nested = new Map(scope); nested.set(statement.binding, local);
          lines.push(`for(const ${local} of [...${expression(statement.iterable, scope)}]){__tick();${block(statement.body, nested,scopes)}}`); break; }
      }
    }
    if(resources){const pending=`__pending${nextLocal++}`,has=`__has${nextLocal++}`,caught=`__caught${nextLocal++}`;return `{const ${owned}=[],${owner}={};let ${pending},${has}=false;try{${lines.join('\n')}}catch(${caught}){${pending}=${caught};${has}=true;throw ${caught};}finally{const failures=await __resources.dispose(${owned},${pending},${has});resourceCleanupOutcome(${pending},${has},failures);}}`;}
    return lines.join('\n');
  }
  const definitions = [...checked.functions.values()].map(fn => {
    const parameters = fn.inputs.map(() => `__local${nextLocal++}`), scope = new Map(fn.inputs.map((input, index) => [input.name, parameters[index]]));
    if (futures) return `async function ${functionNames.get(fn.id)}(__parent${parameters.length ? ','+parameters.join(',') : ''}){__tick();const __frame={depth:__parent.depth+1,evaluationDepth:__parent.evaluationDepth};if(__frame.depth>__budget.maxDepth)fail('CALL_DEPTH','Control call depth exhausted',{maxDepth:__budget.maxDepth});${block(fn.body,scope)}}`;
    return `function ${functionNames.get(fn.id)}(${parameters.join(',')}){__tick();if(++__depth>__budget.maxDepth){__depth--;fail('CALL_DEPTH','Control call depth exhausted',{maxDepth:__budget.maxDepth});}try{${block(fn.body, scope)}}finally{__depth--;}}`;
  });
  const entry = checked.entry;
  const futureSetup = futures ? `${resources?'resourceBudgetOptions(options);':''}${streams ? 'streamBudgetOptions(options);' : ''}const __futures=createFutureScope(options,__validate);options={...options,signal:__futures.signal};
const __streams=${streams ? 'createStreamScope(options)' : 'null'};
const __resources=${resources?'createResourceScope(options)':'null'};
function __validate(value,type,context){assertControlValueType(value,type,context,__futures.check,__streams?.check,__resources?.check);}
function __futureCall(type,fn,parent,args){const frame={depth:parent.depth,evaluationDepth:0};return __futures.start(type,()=>fn(frame,...args));}
function __futureHost(type,fn,params){return __futures.start(type,()=>fn(params));}
async function __value(type,fn,frame){__tick();if(++frame.evaluationDepth>256){frame.evaluationDepth--;fail('EVALUATION_DEPTH','Control expression depth exhausted',{maxEvaluationDepth:256});}try{const value=await fn();checkCancellation(options.signal);__validate(value,type,'control expression');return value;}finally{frame.evaluationDepth--;}}` : `function __value(type,fn){__tick();if(++__evaluationDepth>256){__evaluationDepth--;fail('EVALUATION_DEPTH','Control expression depth exhausted',{maxEvaluationDepth:256});}try{const value=fn();checkCancellation(options.signal);assertControlValueType(value,type,'control expression');return value;}finally{__evaluationDepth--;}}`;
  const arguments_ = entry.inputs.map(input => `inputs[${quote(input.name)}]`).join(',');
  const entryCall=`${functionNames.get(entry.id)}({depth:0,evaluationDepth:0}${arguments_ ? ','+arguments_ : ''})`;
  const executeEntry = futures ? `let result,pending,hasError=false;try{result=await ${entryCall};await __futures.join();}catch(error){pending=__futures.terminalFailure()??error;hasError=true;await __futures.abort();}finally{try{const failures=__resources?await __resources.finish(pending,hasError):[];resourceCleanupOutcome(pending,hasError,failures);}finally{__streams?.finish();__futures.close();}}return result;`
    : `return ${functionNames.get(entry.id)}(${arguments_});`;
  return `// EMS control IR standalone output. Pure finite values; no EMS dependency.\n${standaloneHelpersJS()}
const fail=__fail,assertPrimitiveValueType=__assertType,assertValueType=assertControlValueType;
${[parseControlType, controlTypeName, controlVariants, assertControlValueType, cloneControlValue, matchControlPattern, validateControlInputs, equalControlValues, binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions, assertSignal, checkCancellation, ...(futures ? [awaitCancellable,createFutureScope] : []), ...(streams ? [streamBudgetOptions,createStreamScope,executeStreamOperation] : []),resourceCleanupOutcome,...(resources?[resourceBudgetOptions,createResourceScope,executeResourceOperation]:[]), makeControlThrow, matchesControlCatch, controlCatchValue, terminalControlError].map(fn => fn.toString()).join('\n')}
const __params=(names,values)=>Object.fromEntries(names.map((name,index)=>[name,values[index]]));
${wrappers.join('\n')}
export ${futures ? 'async ' : ''}function execute(inputs,options={}){
assertSignal(options.signal);checkCancellation(options.signal);
validateControlInputs(${quote({inputs:entry.inputs})},inputs);
const __budget=controlBudgetOptions(options);let __steps=0,__depth=0,__evaluationDepth=0;
function __tick(){checkCancellation(options.signal);if(++__steps>__budget.maxSteps)fail('STEP_LIMIT','Control execution step budget exhausted',{maxSteps:__budget.maxSteps});}
${futureSetup}
${definitions.join('\n')}
${executeEntry}
}\n`;
}

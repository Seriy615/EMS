import { parseControlType, controlTypeName, controlVariants, assertControlValueType, cloneControlValue, matchControlPattern, validateControlInputs } from '../semantics/control-algebraic.mjs';
import { fail } from '../reference/errors.mjs';
import { compileStandaloneJS, standaloneHelpersJS } from '../reference/compiler.mjs';
import { validateControlIR, decodeControlLiteral } from '../ir/control.mjs';
import { equalControlValues, binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions } from '../semantics/control-values.mjs';
import { assertSignal, checkCancellation } from '../runtime/cancellation.mjs';
import { makeControlThrow, matchesControlCatch, controlCatchValue, terminalControlError } from '../semantics/control-errors.mjs';

/** Generate independent pure JavaScript from checked semantic control blocks. No AST or EMS imports in output. */
export function compileControlJS(ir, registry) {
  const checked = validateControlIR(ir, registry);
  for (const fn of checked.functions.values()) if (fn.policy.effects.length || fn.policy.capabilities.length)
    fail('UNSUPPORTED_TARGET', 'Control standalone target requires pure bindings');
  const functionNames = new Map([...checked.functions.keys()].map((id, index) => [id, `__fn${index}`]));
  const hosts = new Map(), wrappers = []; let nextLocal = 0;
  const quote = JSON.stringify;
  const literal = value => typeof value === 'number' && Object.is(value, -0) ? '-0' : Array.isArray(value) ? `[${value.map(literal).join(',')}]` : quote(value);
  function host(id) {
    if (hosts.has(id)) return hosts.get(id);
    const contract = registry.resolve(id), wrapper = `__host${hosts.size}`;
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
      case 'call': {
        const args = node.arguments.map(node => expression(node, scope)).join(',');
        if (node.target.kind === 'function') result = `${functionNames.get(node.target.id)}(${args})`;
        else { const contract = registry.resolve(node.target.id); result = `${host(contract.id)}(__params(${quote(Object.keys(contract.inputs))},[${args}]))`; } break;
      }
    }
    return `__value(${quote(node.type)},()=>${result})`;
  }
  function block(body, parent) {
    const scope = new Map(parent), lines = [];
    for (const statement of body) {
      lines.push('__tick();');
      switch (statement.kind) {
        case 'let': { const local = `__local${nextLocal++}`, value = expression(statement.value, scope); scope.set(statement.name, local);
          lines.push(`${statement.mutable ? 'let' : 'const'} ${local}=${value};`); break; }
        case 'expression': lines.push(`${expression(statement.value, scope)};`); break;
        case 'return': lines.push(`return ${expression(statement.value, scope)};`); break;
        case 'throw': lines.push(`throw makeControlThrow(${expression(statement.value, scope)},${quote(statement.value.type)});`); break;
        case 'try': {
          let attempted = block(statement.body, scope);
          if (statement.handler !== null) {
            const caught = `__catch${nextLocal++}`, local = `__local${nextLocal++}`, nested = new Map(scope);
            nested.set(statement.handler.binding, local);
            attempted = `try{${attempted}}catch(${caught}){if(!matchesControlCatch(${caught},${quote(statement.handler.type)}))throw ${caught};const ${local}=controlCatchValue(${caught},${quote(statement.handler.type)});${block(statement.handler.body, nested)}}`;
          }
          if (statement.finalizer !== null) {
            const saved = `__saved${nextLocal++}`, has = `__pending${nextLocal++}`, caught = `__caught${nextLocal++}`;
            lines.push(`{let ${saved},${has}=false;try{${attempted}}catch(${caught}){${saved}=${caught};${has}=true;throw ${caught};}finally{try{${block(statement.finalizer, scope)}}finally{if(${has}&&terminalControlError(${saved}))throw ${saved};}}}`);
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
            lines.push(`if(!${matched}){const ${bindings}=matchControlPattern(${quote(arm.pattern)},${value},__tick);if(${bindings}!==null){${matched}=true;${declarations.join('')}${block(arm.body,nested)}}}`);
          }
          lines.push('}'); break;
        }
        case 'break': case 'continue': lines.push(`${statement.kind};`); break;
        case 'block': lines.push(`{${block(statement.body, scope)}}`); break;
        case 'if': lines.push(`if(${expression(statement.condition, scope)}){${block(statement.then, scope)}}else{${block(statement.otherwise, scope)}}`); break;
        case 'while': lines.push(`while(${expression(statement.condition, scope)}){${block(statement.body, scope)}}`); break;
        case 'for': { const local = `__local${nextLocal++}`, nested = new Map(scope); nested.set(statement.binding, local);
          lines.push(`for(const ${local} of [...${expression(statement.iterable, scope)}]){__tick();${block(statement.body, nested)}}`); break; }
      }
    }
    return lines.join('\n');
  }
  const definitions = [...checked.functions.values()].map(fn => {
    const parameters = fn.inputs.map(() => `__local${nextLocal++}`), scope = new Map(fn.inputs.map((input, index) => [input.name, parameters[index]]));
    return `function ${functionNames.get(fn.id)}(${parameters.join(',')}){__tick();if(++__depth>__budget.maxDepth){__depth--;fail('CALL_DEPTH','Control call depth exhausted',{maxDepth:__budget.maxDepth});}try{${block(fn.body, scope)}}finally{__depth--;}}`;
  });
  const entry = checked.entry;
  return `// EMS control IR standalone output. Pure finite values; no EMS dependency.\n${standaloneHelpersJS()}
const fail=__fail,assertPrimitiveValueType=__assertType,assertValueType=assertControlValueType;
${[parseControlType, controlTypeName, controlVariants, assertControlValueType, cloneControlValue, matchControlPattern, validateControlInputs, equalControlValues, binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions, assertSignal, checkCancellation, makeControlThrow, matchesControlCatch, controlCatchValue, terminalControlError].map(fn => fn.toString()).join('\n')}
const __params=(names,values)=>Object.fromEntries(names.map((name,index)=>[name,values[index]]));
${wrappers.join('\n')}
export function execute(inputs,options={}){
assertSignal(options.signal);checkCancellation(options.signal);
validateControlInputs(${quote({inputs:entry.inputs})},inputs);
const __budget=controlBudgetOptions(options);let __steps=0,__depth=0,__evaluationDepth=0;
function __tick(){checkCancellation(options.signal);if(++__steps>__budget.maxSteps)fail('STEP_LIMIT','Control execution step budget exhausted',{maxSteps:__budget.maxSteps});}
function __value(type,fn){__tick();if(++__evaluationDepth>256){__evaluationDepth--;fail('EVALUATION_DEPTH','Control expression depth exhausted',{maxEvaluationDepth:256});}try{const value=fn();checkCancellation(options.signal);assertControlValueType(value,type,'control expression');return value;}finally{__evaluationDepth--;}}
${definitions.join('\n')}
return ${functionNames.get(entry.id)}(${entry.inputs.map(input => `inputs[${quote(input.name)}]`).join(',')});
}\n`;
}

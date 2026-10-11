import {controlNodeEntries} from '../ir/control-addresses.mjs';
import { createResourceScope,resourceBudgetOptions,executeResourceOperation,resourceCleanupOutcome } from './resources.mjs';
import { createStreamScope, executeStreamOperation, streamBudgetOptions } from './streams.mjs';
import { createFutureScope } from './futures.mjs';
import { fail } from '../reference/errors.mjs';
import { assertValueType } from '../reference/types.mjs';
import { assertControlValueType, validateControlInputs, matchControlPattern } from '../semantics/control-algebraic.mjs';
import { executeGraph } from '../reference/runtime.mjs';
import { validateControlIR, decodeControlLiteral, CONTROL_FUTURE_PROFILE, CONTROL_STREAM_PROFILE,CONTROL_RESOURCE_PROFILE } from '../ir/control.mjs';
import { assertPolicyNames } from '../semantics/effects.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from './cancellation.mjs';
import { binaryControlValue, unaryControlValue, indexControlValue, controlBudgetOptions } from '../semantics/control-values.mjs';
import { makeControlThrow, matchesControlCatch, controlCatchValue, terminalControlError } from '../semantics/control-errors.mjs';

export function checkControlPolicy(summary, { capabilities = [], allowedEffects = [] } = {}) {
  assertPolicyNames(capabilities, 'capabilities'); assertPolicyNames(allowedEffects, 'allowedEffects');
  for (const capability of summary.capabilities) if (!capabilities.includes(capability)) fail('PERMISSION_DENIED', `Control program requires ${capability}`, { capability });
  for (const effect of summary.effects) if (!allowedEffects.includes(effect)) fail('EFFECT_DENIED', `Control program declares ${effect}`, { effect });
}
export function controlSignature(fn) {
  return { id: fn.id, inputs: Object.fromEntries(fn.inputs.map(input => [input.name, { type: input.type }])), output: fn.output };
}

/** Execute semantic blocks. Every statement/expression/call shares one bounded step/depth domain. */
export async function executeControlIR(ir, inputs, registry, options = {}) {
  if(options.onControlEnter!==undefined&&typeof options.onControlEnter!=='function')fail('INVALID_OPTION','Expected control entry observer');
  assertSignal(options.signal); checkCancellation(options.signal);
  const checked = validateControlIR(ir, registry); checkControlPolicy(checked.policy, options);
  validateControlInputs(checked.entry, inputs);
  const budget = controlBudgetOptions(options); let steps = 0;
  const addresses=new WeakMap();
  if(options.onControlEnter)for(const fn of ir.functions)for(const [path,node] of controlNodeEntries(fn))addresses.set(node,path);
  async function observe(node,frame){
    const event={phase:'enter',profile:'control',function:frame.function,node:addresses.get(node),kind:node.kind,type:node.type??null,callStack:[...frame.callStack],step:steps};
    try{await awaitCancellable(options.onControlEnter(event),options.signal);}catch{/* Diagnostics cannot replace semantic errors. */}
    checkCancellation(options.signal);
  }
  const resourceProfile=ir.profile===CONTROL_RESOURCE_PROFILE;
  if(resourceProfile)resourceBudgetOptions(options);
  if ([CONTROL_STREAM_PROFILE,CONTROL_RESOURCE_PROFILE].includes(ir.profile)) streamBudgetOptions(options);
  const futures = [CONTROL_FUTURE_PROFILE, CONTROL_STREAM_PROFILE,CONTROL_RESOURCE_PROFILE].includes(ir.profile) ? createFutureScope(options, validateValue) : null;
  if (futures) options = { ...options, signal: futures.signal };
  const streams = [CONTROL_STREAM_PROFILE,CONTROL_RESOURCE_PROFILE].includes(ir.profile) ? createStreamScope(options) : null;
  const resources=resourceProfile?createResourceScope(options):null;
  function validateValue(value, type, context) { assertControlValueType(value, type, context, futures?.check, streams?.check,resources?.check); }
  function tick() { checkCancellation(options.signal); if (++steps > budget.maxSteps) fail('STEP_LIMIT', 'Control execution step budget exhausted', { maxSteps: budget.maxSteps }); }
  async function expression(node, scope, frame) {
    tick();
    if (++frame.evaluationDepth > 256) { frame.evaluationDepth--; fail('EVALUATION_DEPTH', 'Control expression depth exhausted', { maxEvaluationDepth: 256 }); }
    try {
    if(options.onControlEnter)await observe(node,frame);
    let value;
    switch (node.kind) {
      case 'literal': value = decodeControlLiteral(node.value, node.type); break;
      case 'local': value = scope.get(node.name).value; break;
      case 'array': value = []; for (const element of node.elements) value.push(await expression(element, scope, frame)); break;
      case 'index': value = indexControlValue(await expression(node.value, scope, frame), await expression(node.index, scope, frame)); break;
      case 'assign': value = await expression(node.value, scope, frame); scope.get(node.name).value = value; break;
      case 'unary': value = unaryControlValue(node.operator, await expression(node.value, scope, frame)); break;
      case 'binary': {
        const left = await expression(node.left, scope, frame);
        if (node.operator === '&&') value = left && await expression(node.right, scope, frame);
        else if (node.operator === '||') value = left || await expression(node.right, scope, frame);
        else value = binaryControlValue(node.operator, left, await expression(node.right, scope, frame)); break;
      }
      case 'construct': value = node.arguments.length ? { tag: node.tag, value: await expression(node.arguments[0], scope, frame) } : { tag: node.tag }; break;
      case 'resource':{const args=[];for(const argument of node.arguments)args.push(await expression(argument,scope,frame));value=await executeResourceOperation(node.operation,node.type,args,resources);break;}
      case 'stream': { const args=[];for(const argument of node.arguments)args.push(await expression(argument,scope,frame));value=executeStreamOperation(node.operation,node.type,args,streams,futures);break; }
      case 'await': value = await futures.wait(await expression(node.value, scope, frame), node.type); break;
      case 'call': {
        const args = []; for (const argument of node.arguments) args.push(await expression(argument, scope, frame));
        checkCancellation(options.signal);
        const target = node.target.kind === 'function' ? checked.functions.get(node.target.id) : registry.resolve(node.target.id);
        const operation = async (taskFrame = frame) => {
          if (node.target.kind === 'function') return invoke(target, args, taskFrame);
          const params = Object.fromEntries(Object.keys(target.inputs).map((key, index) => [key, args[index]]));
          const result = target.kind==='resource'?await resources.acquire(target,params):target.kind === 'composite' ? await executeGraph(target.graph, params, registry, options)
            : await awaitCancellable(target.execute(params, Object.freeze({ signal: options.signal, state: options.state })), options.signal);
          if(target.kind!=='resource')assertValueType(result, target.output, 'result of ' + node.target.id); return result;
        };
        value = (node.target.kind === 'function' ? target.async : node.target.async)
          ? futures.start(node.type.slice(7,-1), () => operation({ depth: frame.depth, evaluationDepth: 0,callStack:frame.callStack })) : await operation();
        break;
      }
    }
    checkCancellation(options.signal); validateValue(value, node.type, 'control expression'); return value;
    } finally { frame.evaluationDepth--; }
  }
  async function block(body, parent, frame) {
    const scope = new Map(parent),owned=[],owner={};let pending,hasError=false,exitValue;
    try{return await run();}catch(error){pending=error;hasError=true;throw error;}finally{if(resources){let escape;try{if(exitValue?.kind==='return')resources.escaping(exitValue.value,owned);}catch(error){escape=error;}const failures=await resources.dispose(owned,pending,hasError);resourceCleanupOutcome(escape??pending,!!escape||hasError,failures);}}
    async function run(){
    for (const statement of body) {
      tick();if(options.onControlEnter)await observe(statement,frame); let exit;
      switch (statement.kind) {
        case 'using':{const value=resources.claim(await expression(statement.value,scope,frame),owner);owned.push(value);scope.set(statement.name,{value});break;}
        case 'let': scope.set(statement.name, { value: await expression(statement.value, scope, frame) }); break;
        case 'expression': await expression(statement.value, scope, frame); break;
        case 'return': exitValue={kind:'return',value:await expression(statement.value,scope,frame)};return exitValue;
        case 'throw': throw makeControlThrow(await expression(statement.value, scope, frame), statement.value.type);
        case 'try': {
          let pending, hasError = false;
          try {
            try { exit = await block(statement.body, scope, frame); }
            catch (error) {
              const handler = statement.handler;
              if (!handler || !matchesControlCatch(error, handler.type)) throw error;
              const nested = new Map(scope); nested.set(handler.binding, { value: controlCatchValue(error, handler.type) });
              exit = await block(handler.body, nested, frame);
            }
          } catch (error) { pending = error; hasError = true; }
          if (statement.finalizer !== null) {
            try {
              const finalized = await block(statement.finalizer, scope, frame);
              if (finalized) { exit = finalized; if (!hasError || !terminalControlError(pending)) hasError = false; }
            } catch (error) {
              if (!hasError || !terminalControlError(pending)) { pending = error; hasError = true; }
            }
          }
          if (hasError) throw pending;
          break;
        }
        case 'match': {
          const value = await expression(statement.value, scope, frame);
          for (const arm of statement.arms) {
            const bindings = matchControlPattern(arm.pattern, value, tick);
            if (bindings !== null) { const nested = new Map(scope);
              for (const [name, value] of bindings) nested.set(name, { value });
              exit = await block(arm.body, nested, frame); break;
            }
          }
          break;
        }
        case 'break': case 'continue': return { kind: statement.kind };
        case 'block': exit = await block(statement.body, scope, frame); break;
        case 'if': exit = await block(await expression(statement.condition, scope, frame) ? statement.then : statement.otherwise, scope, frame); break;
        case 'while':
          while (await expression(statement.condition, scope, frame)) {
            const result = await block(statement.body, scope, frame);
            if (result?.kind === 'return'){exitValue=result;return result;}
            if (result?.kind === 'break') break;
          } break;
        case 'forAwait': {
          const stream = await expression(statement.iterable,scope,frame);
          while (true) {
            tick(); const item=await streams.next(stream);checkCancellation(options.signal);
            if (item.tag === 'None') break;
            tick();const nested=new Map(scope);nested.set(statement.binding,{value:item.value});
            const result=await block(statement.body,nested,frame);if(result?.kind==='return'){exitValue=result;return result;}if(result?.kind==='break')break;
          }
          break;
        }
        case 'for': {
          const values = [...await expression(statement.iterable, scope, frame)];
          for (const value of values) { tick(); const nested = new Map(scope); nested.set(statement.binding, { value });
            const result = await block(statement.body, nested, frame); if (result?.kind === 'return'){exitValue=result;return result;} if (result?.kind === 'break') break;
          } break;
        }
      }
      if (exit){exitValue=exit;return exit;}
    }
  }
  }
  async function invoke(fn, args, parent = { depth: 0, evaluationDepth: 0 }) {
    tick(); const frame = { depth: parent.depth + 1, evaluationDepth: parent.evaluationDepth, function:fn.id,callStack:[...(parent.callStack??[]),fn.id] };
    if (frame.depth > budget.maxDepth) fail('CALL_DEPTH', 'Control call depth exhausted', { maxDepth: budget.maxDepth });
    const scope = new Map(fn.inputs.map((input, index) => [input.name, { value: args[index] }]));
    const outcome = await block(fn.body, scope, frame); validateValue(outcome?.value, fn.output.type, 'control return'); return outcome.value;
  }
  let result,pending,hasError=false;
  try {result=await invoke(checked.entry,checked.entry.inputs.map(input=>inputs[input.name]));if(futures)await futures.join();}
  catch(error){pending=futures?.terminalFailure()??error;hasError=true;if(futures)await futures.abort();}
  finally {try{const failures=resources?await resources.finish(pending,hasError):[];resourceCleanupOutcome(pending,hasError,failures);}finally{streams?.finish();futures?.close();}}
  return result;
}

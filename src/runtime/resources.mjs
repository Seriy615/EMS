import { runResourcePhase,checkResourceAcquired } from '../contracts/resource-conditions.mjs';
import { fail } from '../reference/errors.mjs';
import { assertSignal, checkCancellation, awaitCancellable } from './cancellation.mjs';
import { parseControlType, assertControlValueType, cloneControlValue } from '../semantics/control-algebraic.mjs';

export function resourceBudgetOptions(options) {
  const maxResources = options.maxResources ?? 64, maxCleanupMs = options.maxCleanupMs ?? 1000;
  if (!Number.isSafeInteger(maxResources) || maxResources < 1 || maxResources > 1024 ||
      !Number.isSafeInteger(maxCleanupMs) || maxCleanupMs < 1 || maxCleanupMs > 10000) fail('INVALID_BUDGET', 'Invalid resource/cleanup budget');
  if (options.onResourceCleanup !== undefined && typeof options.onResourceCleanup !== 'function') fail('INVALID_OPTION','Expected cleanup observer function');
  return { maxResources, maxCleanupMs };
}

/** Owned cells and trusted native adapters. Cleanup does not spend program ticks or inherit its aborted signal. */
export function createResourceScope(options) {
  assertSignal(options.signal); checkCancellation(options.signal);
  const { maxResources, maxCleanupMs } = resourceBudgetOptions(options);
  const handles = new WeakMap(), states = []; let ended = false;
  function check(handle, type) { const state = handle !== null && typeof handle === 'object' ? handles.get(handle) : null; return !!state && state.type === type && !ended; }
  function lookup(handle, open = true) {
    if (ended) fail('RESOURCE_SCOPE','Resource scope has ended');
    const state = handle !== null && typeof handle === 'object' ? handles.get(handle) : null;
    if (!state) fail('TYPE_MISMATCH','Expected execution-owned ResourceHandle');
    if (open && state.closed) fail('RESOURCE_CLOSED','Resource is closed'); return state;
  }
  function code(error) { return typeof error?.code === 'string' ? error.code : 'HOST_ERROR'; }
  function failure(state, error) { return { resource: state.id, binding: state.binding.id, code: code(error) }; }
  function report(state, phase, reason) {
    options.onResourceCleanup?.(Object.freeze({ resource: state.id, binding: state.binding.id, type: state.type, phase, reason }));
  }
  function reserve(binding) {
    checkCancellation(options.signal);
    if (ended) fail('RESOURCE_SCOPE','Resource scope has ended');
    parseControlType(binding.valueType);
    if (states.length >= maxResources) fail('RESOURCE_LIMIT','Control resource budget exhausted',{maxResources});
    const state = { id: states.length, binding, type: binding.valueType, native: undefined, acquired: false, closed: false, owner: null, tail: Promise.resolve(), disposal: null, release: null };
    states.push(state); return state;
  }
  function expose(state) { const handle = Object.freeze(Object.create(null)); handles.set(handle,state);return handle; }
  function reason(error,hasError=false) { return error?.code === 'CANCELLED' ? 'cancelled' : hasError || error !== undefined ? 'error' : 'normal'; }
  async function deadline(operation) {
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),new Promise((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();try{fail('CLEANUP_TIMEOUT','Resource cleanup deadline exhausted',{maxCleanupMs});}catch(error){reject(error);}},maxCleanupMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  function releaseOnce(state, why) {
    if (state.release) return state.release;
    state.release = deadline(async signal=>{
      await runResourcePhase(state.binding,'release',{},()=>state.binding.release(state.native,Object.freeze({signal,reason:why}))); state.native=undefined;
      report(state,'released',why);
    });
    // Deferred release failures are retained and observed; no native error payload is logged.
    state.release.catch(()=>{});return state.release;
  }
  async function disposeState(state, why) {
    if (state.disposal) return state.disposal;
    state.closed=true;
    state.disposal=(async()=>{
      try {
        await deadline(()=>state.tail);
        if (state.acquired) await releaseOnce(state,why);
        return [];
      } catch(error) {
        // An operation that ignores cancellation must quiesce before native release. Do not free under active IO.
        if (error?.code === 'CLEANUP_TIMEOUT' && !state.release && state.acquired)
          state.tail.then(()=>releaseOnce(state,why)).catch(()=>{});
        try { report(state,error?.code==='CLEANUP_TIMEOUT'?'deferred':'failed',why); } catch {}
        return [failure(state,error)];
      }
    })();return state.disposal;
  }
  async function acquire(binding, params) {
    const state=reserve(binding);
    const acquisition=Promise.resolve().then(()=>{checkCancellation(options.signal);return runResourcePhase(binding,'acquire',params,()=>binding.acquire(params,Object.freeze({signal:options.signal,state:options.state})));});
    state.tail=acquisition.then(native=>{
      state.native=native;state.acquired=true;
      if (ended || state.closed || options.signal?.aborted) releaseOnce(state,'cancelled').catch(()=>{});
    },()=>{});
    await awaitCancellable(acquisition,options.signal);checkCancellation(options.signal);checkResourceAcquired(binding,params);return expose(state);
  }
  function cell(value,type) {
    assertControlValueType(value,type,'resource cell');
    const state=reserve({id:'resource.cell',valueType:type,release:()=>{state.native=undefined;}});
    state.native=cloneControlValue(value);state.acquired=true;return expose(state);
  }
  async function operation(handle, value, writing) {
    checkCancellation(options.signal);const state=lookup(handle);
    if (writing) assertControlValueType(value,state.type,'resource write');
    const copy=writing?cloneControlValue(value):undefined;
    const work=state.tail.then(async()=>{
      checkCancellation(options.signal);if(state.closed)fail('RESOURCE_CLOSED','Resource is closed');
      const context=Object.freeze({signal:options.signal,state:options.state});let result;
      if(state.binding.id==='resource.cell'){if(writing)state.native=copy;result=state.native;}
      else if(writing){if(typeof state.binding.write!=='function')fail('RESOURCE_READ_ONLY','Resource is read-only');result=await runResourcePhase(state.binding,'write',{value:copy},()=>state.binding.write(state.native,copy,context));}
      else result=await runResourcePhase(state.binding,'read',{},()=>state.binding.read(state.native,context));
      assertControlValueType(result,state.type,'resource result');return cloneControlValue(result);
    });
    state.tail=work.then(()=>{},()=>{});return awaitCancellable(work,options.signal);
  }
  function claim(handle,owner) { const state=lookup(handle);if(state.owner!==null)fail('RESOURCE_OWNERSHIP','Resource already has a using owner');state.owner=owner;return handle; }
  function escaping(value,owned) {
    if(value===null || typeof value!=='object')return;
    const state=handles.get(value);if(state && owned.includes(value))fail('RESOURCE_ESCAPE','Using resource cannot escape its owner scope');
    if(!state && Object.hasOwn(value,'value'))escaping(value.value,owned);
  }
  async function dispose(owned,error,hasError=false) { const failures=[];for(const handle of [...owned].reverse())failures.push(...await disposeState(lookup(handle,false),reason(error,hasError)));return failures; }
  async function close(handle) { checkCancellation(options.signal);const state=lookup(handle);const failures=await disposeState(state,'normal');if(failures.length)fail('RESOURCE_CLEANUP','Resource cleanup failed',{failures});return true; }
  async function finish(error,hasError=false) { const failures=[];for(const state of [...states].reverse())failures.push(...await disposeState(state,reason(error,hasError)));ended=true;return failures; }
  return {check,cell,acquire,claim,escaping,dispose,finish,close,read:handle=>operation(handle,undefined,false),write:(handle,value)=>operation(handle,value,true),isClosed:handle=>lookup(handle,false).closed};
}

export async function executeResourceOperation(operation,type,args,resources) {
  switch(operation){
    case 'cell':return resources.cell(args[0],type.slice(15,-1));
    case 'read':return resources.read(args[0]);
    case 'write':return resources.write(args[0],args[1]);
    case 'close':return resources.close(args[0]);
    case 'isClosed':return resources.isClosed(args[0]);
  }
  fail('INVALID_IR','Unknown resource operation');
}
export function resourceCleanupOutcome(error,hasError,failures) {
  if(hasError){if(failures.length && error!==null && typeof error==='object'){try{Object.defineProperty(error,'resourceCleanupFailures',{value:failures,configurable:true});}catch{}}throw error;}
  if(failures.length)fail('RESOURCE_CLEANUP','Resource cleanup failed',{failures});
}

import {ReactorKernel,fields,declarations} from './reactor-kernel.mjs';
import {installStateBindings} from './state-bindings.mjs';
import { fail } from '../reference/errors.mjs';
import { Registry } from '../reference/registry.mjs';
import { signatureIR, checkIRPolicy, executeIR } from '../ir/index.mjs';

const copy = value => structuredClone(value);
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
function copyRegistry(base) {
  const registry = new Registry();
  for (const contract of base.items.values()) {
    if (contract.kind === 'atomic') registry.registerAtomic(contract);
    else if(contract.kind==='resource')registry.registerResource(contract);
    else registry.registerComposite(contract);
  }
  return registry;
}
/** Install typed state interfaces. Memory belongs to each reactor session, never to this registry. */
export function createStateRegistry(base,state){return installStateBindings(copyRegistry(base),declarations(state));}

/** Single-owner transactional event runner for finite EMS IR. No external-effect rollback or plugin sandbox. */
export class ReactorSession extends ReactorKernel {
  constructor(manifest, registry, { policy = {}, maxQueue = 64, recordTrace = false } = {}) {
    fields(manifest, ['schemaVersion', 'id', 'version', 'state', 'handlers'], 'reactor');
    if (manifest.schemaVersion !== 'ems-reactor/1') fail('REACTOR_VERSION', 'Expected ems-reactor/1');
    if (typeof manifest.id !== 'string' || !manifest.id || typeof manifest.version !== 'string' || !manifest.version)
      fail('INVALID_REACTOR', 'Reactor identity/version required');
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) fail('INVALID_REACTOR', 'maxQueue must be a positive safe integer');
    if (typeof recordTrace !== 'boolean') fail('INVALID_REACTOR', 'recordTrace must be Boolean');
    const slots = declarations(manifest.state);
    const linkedRegistry = copyRegistry(registry);
    for (const [id, slot] of slots) for (const action of ['read', 'write']) {
      const binding = linkedRegistry.resolve(`state.${id}.${action}`);
      const inputs = Object.entries(binding.inputs).map(([name, spec]) => [name, typeof spec === 'string' ? spec : spec.type]);
      if (binding.kind !== 'atomic' || binding.output !== slot.type ||
          JSON.stringify(inputs) !== JSON.stringify(action === 'read' ? [] : [['value', slot.type]]) ||
          !binding.effects.includes(`state.${action}`) || !binding.capabilities.includes(`state.${action}`))
        fail('INVALID_STATE_BINDING', `State binding disagrees with ${id}.${action}`);
    }
    const handlers = [];
    if (!Array.isArray(manifest.handlers) || Object.keys(manifest.handlers).length !== manifest.handlers.length)
      fail('INVALID_REACTOR', 'Expected dense event handlers');
    for (const handler of manifest.handlers) {
      fields(handler, ['event', 'program'], 'handler');
      if (typeof handler.event !== 'string' || !namePattern.test(handler.event) || handlers.some(item=>item.event===handler.event))
        fail('INVALID_REACTOR', 'Invalid or duplicate event name');
      const program = copy(handler.program), graph = signatureIR(program, linkedRegistry);
      handlers.push({event:handler.event, inputs:Object.entries(graph.inputs).map(([name,input])=>({name,type:input.type})),
        checkPolicy:grants=>checkIRPolicy(program,linkedRegistry,grants),
        execute:(inputs,options)=>executeIR(program,inputs,linkedRegistry,options)});
    }
    super(manifest.state,handlers,{policy,maxQueue,recordTrace});
  }
}

/** Replay accepted event order. Determinism also requires deterministic bound host implementations. */
export async function replayEvents(session, events) {
  const outcomes = [];
  for (const event of events) {
    const controller = new AbortController();
    if (event.status === 'cancelled') controller.abort();
    try { outcomes.push({ status: 'committed', result: await session.dispatch(event.event, event.inputs, { signal: controller.signal }) }); }
    catch (error) { outcomes.push({ status: error?.code === 'CANCELLED' ? 'cancelled' : 'failed', error: error?.code ?? 'HOST_ERROR' }); }
  }
  return outcomes;
}

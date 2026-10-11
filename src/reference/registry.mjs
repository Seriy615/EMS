import { fail } from './errors.mjs';
import { assertTypeName } from './types.mjs';
import { assertPolicyNames } from '../semantics/effects.mjs';

/** Trust boundary: registerAtomic accepts host-trusted implementations only. No plugin sandbox in M0. */
export class Registry {
  constructor() { this.items = new Map(); }
  registerAtomic({ id, version = '1.0.0', inputs, output, effects = [], capabilities = [], execute, emitJS = null }) {
    if (typeof execute !== 'function') fail('INVALID_IMPL', `${id}: atomic executor must be a function`);
    this.#register({ id, version, kind: 'atomic', inputs, output, effects, capabilities, execute, emitJS });
    return this;
  }
  registerResource({id,version='1.0.0',inputs,valueType,effects=[],capabilities=[],acquire,read,write=null,release}) {
    if(typeof version!=='string' || !version)fail('INVALID_CONTRACT','Resource version must be nonempty string');
    for(const [name,callback] of Object.entries({acquire,read,release}))if(typeof callback!=='function')fail('INVALID_IMPL',`${id}: ${name} must be a function`);
    if(write!==null && typeof write!=='function')fail('INVALID_IMPL',`${id}: write must be a function`);
    this.#register({id,version,kind:'resource',inputs,output:`ResourceHandle<${valueType}>`,valueType,effects,capabilities,acquire,read,write,release});return this;
  }
  registerComposite({ id, version = '1.0.0', graph, effects = [], capabilities = [] }) {
    if (!graph || graph.id !== id) fail('INVALID_IMPL', `${id}: composite graph id mismatch`);
    this.#register({ id, version, kind: 'composite', inputs: graph.inputs, output: graph.output.type, effects, capabilities, graph });
    return this;
  }
  #register(item) {
    if (!item.id || !/^[-a-zA-Z0-9_.]+$/.test(item.id)) fail('INVALID_ID', `Invalid contract id ${item.id}`);
    if (this.items.has(item.id)) fail('DUPLICATE_CONTRACT', `Duplicate contract ${item.id}`);
    if (!item.inputs || typeof item.inputs !== 'object') fail('INVALID_CONTRACT', `Missing inputs for ${item.id}`);
    for (const [key, v] of Object.entries(item.inputs)) assertTypeName(typeof v === 'string' ? v : v.type, `${item.id}.${key}`);
    assertTypeName(item.kind==='resource'?item.valueType:item.output, `${item.id}.output`);
    assertPolicyNames(item.effects, 'effects');
    assertPolicyNames(item.capabilities, 'capabilities');
    this.items.set(item.id, Object.freeze({ ...item, effects: Object.freeze([...item.effects]), capabilities: Object.freeze([...item.capabilities]) }));
  }
  resolve(id) {
    const item = this.items.get(id);
    if (!item) fail('MISSING_CONTRACT', `Unknown contract ${id}`);
    return item;
  }
}
const numeric = { a: 'Number', b: 'Number' };
const list = { values: 'NumberArray' };
const emitMath = op => args => `(${args.a} ${op} ${args.b})`;
export function createCoreRegistry() {
  return new Registry()
    .registerAtomic({ id: 'core.add', inputs: numeric, output: 'Number', execute: ({ a, b }) => a + b, emitJS: emitMath('+') })
    .registerAtomic({ id: 'core.sub', inputs: numeric, output: 'Number', execute: ({ a, b }) => a - b, emitJS: emitMath('-') })
    .registerAtomic({ id: 'core.mul', inputs: numeric, output: 'Number', execute: ({ a, b }) => a * b, emitJS: emitMath('*') })
    .registerAtomic({ id: 'core.div', inputs: numeric, output: 'Number', execute: ({ a, b }) => {
      if (b === 0) fail('DIV_BY_ZERO', 'Division by zero');
      return a / b;
    }, emitJS: ({a,b}) => `__divide(${a}, ${b})` })
    .registerAtomic({ id: 'core.sum', inputs: list, output: 'Number', execute: ({ values }) => values.reduce((a, b) => a + b, 0), emitJS: ({values}) => `${values}.reduce((a,b)=>a+b,0)` })
    .registerAtomic({ id: 'core.min', inputs: list, output: 'Number', execute: ({ values }) => {
      if (!values.length) fail('EMPTY_ARRAY', 'core.min: empty list');
      return values.reduce((a, b) => Math.min(a, b), Infinity);
    }, emitJS: ({values}) => `__min(${values})` })
    .registerAtomic({ id: 'core.max', inputs: list, output: 'Number', execute: ({ values }) => {
      if (!values.length) fail('EMPTY_ARRAY', 'core.max: empty list');
      return values.reduce((a, b) => Math.max(a, b), -Infinity);
    }, emitJS: ({values}) => `__max(${values})` });
}

import {resolveTypedMapContract} from '../stdlib/typed-map-contracts.mjs';
import {resolveTypedArrayContract} from '../stdlib/typed-array-contracts.mjs';
import {contractDescriptionTemplate} from '../contracts/descriptions.mjs';
import {parseControlType,controlTypeName} from '../semantics/control-algebraic.mjs';
import {installFiniteStandardLibrary} from '../stdlib/finite.mjs';
import { fail } from './errors.mjs';
import { assertTypeName } from './types.mjs';
import { validateContractInterface, validateContractBinding } from '../contracts/idl.mjs';
import { assertPolicyNames } from '../semantics/effects.mjs';

const coreImplementations=new WeakMap();
export function coreIntrinsic(item) {
  const expected=coreImplementations.get(item.execute);
  if(item.valueProfile!==undefined||item.kind!=='atomic'||!expected||item.emitJS!==expected.emitJS||JSON.stringify(Object.entries(item.inputs))!==expected.inputs||item.output!==expected.output||item.version!=='1.0.0'||item.effects.length||item.capabilities.length||item.id!==expected.id)return null;
  return {abi:expected.abi,operation:expected.id};
}

/** Trust boundary: registerAtomic accepts host-trusted implementations only. No plugin sandbox in M0. */
export class Registry {
  constructor() { this.items = new Map(); }
  #typedArrayInstances=0;
  /** Optional ems-algebraic/1 signatures use structured control IR; the default reference graph profile stays finite. */
  registerAtomic({ id, version = '1.0.0', inputs, output, effects = [], capabilities = [], execute, emitJS = null, interfaceBoundary = null, valueProfile, description=contractDescriptionTemplate(id,Object.keys(inputs??{})) }) {
    if (typeof execute !== 'function') fail('INVALID_IMPL', `${id}: atomic executor must be a function`);
    this.#register({ id, version, kind: 'atomic', description, inputs, output, effects, capabilities, execute, emitJS, interfaceBoundary,...(valueProfile===undefined?{}:{valueProfile}) });
    return this;
  }
  registerResource({id,version='1.0.0',inputs,valueType,effects=[],capabilities=[],acquire,read,write=null,release,resourceBoundaries=[]}) {
    if(typeof version!=='string' || !version)fail('INVALID_CONTRACT','Resource version must be nonempty string');
    for(const [name,callback] of Object.entries({acquire,read,release}))if(typeof callback!=='function')fail('INVALID_IMPL',`${id}: ${name} must be a function`);
    if(write!==null && typeof write!=='function')fail('INVALID_IMPL',`${id}: write must be a function`);
    if(!Array.isArray(resourceBoundaries)||resourceBoundaries.length>32||Object.keys(resourceBoundaries).length!==resourceBoundaries.length)fail('INVALID_CONTRACT','Invalid resource boundary chain');
    resourceBoundaries=Object.freeze(resourceBoundaries.map((boundary,index)=>{
      if(!boundary||typeof boundary!=='object'||Object.keys(boundary).length!==2||!Object.hasOwn(boundary,'interface')||!Object.hasOwn(boundary,'binding'))fail('INVALID_CONTRACT','Invalid resource boundary descriptor');
      const spec=validateContractInterface(boundary.interface),binding=validateContractBinding(boundary.binding);
      const ports=Object.entries(inputs).map(([name,type])=>({name,type:typeof type==='string'?type:type.type}));
      if(!spec.lifecycle||spec.lifecycle.valueType!==valueType||spec.inputs.length!==ports.length||ports.some((port,i)=>port.name!==spec.inputs[i].name||port.type!==spec.inputs[i].type))fail('INCOMPATIBLE_BINDING','Resource boundary signature mismatch');
      if(binding.interface.id!==spec.id||binding.interface.version!==spec.version||index===0&&(spec.id!==id||spec.version!==version))fail('CONTRACT_VERSION','Resource boundary identity mismatch');
      if(index===0&&((spec.lifecycle.write===null)!==(write===null)))fail('INCOMPATIBLE_BINDING','Resource boundary write availability mismatch');
      return Object.freeze({interface:spec,binding});
    }));
    this.#register({id,version,kind:'resource',inputs,output:`ResourceHandle<${valueType}>`,valueType,effects,capabilities,acquire,read,write,release,resourceBoundaries});return this;
  }
  registerComposite({ id, version = '1.0.0', graph, effects = [], capabilities = [], interfaceBoundary = null }) {
    if (!graph || graph.id !== id) fail('INVALID_IMPL', `${id}: composite graph id mismatch`);
    if(interfaceBoundary!==null){
      const spec=validateContractInterface(interfaceBoundary.interface),binding=validateContractBinding(interfaceBoundary.binding);
      if(spec.id!==id||spec.version!==version||binding.interface.id!==id||binding.interface.version!==version)fail('CONTRACT_VERSION','Composite interface boundary mismatch');
      interfaceBoundary=Object.freeze({interface:spec,binding});
    }
    this.#register({ id, version, kind: 'composite', inputs: graph.inputs, output: graph.output.type, effects, capabilities, graph, interfaceBoundary });
    return this;
  }
  #register(item) {
    if(item.description!==undefined&&(typeof item.description!=='string'||item.description.length>2000))fail('INVALID_DESCRIPTION','Invalid contract description');
    if (!item.id || !/^[-a-zA-Z0-9_.]+$/.test(item.id)) fail('INVALID_ID', `Invalid contract id ${item.id}`);
    if (this.items.has(item.id)) fail('DUPLICATE_CONTRACT', `Duplicate contract ${item.id}`);
    if (!item.inputs || typeof item.inputs !== 'object') fail('INVALID_CONTRACT', `Missing inputs for ${item.id}`);
    if(item.valueProfile!==undefined&&(item.kind!=='atomic'||item.valueProfile!=='ems-algebraic/1'||item.interfaceBoundary!==null))fail('UNSUPPORTED_PROFILE','Algebraic atomic contracts require an explicit value profile without finite IDL boundary');
    const assertSignature=(type,context)=>{if(item.valueProfile===undefined)return assertTypeName(type,context);if(controlTypeName(parseControlType(type))!==type)fail('UNKNOWN_TYPE','Noncanonical algebraic contract type');};
    for (const [key, v] of Object.entries(item.inputs)) assertSignature(typeof v === 'string' ? v : v.type, `${item.id}.${key}`);
    assertSignature(item.kind==='resource'?item.valueType:item.output, `${item.id}.output`);
    assertPolicyNames(item.effects, 'effects');
    assertPolicyNames(item.capabilities, 'capabilities');
    this.items.set(item.id, Object.freeze({ ...item, effects: Object.freeze([...item.effects]), capabilities: Object.freeze([...item.capabilities]) }));
  }
  resolve(id) {
    let item = this.items.get(id);
    if(!item){const definition=resolveTypedArrayContract(id)??resolveTypedMapContract(id);if(definition){if(this.#typedArrayInstances>=1024)fail('CONTRACT_LIMIT','Too many typed collection instances');this.registerAtomic(definition);this.#typedArrayInstances++;item=this.items.get(id);}}
    if (!item) fail('MISSING_CONTRACT', `Unknown contract ${id}`);
    return item;
  }
}
const numeric = { a: 'Number', b: 'Number' };
const list = { values: 'NumberArray' };
const emitMath = op => args => `(${args.a} ${op} ${args.b})`;
export function createCoreRegistry() {
  const registry=new Registry()
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
  installFiniteStandardLibrary(registry,fail);
  for(const item of registry.items.values())coreImplementations.set(item.execute,{id:item.id,abi:item.id.startsWith('std.')?'ems-stdlib-finite/1':'ems-core-finite/1',emitJS:item.emitJS,inputs:JSON.stringify(Object.entries(item.inputs)),output:item.output});
  return registry;
}

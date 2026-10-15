import {fail} from '../reference/errors.mjs';
import {assertTypeName,assertValueType} from '../reference/types.mjs';
import {parseControlType,controlTypeName,assertControlValueType} from '../semantics/control-algebraic.mjs';
/** State version is declared by the program, never inferred from arbitrary host data. */
export function assertStateType(type,version='ems-reactor/1',context='state'){
 if(!['ems-reactor/1','ems-reactor/2'].includes(version))fail('REACTOR_VERSION','Unsupported state schema');
 if(version==='ems-reactor/1')return assertTypeName(type,context);
 if(controlTypeName(parseControlType(type))!==type)fail('UNKNOWN_TYPE','State type must be canonical',{context});
}
/** Rich slots contain bounded enumerable own data, safe to clone and transport without accessors. */
export function assertStateValue(value,type,context,version='ems-reactor/1'){
 assertStateType(type,version,context);
 if(version==='ems-reactor/1')return assertValueType(value,type,context);
 function data(value,depth){
  if(depth>64)fail('VALUE_LIMIT','State data nesting exceeds limit');
  if(typeof value==='string'){if(value.length>262144)fail('VALUE_LIMIT','State string exceeds limit');return;}
  if(typeof value==='number'||typeof value==='boolean')return;
  if(!value||typeof value!=='object')fail('TYPE_MISMATCH','State requires finite own data',{context});
  const array=Array.isArray(value);
  if(array&&value.length>10000)fail('VALUE_LIMIT','State collection exceeds limit');
  const keys=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
  if(array){if(Object.getPrototypeOf(value)!==Array.prototype||keys.length!==value.length+1)fail('TYPE_MISMATCH','State arrays require dense own data',{context});for(let i=0;i<value.length;i++){const descriptor=descriptors[i];if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail('TYPE_MISMATCH','State arrays require own data elements',{context});data(descriptor.value,depth+1);}return;}
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value))||keys.length>2||keys.some(key=>!['tag','value'].includes(key)||!Object.hasOwn(descriptors[key],'value')||!descriptors[key].enumerable))fail('TYPE_MISMATCH','State requires own-data tagged values',{context});
  for(const descriptor of Object.values(descriptors))data(descriptor.value,depth+1);
 }
 data(value,0);assertControlValueType(value,type,context);
}

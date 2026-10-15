import {fail} from '../reference/errors.mjs';
import {assertTypeName,assertValueType} from '../reference/types.mjs';
import {parseControlType,controlTypeName,assertControlValueType} from '../semantics/control-algebraic.mjs';
export const FLOW_VALUE_TYPES=Object.freeze(['Number','Boolean','String','NumberArray','Array<String>','Array<Boolean>','Array<NumberArray>','Array<Array<String>>','Option<String>','Option<Number>','Result<Number,String>']);
export const canonicalFlowType=type=>controlTypeName(parseControlType(type));
export function assertFlowType(type,context,rich=false){if(!rich)return assertTypeName(type,context);if(canonicalFlowType(type)!==type)fail('UNKNOWN_TYPE','Flow types must be canonical',{type,context});}
/** Bounded own-data literals; typed control semantics remain authoritative. */
export function assertFlowValue(value,type,context,rich=false){
 if(!rich){assertValueType(value,type,context);return;}
 assertFlowType(type,context,true);let count=0;
 function data(value,depth){if(depth>64)fail('FLOW_LIMIT','Flow value nesting exceeds limit');if(typeof value==='string'){if(value.length>262144)fail('FLOW_LIMIT','Flow string exceeds limit');return;}if(typeof value==='number'||typeof value==='boolean')return;
  if(!value||typeof value!=='object')fail('TYPE_MISMATCH','Expected finite flow data',{type,context});if(Array.isArray(value)&&(count+Object.getOwnPropertyDescriptor(value,'length').value)>10000)fail('FLOW_LIMIT','Flow arrays exceed 10000 elements');const keys=Reflect.ownKeys(value);if(!Array.isArray(value)&&(![Object.prototype,null].includes(Object.getPrototypeOf(value))||keys.length>2))fail('TYPE_MISMATCH','Expected own-data tagged value');const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Array.isArray(value)){const length=descriptors.length.value;count+=length;if(Object.getPrototypeOf(value)!==Array.prototype||keys.length!==length+1)fail('TYPE_MISMATCH','Expected dense own-data array');for(let i=0;i<length;i++){if(!Object.hasOwn(descriptors[i]??{},'value'))fail('TYPE_MISMATCH','Array elements must be own data');data(descriptors[i].value,depth+1);}return;}
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value))||keys.length>2||keys.some(key=>!['tag','value'].includes(key)||!Object.hasOwn(descriptors[key],'value')))fail('TYPE_MISMATCH','Expected own-data tagged value');for(const descriptor of Object.values(descriptors))data(descriptor.value,depth+1);
 }
 data(value,0);assertControlValueType(value,type,context);
}
export function defaultFlowValue(source){
 function value(type){if(type.name==='Number')return 0;if(type.name==='Boolean')return false;if(type.name==='String')return '';if(['Array','NumberArray'].includes(type.name))return [];if(type.name==='Option')return {tag:'None'};if(type.name==='Result')return {tag:'Err',value:value(type.arguments[1])};fail('UNKNOWN_TYPE','No finite flow default');}
 return value(parseControlType(source));
}
/** Emit only closed EMS value syntax, never object source or application JavaScript. */
export function flowValueSource(value,source){
 function emit(value,type){if(type.name==='Number')return Object.is(value,-0)?'-0':JSON.stringify(value);if(['String','Boolean'].includes(type.name))return JSON.stringify(value);if(['Array','NumberArray'].includes(type.name))return '['+value.map(item=>emit(item,type.name==='NumberArray'?{name:'Number',arguments:[]}:type.arguments[0])).join(',')+']';if(type.name==='Option')return value.tag==='None'?'None()':'Some('+emit(value.value,type.arguments[0])+')';if(type.name==='Result')return value.tag+'('+emit(value.value,type.arguments[value.tag==='Ok'?0:1])+')';fail('UNKNOWN_TYPE','Unsupported flow literal type');}
 return emit(value,parseControlType(source));
}

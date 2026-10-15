import { fail } from '../reference/errors.mjs';
import { assertValueType as assertPrimitiveValueType } from '../reference/types.mjs';

/** Canonical finite type grammar for the algebraic control profile, independent of frontend AST. */
export function parseControlType(source, allowFuture = false, allowStream = false, allowResource = false) {
  if (typeof source !== 'string' || source.length > 4096) fail('UNKNOWN_TYPE', 'Invalid control type');
  let offset = 0;
  function parse(depth) {
    if (depth > 32) fail('IR_LIMIT', 'Control type nesting exceeds 32');
    const match = /^[A-Za-z]+/.exec(source.slice(offset));
    if (!match) fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    const name = match[0]; offset += name.length;
    if (['Number', 'NumberArray', 'Boolean', 'String'].includes(name)) return { name, arguments: [] };
    if (!['Array', 'Map', 'Option', 'Result', ...(allowFuture ? ['Future'] : []), ...(allowStream ? ['Stream'] : []), ...(allowResource ? ['ResourceHandle'] : [])].includes(name) || source[offset++] !== '<') fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    const arguments_ = [parse(depth + 1)];
    if (name === 'Result' || name === 'Map') { if (source[offset++] !== ',') fail('UNKNOWN_TYPE', 'Invalid control type ' + source); arguments_.push(parse(depth + 1)); }
    if (source[offset++] !== '>') fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
    if(name==='Map'&&!['String','Number','Boolean'].includes(arguments_[0].name))fail('UNKNOWN_TYPE','Map keys require String, Number or Boolean');
    if(name==='Map'){const live=type=>['Future','Stream','ResourceHandle'].includes(type.name)||type.arguments.some(live);if(live(arguments_[1]))fail('UNKNOWN_TYPE','Map values require finite serializable types');}
    return name==='Array'&&arguments_[0].name==='Number'?{name:'NumberArray',arguments:[]}:{ name, arguments: arguments_ };
  }
  const result = parse(0);
  if (offset !== source.length) fail('UNKNOWN_TYPE', 'Invalid control type ' + source);
  return result;
}
export function controlTypeName(type) {
  return type.name + (type.arguments.length ? '<' + type.arguments.map(controlTypeName).join(',') + '>' : '');
}
export function controlVariants(type) {
  const parsed = typeof type === 'string' ? parseControlType(type, true, true, true) : type;
  return parsed.name === 'Option' ? new Map([['Some', [parsed.arguments[0]]], ['None', []]])
    : parsed.name === 'Result' ? new Map([['Ok', [parsed.arguments[0]]], ['Err', [parsed.arguments[1]]]]) : null;
}
export function assertControlValueType(value, expected, context, futureCheck, streamCheck, resourceCheck) {
  const type = parseControlType(expected, !!futureCheck, !!streamCheck, !!resourceCheck);
  let arrayElements=0;
  function check(value, type) {
    if(type.name==='Map'){
      const record=value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
      const descriptors=record?Object.getOwnPropertyDescriptors(value):{};
      if(!record||Reflect.ownKeys(value).length!==2||descriptors.tag?.value!=='Map'||!Object.hasOwn(descriptors.value??{},'value'))fail('TYPE_MISMATCH',`${context}: expected ${expected}`,{expected,context});
      const entries=descriptors.value.value;
      function dense(array,length){if(!Array.isArray(array)||Object.getPrototypeOf(array)!==Array.prototype||array.length!==length||Reflect.ownKeys(array).length!==length+1)fail('TYPE_MISMATCH','Map requires dense own-data entries',{expected,context});const data=Object.getOwnPropertyDescriptors(array);for(let i=0;i<length;i++)if(!Object.hasOwn(data[i]??{},'value'))fail('TYPE_MISMATCH','Map entries must be own data',{expected,context});return data;}
      if(!Array.isArray(entries))fail('TYPE_MISMATCH','Map requires an entry array',{expected,context});
      if((arrayElements+=entries.length)>10000)fail('VALUE_LIMIT','Collections exceed 10000 elements');
      const data=dense(entries,entries.length),keys=new Set();
      for(let i=0;i<entries.length;i++){const pair=dense(data[i].value,2),key=pair[0].value;check(key,type.arguments[0]);if(keys.has(key))fail('DUPLICATE_MAP_KEY','Map keys must be unique',{context});keys.add(key);check(pair[1].value,type.arguments[1]);}
      return;
    }
    const nestedNumbers=type.name==='NumberArray'&&arrayElements>0;
    if(type.name==='Array'||nestedNumbers){
      if(Array.isArray(value)&&(arrayElements+value.length)>10000)fail('VALUE_LIMIT','Typed array value exceeds 10000 elements');
      const descriptors=Array.isArray(value)?Object.getOwnPropertyDescriptors(value):null;
      if(!descriptors||Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)fail('TYPE_MISMATCH',`${context}: expected ${expected}`,{expected,context});
      if((arrayElements+=value.length)>10000)fail('VALUE_LIMIT','Typed array value exceeds 10000 elements');
      for(let index=0;index<value.length;index++){const descriptor=descriptors[index];if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('TYPE_MISMATCH','Typed arrays require dense own data elements',{expected,context});check(descriptor.value,nestedNumbers?{name:'Number',arguments:[]}:type.arguments[0]);}
      return;
    }
    if(type.name==='ResourceHandle'){if(!resourceCheck?.(value,controlTypeName(type.arguments[0])))fail('TYPE_MISMATCH',`${context}: expected ${expected}, got Unknown`,{expected,received:'Unknown',context});return;}
    if (type.name === 'Stream') {
      if (!streamCheck?.(value, controlTypeName(type.arguments[0]))) fail('TYPE_MISMATCH', `${context}: expected ${expected}, got Unknown`, { expected, received: 'Unknown', context });
      return;
    }
    if (type.name === 'Future') {
      if (!futureCheck?.(value, controlTypeName(type.arguments[0]))) fail('TYPE_MISMATCH', `${context}: expected ${expected}, got Unknown`, { expected, received: 'Unknown', context });
      return;
    }
    const variants = controlVariants(type);
    if (!variants) { assertPrimitiveValueType(value, type.name, context); return; }
    const validObject = value !== null && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value));
    const descriptors = validObject ? Object.getOwnPropertyDescriptors(value) : {};
    const tag = descriptors.tag?.value, payload = variants.get(tag);
    const keys = payload?.length === 0 ? ['tag'] : ['tag', 'value'];
    if (!validObject || !payload || Reflect.ownKeys(value).length !== keys.length ||
        keys.some(key => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value')))
      fail('TYPE_MISMATCH', `${context}: expected ${expected}, got Unknown`, { expected, received: 'Unknown', context });
    if (payload.length) check(descriptors.value.value, payload[0]);
  }
  check(value, type);
}
export function cloneControlValue(value) {
  if (Array.isArray(value)) return value.map(cloneControlValue);
  if (value !== null && typeof value === 'object') return Object.hasOwn(value, 'value')
    ? { tag: value.tag, value: cloneControlValue(value.value) } : { tag: value.tag };
  return value;
}
/** Match a validated semantic pattern. Every visited pattern consumes the shared execution budget. */
export function matchControlPattern(pattern, value, tick, bindings = new Map()) {
  tick();
  switch (pattern.kind) {
    case 'wildcard': return bindings;
    case 'binding': bindings.set(pattern.name, value); return bindings;
    case 'literal': return value === (pattern.value === '-0' && pattern.type === 'Number' ? -0 : pattern.value) ? bindings : null;
    case 'constructor':
      if (value.tag !== pattern.tag) return null;
      return pattern.arguments.length ? matchControlPattern(pattern.arguments[0], value.value, tick, bindings) : bindings;
  }
  fail('INVALID_IR', 'Unknown match pattern');
}
export function validateControlInputs(fn, inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || ![Object.prototype, null].includes(Object.getPrototypeOf(inputs)))
    fail('INVALID_INPUT', 'Input values must be an object');
  for (const input of fn.inputs) {
    if (!Object.hasOwn(inputs, input.name)) fail('MISSING_INPUT', 'Missing input ' + input.name);
    assertControlValueType(inputs[input.name], input.type, 'inputs.' + input.name);
  }
  for (const name of Object.keys(inputs)) if (!fn.inputs.some(input => input.name === name)) fail('EXTRA_INPUT', 'Unexpected input ' + name);
}

/** Canonical element type for typed array operations; legacy NumberArray remains an alias. */
export function controlArrayElementType(source){const type=parseControlType(source,true,true,true);if(type.name==='NumberArray')return 'Number';if(type.name!=='Array')fail('TYPE_MISMATCH','Array operation requires Array');return controlTypeName(type.arguments[0]);}

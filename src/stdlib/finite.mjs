import {validateContractInterface} from '../contracts/idl.mjs';
/** Trusted, pure standard contracts for the finite primitive profile. */
const definitions=[];
function define(id,category,inputs,output,operation,summary,errors=[]){
 const signature=Object.freeze({...inputs});
 definitions.push(Object.freeze({id,version:'1.0.0',category,inputs:signature,output,operation,summary,errors:Object.freeze([...errors])}));
}
for(const type of ['Number','Boolean','String','NumberArray']){
 define(`std.value.${type}`,'value',{value:type},type,type==='NumberArray'?({value})=>value.slice():({value})=>value,'Typed value identity; arrays are copied.');
 define(`std.select.${type}`,'selection',{condition:'Boolean',whenTrue:type,whenFalse:type},type,type==='NumberArray'?({condition,whenTrue,whenFalse})=>(condition?whenTrue:whenFalse).slice():({condition,whenTrue,whenFalse})=>condition?whenTrue:whenFalse,'Select between already evaluated values; not lazy control flow.');
}
define('std.logic.and','logic',{a:'Boolean',b:'Boolean'},'Boolean',({a,b})=>a&&b,'Eager Boolean conjunction.');
define('std.logic.or','logic',{a:'Boolean',b:'Boolean'},'Boolean',({a,b})=>a||b,'Eager Boolean disjunction.');
define('std.logic.not','logic',{value:'Boolean'},'Boolean',({value})=>!value,'Boolean negation.');
const numbers={a:'Number',b:'Number'};
for(const [name,operation] of Object.entries({equal:({a,b})=>a===b,notEqual:({a,b})=>a!==b,less:({a,b})=>a<b,lessEqual:({a,b})=>a<=b,greater:({a,b})=>a>b,greaterEqual:({a,b})=>a>=b}))define(`std.number.${name}`,'comparison',numbers,'Boolean',operation,'Finite numeric comparison; signed zeros compare equal.');
for(const [name,operation] of Object.entries({abs:({value})=>Math.abs(value),floor:({value})=>Math.floor(value),ceil:({value})=>Math.ceil(value),round:({value})=>Math.round(value)}))define(`std.number.${name}`,'number',{value:'Number'},'Number',operation,'Binary64 operation; round ties toward positive infinity, preserving negative zero.');
define('std.text.concat','text',{a:'String',b:'String'},'String',({a,b})=>a+b,'Concatenate without normalization.');
define('std.text.equal','text',{a:'String',b:'String'},'Boolean',({a,b})=>a===b,'Exact UTF-16 sequence equality; no normalization.');
define('std.text.length','text',{text:'String'},'Number',({text})=>Array.from(text).length,'Count Unicode code points; unpaired surrogates count as one.');
define('std.text.contains','text',{text:'String',part:'String'},'Boolean',({text,part})=>text.includes(part),'Exact substring test; empty part is present.');
define('std.text.slice','text',{text:'String',start:'Number',end:'Number'},'String',({text,start,end},fail)=>{const points=Array.from(text);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>points.length)fail('INDEX_RANGE','Text slice requires 0 <= start <= end <= code-point length');return points.slice(start,end).join('');},'Strict half-open code-point interval.',['INDEX_RANGE']);
define('std.text.toNumber','text',{text:'String'},'Number',({text},fail)=>{if(!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text))fail('NUMBER_FORMAT','Expected a finite decimal number');const value=Number(text);if(!Number.isFinite(value))fail('NUMBER_FORMAT','Expected a finite decimal number');return value;},'Strict locale-independent decimal parsing; no whitespace, hex, NaN or infinity.',['NUMBER_FORMAT']);
define('std.text.fromNumber','text',{value:'Number'},'String',({value})=>Object.is(value,-0)?'-0':String(value),'Binary64 decimal rendering; preserve negative zero.');
define('std.array.length','array',{values:'NumberArray'},'Number',({values})=>values.length,'Number of elements.');
define('std.array.at','array',{values:'NumberArray',index:'Number'},'Number',({values,index},fail)=>{if(!Number.isSafeInteger(index)||index<0||index>=values.length)fail('INDEX_RANGE','Array index must be a safe integer within bounds');return values[index];},'Strict zero-based indexing.',['INDEX_RANGE']);
define('std.array.append','array',{values:'NumberArray',value:'Number'},'NumberArray',({values,value})=>[...values,value],'Return a new array.');
define('std.array.concat','array',{a:'NumberArray',b:'NumberArray'},'NumberArray',({a,b})=>[...a,...b],'Return a new concatenation.');
define('std.array.reverse','array',{values:'NumberArray'},'NumberArray',({values})=>values.slice().reverse(),'Reverse a copy.');
define('std.array.sort','array',{values:'NumberArray'},'NumberArray',({values})=>values.slice().sort((a,b)=>a-b),'Stable ascending numeric order; preserve order of signed zeros.');
define('std.array.slice','array',{values:'NumberArray',start:'Number',end:'Number'},'NumberArray',({values,start,end},fail)=>{if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>values.length)fail('INDEX_RANGE','Array slice requires 0 <= start <= end <= length');return values.slice(start,end);},'Strict half-open interval.',['INDEX_RANGE']);
define('std.array.contains','array',{values:'NumberArray',value:'Number'},'Boolean',({values,value})=>values.includes(value),'Finite numeric membership; signed zeros compare equal.');
export const STANDARD_CONTRACTS=Object.freeze(definitions);
/** Public interfaces are data artifacts, separate from operational bodies and binding provenance. */
export const STANDARD_INTERFACES=Object.freeze(STANDARD_CONTRACTS.map(item=>validateContractInterface({schemaVersion:'ems-contract-interface/1',id:item.id,version:item.version,inputs:Object.entries(item.inputs).map(([name,type])=>({name,type})),output:{type:item.output},errors:item.errors.map(code=>({code,payloadType:null})),semantics:{determinism:'deterministic',effects:[],capabilities:[]},conditions:{pre:[],post:[]}})));
export function standardCatalog(){return {schemaVersion:'ems-stdlib-catalog/1',contracts:STANDARD_CONTRACTS.map((item,index)=>({interface:STANDARD_INTERFACES[index],category:item.category,summary:item.summary,implementation:{kind:'intrinsic',abi:'ems-stdlib-finite/1',id:item.id}}))};}
/** One trusted operational body is used by runtime and standalone emission. No source from users is evaluated. */
export function installFiniteStandardLibrary(registry,fail){
 for(const {id,version,inputs,output,operation} of STANDARD_CONTRACTS){
  const source=operation.toString();
  registry.registerAtomic({id,version,inputs,output,execute:args=>operation(args,fail),emitJS:args=>`(${source})({${Object.keys(inputs).map(name=>JSON.stringify(name)+':'+args[name]).join(',')}},__fail)`});
 }
 return registry;
}

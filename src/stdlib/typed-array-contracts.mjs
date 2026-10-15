import {contractDescriptionTemplate} from '../contracts/descriptions.mjs';
import {fail} from '../reference/errors.mjs';
import {parseControlType,controlTypeName} from '../semantics/control-algebraic.mjs';
import {equalControlValues} from '../semantics/control-values.mjs';
const operations={length:{values:'Array<T>'},at:{values:'Array<T>',index:'Number'},append:{values:'Array<T>',value:'T'},concat:{a:'Array<T>',b:'Array<T>'},reverse:{values:'Array<T>'},slice:{values:'Array<T>',start:'Number',end:'Number'},removeAt:{values:'Array<T>',index:'Number'},contains:{values:'Array<T>',value:'T'},set:{values:'Array<T>',index:'Number',value:'T'},insertAt:{values:'Array<T>',index:'Number',value:'T'}};
const outputs={length:'Number',at:'T',contains:'Boolean'};
export const ARRAY_CONTRACT_TEMPLATES=Object.freeze(Object.entries(operations).map(([operation,inputs])=>Object.freeze({kind:'atomic-template',id:'std.array.'+operation,description:contractDescriptionTemplate('std.array.'+operation,Object.keys(inputs)),version:'1.0.0',parameters:Object.freeze(['T']),inputs:Object.freeze(inputs),output:outputs[operation]??'Array<T>',effects:Object.freeze([]),capabilities:Object.freeze([])})));
export const arrayContractTemplate=id=>ARRAY_CONTRACT_TEMPLATES.find(template=>template.id===id)??null;
const witnesses=new WeakMap();
/** Shared pure implementation for every concrete typed instance and its independent emitter. */
function arrayOperation(operation,args,fail,equal){
 const values=args.values??args.a,index=args.index;
 if(['at','removeAt','set','insertAt'].includes(operation)&&(!Number.isSafeInteger(index)||index<0||index>=(operation==='insertAt'?values.length+1:values.length)))fail('INDEX_RANGE','Array index must be a safe integer within bounds');
 switch(operation){
  case 'length':return values.length;
  case 'at':return values[index];
  case 'append':return [...values,args.value];
  case 'concat':return [...args.a,...args.b];
  case 'reverse':return values.slice().reverse();
  case 'slice':if(!Number.isSafeInteger(args.start)||!Number.isSafeInteger(args.end)||args.start<0||args.end<args.start||args.end>values.length)fail('INDEX_RANGE','Array slice requires 0 <= start <= end <= length');return values.slice(args.start,args.end);
  case 'removeAt':return [...values.slice(0,index),...values.slice(index+1)];
  case 'contains':return values.some(value=>equal(value,args.value));
  case 'set':{const result=values.slice();result[index]=args.value;return result;}
  case 'insertAt':return [...values.slice(0,index),args.value,...values.slice(index)];
 }
 fail('MISSING_CONTRACT','Unknown typed array operation');
}
export function typedArrayContractId(operation,element){
 if(!arrayContractTemplate('std.array.'+operation))fail('MISSING_CONTRACT','Unknown typed array operation');
 const canonical=controlTypeName(parseControlType(element));if(canonical!==element)fail('UNKNOWN_TYPE','Typed array contract requires canonical element type');
 return 'std.array.'+operation+'.T'+Array.from(element,char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('');
}
/** Deterministic closed recipe; no plugin lookup, source evaluation or host invocation. */
export function resolveTypedArrayContract(id){
 const match=typeof id==='string'&&/^std\.array\.([A-Za-z]+)\.T([0-9a-f]+)$/.exec(id);if(!match||match[2].length%2||match[2].length>8192||!arrayContractTemplate('std.array.'+match[1]))return null;
 const element=match[2].match(/../g).map(byte=>String.fromCharCode(parseInt(byte,16))).join('');if(typedArrayContractId(match[1],element)!==id)return null;
 const template=arrayContractTemplate('std.array.'+match[1]),array=element==='Number'?'NumberArray':'Array<'+element+'>',type=value=>value==='T'?element:value==='Array<T>'?array:value,inputs=Object.fromEntries(Object.entries(template.inputs).map(([name,value])=>[name,type(value)])),output=type(template.output),execute=args=>arrayOperation(match[1],args,fail,equalControlValues),emitJS=args=>`(${arrayOperation.toString()})(${JSON.stringify(match[1])},{${Object.keys(inputs).map(name=>JSON.stringify(name)+':'+args[name]).join(',')}},__fail,equalControlValues)`;
 witnesses.set(execute,{id,inputs:JSON.stringify(inputs),output,emitJS});
 return {id,version:'1.0.0',inputs,output,effects:[],capabilities:[],valueProfile:'ems-algebraic/1',execute,emitJS,description:template.description};
}
export function typedArrayIntrinsic(contract){const witness=witnesses.get(contract?.execute);return !!witness&&contract.kind==='atomic'&&contract.id===witness.id&&contract.version==='1.0.0'&&JSON.stringify(contract.inputs)===witness.inputs&&contract.output===witness.output&&contract.emitJS===witness.emitJS&&contract.valueProfile==='ems-algebraic/1'&&!contract.effects.length&&!contract.capabilities.length&&contract.interfaceBoundary===null;}

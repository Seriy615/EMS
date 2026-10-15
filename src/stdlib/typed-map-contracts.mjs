import {fail} from '../reference/errors.mjs';
import {parseControlType,controlTypeName} from '../semantics/control-algebraic.mjs';
const operations={empty:{},size:{map:'Map<K,V>'},has:{map:'Map<K,V>',key:'K'},get:{map:'Map<K,V>',key:'K'},getOr:{map:'Map<K,V>',key:'K',fallback:'V'},set:{map:'Map<K,V>',key:'K',value:'V'},remove:{map:'Map<K,V>',key:'K'},keys:{map:'Map<K,V>'},values:{map:'Map<K,V>'},fromArrays:{keys:'Array<K>',values:'Array<V>'}};
const outputs={size:'Number',has:'Boolean',get:'Option<V>',getOr:'V',keys:'Array<K>',values:'Array<V>'};
const descriptions={empty:'Создать пустой словарь',size:'Количество записей в {map}',has:'Проверить ключ {key} в {map}',get:'Получить значение ключа {key} из {map}',getOr:'Получить {key} из {map}, иначе {fallback}',set:'Записать {value} по ключу {key} в {map}',remove:'Удалить ключ {key} из {map}',keys:'Ключи словаря {map}',values:'Значения словаря {map}',fromArrays:'Создать словарь из ключей {keys} и значений {values}'};
export const MAP_CONTRACT_TEMPLATES=Object.freeze(Object.entries(operations).map(([operation,inputs])=>Object.freeze({kind:'atomic-template',id:'std.map.'+operation,version:'1.0.0',parameters:Object.freeze(['K','V']),inputs:Object.freeze(inputs),output:outputs[operation]??'Map<K,V>',description:descriptions[operation],effects:Object.freeze([]),capabilities:Object.freeze([])})));
export const mapContractTemplate=id=>MAP_CONTRACT_TEMPLATES.find(item=>item.id===id)??null;
const witnesses=new WeakMap();
/** Immutable entries preserve insertion order; key identity is primitive equality, including -0 == 0. */
function mapOperation(operation,args,fail){
 const entries=args.map?.value,index=entries?.findIndex(entry=>entry[0]===args.key);
 switch(operation){
  case 'empty':return {tag:'Map',value:[]};
  case 'size':return entries.length;
  case 'has':return index>=0;
  case 'get':return index<0?{tag:'None'}:{tag:'Some',value:entries[index][1]};
  case 'getOr':return index<0?args.fallback:entries[index][1];
  case 'set':{const result=entries.slice();if(index<0)result.push([args.key,args.value]);else result[index]=[entries[index][0],args.value];return {tag:'Map',value:result};}
  case 'remove':return {tag:'Map',value:entries.filter((_,i)=>i!==index)};
  case 'keys':return entries.map(entry=>entry[0]);
  case 'values':return entries.map(entry=>entry[1]);
  case 'fromArrays':{if(args.keys.length!==args.values.length)fail('MAP_LENGTH_MISMATCH','Map key and value counts differ');const seen=new Set();return {tag:'Map',value:args.keys.map((key,i)=>{if(seen.has(key))fail('DUPLICATE_MAP_KEY','Map keys must be unique');seen.add(key);return [key,args.values[i]];})};}
 }
 fail('MISSING_CONTRACT','Unknown typed map operation');
}
const encode=type=>Array.from(type,char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('');
export function typedMapContractId(operation,key,value){
 if(!mapContractTemplate('std.map.'+operation))fail('MISSING_CONTRACT','Unknown typed map operation');
 if(controlTypeName(parseControlType('Map<'+key+','+value+'>'))!=='Map<'+key+','+value+'>')fail('UNKNOWN_TYPE','Typed map requires canonical finite types');
 return 'std.map.'+operation+'.K'+encode(key)+'.V'+encode(value);
}
export function resolveTypedMapContract(id){
 const match=typeof id==='string'&&/^std\.map\.([A-Za-z]+)\.K([0-9a-f]+)\.V([0-9a-f]+)$/.exec(id);if(!match||!mapContractTemplate('std.map.'+match[1])||match.slice(2).some(part=>part.length%2||part.length>8192))return null;
 const decode=hex=>hex.match(/../g).map(byte=>String.fromCharCode(parseInt(byte,16))).join(''),key=decode(match[2]),value=decode(match[3]);if(typedMapContractId(match[1],key,value)!==id)return null;
 const template=mapContractTemplate('std.map.'+match[1]),convert=source=>{if(source==='K')return key;if(source==='V')return value;return controlTypeName(parseControlType(source.replaceAll('K',key).replaceAll('V',value)));},inputs=Object.fromEntries(Object.entries(template.inputs).map(([name,type])=>[name,convert(type)])),output=convert(template.output),execute=args=>mapOperation(match[1],args,fail),emitJS=args=>`(${mapOperation.toString()})(${JSON.stringify(match[1])},{${Object.keys(inputs).map(name=>JSON.stringify(name)+':'+args[name]).join(',')}},__fail)`;
 witnesses.set(execute,{id,inputs:JSON.stringify(inputs),output,emitJS});
 return {id,version:'1.0.0',inputs,output,valueProfile:'ems-algebraic/1',effects:[],capabilities:[],description:template.description,execute,emitJS};
}
export function typedMapIntrinsic(contract){const witness=witnesses.get(contract?.execute);return !!witness&&contract.kind==='atomic'&&contract.id===witness.id&&contract.version==='1.0.0'&&JSON.stringify(contract.inputs)===witness.inputs&&contract.output===witness.output&&contract.emitJS===witness.emitJS&&contract.valueProfile==='ems-algebraic/1'&&!contract.effects.length&&!contract.capabilities.length&&contract.interfaceBoundary===null;}

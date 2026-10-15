import {fail} from '../reference/errors.mjs';
import {Registry} from '../reference/registry.mjs';
export const INVARIANT_GUARD='ems.kernel.invariant';
const witnesses=new WeakMap();
/** Linker-owned terminal check. It cannot be replaced by caller metadata. */
export function instanceRegistry(base){
 const registry=new Registry();for(const [id,item]of base.items)registry.items.set(id,item);
 if(registry.items.has(INVARIANT_GUARD))fail('RESERVED_CONTRACT','Instance invariant guard is reserved');
 const inputs={condition:'Boolean',instance:'String',invariant:'String',phase:'String'},execute=({condition,instance,invariant,phase})=>{if(!condition)fail('INVARIANT_VIOLATION','Contract invariant rejected the state',{instance,invariant,phase});return true;},emitJS=args=>`(()=>{if(!${args.condition})__fail('INVARIANT_VIOLATION','Contract invariant rejected the state',{instance:${args.instance},invariant:${args.invariant},phase:${args.phase}});return true;})()`;
 registry.registerAtomic({id:INVARIANT_GUARD,inputs,output:'Boolean',execute,emitJS});const item=registry.resolve(INVARIANT_GUARD);witnesses.set(item.execute,item);return registry;
}
export function invariantIntrinsic(item){return witnesses.get(item?.execute)===item;}

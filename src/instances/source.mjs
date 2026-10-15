import {printControlProgram} from '../frontend/print-control.mjs';
import {uiSymbolSource} from '../frontend/index.mjs';
import {validateInstanceModule} from './module.mjs';
import {instanceSlot} from './names.mjs';
import {printInstanceUISource,compileInstanceSource} from './ui-source.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
const path=id=>id.split('.').map(uiSymbolSource).join('::');
/** Current semantic module to native EMS; sourceArchive and canvas data are never inputs. */
export function printInstanceSource(module,ui=null,base=createCoreRegistry()){
 const checked=validateInstanceModule(module,base),state=new Map(),helpers=[],used=new Set([...module.definitions,...module.instances].map(item=>item.id));let next=0;
 function emit(program,registry,seed,options={}){let prefix=seed,index=0;while(program.functions.some((_,i)=>used.has(prefix+'_'+String(i).padStart(4,'0'))))prefix=seed+'_'+(++index);const result=printControlProgram(program,registry,{prefix,...options});for(const name of result.names.values())used.add(name);return result;}
 for(const instance of module.instances){const def=checked.definitions.get(instance.contract);for(const field of def.fields)for(const operation of ['read','write'])state.set('state.'+instanceSlot(instance.id,field.name)+'.'+operation,[instance.id,field.name,operation].map(uiSymbolSource).join('::'));}
 const body=emit(module.program,checked.registry,'_ems_text_body',{contractName:id=>state.get(id)??path(id)});helpers.push(body.source);
 function pure(program){const result=emit(program,base,'_ems_text_pure_'+String(next++).padStart(4,'0'));helpers.push(result.source);return '@'+result.entry;}
 const lines=['// Current EMS program. Generated from semantic IR; editable with the EMS parser.','package '+JSON.stringify(module.id)+' @ "1.0.0";',''];
 for(const def of module.definitions){lines.push('@'+path(def.id)+' {');for(const field of def.fields)lines.push('    '+uiSymbolSource(field.name)+': '+field.type+' = '+pure(field.initializer)+';');for(const invariant of def.invariants)lines.push('    ? '+uiSymbolSource(invariant.id)+' = '+pure(invariant.program)+';');for(const action of def.transitions)lines.push('    +'+uiSymbolSource(action.name)+'('+action.inputs.map(input=>uiSymbolSource(input.name)+': '+input.type).join(', ')+') -> '+action.output.type+';');lines.push('}','');}
 for(const instance of module.instances){lines.push('@'+path(instance.contract)+' #'+uiSymbolSource(instance.id)+' {');for(const initial of instance.initials)lines.push('    '+uiSymbolSource(initial.field)+': '+pure(initial.program)+';');for(const action of instance.transitions)lines.push('    +'+uiSymbolSource(action.name)+' = @'+body.names.get(action.entry)+';');lines.push('}','');}
 lines.push(...helpers);if(ui)lines.push('',printInstanceUISource(module,ui,base));const source=lines.join('\n')+'\n';try{compileInstanceSource(source,base);}catch(error){fail(error.code==='SOURCE_LIMIT'?'INSTANCE_SOURCE_LIMIT':'INSTANCE_SOURCE_PROFILE','Current module cannot be represented in the native source profile',{cause:error.code,location:error.details?.location});}return source;
}

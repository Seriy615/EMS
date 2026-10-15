import {instanceOptions} from './options.mjs';
import {compileReactorJS} from '../compiler/reactor.mjs';
import {compileIRToJS} from '../ir/index.mjs';
import {validateInstanceModule,linkInstanceBoundary} from './module.mjs';
import {instanceEvent,instanceSlot} from './names.mjs';
import {instanceLayout,InstanceSession} from './runtime.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
/** Independent code contains the same checked boundaries and transaction kernel. Build executes no initializer. */
export function compileInstanceModuleJS(module,base=createCoreRegistry()){
 const checked=validateInstanceModule(module,base),initial=linkInstanceBoundary(module,null,base,{initial:true}),wrappers=[],initializers=[];
 for(const [index,item]of checked.initials.entries()){const name='ems_init'+index;wrappers.push('const '+name+'=(()=>{'+compileIRToJS(item.program,base).replace('export function execute(','function execute(')+'\nreturn execute;})();');initializers.push('{id:'+JSON.stringify(item.slot)+',type:'+JSON.stringify(item.type)+',initial:'+name+'({},creationOptions)}');}
 const creation='const ems_creation=(()=>{'+compileIRToJS(initial.ir,initial.registry).replace('export function execute(','function execute(')+'\nreturn execute;})();';
 const handlers=checked.transitions.map(action=>({event:instanceEvent(action.instance,action.name),program:linkInstanceBoundary(module,action,base).ir})),reactor=compileReactorJS({schemaVersion:'ems-reactor/2',id:module.id,version:module.version,state:checked.slots,handlers},initial.registry,{dynamicInitialState:true}).replace(/^export function (createSession|checkSessionPolicy)\(/gm,'function $1(').replace(/^export \{replayEvents\};$/m,'');
 // Helpers remain inside the reactor closure, so independent modules do not collide with application names.
 const owner=`const ems_owner=(()=>{${reactor}\nreturn {createSession,checkSessionPolicy,controlBudgetOptions,createWorkBudget,checkCancellation,assertSignal,fail,assertStateValue};})();`;
 const source=`// EMS statically linked contract instances. No EMS imports or service dependency.\n${wrappers.join('\n')}\n${creation}\n${owner}\n${instanceSlot.toString()}\n${instanceEvent.toString()}\n${InstanceSession.toString()}\nconst controlBudgetOptions=ems_owner.controlBudgetOptions,assertSignal=ems_owner.assertSignal,fail=ems_owner.fail;\n${instanceOptions.toString()}\nexport async function createSession({policy={},maxSteps=100000,maxDepth=64,maxQueue=64,recordTrace=false,signal}={}){const limits=instanceOptions({maxSteps,maxDepth,maxQueue,recordTrace,signal}),creationOptions={...limits,workBudget:ems_owner.createWorkBudget(limits.maxSteps),signal,capabilities:[],allowedEffects:[]};ems_owner.checkSessionPolicy(policy);await Promise.resolve();ems_owner.checkCancellation(signal);const state=[${initializers.join(',')}];for(const slot of state)ems_owner.assertStateValue(slot.initial,slot.type,'state.'+slot.id,'ems-reactor/2');ems_creation(Object.fromEntries(state.map(slot=>[slot.id,slot.initial])),creationOptions);const session=ems_owner.createSession({policy,maxQueue,recordTrace,...limits},state);return new InstanceSession(session,${JSON.stringify(instanceLayout(module))});}\n`;
 if(new TextEncoder().encode(source).length>2097152)throw Object.assign(Error('Instance standalone exceeds2MiB'),{code:'INSTANCE_LIMIT'});return source;
}

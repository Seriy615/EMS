import {assertStateValue} from '../runtime/state-values.mjs';
import {validateUIStyles} from './styles.mjs';
import {UIKernel,kinds,record,checkUIPolicy,createUIRuntimeLink} from './kernel.mjs';
export {renderUITree} from './kernel.mjs';
const clone=value=>structuredClone(value);
import {fail} from '../reference/errors.mjs';
import {assertValueType} from '../reference/types.mjs';
import {signatureIR,checkIRPolicy} from '../ir/index.mjs';
import {createStateRegistry,ReactorSession} from '../runtime/reactor.mjs';

function fields(value,keys,where){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_UI',`${where}: unexpected fields`);}
function bindingType(ref,slots,eventType,rich=false){
 record(ref,'binding');const keys=Object.keys(ref);
 if(keys.length===1&&Object.hasOwn(ref,'literal')){fields(ref,['literal'],'literal binding');return ref.literal;}
 if(Object.hasOwn(ref,'state')){
  const format=Object.hasOwn(ref,'format');fields(ref,format?['state','format']:['state'],'state binding');
  const slot=slots.get(ref.state);if(!slot)fail('UNKNOWN_STATE','Unknown UI state binding');
  if(format){if(ref.format==='json'&&rich)return '';if(ref.format!=='number'||slot.type!=='Number')fail('UI_BINDING_TYPE','Number formatting requires Number state');return '';}
  return clone(slot.initial);
 }
 if(keys.length===1&&ref.value===true){fields(ref,['value'],'event value binding');if(!eventType)fail('UI_BINDING_TYPE','Event value is unavailable here');return eventType==='String'?'':false;}
 fail('INVALID_UI','Unsupported UI binding');
}

/** Link a finite, platform-neutral UI tree to real typed EMS event programs. Performs no DOM or handler effects. */
export function linkUIApplication(application,baseRegistry,{policy={},maxQueue=64,recordTrace=false}={}){
 fields(application,['schemaVersion','id','version','reactor','ui'],'application');
 if(!['ems-ui-app/1','ems-ui-app/2'].includes(application.schemaVersion)||typeof application.id!=='string'||!application.id||typeof application.version!=='string'||!application.version)fail('UI_VERSION','Invalid UI application identity/version');
 const rich=application.schemaVersion==='ems-ui-app/2';if(application.reactor?.schemaVersion!==(rich?'ems-reactor/2':'ems-reactor/1'))fail('UI_VERSION','UI application and reactor versions disagree');
 const registry=createStateRegistry(baseRegistry,application.reactor?.state,application.reactor?.schemaVersion);
 // Reactor performs the authoritative manifest/state/binding/IR checks, without invoking handlers.
 const session=new ReactorSession(application.reactor,registry,{policy,maxQueue,recordTrace});
 const slots=new Map(application.reactor.state.map(slot=>[slot.id,slot]));
 const handlers=new Map(application.reactor.handlers.map(handler=>[handler.event,signatureIR(handler.program,registry)]));
 fields(application.ui,['schemaVersion','root'],'UI tree');if(application.ui.schemaVersion!=='ems-ui/1')fail('UI_VERSION','Unsupported UI tree version');
 const nodes=new Map();let count=0;
 function visit(node,depth){
  if(++count>1000||depth>32)fail('UI_LIMIT','UI tree size/depth limit');
  fields(node,['id','kind','props','events','children'],'UI node');
  if(typeof node.id!=='string'||!/^[-A-Za-z0-9_.]+$/.test(node.id)||nodes.has(node.id))fail('INVALID_UI','Invalid or duplicate UI node ID');
  const spec=typeof node.kind==='string'&&Object.hasOwn(kinds,node.kind)?kinds[node.kind]:null;if(!spec)fail('UNSUPPORTED_UI','Unsupported semantic UI kind');nodes.set(node.id,node);
  record(node.props,'properties');record(node.events,'events');validateUIStyles(node.props);
  if(!Array.isArray(node.children)||Object.keys(node.children).length!==node.children.length||(!spec.children&&node.children.length))fail('INVALID_UI','Invalid UI children');
  for(const required of spec.required??[])if(!Object.hasOwn(node.props,required))fail('INVALID_UI','Missing required UI property');
  for(const [name,ref]of Object.entries(node.props)){const type=spec.props[name];if(!type)fail('UNSUPPORTED_UI','Unsupported semantic property');assertValueType(bindingType(ref,slots,undefined,rich),type,`ui.${node.id}.${name}`);}
  for(const [event,binding]of Object.entries(node.events)){
   if(event!==spec.event)fail('UNSUPPORTED_UI','Unsupported semantic event');fields(binding,['handler','inputs'],'event binding');
   const signature=handlers.get(binding.handler);if(!signature)fail('UNKNOWN_EVENT','Unknown UI handler');record(binding.inputs,'event inputs');
   if(Object.keys(binding.inputs).sort().join(',')!==Object.keys(signature.inputs).sort().join(','))fail('UI_EVENT_TYPE','UI event inputs disagree with handler');
   for(const [name,ref]of Object.entries(binding.inputs))assertStateValue(bindingType(ref,slots,spec.value,rich),signature.inputs[name].type,`ui.${node.id}.${event}.${name}`,application.reactor.schemaVersion);
  }
  for(const child of node.children)visit(child,depth+1);
 }
 visit(application.ui.root,0);
 return {...createUIRuntimeLink(application,session),registry};
}

/** Owns one interpreted reactor after authoritative UI/IR linking and policy preflight. */
export class UIRuntime extends UIKernel{
 constructor(application,registry,{policy={},maxQueue=64,recordTrace=false}={}){
  checkUIPolicy(policy);
  const link=linkUIApplication(application,registry,{policy,maxQueue,recordTrace});
  for(const handler of link.application.reactor.handlers)checkIRPolicy(handler.program,link.registry,policy);
  super(link);
 }
}

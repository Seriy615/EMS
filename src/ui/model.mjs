import {fail} from '../reference/errors.mjs';
import {assertValueType} from '../reference/types.mjs';
import {signatureIR,checkIRPolicy} from '../ir/index.mjs';
import {assertPolicyNames} from '../semantics/effects.mjs';
import {createStateRegistry,ReactorSession} from '../runtime/reactor.mjs';

const kinds=Object.freeze({
 column:{props:{label:'String'},children:true},row:{props:{label:'String'},children:true},
 text:{props:{text:'String',label:'String'},required:['text']},
 button:{props:{text:'String',label:'String',disabled:'Boolean'},required:['text'],event:'press'},
 textInput:{props:{value:'String',label:'String',disabled:'Boolean'},required:['value','label'],event:'change',value:'String'},
 checkbox:{props:{checked:'Boolean',label:'String',disabled:'Boolean'},required:['checked','label'],event:'change',value:'Boolean'}
});
const clone=value=>structuredClone(value);
function fields(value,keys,where){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('INVALID_UI',`${where}: unexpected fields`);}
function record(value,where){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(key=>typeof key!=='string'))fail('INVALID_UI',`${where}: expected record`);}
function bindingType(ref,slots,eventType){
 record(ref,'binding');const keys=Object.keys(ref);
 if(keys.length===1&&Object.hasOwn(ref,'literal')){fields(ref,['literal'],'literal binding');return ref.literal;}
 if(Object.hasOwn(ref,'state')){
  const format=Object.hasOwn(ref,'format');fields(ref,format?['state','format']:['state'],'state binding');
  const slot=slots.get(ref.state);if(!slot)fail('UNKNOWN_STATE','Unknown UI state binding');
  if(format){if(ref.format!=='number'||slot.type!=='Number')fail('UI_BINDING_TYPE','Number formatting requires Number state');return '';}
  return clone(slot.initial);
 }
 if(keys.length===1&&ref.value===true){fields(ref,['value'],'event value binding');if(!eventType)fail('UI_BINDING_TYPE','Event value is unavailable here');return eventType==='String'?'':false;}
 fail('INVALID_UI','Unsupported UI binding');
}
function valueOf(ref,snapshot,eventValue){
 if(Object.hasOwn(ref,'literal'))return clone(ref.literal);
 if(Object.hasOwn(ref,'value'))return clone(eventValue);
 const value=clone(snapshot[ref.state]);return ref.format==='number'?(Object.is(value,-0)?'-0':String(value)):value;
}

/** Link a finite, platform-neutral UI tree to real typed EMS event programs. Performs no DOM or handler effects. */
export function linkUIApplication(application,baseRegistry,{policy={},maxQueue=64,recordTrace=false}={}){
 fields(application,['schemaVersion','id','version','reactor','ui'],'application');
 if(application.schemaVersion!=='ems-ui-app/1'||typeof application.id!=='string'||!application.id||typeof application.version!=='string'||!application.version)fail('UI_VERSION','Invalid UI application identity/version');
 const registry=createStateRegistry(baseRegistry,application.reactor?.state);
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
  record(node.props,'properties');record(node.events,'events');
  if(!Array.isArray(node.children)||Object.keys(node.children).length!==node.children.length||(!spec.children&&node.children.length))fail('INVALID_UI','Invalid UI children');
  for(const required of spec.required??[])if(!Object.hasOwn(node.props,required))fail('INVALID_UI','Missing required UI property');
  for(const [name,ref]of Object.entries(node.props)){const type=spec.props[name];if(!type)fail('UNSUPPORTED_UI','Unsupported semantic property');assertValueType(bindingType(ref,slots),type,`ui.${node.id}.${name}`);}
  for(const [event,binding]of Object.entries(node.events)){
   if(event!==spec.event)fail('UNSUPPORTED_UI','Unsupported semantic event');fields(binding,['handler','inputs'],'event binding');
   const signature=handlers.get(binding.handler);if(!signature)fail('UNKNOWN_EVENT','Unknown UI handler');record(binding.inputs,'event inputs');
   if(Object.keys(binding.inputs).sort().join(',')!==Object.keys(signature.inputs).sort().join(','))fail('UI_EVENT_TYPE','UI event inputs disagree with handler');
   for(const [name,ref]of Object.entries(binding.inputs))assertValueType(bindingType(ref,slots,spec.value),signature.inputs[name].type,`ui.${node.id}.${event}.${name}`);
  }
  for(const child of node.children)visit(child,depth+1);
 }
 visit(application.ui.root,0);
 const saved=clone(application);
 return {application:saved,registry,session,slots:new Map(saved.reactor.state.map(slot=>[slot.id,slot])),nodes:new Map([...nodes].map(([id])=>[id,find(saved.ui.root,id)]))};
}
function find(node,id){if(node.id===id)return node;for(const child of node.children){const result=find(child,id);if(result)return result;}}
export function renderUITree(link,snapshot){
 record(snapshot,'UI state snapshot');if(Object.keys(snapshot).sort().join(',')!==[...link.slots.keys()].sort().join(','))fail('UI_BINDING_TYPE','Snapshot does not match UI state');
 for(const [id,slot]of link.slots)assertValueType(snapshot[id],slot.type,`ui.state.${id}`);
 function visit(node){return {id:node.id,kind:node.kind,props:Object.fromEntries(Object.entries(node.props).map(([name,ref])=>[name,valueOf(ref,snapshot)])),children:node.children.map(visit)};}
 return visit(link.application.ui.root);
}

/** Owns one reactor. Platform adapters only render snapshots and forward typed semantic events. */
export class UIRuntime{
 #link;#closed=false;
 constructor(application,registry,{policy={},maxQueue=64,recordTrace=false}={}){
  record(policy,'UI policy');
  assertPolicyNames(policy.capabilities??[],'capabilities');assertPolicyNames(policy.allowedEffects??[],'allowedEffects');
  if(!(policy.capabilities??[]).includes('ui.render'))fail('PERMISSION_DENIED','UI rendering requires ui.render',{capability:'ui.render'});
  if(!(policy.allowedEffects??[]).includes('ui.render'))fail('EFFECT_DENIED','UI rendering requires ui.render effect',{effect:'ui.render'});
  this.#link=linkUIApplication(application,registry,{policy,maxQueue,recordTrace});
  for(const handler of this.#link.application.reactor.handlers)checkIRPolicy(handler.program,this.#link.registry,policy);
 }
 snapshot(){return this.#link.session.snapshot();}
 view(){return renderUITree(this.#link,this.snapshot());}
 trace(){return this.#link.session.trace();}
 async dispatch(id,event,value,options={}){
  if(this.#closed)fail('SESSION_CLOSED','UI runtime is closed');const node=this.#link.nodes.get(id),binding=node?.events[event];if(!binding)fail('UNKNOWN_EVENT','Unknown UI node/event');
  const snapshot=this.snapshot();if(node.props.disabled&&valueOf(node.props.disabled,snapshot))fail('UI_EVENT_DISABLED','UI element is disabled');
  const spec=kinds[node.kind];if(spec.value)assertValueType(value,spec.value,`ui.${id}.${event}.value`);else if(value!==undefined)fail('UI_EVENT_TYPE','This event has no value');
  return this.#link.session.dispatch(binding.handler,Object.fromEntries(Object.entries(binding.inputs).map(([name,ref])=>[name,valueOf(ref,snapshot,value)])),options);
 }
 async close(){this.#closed=true;await this.#link.session.close();}
}

import {UI_STYLE_TYPES} from './styles.mjs';
import {fail} from '../reference/errors.mjs';
import {assertValueType} from '../reference/types.mjs';
import {assertPolicyNames} from '../semantics/effects.mjs';

export const kinds=Object.freeze({
 column:{props:{label:'String'},children:true},row:{props:{label:'String'},children:true},
 text:{props:{text:'String',label:'String'},required:['text']},
 button:{props:{text:'String',label:'String',disabled:'Boolean'},required:['text'],event:'press'},
 textInput:{props:{value:'String',label:'String',disabled:'Boolean'},required:['value','label'],event:'change',value:'String'},
 checkbox:{props:{checked:'Boolean',label:'String',disabled:'Boolean'},required:['checked','label'],event:'change',value:'Boolean'}
});
for(const kind of Object.values(kinds))Object.assign(kind.props,UI_STYLE_TYPES);
for(const spec of Object.values(kinds)){Object.freeze(spec.props);if(spec.required)Object.freeze(spec.required);Object.freeze(spec);}
const clone=value=>structuredClone(value);
export function record(value,where){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(key=>typeof key!=='string'))fail('INVALID_UI',`${where}: expected record`);}
export function valueOf(ref,snapshot,eventValue){
 if(Object.hasOwn(ref,'literal'))return clone(ref.literal);
 if(Object.hasOwn(ref,'value'))return clone(eventValue);
 const value=clone(snapshot[ref.state]);return ref.format==='number'?(Object.is(value,-0)?'-0':String(value)):value;
}

export function checkUIPolicy(policy){
 record(policy,'UI policy');
 assertPolicyNames(policy.capabilities??[],'capabilities');assertPolicyNames(policy.allowedEffects??[],'allowedEffects');
 if(!(policy.capabilities??[]).includes('ui.render'))fail('PERMISSION_DENIED','UI rendering requires ui.render',{capability:'ui.render'});
 if(!(policy.allowedEffects??[]).includes('ui.render'))fail('EFFECT_DENIED','UI rendering requires ui.render effect',{effect:'ui.render'});
}
/** Internal adapter: only supply an application already validated by the semantic linker. */
export function createUIRuntimeLink(application,session){
 const saved=clone(application),nodes=new Map();
 function visit(node){nodes.set(node.id,node);for(const child of node.children)visit(child);}
 visit(saved.ui.root);
 return {application:saved,session,slots:new Map(saved.reactor.state.map(slot=>[slot.id,slot])),nodes};
}
export function renderUITree(link,snapshot){
 record(snapshot,'UI state snapshot');if(Object.keys(snapshot).sort().join(',')!==[...link.slots.keys()].sort().join(','))fail('UI_BINDING_TYPE','Snapshot does not match UI state');
 for(const [id,slot]of link.slots)assertValueType(snapshot[id],slot.type,`ui.state.${id}`);
 function visit(node){return {id:node.id,kind:node.kind,props:Object.fromEntries(Object.entries(node.props).map(([name,ref])=>[name,valueOf(ref,snapshot)])),children:node.children.map(visit)};}
 return visit(link.application.ui.root);
}

/** Shared semantic UI event/render lifecycle for interpreted and compiled sessions. */
export class UIKernel{
 #link;#closed=false;
 constructor(link){this.#link=link;}
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

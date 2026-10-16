import {fail} from '../reference/errors.mjs';
import {UIRuntime} from './model.mjs';
const mounted=new WeakMap();

/** Capability-checked DOM adapter for the finite semantic UI tree; owns its subtree and event lifecycle. */
export function mountDOMApplication(host,application,registry,{onError=()=>{},...options}={}){
 if(!host?.ownerDocument||typeof host.replaceChildren!=='function'||typeof onError!=='function')fail('INVALID_UI','DOM host and error callback required');
 if(mounted.has(host))fail('UI_HOST_BUSY','DOM host already owns a mounted EMS application');
 return mountDOMRuntime(host,application,new UIRuntime(application,registry,options),{onError});
}

/** Render an already checked local or worker runtime with the same semantic DOM/event mapping. */
export function mountDOMRuntime(host,application,runtime,{onError=()=>{}}={}){
 if(!host?.ownerDocument||typeof host.replaceChildren!=='function'||typeof onError!=='function')fail('INVALID_UI','DOM host and error callback required');
 if(mounted.has(host))fail('UI_HOST_BUSY','DOM host already owns a mounted EMS application');
 const document=host.ownerDocument,nodes=new Map(),listeners=[],pending=new Set();let closed=false,closing;
 const tags={column:'div',row:'div',text:'span',button:'button',textInput:'input',checkbox:'input'};
 function make(view){const element=document.createElement(tags[view.kind]);element.dataset.emsUi=view.id;element.dataset.emsKind=view.kind;nodes.set(view.id,element);if(view.kind==='text'){element.style.whiteSpace='pre-wrap';element.style.overflowWrap='anywhere';}if(view.kind==='button')element.type='button';if(view.kind==='textInput')element.type='text';if(view.kind==='checkbox')element.type='checkbox';if(view.kind==='column'||view.kind==='row'){element.style.display='flex';element.style.flexDirection=view.kind==='column'?'column':'row';}for(const child of view.children)element.append(make(child));return element;}
 function update(view){const element=nodes.get(view.id),props=view.props;for(const name of ['backgroundColor','color','borderColor','fontFamily','borderRadius','borderWidth','fontSize','padding','gap','width','height'])if(Object.hasOwn(props,name)){element.style[name]=typeof props[name]==='number'?props[name]+'px':props[name];if(name==='borderWidth')element.style.borderStyle='solid';}if(Object.hasOwn(props,'text'))element.textContent=props.text;if(Object.hasOwn(props,'value')&&element.value!==props.value)element.value=props.value;if(Object.hasOwn(props,'checked'))element.checked=props.checked;if(Object.hasOwn(props,'disabled'))element.disabled=props.disabled;if(Object.hasOwn(props,'label'))element.setAttribute('aria-label',props.label);for(const child of view.children)update(child);}
 async function dispatch(id,event,value,options){try{return await runtime.dispatch(id,event,value,options);}finally{if(!closed)update(runtime.view());}}
 function listen(node){const element=nodes.get(node.id);for(const event of Object.keys(node.events)){const domEvent=event==='press'?'click':node.kind==='textInput'?'input':'change';const listener=()=>{if(closed)return;const value=event==='press'?undefined:node.kind==='checkbox'?element.checked:element.value;const job=dispatch(node.id,event,value).catch(async error=>{try{await onError(error);}catch{ /* Error observers cannot leave an unhandled event rejection. */ }});pending.add(job);job.finally(()=>pending.delete(job));};element.addEventListener(domEvent,listener);listeners.push([element,domEvent,listener]);}for(const child of node.children)listen(child);}
 const view=runtime.view(),root=make(view);update(view);listen(application.ui.root);host.replaceChildren(root);mounted.set(host,root);
 return Object.freeze({runtime,dispatch,refresh:()=>{if(!closed)update(runtime.view());},idle:async()=>{while(pending.size)await Promise.all([...pending]);},close:()=>{if(closing)return closing;closed=true;for(const [element,event,listener]of listeners)element.removeEventListener(event,listener);if(root.parentNode===host)root.remove();if(mounted.get(host)===root)mounted.delete(host);closing=(async()=>{await runtime.close();await Promise.all([...pending]);})();return closing;}});
}

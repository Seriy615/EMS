import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {signatureIR} from '../src/ir/index.mjs';
const $=id=>document.getElementById(id),text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
const defaults={column:{},row:{},text:{text:{literal:'Текст'}},button:{text:{literal:'Кнопка'}},textInput:{value:{literal:''},label:{literal:'Поле'}},checkbox:{checked:{literal:false},label:{literal:'Флажок'}}};
const properties={column:{label:'String'},row:{label:'String'},text:{text:'String',label:'String'},button:{text:'String',label:'String',disabled:'Boolean'},textInput:{value:'String',label:'String',disabled:'Boolean'},checkbox:{checked:'Boolean',label:'String',disabled:'Boolean'}};
function nodes(root){return [root,...root.children.flatMap(nodes)];}
function fill(select,values){const previous=select.value;select.replaceChildren();for(const value of values){const option=text('option',value);option.value=value;select.append(option);}if(values.includes(previous))select.value=previous;}
function literal(value,type){return type==='String'?value:JSON.parse(value);}
function binding(mode,value,type){return mode==='literal'?{literal:literal(value,type)}:mode==='state'?{state:value}:mode==='number'?{state:value,format:'number'}:{value:true};}
/** Forms edit the same validated UI program; DOM preview contains no authoring-only business logic. */
export function installUIAuthoring(getEditor,change,report){
 let selected=null;
 function selectedNode(){return nodes(getEditor().application.ui.root).find(node=>node.id===$('widget-select').value);}
 function propertyChoices(){const node=selectedNode();fill($('property-name'),Object.keys(properties[node?.kind]??{}));}
 function eventChoices(){
  const editor=getEditor(),app=editor.application,handler=app.reactor.handlers.find(item=>item.event===$('event-handler').value);$('event-inputs').replaceChildren();if(!handler)return;
  const signature=signatureIR(handler.program,createStateRegistry(editor.base,app.reactor.state));
  for(const [port,spec]of Object.entries(signature.inputs)){
   const row=document.createElement('label');row.append(text('span',port+' : '+spec.type));
   const mode=document.createElement('select');mode.dataset.eventMode=port;for(const value of ['literal','state','value',...(spec.type==='String'?['number']:[])]){const option=text('option',({literal:'Значение',state:'Состояние',value:'Значение события',number:'Число → текст'})[value]);option.value=value;mode.append(option);}
   const value=document.createElement('input');value.dataset.eventValue=port;value.value=spec.type==='String'?'':spec.type==='Boolean'?'false':spec.type==='NumberArray'?'[]':'0';const existing=selectedNode()?.events?.[selectedNode()?.kind==='button'?'press':'change'];if(existing?.handler===handler.event){const ref=existing.inputs[port];if(ref){if(Object.hasOwn(ref,'literal')){mode.value='literal';value.value=spec.type==='String'?ref.literal:Object.is(ref.literal,-0)?'-0':JSON.stringify(ref.literal);}else if(ref.state){mode.value=ref.format==='number'?'number':'state';value.value=ref.state;}else mode.value='value';}}row.append(mode,value);$('event-inputs').append(row);
  }
 }
 function refresh(){
  const editor=getEditor(),app=editor.application,all=nodes(app.ui.root);fill($('widget-parent'),all.filter(node=>['column','row'].includes(node.kind)).map(node=>node.id));fill($('widget-select'),all.map(node=>node.id));if(selected&&all.some(node=>node.id===selected))$('widget-select').value=selected;propertyChoices();
  fill($('event-handler'),app.reactor.handlers.map(handler=>handler.event));eventChoices();$('state-list').replaceChildren();for(const slot of app.reactor.state)$('state-list').append(text('p',slot.id+' : '+slot.type+' = '+(Object.is(slot.initial,-0)?'-0':typeof slot.initial==='string'?slot.initial:JSON.stringify(slot.initial))));
  fill($('handler-select'),app.reactor.handlers.map(handler=>handler.event));$('handler-inspect').textContent=JSON.stringify(selectedNode()?.events??{},null,2);
 }
 const action=operation=>{change(operation).catch(report);};
 $('add-state-ui').onclick=()=>action(editor=>editor.addState($('state-id').value,$('state-type').value,literal($('state-initial').value,$('state-type').value)));
 $('add-widget').onclick=()=>action(editor=>{const id=$('widget-id').value,kind=$('widget-kind').value;editor.addNode($('widget-parent').value,{id,kind,props:structuredClone(defaults[kind]),events:{},children:[]});selected=id;});
 $('remove-widget').onclick=()=>action(editor=>editor.removeNode($('widget-select').value));
 $('widget-select').onchange=()=>{selected=$('widget-select').value;propertyChoices();$('handler-inspect').textContent=JSON.stringify(selectedNode()?.events??{},null,2);};
 $('set-property').onclick=()=>action(editor=>{const node=selectedNode(),name=$('property-name').value;editor.property(node.id,name,binding($('property-mode').value,$('property-value').value,properties[node.kind][name]));});
 $('event-handler').onchange=eventChoices;
 $('set-event').onclick=()=>action(editor=>{const node=selectedNode(),handler=$('event-handler').value,signature=signatureIR(editor.application.reactor.handlers.find(item=>item.event===handler).program,createStateRegistry(editor.base,editor.application.reactor.state)),inputs={};for(const [name,spec]of Object.entries(signature.inputs)){const mode=[...$('event-inputs').querySelectorAll('[data-event-mode]')].find(field=>field.dataset.eventMode===name).value,value=[...$('event-inputs').querySelectorAll('[data-event-value]')].find(field=>field.dataset.eventValue===name).value;inputs[name]=binding(mode,value,spec.type);}editor.event(node.id,node.kind==='button'?'press':'change',handler,inputs);});
 $('apply-handler').onclick=()=>action(editor=>editor.applyHandler($('handler-event').value,$('handler-source').value,$('handler-entry').value));
 $('load-handler').onclick=()=>{const editor=getEditor(),event=$('handler-select').value,draft=editor.sources[event];$('handler-event').value=event;if(draft){$('handler-source').value=draft.source;$('handler-entry').value=draft.entry;}else{$('handler-source').value='';$('handler-entry').value='';}$('handler-inspect').textContent=JSON.stringify(editor.application.reactor.handlers.find(handler=>handler.event===event)?.program,null,2);};
 $('application').addEventListener('click',event=>{const widget=event.target.closest('[data-ems-ui]');if(widget){selected=widget.dataset.emsUi;refresh();}});
 refresh();$('load-handler').click();return {refresh};
}

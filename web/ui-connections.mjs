import {uiConnections} from '../src/studio/ui-connections.mjs';
const $=id=>document.getElementById(id);
const describe=ref=>Object.hasOwn(ref,'literal')?(typeof ref.literal==='string'?JSON.stringify(ref.literal):Object.is(ref.literal,-0)?'-0':JSON.stringify(ref.literal)):ref.state?'данные '+ref.state:'значение события';
/** Navigable routes use the same selections, forms and transactional editor as the designer. */
export function installUIConnections(getEditor,authoring,designer){
 const stage=$('ui-design-stage'),canvas=$('ui-design-canvas'),host=document.createElement('section'),toggle=document.createElement('button');host.id='ui-connections';host.hidden=true;host.setAttribute('aria-label','Связи интерфейса и логики');stage.append(host);toggle.id='toggle-ui-connections';toggle.textContent='Связи UI ↔ логика';document.querySelector('.ui-title>div').append(toggle);
 let selected=$('widget-select').value;
 function show(active){host.hidden=!active;canvas.hidden=active;toggle.setAttribute('aria-pressed',String(active));toggle.textContent=active?'← К интерфейсу':'Связи UI ↔ логика';if(active){designer.openWindow('palette',false);designer.openWindow('properties',false);refresh();}}
 toggle.onclick=()=>show(host.hidden);
 const button=(label,action,attrs={})=>{const node=document.createElement('button');node.textContent=label;Object.assign(node.dataset,attrs);node.onclick=action;return node;};
 function pick(id,window){designer.select(id);designer.openWindow(window);}
 function property(ref){const node=button(ref.widget+' · '+ref.property,()=>{pick(ref.widget,'widgets');$('property-name').value=ref.property;$('property-name').dispatchEvent(new Event('change'));},{connectionProperty:ref.widget+'.'+ref.property});return node;}
 function refresh(){
  const routes=getEditor().connections??uiConnections(getEditor().application);host.replaceChildren();const heading=document.createElement('h2');heading.textContent='Связи приложения';const hint=document.createElement('p');hint.textContent='Выберите элемент или контракт в цепочке, чтобы изменить его. Стрелки показывают сохранённые связи; чтение и запись — возможные операции обработчика.';host.append(heading,hint);
  for(const event of routes.events){const row=document.createElement('article');row.className='ui-connection-route';row.dataset.connectionWidget=event.widget;row.classList.toggle('selected',event.widget===selected);const start=button(event.widget+' · '+({press:'Нажатие',change:'Изменение'}[event.event]??event.event),()=>pick(event.widget,'events'),{connectionEvent:event.widget});const handler=button('→ '+event.handler,()=>{designer.select(event.widget);authoring.openHandler(event.handler);},{connectionHandler:event.handler});const inputs=document.createElement('p');inputs.textContent=Object.entries(event.inputs).map(([port,ref])=>port+' = '+describe(ref)).join(' · ')||'Без входных данных';const graph=button('Открыть граф',()=>document.dispatchEvent(new CustomEvent('ems:ui-open-graph',{detail:{event:event.handler}})),{openHandlerGraph:event.handler});row.append(start,handler,graph,inputs);
   const logic=routes.handlers.find(h=>h.event===event.handler);for(const [kind,states]of [['Читает',logic?.reads??[]],['Записывает',logic?.writes??[]]])for(const state of states){const group=document.createElement('div');group.className='ui-connection-state';const label=document.createElement('strong');label.textContent=kind+' → '+state;group.append(label);if(kind==='Записывает')for(const ref of routes.properties.filter(p=>p.state===state))group.append(property(ref));row.append(group);}host.append(row);
  }
  const bindings=document.createElement('h3');bindings.textContent='Данные → свойства интерфейса';host.append(bindings);for(const ref of routes.properties){const row=document.createElement('div');row.className='ui-connection-state';const label=document.createElement('span');label.textContent=ref.state+' → ';row.append(label,property(ref));host.append(row);}
  if(!routes.events.length){const empty=document.createElement('p');empty.textContent='События пока не связаны. Выберите кнопку на холсте и назначьте ей контракт обработки.';host.append(empty);}
 }
 document.addEventListener('ems:ui-show-connections',()=>show(true));
 document.addEventListener('ems:ui-selection',event=>{selected=event.detail.id;for(const row of host.querySelectorAll('[data-connection-widget]'))row.classList.toggle('selected',row.dataset.connectionWidget===selected);});
 document.addEventListener('ems:ui-open-handler',()=>{designer.openWindow('logic');if(getEditor().sources[$('handler-select').value])$('open-control-graph').click();});refresh();return {refresh,show};
}

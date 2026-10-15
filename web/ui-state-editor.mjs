const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
/** Initial values belong to the checked program; preview state changes only through EMS contracts. */
export function renderStateEditors(host,application,change,report){
 host.replaceChildren();
 for(const slot of application.reactor.state){
  const form=element('form'),label=element('label',slot.id+' · '+slot.type),input=element('input'),save=element('button','Сохранить значение');
  form.dataset.editState=slot.id;input.dataset.stateValue=slot.id;input.setAttribute('aria-label','Начальное значение '+slot.id);
  input.value=typeof slot.initial==='string'?slot.initial:Object.is(slot.initial,-0)?'-0':JSON.stringify(slot.initial);
  label.append(input);form.append(label,save);form.onsubmit=async event=>{event.preventDefault();try{const value=slot.type==='String'?input.value:JSON.parse(input.value);save.disabled=true;await change(slot.id,value);}catch(error){report(error);}finally{save.disabled=false;}};host.append(form);
 }
 if(!application.reactor.state.length)host.append(element('p','Переменных пока нет.'));
}

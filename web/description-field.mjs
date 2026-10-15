/** Shared documentation field for atomic calls and composite/control cards. */
export function descriptionField(value,placeholder,save,report){
 const form=document.createElement('form'),label=document.createElement('label'),field=document.createElement('textarea'),button=document.createElement('button');label.textContent='Описание';field.value=value;field.placeholder=placeholder;field.maxLength=2000;field.rows=3;field.dataset.contractDescription='';field.setAttribute('aria-label','Описание контракта');button.textContent='Сохранить описание';label.append(field);form.append(label,button);form.className='contract-description-form';
 for(const type of ['pointerdown','click','keydown'])form.addEventListener(type,event=>event.stopPropagation());
 form.onsubmit=async event=>{event.preventDefault();try{await save(field.value);}catch(error){report(error);}};return form;
}

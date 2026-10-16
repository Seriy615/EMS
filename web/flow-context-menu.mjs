/** The ordinary contract canvas menu; actions delegate to the existing editor. */
export function installFlowContextMenu({viewport,select,editor,change,cancelConnection,fit,openContract}){
 const menu=document.createElement('div');menu.id='flow-context-menu';menu.className='flow-context-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Действия с графом');document.body.append(menu);
 const close=()=>{menu.hidden=true;};
 function open(event,{disconnect}={}){
  event.preventDefault();cancelConnection();menu.replaceChildren();
  const card=event.target.closest('[data-flow-node]'),id=card?.dataset.flowNode,node=editor.workspace.graph.nodes.find(node=>node.id===id);
  if(id)select(id);
  const heading=document.createElement('strong');heading.textContent=disconnect?'Соединение':node?'Выбранный контракт':'Холст программы';menu.append(heading);
  const action=(text,work,disabled=false)=>{const button=document.createElement('button');button.textContent=text;button.type='button';button.setAttribute('role','menuitem');button.disabled=disabled;button.onclick=()=>{close();work();};menu.append(button);};
  if(disconnect)action('Удалить соединение',disconnect);
  if(node){
   action('Свойства контракта',()=>{select(id);document.body.classList.remove('hide-inspector');document.body.dataset.mobilePanel='inspector';});
   if(editor.project.contracts?.some(item=>item.graph.id===node.uses))action('Открыть граф контракта',()=>openContract(node.uses));
   action('Начинать отсюда',()=>change(()=>editor.setEntry(id)));
   action('Удалить контракт',()=>change(()=>editor.remove(id)));
  }
  action('Библиотека контрактов',()=>{document.body.classList.remove('hide-library');document.body.dataset.mobilePanel='library';document.getElementById('catalog-search').focus();});
  action('Показать весь граф',fit);
  menu.hidden=false;
  const rect=card?.getBoundingClientRect(),x=event.clientX||rect?.left||8,y=event.clientY||rect?.top||8;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();
 }
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();viewport.focus();}if(!menu.hidden&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);items[(index+(event.key==='ArrowDown'?1:items.length-1))%items.length].focus();}});
 return {open,close};
}

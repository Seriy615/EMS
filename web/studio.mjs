import {ProjectEditor,newProject,parseProject} from '/src/studio/project.mjs';
import {ProjectStorage} from '/src/studio/storage.mjs';
const $=id=>document.getElementById(id);
const titles={'core.add':'Сложение','core.sub':'Вычитание','core.mul':'Умножение','core.div':'Деление','core.sum':'Сумма массива','core.min':'Минимум','core.max':'Максимум'};
const el=(tag,text,style)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(style)node.className=style;return node;};
const identity=()=> 'p'+crypto.randomUUID().replaceAll('-','');
let store,editor,selected=null,pending=null,failedNode=null;
function report(error){$('error').textContent=`${error.code??'ERROR'}: ${error.message}`;}
try{store=new ProjectStorage(localStorage);editor=new ProjectEditor(store.load()??newProject(identity()));}catch(error){editor=new ProjectEditor(newProject(identity()));report(error);}
function projectList(){
 $('projects').replaceChildren();const current=el('option',editor.project.name);current.value=editor.project.id;$('projects').append(current);
 try{for(const project of store?.list()??[])if(project.id!==editor.project.id){const option=el('option',project.name);option.value=project.id;$('projects').append(option);}}catch{}
}
function save(){try{if(!store)throw new Error('Хранилище недоступно. Экспортируйте проект.');store.save(editor.project);$('save-status').textContent='Сохранено локально';}catch(error){$('save-status').textContent='Не сохранено — доступен экспорт';report(error);}projectList();}
function change(action,errorNode=null){try{action();$('error').textContent='';pending=null;failedNode=null;save();render();}catch(error){if(errorNode){failedNode=errorNode;selected=errorNode;render();}report(error);}}
function position(id,index=0){return editor.workspace.canvas.positions[id]??(id==='output'?{x:760,y:100}:{x:330,y:50+index*150});}
function view(){const v=editor.workspace.canvas.view;$('world').style.transform=`translate(${v.x}px,${v.y}px) scale(${v.scale})`;$('zoom').textContent=Math.round(v.scale*100)+'%';}
function port(ref,destination,title,type){
 const row=el('div',undefined,'port-row'),button=el('button',undefined,'port');button.type='button';button.title=`${title}: ${type}`;button.setAttribute('aria-label',`${ref?'Выход':'Вход'} ${title}`);
 button.dataset.port=ref?'out':destination.port;button.dataset.node=ref?(ref.node??`input:${ref.input}`):destination.id;
 if(ref){row.append(el('span',title,'port-label'),el('span',type,'type'),button);if(pending&&JSON.stringify(pending)===JSON.stringify(ref))button.classList.add('pending');button.onclick=event=>{event.stopPropagation();pending=ref;render();};}
 else{row.append(button,el('span',title,'port-label'),el('span',type,'type'));button.onclick=event=>{event.stopPropagation();if(!pending){$('connection-status').textContent='Сначала выберите выход.';return;}change(()=>editor.connect(pending,destination.id,destination.port),destination.id);};}
 return row;
}
function card(id,title,kind,index){
 const node=el('article',undefined,`card ${id.startsWith('input:')?'input-card':id==='output'?'output-card':''} ${selected===id?'selected':''} ${failedNode===id?'invalid':''}`),at=position(id,index);node.dataset.card=id;node.style.left=at.x+'px';node.style.top=at.y+'px';
 const header=el('header');header.append(el('strong',title),el('small',kind));node.append(header);
 node.onclick=()=>{selected=id;inspector();document.querySelectorAll('.card').forEach(card=>card.classList.toggle('selected',card.dataset.card===id));};
 header.onpointerdown=event=>{
  if(event.button!==0)return;event.stopPropagation();header.setPointerCapture(event.pointerId);const start={x:event.clientX,y:event.clientY};let final={...at};
  header.onpointermove=move=>{final={x:Math.max(10,at.x+(move.clientX-start.x)/editor.workspace.canvas.view.scale),y:Math.max(40,at.y+(move.clientY-start.y)/editor.workspace.canvas.view.scale)};node.style.left=final.x+'px';node.style.top=final.y+'px';wires();};
  header.onpointerup=()=>{header.onpointermove=null;header.onpointerup=null;if(final.x!==at.x||final.y!==at.y)change(()=>editor.move(id,final.x,final.y));};
  header.onpointercancel=()=>{header.onpointermove=null;header.onpointerup=null;render();};
 };return node;
}
function wires(){
 $('wires').replaceChildren();const graph=editor.workspace.graph,connections=graph.nodes.flatMap(node=>Object.entries(node.args).map(([port,ref])=>({id:node.id,port,ref})));connections.push({id:'output',port:'return',ref:graph.returns});
 for(const connection of connections){
  if(Object.hasOwn(connection.ref,'literal'))continue;const sourceId=connection.ref.node??`input:${connection.ref.input}`;
  const source=[...document.querySelectorAll('[data-port="out"]')].find(port=>port.dataset.node===sourceId),target=[...document.querySelectorAll('[data-port]')].find(port=>port.dataset.node===connection.id&&port.dataset.port===connection.port);if(!source||!target)continue;
  const origin=$('world').getBoundingClientRect(),a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),scale=editor.workspace.canvas.view.scale,x1=(a.x+a.width/2-origin.x)/scale,y1=(a.y+a.height/2-origin.y)/scale,x2=(b.x+b.width/2-origin.x)/scale,y2=(b.y+b.height/2-origin.y)/scale;
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.classList.add('wire');path.setAttribute('d',`M${x1},${y1} C${x1+70},${y1} ${x2-70},${y2} ${x2},${y2}`);path.dataset.connection=`${connection.id}.${connection.port}`;path.onclick=()=>change(()=>editor.disconnect(connection.id,connection.port));
  const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='Нажмите, чтобы удалить соединение';path.append(title);$('wires').append(path);
 }
}
function render(){
 $('nodes').replaceChildren();const graph=editor.workspace.graph;
 for(const [name,input]of Object.entries(graph.inputs)){const node=card(`input:${name}`,name,'вход');node.append(port({input:name},null,name,input.type));$('nodes').append(node);}
 graph.nodes.forEach((definition,index)=>{const contract=editor.registry.resolve(definition.uses),node=card(definition.id,titles[contract.id]??contract.id,contract.kind==='composite'?'граф':'атом',index);for(const [name,type]of Object.entries(contract.inputs))node.append(port(null,{id:definition.id,port:name},name,typeof type==='string'?type:type.type));node.append(port({node:definition.id},null,definition.id,contract.output));$('nodes').append(node);});
 const output=card('output','Результат функции','выход');output.append(port(null,{id:'output',port:'return'},'return',graph.output.type));$('nodes').append(output);
 $('project-name').value=editor.project.name;$('undo').disabled=!editor.history.length;$('redo').disabled=!editor.future.length;$('connection-status').textContent=pending?'Выберите вход. Esc — отменить.':'';view();catalog();inspector();$('scope').textContent=editor.selectedContract??'Основная программа';$('collapse').disabled=!editor.navigation.length;requestAnimationFrame(wires);
}
function json(value){if(Object.is(value,-0))return '-0';if(Array.isArray(value))return '['+value.map(json).join(',')+']';return JSON.stringify(value);}
function inspector(){
 const panel=$('inspector');panel.replaceChildren();if(!selected){panel.append(el('p','Выберите блок или вход функции.','hint'));return;}
 if(selected==='output'){panel.append(el('strong','Результат'),el('p',editor.workspace.graph.output.type),el('p',Object.hasOwn(editor.workspace.graph.returns,'literal')?'Значение: '+json(editor.workspace.graph.returns.literal):'Источник: '+(editor.workspace.graph.returns.node??editor.workspace.graph.returns.input)));const clear=el('button','Удалить соединение');clear.onclick=()=>change(()=>editor.disconnect('output','return'));panel.append(clear);return;}
 if(selected.startsWith('input:')){
  const name=selected.slice(6),input=editor.workspace.graph.inputs[name];if(!input){selected=null;return;}panel.append(el('strong',name),el('p',input.type));const field=el('textarea');field.value=json(editor.workspace.inputs[name]);field.dataset.inputValue=name;const apply=el('button','Применить значение');apply.onclick=()=>change(()=>editor.setInput(name,JSON.parse(field.value)));panel.append(el('label','Значение (JSON)'),field,apply);
 }else{
  const node=editor.workspace.graph.nodes.find(node=>node.id===selected);if(!node){selected=null;return;}const contract=editor.registry.resolve(node.uses);if(contract.kind==='composite'){const expand=el('button','Раскрыть граф');expand.id='expand';expand.onclick=()=>change(()=>{editor.openContract(contract.id);selected=null;});panel.append(expand);}panel.append(el('strong',titles[contract.id]??contract.id),el('p',`${contract.id} · ${node.id} → ${contract.output}`));
  for(const [name,ref]of Object.entries(node.args)){
   const section=el('div',undefined,'argument');section.append(el('label',`${name} · ${contract.inputs[name]}`));
   if(Object.hasOwn(ref,'literal')){const field=el('textarea');field.value=json(ref.literal);field.dataset.literal=name;const apply=el('button','Применить');apply.onclick=()=>change(()=>editor.literal(node.id,name,JSON.parse(field.value)));section.append(field,apply);}
   else{section.append(el('p',`Источник: ${ref.node??ref.input}`));const clear=el('button','Удалить соединение');clear.onclick=()=>change(()=>editor.disconnect(node.id,name));section.append(clear);}panel.append(section);
  }
 }
 const remove=el('button','Удалить блок','danger');remove.onclick=()=>change(()=>{editor.remove(selected);selected=null;});panel.append(remove);
}
function catalog(){
 $('catalog').replaceChildren();for(const contract of editor.registry.items.values()){
  const row=el('div',undefined,'catalog-item'),button=el('button',(titles[contract.id]??contract.id)+(contract.kind==='composite'?' ▧':''));button.dataset.contract=contract.id;button.onclick=()=>change(()=>{selected=editor.addNode(contract.id);});row.append(button);
  if(contract.kind==='composite'){
   const open=el('button','Открыть');open.dataset.openContract=contract.id;open.onclick=()=>change(()=>{editor.openContract(contract.id);selected=null;});
   const remove=el('button','Удалить');remove.dataset.deleteContract=contract.id;remove.onclick=()=>change(()=>{editor.removeComposite(contract.id);selected=null;});row.append(open,remove);
  }$('catalog').append(row);
 }
}
$('add-input').onsubmit=event=>{event.preventDefault();change(()=>{const name=$('input-name').value.trim();editor.addInput(name,$('input-type').value);selected=`input:${name}`;$('input-name').value='';});};
$('project-name').onchange=()=>change(()=>editor.edit(project=>{project.name=$('project-name').value;}));$('save').onclick=save;
$('new').onclick=()=>change(()=>{editor=new ProjectEditor(newProject(identity()));selected=null;$('output').textContent='Новый проект';});
$('projects').onchange=()=>change(()=>{const project=store.load($('projects').value);if(!project)throw new Error('Проект не найден');editor=new ProjectEditor(project);selected=null;});
$('undo').onclick=()=>change(()=>editor.undo());$('redo').onclick=()=>change(()=>editor.redo());
$('run').onclick=async()=>{ $('run').disabled=true;$('error').textContent='';const started=performance.now();try{$('output').textContent=json(await editor.run());}catch(error){$('output').textContent='Выполнение остановлено';report(error);}finally{$('duration').textContent=(performance.now()-started).toFixed(1)+' мс';$('run').disabled=false;} };
function zoom(factor){change(()=>{const view=editor.workspace.canvas.view;editor.viewport({...view,scale:Math.min(2,Math.max(.25,view.scale*factor))});});}
$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('viewport').onwheel=event=>{event.preventDefault();zoom(event.deltaY<0?1.1:1/1.1);};
$('viewport').onpointerdown=event=>{
 if(event.button!==0||event.target.closest('.card')||event.target.closest('.wire'))return;const viewport=$('viewport'),original={...editor.workspace.canvas.view},start={x:event.clientX,y:event.clientY};let next=original;viewport.setPointerCapture(event.pointerId);
 viewport.onpointermove=move=>{next={...original,x:original.x+move.clientX-start.x,y:original.y+move.clientY-start.y};$('world').style.transform=`translate(${next.x}px,${next.y}px) scale(${next.scale})`;};
 viewport.onpointerup=()=>{viewport.onpointermove=null;viewport.onpointerup=null;if(next!==original)change(()=>editor.viewport(next));};viewport.onpointercancel=()=>{viewport.onpointermove=null;viewport.onpointerup=null;view();};
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){pending=null;render();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();}});
$('export').onclick=()=>{try{const url=URL.createObjectURL(new Blob([editor.serialize()],{type:'application/json'})),anchor=el('a');anchor.href=url;anchor.download=editor.project.id+'.ems.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){report(error);}};
$('import').onclick=()=> $('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>4*1024*1024)throw new Error('Файл слишком большой');const source=await file.text();change(()=>{const project=parseProject(source);if(store?.list().some(saved=>saved.id===project.id)){project.id=identity();project.name=project.name.slice(0,180)+' (импорт)';}editor=new ProjectEditor(project);selected=null;});}catch(error){report(error);}$('file').value='';};
$('examples').onchange=async()=>{
 const choice=$('examples').value;if(!choice)return;try{const project=newProject(identity(),choice==='avg'?'Среднее пяти — арифметика':'Сумма двух чисел');
 if(choice==='avg'){project.graph=await fetch('/examples/avg5.graph.json').then(response=>response.json());project.inputs={times:[12.4,11.85,13.2,12.1,14]};}
 else{project.graph.inputs={a:{type:'Number'},b:{type:'Number'}};project.inputs={a:2,b:3};project.graph.nodes=[{id:'sum',uses:'core.add',args:{a:{input:'a'},b:{input:'b'}}}];project.graph.returns={node:'sum'};}
 Object.keys(project.graph.inputs).forEach((name,index)=>{project.canvas.positions[`input:${name}`]={x:30,y:100+index*130};});project.graph.nodes.forEach((node,index)=>{project.canvas.positions[node.id]={x:300+(index%2)*270,y:60+Math.floor(index/2)*200};});project.canvas.positions.output={x:850,y:150};change(()=>{editor=new ProjectEditor(project);selected=null;});
 }catch(error){report(error);}$('examples').value='';
};
window.addEventListener('resize',wires);projectList();render();

$('create-composite').onclick=()=>change(()=>{const id=$('composite-id').value.trim();editor.createComposite(id);$('composite-id').value='';});
$('collapse').onclick=()=>change(()=>{editor.collapse();selected=null;});
$('main-graph').onclick=()=>change(()=>{editor.main();selected=null;});
$('compile').onclick=()=>{try{const url=URL.createObjectURL(new Blob([editor.compile()],{type:'text/javascript'})),anchor=el('a');anchor.href=url;anchor.download=(editor.selectedContract??'program')+'.mjs';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){report(error);}};

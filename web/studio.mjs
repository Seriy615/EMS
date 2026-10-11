import {STANDARD_CONTRACTS} from '/src/stdlib/finite.mjs';
import {ProjectEditor,newProject,parseProject} from '/src/studio/project.mjs';
import {startStudioExecution} from '/src/studio/execution-client.mjs';
import {ProjectStorage} from '/src/studio/storage.mjs';
const $=id=>document.getElementById(id);
const titles={'core.add':'Сложение','core.sub':'Вычитание','core.mul':'Умножение','core.div':'Деление','core.sum':'Сумма массива','core.min':'Минимум','core.max':'Максимум'};
Object.assign(titles,{'std.logic.and':'И','std.logic.or':'Или','std.logic.not':'Не','std.number.equal':'Равно','std.number.notEqual':'Не равно','std.number.less':'Меньше','std.number.lessEqual':'Меньше или равно','std.number.greater':'Больше','std.number.greaterEqual':'Больше или равно','std.number.abs':'Модуль числа','std.number.floor':'Округлить вниз','std.number.ceil':'Округлить вверх','std.number.round':'Округлить','std.text.concat':'Соединить текст','std.text.equal':'Текст равен','std.text.length':'Длина текста','std.text.contains':'Текст содержит','std.text.slice':'Фрагмент текста','std.text.toNumber':'Текст → число','std.text.fromNumber':'Число → текст','std.array.length':'Длина массива','std.array.at':'Элемент массива','std.array.append':'Добавить элемент','std.array.concat':'Соединить массивы','std.array.reverse':'Обратить массив','std.array.sort':'Сортировать числа','std.array.slice':'Фрагмент массива','std.array.contains':'Массив содержит'});
for(const [type,title] of Object.entries({Number:'Число',Boolean:'Логическое значение',String:'Текст',NumberArray:'Числовой массив'})){titles['std.value.'+type]=title;titles['std.select.'+type]='Выбор: '+title.toLowerCase();}
const standardMetadata=new Map(STANDARD_CONTRACTS.map(item=>[item.id,item]));
const categories={number:'Числа',value:'Значения',logic:'Логика',comparison:'Сравнения',selection:'Выбор значения (входы вычислены)',text:'Текст',array:'Числовые массивы',custom:'Составные контракты'};
const el=(tag,text,style)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(style)node.className=style;return node;};
const identity=()=> 'p'+crypto.randomUUID().replaceAll('-','');
let store,editor,selected=null,pending=null,failedNode=null,textMode=false,textProjectId=null,textStorage;
let activeExecution=null;
async function executeStudio(action,draft,inputs){
 const job=startStudioExecution({action,project:editor.serialize(),selected:editor.selectedContract,draft,inputs});activeExecution=job;$('stop').disabled=false;
 try{return await job.promise;}finally{if(activeExecution===job)activeExecution=null;$('stop').disabled=true;}
}
$('stop').onclick=()=>activeExecution?.cancel();
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
 $('project-name').value=editor.project.name;$('undo').disabled=!editor.history.length;$('redo').disabled=!editor.future.length;$('connection-status').textContent=pending?'Выберите вход. Esc — отменить.':'';view();catalog();inspector();if(textMode&&textProjectId!==editor.project.id)syncTextProject();$('scope').textContent=editor.selectedContract??'Основная программа';$('collapse').disabled=!editor.navigation.length;requestAnimationFrame(wires);
}
function json(value){if(Object.is(value,-0))return '-0';if(Array.isArray(value))return '['+value.map(json).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+json(item)).join(',')+'}';return JSON.stringify(value);}
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
 $('catalog').replaceChildren();const query=$('catalog-search').value.trim().toLowerCase(),category=$('catalog-category').value;let count=0;
 for(const [key,title] of Object.entries(categories)){
  if(category&&category!==key)continue;let heading=false;
  for(const contract of editor.registry.items.values()){
   const metadata=standardMetadata.get(contract.id),group=contract.kind==='composite'?'custom':metadata?.category??(['core.sum','core.min','core.max'].includes(contract.id)?'array':'number');
   const signature=Object.entries(contract.inputs).map(([name,type])=>name+':'+(typeof type==='string'?type:type.type)).join(', ')+' → '+contract.output;
   if(group!==key||query&&!(contract.id+' '+(titles[contract.id]??'')+' '+signature).toLowerCase().includes(query))continue;
   if(!heading){$('catalog').append(el('h3',title));heading=true;}
   const row=el('div',undefined,'catalog-item'),button=el('button',(titles[contract.id]??contract.id)+(contract.kind==='composite'?' ▧':''));button.dataset.contract=contract.id;button.title=contract.id+' · '+signature+(metadata?' · '+metadata.summary:'');button.onclick=()=>change(()=>{selected=editor.addNode(contract.id);});row.append(button);
   if(contract.kind==='composite'){
    const open=el('button','Открыть');open.dataset.openContract=contract.id;open.onclick=()=>change(()=>{editor.openContract(contract.id);selected=null;});
    const remove=el('button','Удалить');remove.dataset.deleteContract=contract.id;remove.onclick=()=>change(()=>{editor.removeComposite(contract.id);selected=null;});row.append(open,remove);
   }
   row.append(el('small',signature,'signature'));$('catalog').append(row);count++;
  }
 }
 if(!count)$('catalog').append(el('p','Контракты не найдены.','hint'));
}
$('catalog-search').addEventListener('input',catalog);$('catalog-category').addEventListener('change',catalog);
$('add-input').onsubmit=event=>{event.preventDefault();change(()=>{const name=$('input-name').value.trim();editor.addInput(name,$('input-type').value);selected=`input:${name}`;$('input-name').value='';});};
$('project-name').onchange=()=>change(()=>editor.edit(project=>{project.name=$('project-name').value;}));$('save').onclick=save;
$('new').onclick=()=>change(()=>{editor=new ProjectEditor(newProject(identity()));selected=null;$('output').textContent='Новый проект';});
$('projects').onchange=()=>change(()=>{const project=store.load($('projects').value);if(!project)throw new Error('Проект не найден');editor=new ProjectEditor(project);selected=null;});
$('undo').onclick=()=>change(()=>editor.undo());$('redo').onclick=()=>change(()=>editor.redo());
$('run').onclick=async()=>{ $('run').disabled=true;$('error').textContent='';const started=performance.now();try{$('output').textContent=json(await executeStudio('graph'));}catch(error){$('output').textContent='Выполнение остановлено';report(error);}finally{$('duration').textContent=(performance.now()-started).toFixed(1)+' мс';$('run').disabled=false;} };
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
 else if(choice==='library'){const saved=parseProject(await fetch('/examples/studio-library.ems.json').then(response=>response.text()));saved.id=project.id;saved.name='Массив → текст';Object.assign(project,saved);}
 else{project.graph.inputs={a:{type:'Number'},b:{type:'Number'}};project.inputs={a:2,b:3};project.graph.nodes=[{id:'sum',uses:'core.add',args:{a:{input:'a'},b:{input:'b'}}}];project.graph.returns={node:'sum'};}
 Object.keys(project.graph.inputs).forEach((name,index)=>{project.canvas.positions[`input:${name}`]={x:30,y:100+index*130};});project.graph.nodes.forEach((node,index)=>{project.canvas.positions[node.id]={x:300+(index%2)*270,y:60+Math.floor(index/2)*200};});project.canvas.positions.output={x:850,y:150};change(()=>{editor=new ProjectEditor(project);selected=null;});
 }catch(error){report(error);}$('examples').value='';
};
window.addEventListener('resize',wires);projectList();render();

$('create-composite').onclick=()=>change(()=>{const id=$('composite-id').value.trim();editor.createComposite(id);$('composite-id').value='';});
$('collapse').onclick=()=>change(()=>{editor.collapse();selected=null;});
$('main-graph').onclick=()=>change(()=>{editor.main();selected=null;});
$('compile').onclick=()=>{try{const url=URL.createObjectURL(new Blob([editor.compile()],{type:'text/javascript'})),anchor=el('a');anchor.href=url;anchor.download=(editor.selectedContract??'program')+'.mjs';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){report(error);}};

// Text candidates compile through the ordinary EMS frontend and the same IR/runtime.
const textAPI=await import('/src/studio/text.mjs');

try{textStorage=new textAPI.TextDraftStorage(localStorage);}catch(error){report(error);}
function draft(){return {source:$('text-source').value,entry:$('text-entry').value.trim(),lowering:$('text-lowering').value,inputs:$('text-inputs').value};}
function setDraft(value){$('text-source').value=value.source;$('text-entry').value=value.entry;$('text-lowering').value=value.lowering;$('text-inputs').value=value.inputs;}
function saveDraft(){try{if(!textStorage)throw new Error('Хранилище черновика недоступно');textStorage.save(editor.project.id,draft());$('text-status').textContent='Черновик сохранён локально. Граф изменяется только после «Применить».';}catch(error){$('text-status').textContent='Черновик не сохранён';report(error);}}
function sourceError(error){report(error);const location=error.details?.location;if(location){$('error').textContent+='\nСтрока '+location.start.line+', столбец '+location.start.column;$('text-source').focus();$('text-source').setSelectionRange(location.start.offset,location.end.offset);}}
function syncTextProject(){const stored=textStorage?.load(editor.project.id);if(stored)setDraft(stored);else generateDraft();textProjectId=editor.project.id;}
function generateDraft(){const value=textAPI.textFromWorkspace(editor);setDraft({...value,inputs:json(editor.workspace.inputs)});textProjectId=editor.project.id;saveDraft();}
$('text-mode').onclick=()=>{
 try{if(!textMode&&textProjectId!==editor.project.id)syncTextProject();
 textMode=!textMode;document.body.classList.toggle('text-mode',textMode);$('text-panel').hidden=!textMode;$('text-mode').textContent=textMode?'Граф':'Текст';if(!textMode)render();}catch(error){sourceError(error);}
};
$('text-from-graph').onclick=()=>{try{generateDraft();$('error').textContent='';}catch(error){sourceError(error);}};
for(const id of ['text-source','text-entry','text-lowering','text-inputs'])$(id).addEventListener('input',saveDraft);
const graphRun=$('run').onclick;
$('run').onclick=async()=>{
 if(!textMode)return graphRun();$('run').disabled=true;$('error').textContent='';const started=performance.now();
 try{$('output').textContent=json(await executeStudio('text',draft(),JSON.parse($('text-inputs').value)));saveDraft();}catch(error){$('output').textContent='Выполнение остановлено';sourceError(error);}finally{$('duration').textContent=(performance.now()-started).toFixed(1)+' мс';$('run').disabled=false;}
};
$('text-ir').onclick=()=>{try{const bundle=textAPI.compileTextDraft(draft(),editor);$('output').textContent=JSON.stringify({ir:bundle.ir,provenance:bundle.provenance},null,2);$('error').textContent='';}catch(error){sourceError(error);}};
$('text-to-graph').onclick=()=>{try{const value=textAPI.projectFromText(draft(),editor,JSON.parse($('text-inputs').value));editor.edit(project=>Object.assign(project,value.project));selected=null;textMode=false;document.body.classList.remove('text-mode');$('text-panel').hidden=true;$('text-mode').textContent='Текст';save();render();$('error').textContent='';}catch(error){sourceError(error);}};
const graphCompile=$('compile').onclick;
$('compile').onclick=()=>{if(!textMode)return graphCompile();try{const url=URL.createObjectURL(new Blob([textAPI.compileTextJS(draft(),editor)],{type:'text/javascript'})),anchor=el('a');anchor.href=url;anchor.download='text-program.mjs';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){sourceError(error);}};

$('text-compile').onclick=()=>$('compile').click();

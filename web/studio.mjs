import {hasCollections} from '/src/studio/collections.mjs';
import {prepareStudioInspection,graphInspectionWitness} from '/src/studio/inspection-transport.mjs';
import {graphInspectionDeclarations} from '/src/runtime/graph-inspection.mjs';
import {controlInspectionDeclarations} from '/src/runtime/inspection.mjs';
import {captureSourceBreakpoint} from '/src/studio/source-anchors.mjs';
import {StudioDebuggerStorage,studioDebuggerContext,resolveStudioDebugger} from '/src/studio/debugger-storage.mjs';
import {breakpointForEvent} from '/src/studio/debugger.mjs';
import {breakpointAtTextOffset} from '/src/studio/breakpoints.mjs';
import {ProjectManager} from '/src/studio/manager.mjs';
import {STANDARD_CONTRACTS} from '/src/stdlib/finite.mjs';
import {ProjectEditor,newProject,parseProject} from '/src/studio/project.mjs';
import {startStudioExecution} from '/src/studio/execution-client.mjs';
import {ProjectStorage} from '/src/studio/storage.mjs';
const $=id=>document.getElementById(id);
const titles={'core.add':'Сложение','core.sub':'Вычитание','core.mul':'Умножение','core.div':'Деление','core.sum':'Сумма массива','core.min':'Минимум','core.max':'Максимум'};
Object.assign(titles,{'std.logic.and':'И','std.logic.or':'Или','std.logic.not':'Не','std.number.equal':'Равно','std.number.notEqual':'Не равно','std.number.less':'Меньше','std.number.lessEqual':'Меньше или равно','std.number.greater':'Больше','std.number.greaterEqual':'Больше или равно','std.number.abs':'Модуль числа','std.number.floor':'Округлить вниз','std.number.ceil':'Округлить вверх','std.number.round':'Округлить','std.text.concat':'Соединить текст','std.text.equal':'Текст равен','std.text.length':'Длина текста','std.text.contains':'Текст содержит','std.text.slice':'Фрагмент текста','std.text.toNumber':'Текст → число','std.text.fromNumber':'Число → текст','std.array.length':'Длина массива','std.array.at':'Элемент массива','std.array.append':'Добавить элемент','std.array.concat':'Соединить массивы','std.array.reverse':'Обратить массив','std.array.sort':'Сортировать числа','std.array.slice':'Фрагмент массива','std.array.contains':'Массив содержит'});
for(const [type,title] of Object.entries({Number:'Число',Boolean:'Логическое значение',String:'Текст',NumberArray:'Числовой массив'})){titles['std.value.'+type]=title;titles['std.select.'+type]='Выбор: '+title.toLowerCase();}
const standardMetadata=new Map(STANDARD_CONTRACTS.map(item=>[item.id,item]));
const categories={number:'Числа',value:'Значения',logic:'Логика',comparison:'Сравнения',selection:'Выбор значения (входы вычислены)',text:'Текст',array:'Числовые массивы',collection:'Map / Filter',custom:'Составные контракты'};
const el=(tag,text,style)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(style)node.className=style;return node;};
const identity=()=> 'p'+crypto.randomUUID().replaceAll('-','');
let store,editor,selected=null,pending=null,failedNode=null,textMode=false,textProjectId=null,textStorage;
const managedId=new URLSearchParams(location.search).get('project'),manager=managedId?new ProjectManager(localStorage):null;
let activeExecution=null,pausedOperation=null,executionBreakpointIdentity=null;
let breakpointIdentity=null,breakpoints=[],debuggerOwner=null,debuggerStorage=null,debuggerRecords=[],debuggerPoints=[];
let inspectionState=null,activeInspection=false;
function currentBreakpointIdentity(){const library=studioDebuggerContext(editor).library,program=textMode?JSON.stringify({profile:'text',source:$('text-source').value,entry:$('text-entry').value.trim(),lowering:$('text-lowering').value,library}):'graph:'+library;return editor.project.id+':'+program;}
function syncBreakpoints(){
 const identity=currentBreakpointIdentity();syncInspection(identity);
 if(debuggerOwner!==editor.project.id){debuggerOwner=editor.project.id;debuggerStorage=new StudioDebuggerStorage(localStorage,debuggerOwner);try{debuggerRecords=debuggerStorage.load();}catch(error){debuggerRecords=[];report(error);}breakpointIdentity=null;}
 if(identity!==breakpointIdentity){
  breakpointIdentity=identity;const context=studioDebuggerContext(editor,textMode?draft():null);let bundle=null;
  try{if(textMode&&debuggerRecords.some(record=>record.context.mode==='text'&&record.context.entry===context.entry&&record.context.lowering===context.lowering&&record.context.library===context.library))bundle=textAPI.compileTextDraft(draft(),editor);}catch{}
  try{debuggerPoints=resolveStudioDebugger(debuggerRecords,context,{bundle,project:editor.project});}catch(error){debuggerPoints=debuggerRecords.filter(record=>record.context.mode===context.mode&&(context.mode==='graph'||record.context.entry===context.entry&&record.context.lowering===context.lowering)).map(record=>({record,point:null,reason:error.code??'invalid-draft'}));}
  breakpoints=debuggerPoints.filter(item=>item.point).map(item=>item.point);
 }
 $('breakpoint-count').textContent=String(debuggerPoints.length);
 $('breakpoint-list').textContent=debuggerPoints.map(item=>(item.record.point.graph??item.record.point.function)+' / '+(item.point?.node??('не привязана: '+item.reason))).join('\n')||'Выберите блок в графе или операцию в тексте.';
 $('debug-breakpoint').disabled=!pausedOperation||executionBreakpointIdentity!==identity;
}
function toggleBreakpoint(point){
 syncBreakpoints();const key=JSON.stringify(point),active=debuggerPoints.find(item=>JSON.stringify(item.point)===key);let next;
 if(active)next=debuggerRecords.filter(record=>JSON.stringify(record)!==JSON.stringify(active.record));
 else{if(debuggerRecords.length>=64)throw Object.assign(new Error('Не более 64 точек на проект'),{code:'INVALID_DEBUG_BREAKPOINT'});const anchor=textMode?captureSourceBreakpoint(textAPI.compileTextDraft(draft(),editor),point):null;next=[...debuggerRecords,{context:studioDebuggerContext(editor,textMode?draft():null),point:anchor?.point??point,anchor}];}
 debuggerStorage.save(next);debuggerRecords=next;breakpointIdentity=null;syncBreakpoints();
 if(activeExecution&&executionBreakpointIdentity===breakpointIdentity)activeExecution.setBreakpoints(breakpoints);
 render();
}
$('debug-breakpoint').onclick=()=>{try{if(pausedOperation&&executionBreakpointIdentity===currentBreakpointIdentity())toggleBreakpoint(breakpointForEvent(pausedOperation));}catch(error){report(error);}};
$('clear-breakpoints').onclick=()=>{try{syncBreakpoints();debuggerStorage.save([]);debuggerRecords=[];breakpointIdentity=null;syncBreakpoints();if(activeExecution&&executionBreakpointIdentity===breakpointIdentity)activeExecution.setBreakpoints([]);render();}catch(error){report(error);}};
$('text-breakpoint').onclick=()=>{try{toggleBreakpoint(breakpointAtTextOffset(textAPI.compileTextDraft(draft(),editor),$('text-source').selectionStart));}catch(error){sourceError(error);}};

async function executeStudio(action,draft,inputs,debug=false){
 syncBreakpoints();executionBreakpointIdentity=breakpointIdentity;pausedOperation=null;syncBreakpoints();
 $('output').textContent=debug?'Отладка: выполняется…':'Выполняется…';$('execution-log').textContent='';$('debug-location').textContent='';$('debug').disabled=true;
 const witness=inspectionWitness(debug);activeInspection=!!witness;$('inspection-options').disabled=activeInspection;
 const job=startStudioExecution({...(witness?{inspection:witness}:{}),action,project:editor.serialize(),selected:editor.selectedContract,draft,inputs,debug,...(debug?{debugOptions:{breakpoints,start:$('debug-run-to-breakpoint').checked?'continue':'step'}}:{})},{timeout:debug?60000:5000,onPause:pause=>{
 showInspection(pause);document.querySelector('.debug-tools').open=true;pausedOperation=pause;$('output').textContent='Пауза. Нажмите «Шаг» или «Продолжить».';syncBreakpoints();$('debug-over').disabled=false;$('debug-out').disabled=false;$('debug-step').disabled=false;$('debug-continue').disabled=false;
 const where=pause.profile==='control'?pause.callStack.map(inspectionFunctionLabel).join(' → ')+' / '+pause.node+' ('+pause.kind+') → '+(pause.type??'statement'):pause.callPath.map(call=>call.graph+' / '+call.node+' → '+call.contract).join('\n')+'\nВходы: '+JSON.stringify(pause.inputs)+' → '+pause.output;
 $('debug-location').textContent=(pause.phase==='exit'?'Пауза после операции (выход вычислен)\n':'Пауза перед операцией (снимок программы)\n')+where+(pause.location?'\nСтрока '+pause.location.start.line+', столбец '+pause.location.start.column:'');
 if(action==='text'&&pause.location&&$('text-source').value===draft.source){$('text-source').focus();$('text-source').setSelectionRange(pause.location.start.offset,pause.location.end.offset);}
 if(action==='graph'&&pause.profile==='control'&&inspectionState?.prepared.presentation){const item=inspectionState.prepared.presentation.get(pause.function),binding=item?.bindings.find(b=>b.kind==='node'&&(pause.node===b.declaration||pause.node.startsWith(b.declaration+'/')));if(item?.graph===editor.workspace.graph.id&&binding){selected=binding.displayName;render();}}
 const at=pause.callPath?.find(call=>call.graph===editor.workspace.graph.id);if(action==='graph'&&at){selected=at.node;render();}
 },onLog:record=>{if(['finished','failed'].includes(record.type))clearInspectionValues();if(debug&&['finished','failed'].includes(record.type))$('debug-location').textContent=(record.type==='finished'?'Отладка завершена':'Отладка остановлена: '+record.code)+'\n'+$('debug-location').textContent.replace(/Пауза (?:перед операцией \(снимок программы\)|после операции \(выход вычислен\))/,'Последняя операция (снимок программы)');const message=record.type==='started'?'Запуск '+record.action:record.type==='validated'?'Проект проверен: '+record.id:record.type==='finished'?'Выполнение завершено':'Выполнение остановлено: '+record.code;$('execution-log').textContent+=message+'\n';}});activeExecution=job;$('stop').disabled=false;
 try{return await job.promise;}finally{activeInspection=false;$('inspection-options').disabled=false;clearInspectionValues();if(activeExecution===job)activeExecution=null;pausedOperation=null;syncBreakpoints();$('stop').disabled=true;$('debug').disabled=false;$('debug-over').disabled=true;$('debug-out').disabled=true;$('debug-step').disabled=true;$('debug-continue').disabled=true;}
}
for(const [id,mode] of [['debug-step','step'],['debug-over','over'],['debug-out','out'],['debug-continue','continue']])$(id).onclick=()=>{if(activeExecution?.resume(mode)){clearInspectionValues();$('output').textContent='Отладка: выполняется…';pausedOperation=null;syncBreakpoints();$('debug-over').disabled=true;$('debug-out').disabled=true;$('debug-step').disabled=true;$('debug-continue').disabled=true;}};
$('stop').onclick=()=>activeExecution?.cancel();
function report(error){$('error').textContent=`${error.code??'ERROR'}: ${error.message}`;}
try{if(manager){const record=manager.load(managedId);if(record?.kind!=='graph')throw new Error('Графовый проект не найден');store={load:id=>{const record=manager.load(id??managedId);return record?.kind==='graph'?parseProject(record.source):null;},list:()=>manager.list().filter(record=>record.kind==='graph'),save:project=>{manager.save({id:project.id,name:project.name,kind:'graph',source:new ProjectEditor(project).serialize(),draft:manager.load(project.id)?.draft??null});history.replaceState(null,'','/?project='+encodeURIComponent(project.id));}};}else store=new ProjectStorage(localStorage);editor=new ProjectEditor(store.load()??newProject(identity()));}catch(error){if(manager){report(error);throw error;}editor=new ProjectEditor(newProject(identity()));report(error);}
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
 const node=el('article',undefined,`card ${id.startsWith('input:')?'input-card':id==='output'?'output-card':''} ${selected===id?'selected':''} ${failedNode===id?'invalid':''}`),at=position(id,index);node.classList.toggle('breakpoint',breakpoints.some(point=>point.profile==='graph'&&point.graph===editor.workspace.graph.id&&point.node===id));node.dataset.card=id;node.style.left=at.x+'px';node.style.top=at.y+'px';
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
 if(textMode&&textProjectId!==editor.project.id)syncTextProject();
 $('nodes').replaceChildren();const graph=editor.workspace.graph;
 syncBreakpoints();
 $('canvas-guide').hidden=graph.nodes.length>0||Object.keys(graph.inputs).length>0;
 for(const [name,input]of Object.entries(graph.inputs)){const node=card(`input:${name}`,name,'Входные данные');node.append(el('div',json(editor.workspace.inputs[name]),'input-preview'));node.append(port({input:name},null,name,input.type));$('nodes').append(node);}
 graph.nodes.forEach((definition,index)=>{const contract=editor.registry.resolve(definition.uses),node=card(definition.id,titles[contract.id]??contract.id,contract.kind==='composite'?'Составной':contract.kind==='collection'?'Коллекция':'Операция',index);for(const [name,type]of Object.entries(contract.inputs))node.append(port(null,{id:definition.id,port:name},name,typeof type==='string'?type:type.type));node.append(port({node:definition.id},null,definition.id,contract.output));$('nodes').append(node);});
 const output=card('output','Результат функции','выход');output.append(port(null,{id:'output',port:'return'},'return',graph.output.type));$('nodes').append(output);
 $('project-name').value=editor.project.name;$('undo').disabled=!editor.history.length;$('redo').disabled=!editor.future.length;$('connection-status').textContent=pending?'Выберите вход. Esc — отменить.':'';view();catalog();collectionChoices();runInputs();inspector();$('scope').textContent=editor.selectedContract??'Основная программа';$('collapse').disabled=!editor.navigation.length;requestAnimationFrame(wires);
}
function json(value){if(Object.is(value,-0))return '-0';if(Array.isArray(value))return '['+value.map(json).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+json(item)).join(',')+'}';return JSON.stringify(value);}
function runInputs(){
 const panel=$('run-inputs');panel.replaceChildren();
 const entries=Object.entries(editor.workspace.graph.inputs);
 if(!entries.length){panel.append(el('p','У этой программы нет входных параметров.','hint'));return;}
 for(const [name,input] of entries){
  const form=el('form',undefined,'run-input-row'),label=el('label',name),field=el(input.type==='NumberArray'?'textarea':input.type==='Boolean'?'select':'input');
  const id='run-input-'+encodeURIComponent(name);field.id=id;label.htmlFor=id;field.dataset.runInput=name;
  if(input.type==='Boolean')for(const [value,title] of [['true','Да (true)'],['false','Нет (false)']]){const option=el('option',title);option.value=value;field.append(option);}
  field.value=input.type==='String'?editor.workspace.inputs[name]:json(editor.workspace.inputs[name]);field.setAttribute('aria-label','Вход '+name);field.spellcheck=false;
  if(input.type==='Number')field.inputMode='decimal';
  const apply=el('button','Применить');apply.type='submit';
  form.append(label,el('small',input.type,'input-type'),field,apply);
  if(input.type==='NumberArray')form.append(el('small','Список чисел: [1, 2, 3]','hint'));
  form.onsubmit=event=>{event.preventDefault();change(()=>{editor.setInput(name,input.type==='String'?field.value:JSON.parse(field.value));$('output').textContent='Данные изменены. Нажмите «Запустить».';});};panel.append(form);
 }
}
function fitGraph(){
 const cards=[...$('nodes').children];if(!cards.length)return;
 const left=Math.min(...cards.map(card=>parseFloat(card.style.left))),top=Math.min(...cards.map(card=>parseFloat(card.style.top)));
 const right=Math.max(...cards.map(card=>parseFloat(card.style.left)+card.offsetWidth)),bottom=Math.max(...cards.map(card=>parseFloat(card.style.top)+card.offsetHeight));
 const width=$('viewport').clientWidth,height=$('viewport').clientHeight,padding=28,headroom=10;
 const scale=Math.max(.25,Math.min(1,(width-padding*2)/(right-left),(height-headroom-padding*2)/(bottom-top)));
 change(()=>editor.viewport({scale,x:(width-(right-left)*scale)/2-left*scale,y:headroom+padding-top*scale}));
}
$('fit-graph').onclick=fitGraph;
function inspector(){
 const panel=$('inspector');panel.replaceChildren();if(!selected){panel.append(el('p','Нажмите на блок на схеме, чтобы изменить его параметры. Входные данные можно задать выше.','hint'));return;}
 if(selected==='output'){panel.append(el('strong','Результат'),el('p',editor.workspace.graph.output.type),el('p',Object.hasOwn(editor.workspace.graph.returns,'literal')?'Значение: '+json(editor.workspace.graph.returns.literal):'Источник: '+(editor.workspace.graph.returns.node??editor.workspace.graph.returns.input)));const clear=el('button','Удалить соединение');clear.onclick=()=>change(()=>editor.disconnect('output','return'));panel.append(clear);return;}
 if(selected.startsWith('input:')){
  const name=selected.slice(6),input=editor.workspace.graph.inputs[name];if(!input){selected=null;return;}panel.append(el('strong',name),el('p',input.type));const field=el('textarea');field.value=json(editor.workspace.inputs[name]);field.dataset.inputValue=name;const apply=el('button','Применить значение');apply.onclick=()=>change(()=>editor.setInput(name,JSON.parse(field.value)));panel.append(el('label','Значение (JSON)'),field,apply);
 }else{
  const node=editor.workspace.graph.nodes.find(node=>node.id===selected);if(!node){selected=null;return;}const contract=editor.registry.resolve(node.uses);if(contract.kind==='composite'){const expand=el('button','Раскрыть граф');expand.id='expand';expand.onclick=()=>change(()=>{editor.openContract(contract.id);selected=null;});panel.append(expand);}panel.append(el('strong',titles[contract.id]??contract.id),el('p',`${contract.id} · ${node.id} → ${contract.output}`));
  const point={profile:'graph',graph:editor.workspace.graph.id,node:node.id},has=breakpoints.some(item=>JSON.stringify(item)===JSON.stringify(point)),stop=el('button',has?'● Убрать точку останова':'○ Точка останова');stop.id='node-breakpoint';stop.setAttribute('aria-pressed',String(has));stop.disabled=textMode;stop.onclick=()=>{try{toggleBreakpoint(point);}catch(error){report(error);}};panel.append(stop);
  if(contract.kind==='collection'){
   panel.append(el('p',contract.collection.operation.toUpperCase()+' · '+contract.collection.callback.id));const field=el('select');field.dataset.collectionCallback=contract.id;
   const output=contract.collection.operation==='map'?'Number':'Boolean';for(const item of editor.registry.items.values()){const inputs=Object.values(item.inputs).map(spec=>typeof spec==='string'?spec:spec.type);if(['atomic','composite'].includes(item.kind)&&inputs.length===1&&inputs[0]==='Number'&&item.output===output){const option=el('option',item.id);option.value=item.id;field.append(option);}}
   field.value=contract.collection.callback.id;const apply=el('button','Изменить преобразование');apply.onclick=()=>change(()=>editor.setCollectionCallback(contract.id,field.value));panel.append(field,apply);
   if(editor.project.contracts.some(item=>item.graph.id===contract.collection.callback.id)){const open=el('button','Открыть преобразование');open.dataset.openCollectionCallback=contract.id;open.onclick=()=>change(()=>{editor.openContract(contract.collection.callback.id);selected=null;});panel.append(open);}
  }

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
   const metadata=standardMetadata.get(contract.id),group=contract.kind==='collection'?'collection':contract.kind==='composite'?'custom':metadata?.category??(['core.sum','core.min','core.max'].includes(contract.id)?'array':'number');
   const signature=Object.entries(contract.inputs).map(([name,type])=>name+':'+(typeof type==='string'?type:type.type)).join(', ')+' → '+contract.output;
   if(group!==key||query&&!(contract.id+' '+(titles[contract.id]??'')+' '+signature).toLowerCase().includes(query))continue;
   if(!heading){$('catalog').append(el('h3',title));heading=true;}
   const label=contract.kind==='collection'?contract.collection.operation.toUpperCase()+' · '+contract.id:(titles[contract.id]??contract.id);const row=el('div',undefined,'catalog-item'),button=el('button',label+(contract.kind==='composite'?' ▧':''));button.dataset.contract=contract.id;button.title=contract.id+' · '+signature+(metadata?' · '+metadata.summary:'');button.onclick=()=>change(()=>{selected=editor.addNode(contract.id);});row.append(button);
   if(contract.kind==='composite'){
    const open=el('button','Открыть');open.dataset.openContract=contract.id;open.onclick=()=>change(()=>{editor.openContract(contract.id);selected=null;});
    const remove=el('button','Удалить');remove.dataset.deleteContract=contract.id;remove.onclick=()=>change(()=>{editor.removeComposite(contract.id);selected=null;});row.append(open,remove);
   }
   if(contract.kind==='collection'){const remove=el('button','Удалить');remove.dataset.deleteCollection=contract.id;remove.onclick=()=>change(()=>editor.removeCollection(contract.id));row.append(remove);}
   row.append(el('small',signature+(contract.kind==='collection'?' · '+contract.collection.callback.id:''),'signature'));$('catalog').append(row);count++;
  }
 }
 if(!count)$('catalog').append(el('p','Контракты не найдены.','hint'));
}
function collectionChoices(){
 const field=$('collection-callback'),previous=field.value;field.replaceChildren();const output=$('collection-operation').value==='map'?'Number':'Boolean';
 for(const item of editor.registry.items.values()){const inputs=Object.values(item.inputs).map(spec=>typeof spec==='string'?spec:spec.type);if(['atomic','composite'].includes(item.kind)&&inputs.length===1&&inputs[0]==='Number'&&item.output===output){const option=el('option',item.id+' · Number → '+output);option.value=item.id;field.append(option);}}
 if([...field.options].some(option=>option.value===previous))field.value=previous;$('create-collection').disabled=!field.options.length;
}
$('collection-operation').addEventListener('change',collectionChoices);
$('create-collection').onclick=()=>change(()=>editor.createCollection($('collection-id').value.trim(),$('collection-operation').value,$('collection-callback').value));
$('catalog-search').addEventListener('input',catalog);$('catalog-category').addEventListener('change',catalog);
$('add-input').onsubmit=event=>{event.preventDefault();change(()=>{const name=$('input-name').value.trim();editor.addInput(name,$('input-type').value);selected=`input:${name}`;$('input-name').value='';});};
$('project-name').onchange=()=>change(()=>editor.edit(project=>{project.name=$('project-name').value;}));$('save').onclick=save;
$('new').onclick=()=>change(()=>{editor=new ProjectEditor(newProject(identity()));selected=null;$('output').textContent='Новый проект';});
$('projects').onchange=()=>change(()=>{const project=store.load($('projects').value);if(!project)throw new Error('Проект не найден');editor=new ProjectEditor(project);selected=null;});
$('undo').onclick=()=>change(()=>editor.undo());$('redo').onclick=()=>change(()=>editor.redo());
async function runGraph(debug=false){ $('run').disabled=true;$('error').textContent='';failedNode=null;render();const started=performance.now();try{$('output').textContent=json(await executeStudio('graph',undefined,undefined,debug));}catch(error){$('output').textContent='Выполнение остановлено';const at=error.failurePath?.find(call=>call.graph===editor.workspace.graph.id);if(at){selected=failedNode=at.node;render();}report(error);}finally{$('duration').textContent=(performance.now()-started).toFixed(1)+' мс';$('run').disabled=false;$('debug').disabled=false;} }
$('run').onclick=()=>runGraph();$('debug').onclick=()=>textMode?runText(true):runGraph(true);
function zoom(factor){change(()=>{const view=editor.workspace.canvas.view;editor.viewport({...view,scale:Math.min(2,Math.max(.25,view.scale*factor))});});}
$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('viewport').onwheel=event=>{event.preventDefault();zoom(event.deltaY<0?1.1:1/1.1);};
$('viewport').onpointerdown=event=>{
 if(event.button!==0||event.target.closest('.card')||event.target.closest('.wire'))return;const viewport=$('viewport'),original={...editor.workspace.canvas.view},start={x:event.clientX,y:event.clientY};let next=original;viewport.setPointerCapture(event.pointerId);
 viewport.onpointermove=move=>{next={...original,x:original.x+move.clientX-start.x,y:original.y+move.clientY-start.y};$('world').style.transform=`translate(${next.x}px,${next.y}px) scale(${next.scale})`;};
 viewport.onpointerup=()=>{viewport.onpointermove=null;viewport.onpointerup=null;if(next!==original)change(()=>editor.viewport(next));};viewport.onpointercancel=()=>{viewport.onpointermove=null;viewport.onpointerup=null;view();};
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){pending=null;render();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();}});
$('export').onclick=()=>{try{const url=URL.createObjectURL(new Blob([editor.serialize()],{type:'application/json'})),anchor=el('a');anchor.href=url;anchor.download=editor.project.id+'.ems.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){report(error);}};
$('import').onclick=()=> $('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>4*1024*1024)throw new Error('Файл слишком большой');const source=await file.text();change(()=>{const project=parseProject(source);project.id=identity();project.name=project.name.slice(0,180)+' (импорт)';editor=new ProjectEditor(project);selected=null;});}catch(error){report(error);}$('file').value='';};
$('examples').onchange=async()=>{
 const choice=$('examples').value;if(!choice)return;try{const project=newProject(identity(),choice==='avg'?'Среднее пяти — арифметика':'Сумма двух чисел');
 if(choice==='map'){const saved=parseProject(await fetch('/examples/studio-map-double.ems.json').then(response=>response.text()));saved.id=project.id;Object.assign(project,saved);}
 else if(choice==='avg'){const saved=parseProject(await fetch('/examples/studio-avg5.ems.json').then(response=>response.text()));saved.id=project.id;Object.assign(project,saved);}
 else if(choice==='library'){const saved=parseProject(await fetch('/examples/studio-library.ems.json').then(response=>response.text()));saved.id=project.id;saved.name='Массив → текст';Object.assign(project,saved);}
 else{project.graph.inputs={a:{type:'Number'},b:{type:'Number'}};project.inputs={a:2,b:3};project.graph.nodes=[{id:'sum',uses:'core.add',args:{a:{input:'a'},b:{input:'b'}}}];project.graph.returns={node:'sum'};}
 Object.keys(project.graph.inputs).forEach((name,index)=>{project.canvas.positions[`input:${name}`]={x:30,y:100+index*130};});project.graph.nodes.forEach((node,index)=>{project.canvas.positions[node.id]={x:300+(index%2)*270,y:60+Math.floor(index/2)*200};});project.canvas.positions.output={x:850,y:150};change(()=>{editor=new ProjectEditor(project);selected=null;});fitGraph();
 }catch(error){report(error);}$('examples').value='';
};
window.addEventListener('resize',wires);projectList();render();

$('create-composite').onclick=()=>change(()=>{const id=$('composite-id').value.trim();editor.createComposite(id);$('composite-id').value='';});
$('collapse').onclick=()=>change(()=>{editor.collapse();selected=null;});
$('main-graph').onclick=()=>change(()=>{editor.main();selected=null;});
$('compile').onclick=()=>{try{const url=URL.createObjectURL(new Blob([editor.compile()],{type:'text/javascript'})),anchor=el('a');anchor.href=url;anchor.download=(editor.selectedContract??'program')+'.mjs';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){report(error);}};

// Text candidates compile through the ordinary EMS frontend and the same IR/runtime.
const textAPI=await import('/src/studio/text.mjs');

try{textStorage=manager?{load:id=>manager.load(id)?.draft??null,save:(id,draft)=>{const record=manager.load(id);if(!record)throw new Error('Проект не сохранён');manager.save({...record,source:editor.serialize(),draft:textAPI.validateStoredDraft({schemaVersion:'ems-studio-text/1',...draft})});}}:new textAPI.TextDraftStorage(localStorage);}catch(error){report(error);}
function draft(){return {source:$('text-source').value,entry:$('text-entry').value.trim(),lowering:$('text-lowering').value,inputs:$('text-inputs').value};}
function setDraft(value){$('text-source').value=value.source;$('text-entry').value=value.entry;$('text-lowering').value=value.lowering;$('text-inputs').value=value.inputs;}
function saveDraft(){try{if(!textStorage)throw new Error('Хранилище черновика недоступно');textStorage.save(editor.project.id,draft());$('text-status').textContent='Черновик сохранён локально. Граф изменяется только после «Применить».';}catch(error){$('text-status').textContent='Черновик не сохранён';report(error);}}
function sourceError(error){report(error);const location=error.details?.location;if(location){$('error').textContent+='\nСтрока '+location.start.line+', столбец '+location.start.column;$('text-source').focus();$('text-source').setSelectionRange(location.start.offset,location.end.offset);}}
function syncTextProject(){const stored=textStorage?.load(editor.project.id);if(stored)setDraft(stored);else generateDraft();textProjectId=editor.project.id;}
function generateDraft(){const value=textAPI.textFromWorkspace(editor);setDraft({...value,inputs:json(editor.workspace.inputs)});textProjectId=editor.project.id;saveDraft();syncBreakpoints();}
function setTextMode(next){
 if(textMode===next)return;
 try{if(next&&textProjectId!==editor.project.id)syncTextProject();
 textMode=next;document.body.classList.toggle('text-mode',textMode);$('text-panel').hidden=!textMode;$('text-mode').setAttribute('aria-pressed',String(textMode));$('graph-view').setAttribute('aria-pressed',String(!textMode));if(!textMode)render();else{syncBreakpoints();inspector();}}catch(error){sourceError(error);}
}
$('text-mode').onclick=()=>setTextMode(true);
$('graph-view').onclick=()=>setTextMode(false);
$('start-example').onclick=()=>{const examples=$('examples');examples.value='sum';examples.dispatchEvent(new Event('change'));};
$('text-from-graph').onclick=()=>{try{generateDraft();$('error').textContent='';}catch(error){sourceError(error);}};
for(const id of ['text-source','text-entry','text-lowering','text-inputs'])$(id).addEventListener('input',()=>{saveDraft();syncBreakpoints();});
const graphRun=$('run').onclick;
async function runText(debug=false){
 if(!textMode)return graphRun();$('run').disabled=true;$('error').textContent='';const started=performance.now();
 try{$('output').textContent=json(await executeStudio('text',draft(),JSON.parse($('text-inputs').value),debug));saveDraft();}catch(error){$('output').textContent='Выполнение остановлено';sourceError(error);}finally{$('duration').textContent=(performance.now()-started).toFixed(1)+' мс';$('run').disabled=false;}
};
$('run').onclick=()=>runText();
$('text-ir').onclick=()=>{try{const bundle=textAPI.compileTextDraft(draft(),editor);$('output').textContent=JSON.stringify({ir:bundle.ir,provenance:bundle.provenance},null,2);$('error').textContent='';}catch(error){sourceError(error);}};
$('text-to-graph').onclick=()=>{try{const value=textAPI.projectFromText(draft(),editor,JSON.parse($('text-inputs').value));editor.edit(project=>Object.assign(project,value.project));selected=null;textMode=false;document.body.classList.remove('text-mode');$('text-panel').hidden=true;$('text-mode').setAttribute('aria-pressed','false');$('graph-view').setAttribute('aria-pressed','true');save();render();$('error').textContent='';}catch(error){sourceError(error);}};
const graphCompile=$('compile').onclick;
$('compile').onclick=()=>{if(!textMode)return graphCompile();try{const url=URL.createObjectURL(new Blob([textAPI.compileTextJS(draft(),editor)],{type:'text/javascript'})),anchor=el('a');anchor.href=url;anchor.download='text-program.mjs';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){sourceError(error);}};

$('text-compile').onclick=()=>$('compile').click();

// Compact library on narrow screens keeps the program and first action in view.
const compactLibrary=matchMedia('(max-width:520px)');
function syncLibraryLayout(){document.querySelector('.library-section').open=!compactLibrary.matches;}
compactLibrary.addEventListener('change',syncLibraryLayout);syncLibraryLayout();

function clearInspectionValues(){ $('inspection-values').textContent=''; }
function syncInspection(identity){
 if(inspectionState&&inspectionState.identity!==currentInspectionIdentity()){inspectionState=null;$('inspection-bindings').replaceChildren();$('inspection-function').replaceChildren();clearInspectionValues();$('inspection-status').textContent='Программа изменилась. Выберите переменные заново.';if(activeInspection)activeExecution?.cancel();}
 $('inspection-choose').disabled=false;$('inspection-after').disabled=!inspectionState;if(!inspectionState)$('inspection-after').checked=false;
}
function currentInspectionIdentity(){return currentBreakpointIdentity()+(!textMode?':'+editor.workspace.graph.id:'');}
function inspectionWitness(debug){
 if(debug&&!textMode&&!inspectionState&&hasCollections(editor.workspace.graph,editor.registry)){const witness=graphInspectionWitness(editor,{allow:[]}),prepared=prepareStudioInspection({action:'graph',debug:true,project:editor.serialize(),selected:editor.selectedContract,inspection:witness},editor);inspectionState={identity:currentInspectionIdentity(),bundle:prepared.bundle,prepared,grants:new Map()};}
 if(!debug||!inspectionState||inspectionState.identity!==currentInspectionIdentity())return null;
 const allow=[...inspectionState.grants].filter(([,names])=>names.size).map(([fn,names])=>({function:fn,declarations:[...names]}));
 if(!allow.length&&!inspectionState.prepared.presentation)return null;
 const policy={allow,protectedFunctions:$('inspection-protected').checked?[inspectionState.prepared.root?.id??inspectionState.bundle.ir.entry]:[]};
 const afterOperations=$('inspection-after').checked;
 return textMode?{schemaVersion:afterOperations?'ems-source-inspection/2':'ems-source-inspection/1',...(afterOperations?{afterOperations:true}:{}),source:draft().source,entry:draft().entry,lowering:draft().lowering,policy}:graphInspectionWitness(editor,policy,{afterOperations});
}
function inspectionDeclarationLabel(fn,item){
 if(item.kind==='input')return 'вход программы';if(item.kind==='node')return 'выход блока';
 if(item.declaration.startsWith('/inputs/'))return 'параметр';
 const locations=inspectionState.bundle.provenance.functions[fn.id]?.nodes??{};let path=item.declaration;
 while(path&&!locations[path])path=path.slice(0,path.lastIndexOf('/'));
 const at=locations[path]?.start;return at?'строка '+at.line+', столбец '+at.column:'локальная переменная';
}
function inspectionChoices(){
 const fn=inspectionFunctions().find(fn=>fn.id===$('inspection-function').value);$('inspection-bindings').replaceChildren();if(!fn)return;
 for(const item of inspectionCatalog(fn)){
  const label=el('label'),input=el('input');input.type='checkbox';input.dataset.inspectionName=item.name;input.dataset.inspectionDeclaration=item.declaration;input.disabled=item.declaration.length>1024;input.checked=inspectionState.grants.get(fn.id)?.has(item.declaration)??false;
  input.onchange=()=>{const count=[...inspectionState.grants.values()].reduce((n,names)=>n+names.size,0);if(input.checked&&count>=32){input.checked=false;$('inspection-status').textContent='Можно выбрать не более 32 переменных.';return;}const names=inspectionState.grants.get(fn.id)??new Set();input.checked?names.add(item.declaration):names.delete(item.declaration);inspectionState.grants.set(fn.id,names);clearInspectionValues();$('inspection-status').textContent='Разрешение применится при следующем запуске отладки.';};
  label.append(input,document.createTextNode((item.displayName??item.name)+' · '+item.type+' · '+inspectionDeclarationLabel(fn,item)));$('inspection-bindings').append(label);
 }
}
function inspectionFunctionLabel(id){return inspectionState?.prepared.presentation?inspectionState.prepared.presentation.get(id)?.graph??'Выполнение коллекции':id;}
function inspectionFunctions(){if(inspectionState?.prepared.presentation)return inspectionState.bundle.ir.functions.filter(fn=>inspectionState.prepared.presentation.has(fn.id));return inspectionState?.prepared.graphs?[...inspectionState.prepared.graphs.values()].map(item=>item.graph):inspectionState?.bundle.ir.functions??[];}
function inspectionCatalog(fn){if(!fn)return [];if(inspectionState.prepared.presentation)return inspectionState.prepared.presentation.get(fn.id)?.bindings??[];return inspectionState.prepared.graphs?graphInspectionDeclarations(fn,inspectionState.prepared.registry):controlInspectionDeclarations(fn);}
$('inspection-choose').onclick=()=>{try{
 const policy={allow:[]},witness=textMode?{schemaVersion:'ems-source-inspection/1',source:draft().source,entry:draft().entry,lowering:draft().lowering,policy}:graphInspectionWitness(editor,policy);
 const prepared=prepareStudioInspection({action:textMode?'text':'graph',debug:true,project:editor.serialize(),selected:editor.selectedContract,draft:textMode?draft():undefined,inspection:witness});
 inspectionState={identity:currentInspectionIdentity(),bundle:prepared.bundle,prepared,grants:new Map()};$('inspection-after').disabled=false;$('inspection-function').replaceChildren(...inspectionFunctions().map(fn=>{const option=el('option',inspectionFunctionLabel(fn.id));option.value=fn.id;return option;}));$('inspection-function').value=prepared.root?.id??prepared.bundle.ir.entry;inspectionChoices();clearInspectionValues();$('inspection-status').textContent='Отметьте разрешённые значения, затем начните отладку.';
 }catch(error){sourceError(error);}};
$('inspection-function').onchange=inspectionChoices;
$('inspection-protected').onchange=clearInspectionValues;$('inspection-after').onchange=clearInspectionValues;
function showInspection(pause){
 clearInspectionValues();if(!activeInspection||!inspectionState)return;document.querySelector('.inspection-settings').open=true;
 if(!pause.inspection){$('inspection-status').textContent='В этом графовом кадре просмотр значений недоступен.';return;}
 const statuses={'not-evaluated':'ещё не вычислено','not-in-scope':'ещё не в области видимости','protected-program':'защищённая программа','protected-effects':'эффекты программы — значения закрыты','excluded-type':'непрозрачный тип','limit':'превышен лимит','unavailable':'недоступно'};
 const functionId=pause.function??pause.callPath.at(-1).graph,fn=inspectionFunctions().find(fn=>fn.id===functionId);
 $('inspection-status').textContent=inspectionFunctionLabel(functionId)+' · кадр '+pause.frames.at(-1)+(pause.inspection.truncated?' · достигнут лимит снимка':'');
 const catalog=inspectionCatalog(fn);
 $('inspection-values').textContent=pause.inspection.variables.map(v=>{
  const binding=catalog.find(item=>v.declaration?item.declaration===v.declaration:item.name===v.name),name=binding?.displayName??v.name;
  const duplicate=catalog.filter(item=>(item.displayName??item.name)===name).length>1;
  return name+(duplicate?' ['+inspectionDeclarationLabel(fn,binding??{declaration:v.declaration})+']':'')+(v.type?' · '+v.type:'')+' = '+(v.status==='value'?json(v.value):statuses[v.status]);
 }).join('\n');
}

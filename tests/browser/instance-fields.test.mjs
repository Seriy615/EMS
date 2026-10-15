import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioServer} from '../../tools/serve.mjs';
import {launchChromium} from '../../tools/lib/chromium.mjs';
async function until(page,expression){const end=Date.now()+15000;let last;while(Date.now()<end){try{last=await page.evaluate(expression);if(last)return last;}catch(error){last=error.message;}await new Promise(r=>setTimeout(r,30));}throw Error('Browser deadline: '+String(last));}
async function seed(page){await page.evaluate(`(async()=>{const {ProjectManager,workspaceSource}=await import('/src/studio/manager.mjs'),{newInstanceProject,serializeInstanceProject}=await import('/src/studio/instance-project.mjs'),record={id:'native',name:'Состояние',kind:'contract',draft:null,source:serializeInstanceProject(newInstanceProject(await(await fetch('/examples/native-ui.ems')).text()))},other={id:'other',name:'Другой файл',kind:'contract',draft:null,source:serializeInstanceProject(newInstanceProject())};new ProjectManager(localStorage).save({id:'files',name:'Файлы',kind:'workspace',draft:null,source:workspaceSource([{path:'app.contract.json',record},{path:'other.contract.json',record:other}])});})()`);}
const modulePath='/web/contracts.html?project=files&file=native';
async function addField(page,name){await page.evaluate(`(()=>{document.querySelector('#add-field').closest('details').open=true;document.querySelector('#field-name').value=${JSON.stringify(name)};document.querySelector('#field-initial').value='0';document.querySelector('#add-field').requestSubmit();})()`);await until(page,`!!document.querySelector('[data-field="'+${JSON.stringify(name)}+'"]')`);}
test('mobile field forms preserve UI bindings and siblings, provide dependency links, undo/redo and stale-window protection',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();let page=await browser.page(server.origin+'/web/projects.html');await seed(page);await page.close();page=await browser.page(server.origin+modulePath);await page.viewport(390,844);await until(page,`!!document.querySelector('[data-field="value"]')`);
 await addField(page,'total');await page.evaluate(`document.querySelector('[data-instance="right"]').click();const input=document.querySelector('[data-initial-field="total"]');input.value='8';input.form.requestSubmit();`);
 const before=await page.evaluate(`(async()=>{const {ProjectFileManager}=await import('/src/studio/manager.mjs');return new ProjectFileManager(localStorage,'files','native').load().source;})()`);
 await page.evaluate(`const rename=document.querySelector('[data-field-rename="value"]');rename.value='amount';rename.form.requestSubmit();`);
 assert.ok(await page.evaluate(`!!document.querySelector('[data-field="amount"]')`));await page.evaluate(`document.querySelector('#undo-module').click()`);
 assert.equal(await page.evaluate(`(async()=>{const {ProjectFileManager}=await import('/src/studio/manager.mjs');return new ProjectFileManager(localStorage,'files','native').load().source;})()`),before);
 await page.evaluate(`document.querySelector('#redo-module').click();document.querySelector('[data-remove-field="amount"]').click()`);
 assert.match(await page.evaluate(`document.querySelector('#error').textContent`),/Поле используется/);assert.ok(await page.evaluate(`!!document.querySelector('#error a[href*="invariant="]')`));
 await page.evaluate(`document.querySelector('#error a[href*="widget=count"]').click()`);await until(page,`!!document.querySelector('#widget-select')&&document.querySelector('#widget-select').value==='count'`);
 assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');await page.evaluate(`document.querySelector('#application [data-ems-ui="up"]').click()`);await until(page,`document.querySelector('#application [data-ems-ui="count"]').textContent==='2'`);
 const ui=await page.evaluate(`(async()=>{const {applicationController,editor}=await import('/web/instance-ui-demo.mjs');await applicationController.idle();return {state:applicationController.runtime.snapshot(),field:editor.document.ui.root.children[0].props.text.state};})()`);assert.equal(ui.field,'left.amount');assert.equal(ui.state['right.total'],8);assert.equal(ui.state['left.amount'],2);
 await page.close();page=await browser.page(server.origin+modulePath);await page.viewport(390,844);await until(page,`!!document.querySelector('[data-remove-field="total"]')`);
 const stale=await browser.page(server.origin+modulePath);await until(stale,`!!document.querySelector('[data-field="total"]')`);
 await page.evaluate(`document.querySelector('[data-remove-field="total"]').click()`);assert.equal(await page.evaluate(`document.querySelectorAll('[data-field="total"]').length`),0);
 await page.evaluate(`document.querySelector('#undo-module').click()`);assert.ok(await page.evaluate(`!!document.querySelector('[data-field="total"]')`));await page.evaluate(`document.querySelector('#redo-module').click()`);
 await stale.evaluate(`document.querySelector('#field-name').value='stale';document.querySelector('#add-field').requestSubmit()`);assert.match(await stale.evaluate(`document.querySelector('#error').textContent`),/STALE_INSTANCE_PROJECT/);
 const final=await page.evaluate(`(async()=>{const {ProjectFileManager}=await import('/src/studio/manager.mjs'),p=JSON.parse(new ProjectFileManager(localStorage,'files','native').load().source);return {fields:p.module.definitions[0].fields.map(f=>f.name),sibling:new ProjectFileManager(localStorage,'files','other').load().name,archive:p.sourceArchive,overflow:document.documentElement.scrollWidth>innerWidth+1,error:document.querySelector('#error').textContent};})()`);
 assert.deepEqual(final.fields,['amount']);assert.equal(final.sibling,'Другой файл');assert.match(final.archive,/value: Number = 1/);assert.equal(final.overflow,false);assert.equal(final.error,'');await stale.close();
 }finally{await browser?.close();await server.close();}
});
test('a new field and operation are wired through real value/activation ports and connected to UI events and text',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();let page=await browser.page(server.origin+'/web/projects.html');await seed(page);await page.close();page=await browser.page(server.origin+modulePath);await until(page,`!!document.querySelector('#field-name')`);await addField(page,'total');
 await page.evaluate(`document.querySelector('#transition-name').value='Accumulate';document.querySelector('#transition-inputs').value='delta:Number';document.querySelector('#add-transition').requestSubmit()`);await until(page,`document.querySelector('#scope')?.textContent==='left::Accumulate'`);
 const wiring=await page.evaluate(`(async()=>{
  const {editor}=await import('/web/flow.mjs'),{instanceSlot}=await import('/src/instances/names.mjs'),$=id=>document.getElementById(id);
  const add=id=>{$('catalog-search').value=id;$('catalog-search').dispatchEvent(new Event('input'));document.querySelector('[data-contract="'+id+'"]').click();return editor.workspace.graph.nodes.find(n=>n.uses===id).id;};
  const read=add('state.'+instanceSlot('left','total')+'.read'),sum=add('core.add'),write=add('state.'+instanceSlot('left','total')+'.write'),result=editor.workspace.graph.nodes.find(n=>n.uses==='std.program.Result').id;
  const wire=(from,to)=>{document.querySelector('[data-flow-output="'+from+'"]').click();document.querySelector('[data-flow-input="'+to+'"]').click();};
  wire('value:node:'+read,'input:value:'+sum+':a');wire('value:input:delta','input:value:'+sum+':b');wire('value:node:'+sum,'input:value:'+write+':value');wire('value:node:'+write,'input:value:'+result+':value');
  wire('activation:'+read+':next','input:activation:'+sum+':enter');wire('activation:'+sum+':next','input:activation:'+write+':enter');wire('activation:'+write+':next','input:activation:'+result+':enter');
  document.querySelector('[data-flow-node="'+read+'"]').click();document.querySelector('[data-flow-entry]').click();$('save').click();
  const input=document.querySelector('[data-flow-parameter="delta"]');input.value='2';input.form.requestSubmit();$('run').click();return {error:$('error').textContent,write:document.querySelector('[data-flow-input="input:value:'+write+':value"]').title};
 })()`);assert.equal(wiring.error,'');assert.equal(wiring.write,'Число');await until(page,`!document.querySelector('#run').disabled`);assert.equal(await page.evaluate(`document.querySelector('#output').textContent`),'2');
 await page.evaluate(`document.querySelector('#run').click()`);await until(page,`!document.querySelector('#run').disabled`);assert.equal(await page.evaluate(`document.querySelector('#output').textContent`),'4');
 await page.close();page=await browser.page(server.origin+'/web/ui-demo.html?project=files&file=native&native=1');await until(page,`!!document.querySelector('#application [data-ems-ui="up"]')`);
 await page.evaluate(`(()=>{const $=id=>document.getElementById(id);$('widget-select').value='up';$('widget-select').dispatchEvent(new Event('change'));$('event-handler').value='left::Accumulate';$('event-handler').dispatchEvent(new Event('change'));document.querySelector('[data-event-value="delta"]').value='3';$('set-event').click();})()`);
 await until(page,`document.querySelector('#handler-inspect').textContent.includes('Accumulate')`);
 await page.evaluate(`(()=>{const $=id=>document.getElementById(id);$('widget-select').value='count';$('widget-select').dispatchEvent(new Event('change'));$('property-name').value='text';$('property-name').dispatchEvent(new Event('change'));$('property-mode').value='number';$('property-value').value='left.total';$('set-property').click();})()`);
 await until(page,`document.querySelector('#application [data-ems-ui="count"]').textContent==='0'`);
 await page.evaluate(`document.querySelector('#application [data-ems-ui="up"]').click()`);await until(page,`document.querySelector('#application [data-ems-ui="count"]').textContent==='3'`);
 assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');await page.reload();await until(page,`document.querySelector('#application [data-ems-ui="count"]')?.textContent==='0'`);await page.evaluate(`document.querySelector('#application [data-ems-ui="up"]').click()`);await until(page,`document.querySelector('#application [data-ems-ui="count"]').textContent==='3'`);
 }finally{await browser?.close();await server.close();}
});

test('deletion dependency opens the actual unused helper scope and focuses its connected state contract',async()=>{
 const server=await startStudioServer({port:0});let browser;
 try{browser=await launchChromium();let page=await browser.page(server.origin+'/web/projects.html');await seed(page);
 await page.evaluate(`(async()=>{const {ProjectFileManager}=await import('/src/studio/manager.mjs'),{parseInstanceProject,serializeInstanceProject,instanceProjectFlow,applyInstanceProjectFlow}=await import('/src/studio/instance-project.mjs'),{addInstanceField}=await import('/src/studio/instance-fields.mjs'),{FlowProjectEditor,parseFlowProject}=await import('/src/studio/flow-project.mjs'),{instanceSlot}=await import('/src/instances/names.mjs'),manager=new ProjectFileManager(localStorage,'files','native'),record=manager.load();let p=addInstanceField(parseInstanceProject(record.source),'Counter','spare','Number',0);const target={kind:'transition',instance:'left',name:'Change'},view=instanceProjectFlow(p,target),e=new FlowProjectEditor(parseFlowProject(view.source,view.registry,view.options),view.registry,view.options);e.createContract('user.Unused');e.openContract('user.Unused');e.add('state.'+instanceSlot('left','spare')+'.read');p=applyInstanceProjectFlow(p,target,e.serialize());manager.save({...record,source:serializeInstanceProject(p)});})()`);
 await page.close();page=await browser.page(server.origin+modulePath);await until(page,`!!document.querySelector('[data-remove-field="spare"]')`);await page.evaluate(`document.querySelector('[data-remove-field="spare"]').click()`);
 assert.match(await page.evaluate(`document.querySelector('#error').textContent`),/user.Unused/);await page.evaluate(`document.querySelector('#error a[href*="scope=user.Unused"]').click()`);
 await until(page,`document.querySelector('#scope')?.textContent==='user.Unused'`);
 assert.match(await page.evaluate(`document.querySelector('#inspector').textContent`),/Прочитать left.spare/);assert.equal(await page.evaluate(`document.querySelectorAll('.flow-card.selected').length`),1);
 await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}));document.querySelector('#save').click();`);assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');
 await page.close();page=await browser.page(server.origin+modulePath);await until(page,`!!document.querySelector('[data-remove-field="spare"]')`);await page.evaluate(`document.querySelector('[data-remove-field="spare"]').click()`);assert.equal(await page.evaluate(`document.querySelectorAll('[data-field="spare"]').length`),0);assert.equal(await page.evaluate(`document.querySelector('#error').textContent`),'');
 }finally{await browser?.close();await server.close();}
});

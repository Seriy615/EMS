import {compileUIFlow,newUIFlow} from '../ui/flow.mjs';
import {compileUIHandler} from '../ui/source.mjs';
import {fail} from '../reference/errors.mjs';
import {serializeUIProject,parseUIProject,parseUIWorkspace} from '../ui/project.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
/** Transactional UI authoring snapshot. Execution state is owned by preview, not this saved program. */
export class UIProjectEditor{
 constructor(application,base=createCoreRegistry(),{sources={}}={}){this.base=base;this.source=serializeUIProject(application,base,{sources});this.history=[];this.future=[];}
 get workspace(){return parseUIWorkspace(this.source,this.base);}
 get sources(){return this.workspace.sources;}
 get application(){return parseUIProject(this.source,this.base);}
 replace(source){const workspace=parseUIWorkspace(source,this.base),next=serializeUIProject(workspace.application,this.base,{sources:workspace.sources});if(next===this.source)return;this.history.push(this.source);if(this.history.length>100)this.history.shift();this.source=next;this.future=[];}
 edit(change){const workspace=this.workspace;change(workspace.application,workspace.sources);this.replace(serializeUIProject(workspace.application,this.base,{sources:workspace.sources}));}
 addState(id,type,initial){this.edit(app=>app.reactor.state.push({id,type,initial}));}
 setInitial(id,initial){this.edit(app=>{const slot=app.reactor.state.find(slot=>slot.id===id);if(!slot)fail('UNKNOWN_STATE','Unknown state');slot.initial=initial;});}
 createHandler(event,entry,{parameter='',type='Number'}={}){
  if(!/^[_A-Za-z][_A-Za-z0-9]*$/.test(event)||!/^[_A-Za-z][_A-Za-z0-9]*(\.[_A-Za-z][_A-Za-z0-9]*)*$/.test(entry)||parameter&&!/^[_A-Za-z][_A-Za-z0-9]*$/.test(parameter))fail('INVALID_HANDLER','Use EMS identifiers for handler, contract and parameter');
  if(this.application.reactor.handlers.some(handler=>handler.event===event))fail('DUPLICATE_HANDLER','Handler already exists');
  const types={Number:'Number',Boolean:'Boolean',String:'String',NumberArray:'Number[]'};
  if(!Object.hasOwn(types,type))fail('INVALID_TYPE','Unsupported handler parameter type');
  this.applyHandler(event,'@'+entry.replaceAll('.','::')+'('+ (parameter?parameter+':'+types[type]:'') +')->'+(parameter?types[type]:'Number')+' { return '+(parameter||'0')+'; }',entry);
 }
 createFlowHandler(event,entry,options={}){const candidate=new UIProjectEditor(this.application,this.base,{sources:this.sources});candidate.createHandler(event,entry,options);candidate.applyFlow(event,newUIFlow(event,entry,options));this.replace(candidate.source);}
 applyFlow(event,flow){this.edit((app,sources)=>{if(!/^[_A-Za-z][_A-Za-z0-9]*$/.test(event))fail('INVALID_HANDLER','Use an EMS event name');const bundle=compileUIFlow(flow,app,this.base),handler=app.reactor.handlers.find(item=>item.event===event);if(handler)handler.program=bundle.ir;else app.reactor.handlers.push({event,program:bundle.ir});Object.defineProperty(sources,event,{value:{source:bundle.source,entry:bundle.project.graph.id,flow:bundle.flow},enumerable:true,writable:true,configurable:true});});}
 addNode(parent,node,index){this.edit(app=>{const children=find(app.ui.root,parent).children;if(index!==undefined&&(!Number.isSafeInteger(index)||index<0||index>children.length))fail('INVALID_UI','Invalid insertion index');children.splice(index??children.length,0,structuredClone(node));});}
 moveNode(id,parent,index){this.edit(app=>{if(id===app.ui.root.id)fail('INVALID_UI','Cannot move root');const node=find(app.ui.root,id),target=find(app.ui.root,parent);if(!['column','row'].includes(target.kind))fail('INVALID_UI','Drop target must be a container');function contains(n){return n.id===parent||n.children.some(contains);}if(contains(node))fail('INVALID_UI','Cannot place a container inside itself');let previous;function detach(n){const at=n.children.findIndex(c=>c.id===id);if(at>=0){previous={parent:n,index:at};n.children.splice(at,1);return true;}return n.children.some(detach);}detach(app.ui.root);const at=index??target.children.length;if(!Number.isSafeInteger(at)||at<0||at>target.children.length+(previous.parent===target?1:0))fail('INVALID_UI','Invalid insertion index');target.children.splice(previous.parent===target&&previous.index<at?at-1:at,0,node);});}
 removeNode(id){this.edit(app=>{if(app.ui.root.id===id)fail('INVALID_UI','Cannot remove root');function remove(parent){const index=parent.children.findIndex(child=>child.id===id);if(index>=0){parent.children.splice(index,1);return true;}return parent.children.some(remove);}if(!remove(app.ui.root))fail('INVALID_UI','Unknown UI node');});}
 property(id,name,binding){this.edit(app=>{find(app.ui.root,id).props[name]=structuredClone(binding);});}
 event(id,name,handler,inputs){this.edit(app=>{find(app.ui.root,id).events[name]={handler,inputs:structuredClone(inputs)};});}
 applyHandler(event,source,entry){this.edit((app,sources)=>{const bundle=compileUIHandler(source,entry,app,this.base),handler=app.reactor.handlers.find(item=>item.event===event);if(handler)handler.program=bundle.ir;else app.reactor.handlers.push({event,program:bundle.ir});Object.defineProperty(sources,event,{value:{source,entry},enumerable:true,writable:true,configurable:true});});}
 undo(){if(!this.history.length)return;parseUIProject(this.history.at(-1),this.base);this.future.push(this.source);this.source=this.history.pop();}
 redo(){if(!this.future.length)return;parseUIProject(this.future.at(-1),this.base);this.history.push(this.source);this.source=this.future.pop();}
}
/** One bounded, atomic local record. A failed validation/quota write preserves the previous saved program. */
export class UIProjectStorage{
 constructor(storage,base=createCoreRegistry()){this.storage=storage;this.base=base;}
 load(){const source=this.storage.getItem('ems.studio.ui.v1');return source===null?null:parseUIProject(source,this.base);}
 loadWorkspace(){const source=this.storage.getItem('ems.studio.ui.v1');return source===null?null:parseUIWorkspace(source,this.base);}
 save(application,{sources={}}={}){const source=serializeUIProject(application,this.base,{sources});this.storage.setItem('ems.studio.ui.v1',source);}
}

function find(node,id){if(node.id===id)return node;for(const child of node.children){try{return find(child,id);}catch(error){if(error.code!=='UNKNOWN_UI_NODE')throw error;}}fail('UNKNOWN_UI_NODE','Unknown UI node');}

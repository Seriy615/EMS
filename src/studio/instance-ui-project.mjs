import {parseInstanceProject,serializeInstanceProject,withInstanceUI} from './instance-project.mjs';
import {UIProjectEditor} from './ui-project.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {instanceUIBindings} from '../instances/ui.mjs';
import {validateInstanceModule} from '../instances/module.mjs';
import {instanceSlot} from '../instances/names.mjs';
import {uiConnections} from './ui-connections.mjs';
import {fail} from '../reference/errors.mjs';
/** Authoring view is metadata, not an executable reactor or a second copy of transition logic. */
export class InstanceUIProjectEditor{
 constructor(project,base=createCoreRegistry()){this.base=base;this.source=serializeInstanceProject(project.ui?project:withInstanceUI(project,undefined,base),base);this.history=[];this.future=[];}
 get document(){return parseInstanceProject(this.source,this.base);}
 get sources(){return {};}
 get handlerSignatures(){return new Map(instanceUIBindings(this.document.module).actions.map(action=>[action.id,action.signature]));}
 view(document){const bindings=instanceUIBindings(document.module);return {schemaVersion:'ems-instance-ui-view/1',id:document.module.id,ui:document.ui,reactor:{schemaVersion:'ems-reactor/2',state:bindings.fields.map(field=>({id:field.id,type:field.type})),handlers:bindings.actions.map(action=>({event:action.id}))}};}
 get application(){return this.view(this.document);}
 replace(source){parseInstanceProject(source,this.base);if(source===this.source)return;this.history.push(this.source);if(this.history.length>100)this.history.shift();this.source=source;this.future=[];}
 edit(change){const document=this.document,view=this.view(document);change(view,{});document.ui=view.ui;this.replace(serializeInstanceProject(document,this.base));}
 undo(){if(!this.history.length)return;parseInstanceProject(this.history.at(-1),this.base);this.future.push(this.source);this.source=this.history.pop();}
 redo(){if(!this.future.length)return;parseInstanceProject(this.future.at(-1),this.base);this.history.push(this.source);this.source=this.future.pop();}
 get connections(){const document=this.document,checked=validateInstanceModule(document.module,this.base),bindings=instanceUIBindings(document.module),names=new Map(bindings.fields.map(field=>[instanceSlot(field.instance,field.field),field.id])),routes=uiConnections({ui:document.ui,reactor:{state:checked.slots,handlers:checked.transitions.map(action=>({event:action.instance+'::'+action.name,program:{...document.module.program,entry:action.entry}}))}});for(const action of routes.handlers)for(const key of ['reads','writes'])action[key]=action[key].map(id=>names.get(id));routes.state=bindings.fields.map(({id,type})=>({id,type}));return routes;}
}
for(const method of ['addNode','moveNode','removeNode','property','event'])InstanceUIProjectEditor.prototype[method]=function(...args){return UIProjectEditor.prototype[method].apply(this,args);};
for(const method of ['addState','setInitial','applyHandler','createHandler','createFlowHandler'])InstanceUIProjectEditor.prototype[method]=function(){fail('INSTANCE_UI_MODULE','Edit native state and operations in the contract module');};

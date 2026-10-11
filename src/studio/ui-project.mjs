import {fail} from '../reference/errors.mjs';
import {serializeUIProject,parseUIProject} from '../ui/project.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
/** Transactional UI authoring snapshot. Execution state is owned by preview, not this saved program. */
export class UIProjectEditor{
 constructor(application,base=createCoreRegistry()){this.base=base;this.source=serializeUIProject(application,base);this.history=[];this.future=[];}
 get application(){return parseUIProject(this.source,this.base);}
 replace(source){const next=serializeUIProject(parseUIProject(source,this.base),this.base);if(next===this.source)return;this.history.push(this.source);if(this.history.length>100)this.history.shift();this.source=next;this.future=[];}
 undo(){if(!this.history.length)return;parseUIProject(this.history.at(-1),this.base);this.future.push(this.source);this.source=this.history.pop();}
 redo(){if(!this.future.length)return;parseUIProject(this.future.at(-1),this.base);this.history.push(this.source);this.source=this.future.pop();}
}
/** One bounded, atomic local record. A failed validation/quota write preserves the previous saved program. */
export class UIProjectStorage{
 constructor(storage,base=createCoreRegistry()){this.storage=storage;this.base=base;}
 load(){const source=this.storage.getItem('ems.studio.ui.v1');return source===null?null:parseUIProject(source,this.base);}
 save(application){const source=serializeUIProject(application,this.base);this.storage.setItem('ems.studio.ui.v1',source);}
}

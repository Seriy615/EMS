import {createCoreRegistry} from '../../src/reference/registry.mjs';
import {createStateRegistry} from '../../src/runtime/reactor.mjs';
import {parseEMSModule} from '../../src/frontend/index.mjs';
import {typecheckModule} from '../../src/frontend/check.mjs';
import {lowerCheckedModule} from '../../src/frontend/lower.mjs';
export const policy={capabilities:['ui.render','state.read','state.write'],allowedEffects:['ui.render','state.read','state.write']};
export function fixture({profile='auto'}={}){
 const state=[{id:'count',type:'Number',initial:0},{id:'name',type:'String',initial:'EMS'},{id:'locked',type:'Boolean',initial:false}],base=createCoreRegistry(),registry=createStateRegistry(base,state);
 const sources={increment:'fn run(delta:Number)->Number {return state.count.write(state.count.read()+delta);}',fail:'fn run()->Number {state.count.write(100);return core.div(1,0);}',rename:'fn run(name:String)->String {if name=="reject" {throw "Rejected";} return state.name.write(name);}',lock:'fn run(value:Boolean)->Boolean {return state.locked.write(value);}'};
 const handlers=Object.entries(sources).map(([event,source])=>({event,program:lowerCheckedModule(typecheckModule(parseEMSModule(source),registry),'run',registry,{profile}).ir}));
 const node=(id,kind,props,events={},children=[])=>({id,kind,props,events,children});
 const application={schemaVersion:'ems-ui-app/1',id:'demo.counter',version:'1.0.0',reactor:{schemaVersion:'ems-reactor/1',id:'demo.counter',version:'1.0.0',state,handlers},ui:{schemaVersion:'ems-ui/1',root:node('root','column',{label:{literal:'Counter'}},{},[
 node('count','text',{text:{state:'count',format:'number'}}),node('increment','button',{text:{literal:'+'},disabled:{state:'locked'}},{press:{handler:'increment',inputs:{delta:{literal:1}}}}),node('fail','button',{text:{literal:'Fail'}},{press:{handler:'fail',inputs:{}}}),node('name','textInput',{value:{state:'name'},label:{literal:'Name'}},{change:{handler:'rename',inputs:{name:{value:true}}}}),node('locked','checkbox',{checked:{state:'locked'},label:{literal:'Lock'}},{change:{handler:'lock',inputs:{value:{value:true}}}})
 ])}};return {application,base};
}

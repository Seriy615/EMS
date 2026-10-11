import {hasCollections,collectionSource} from './collections.mjs';
import {Registry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';
import {executeIR,compileIRToJS,serializeIR,parseIR,graphFromIR,checkIRPolicy} from '../ir/index.mjs';
import {newProject,defaultValue,validateProject,workspaceProfile,projectRegistry} from './project.mjs';

export function compileTextDraft(draft,editor){
 if(!draft||typeof draft.source!=='string'||draft.source.length>262144||typeof draft.entry!=='string'||!['auto','call'].includes(draft.lowering))fail('INVALID_DRAFT','Invalid bounded text draft');
 const ast=parseEMSModule(draft.source,{maxTokens:20000,maxDepth:128}),registry=new Registry();
 const declared=new Set(ast.declarations.filter(node=>['FunctionDeclaration','ContractDeclaration'].includes(node.kind)).map(node=>node.name));
 const owned=new Set(editor.project.contracts.map(item=>item.graph.id));
 for(const item of editor.registry.items.values())if(!(owned.has(item.id)&&declared.has(item.id)))registry.items.set(item.id,item);
 const bundle=lowerCheckedModule(typecheckModule(ast,registry),draft.entry,registry,{profile:draft.lowering,preserveGraphIdentity:true});
 checkIRPolicy(bundle.ir,bundle.registry,{capabilities:[],allowedEffects:[]});
 if(bundle.ir.schemaVersion==='ems-ir/1'){
  const graph=graphFromIR(bundle.ir,bundle.registry),base=new Registry(),contracts=[];
  for(const item of bundle.registry.items.values())if(item.kind==='composite'&&item.id!==graph.id)contracts.push({graph:item.graph,inputs:{},canvas:{}});else if(item.kind!=='composite')base.items.set(item.id,item);
  projectRegistry({graph,contracts},base);
 }
 bundle.ir=parseIR(serializeIR(bundle.ir,bundle.registry),bundle.registry);return bundle;
}
export async function runTextDraft(draft,editor,inputs,options={}){
 for(const key of ['onNodeEnter','onControlEnter','onFrameExit'])if(options[key]!==undefined&&typeof options[key]!=='function')fail('INVALID_OPTION','Expected diagnostic observer');
 const bundle=compileTextDraft(draft,editor);
 const locate=event=>{
  const call=event.callPath?.at(-1),fn=event.function??call?.graph,node=event.node??call?.node;
  return {...event,location:structuredClone(bundle.provenance.functions[fn]?.nodes?.[node]??null)};
 };
 return executeIR(bundle.ir,inputs,bundle.registry,{...options,maxSteps:10000,maxDepth:32,
  onNodeEnter:options.onNodeEnter?event=>options.onNodeEnter(locate(event)):undefined,
  onControlEnter:options.onControlEnter?event=>options.onControlEnter(locate(event)):undefined});
}
export function compileTextJS(draft,editor){const bundle=compileTextDraft(draft,editor);return compileIRToJS(bundle.ir,bundle.registry);}
function layout(graph,previous){
 const positions=Object.fromEntries([...Object.keys(graph.inputs).map((name,index)=>[`input:${name}`,{x:30,y:100+index*120}]),...graph.nodes.map((node,index)=>[node.id,{x:280+(index%2)*250,y:70+Math.floor(index/2)*160}])]);
 for(const id of [...Object.keys(positions),'output'])if(previous?.positions[id])positions[id]=structuredClone(previous.positions[id]);
 return {positions,view:structuredClone(previous?.view??{x:0,y:0,scale:1})};
}
/** Only actual call-IR can become this dataflow editor; control IR stays control IR. */
export function projectFromText(draft,editor,inputs){
 const bundle=compileTextDraft(draft,editor);if(bundle.ir.schemaVersion!=='ems-ir/1')fail('UNSUPPORTED_VISUAL_PROFILE','Control IR is executable in text mode but has no dataflow conversion');
 const graph=graphFromIR(bundle.ir,bundle.registry),target=editor.selectedContract;
 if(target&&graph.id!==target)fail('ENTRY_MISMATCH','Text entry must match the selected composite');
 const project=target?structuredClone(editor.project):newProject(editor.project.id,editor.project.name);
 if(!target){if(editor.project.collections)project.collections=structuredClone(editor.project.collections);project.graph=graph;project.inputs=structuredClone(inputs);project.canvas=layout(graph,editor.project.canvas);}
 project.contracts=[];
 for(const item of bundle.registry.items.values())if(item.kind==='composite'&&item.id!==project.graph.id){
  const body=structuredClone(item.graph),old=editor.project.contracts.find(item=>item.graph.id===body.id);project.contracts.push({graph:body,inputs:target===body.id?structuredClone(inputs):Object.fromEntries(Object.entries(body.inputs).map(([name,spec])=>[name,old?.graph.inputs[name]?.type===spec.type?structuredClone(old.inputs[name]):defaultValue(spec.type)])),canvas:layout(body,old?.canvas)});
 }
 validateProject(project,editor.baseRegistry);
 return {project,provenance:bundle.provenance,ir:bundle.ir};
}

/** Export one workspace against the project's existing typed library. Unsupported naming/order fails explicitly. */
export function textFromWorkspace(editor){
 const graph=editor.workspace.graph,registry=editor.registry;
 if(hasCollections(graph,registry))return {...collectionSource(graph,registry),lowering:'auto'};
 const keywords=new Set(['return','let','fn','contract','if','else','while','for','true','false','async','export','extern','package','import','as','match','using','mut','throw','try','catch','finally','break','continue','in','await']);
 function name(value){if(typeof value!=='string'||!value.split('.').every(part=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)&&!keywords.has(part)))fail('UNSUPPORTED_TEXT_EXPORT','Name cannot be represented in current EMS grammar');return value;}
 const type=value=>value==='NumberArray'?'Number[]':value;
 const literal=value=>Object.is(value,-0)?'-0':Array.isArray(value)?'['+value.map(literal).join(',')+']':JSON.stringify(value);
 const ref=value=>Object.hasOwn(value,'literal')?literal(value.literal):name(value.node??value.input);
 let lowering='call',ordered=[];
 if(Object.hasOwn(graph,'sequence')){if(graph.sequence.length!==graph.nodes.length)fail('UNSUPPORTED_TEXT_EXPORT','Partial sequence cannot be exported as sequential source');ordered=graph.sequence.map(id=>graph.nodes.find(node=>node.id===id));lowering='auto';}
 else{
  if(workspaceProfile(graph,registry)!=='ems-core-finite/1')fail('UNSUPPORTED_TEXT_EXPORT','Nested sequences require explicit source order');
  const seen=new Set(),nodes=new Map(graph.nodes.map(node=>[node.id,node]));
  function visit(node){if(seen.has(node.id))return;for(const value of Object.values(node.args))if(value.node)visit(nodes.get(value.node));seen.add(node.id);ordered.push(node);}
  graph.nodes.forEach(visit);
 }
 const lines=[`package studio.text @ ${JSON.stringify(graph.version)};`,`contract ${name(graph.id)}(${Object.entries(graph.inputs).map(([key,spec])=>`${name(key)}:${type(spec.type)}`).join(',')})->${type(graph.output.type)} {`];
 for(const node of ordered){const contract=registry.resolve(node.uses);lines.push(`  let ${name(node.id)}=${name(node.uses)}(${Object.keys(contract.inputs).map(port=>ref(node.args[port])).join(',')});`);}
 lines.push(`  return ${ref(graph.returns)};`,'}');return {source:lines.join('\n')+'\n',entry:graph.id,lowering};
}

export function validateStoredDraft(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='entry,inputs,lowering,schemaVersion,source'||value.schemaVersion!=='ems-studio-text/1'||typeof value.source!=='string'||value.source.length>262144||typeof value.entry!=='string'||value.entry.length>1024||!['auto','call'].includes(value.lowering)||typeof value.inputs!=='string'||value.inputs.length>1048576)fail('INVALID_DRAFT','Invalid bounded saved text draft');return value;
}
export class TextDraftStorage{
 constructor(storage){this.storage=storage;}
 load(id){const source=this.storage.getItem('ems.studio.text.'+id);if(!source)return null;if(source.length>2097152)fail('SOURCE_LIMIT','Saved draft too large');let value;try{value=JSON.parse(source);}catch{fail('INVALID_DRAFT','Corrupt saved text draft');}return validateStoredDraft(value);}
 save(id,draft){const record=validateStoredDraft({schemaVersion:'ems-studio-text/1',source:draft?.source,entry:draft?.entry,lowering:draft?.lowering,inputs:draft?.inputs});this.storage.setItem('ems.studio.text.'+id,JSON.stringify(record));}
}

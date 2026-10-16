import {parseEMSModule} from '../frontend/index.mjs';
import {printInstanceUISource,compileInstanceUIFragment} from '../instances/ui-source.mjs';
import {serializeInstanceModule} from '../instances/module.mjs';
import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {compileSourceWorkspace} from './source-workspace-compiler.mjs';
import {sourceProjectGraphs} from './source-project-graphs.mjs';
import {parseSourceProject,serializeSourceProject} from './source-project.mjs';
import {SourceWorkspace} from './source-workspace.mjs';
import {createCoreRegistry} from '../reference/registry.mjs';
import {fail} from '../reference/errors.mjs';

const UI_DECLARATIONS=new Set(['UINodeDeclaration','UIEventBindingDeclaration']);
function scope(ast){
 const apps=ast.declarations.filter(item=>item.kind==='ApplicationDeclaration');
 if(apps.length>1)fail('SOURCE_UI_SCOPE','В исходном файле допускается одно приложение.');
 return {declarations:apps[0]?.declarations??ast.declarations,container:apps[0]??null};
}
function indentAt(source,offset){const start=source.lastIndexOf('\n',offset-1)+1;return /^[ \t]*/.exec(source.slice(start,offset))[0];}
function indent(text,prefix){return text.split('\n').map((line,index)=>index?prefix+line:line).join('\n');}
function declarationText(source,node){return source.slice(node.location.start.offset,node.location.end.offset);}

/** Replace only a source module's UI declarations, preserving every non-UI span. */
export function applySourceProjectUI(source,file,ui,base=createCoreRegistry(),options={}){
 const project=parseSourceProject(source),original=project.sources.get(file);
 if(original===undefined)fail('MISSING_MODULE','UI file is absent from source project',{file});
 const compiled=compileSourceWorkspace(source,{...options,mode:'native'},base);
 if(compiled.kind!=='native'||!compiled.bundle.project?.ui)fail('SOURCE_UI_REQUIRED','В выбранном исходном файле нет проверенного приложения EMS.');
 const module=compiled.bundle.project.module,fragment=printInstanceUISource(module,ui,base),fragmentAST=parseEMSModule(fragment);
 const fragmentScope=scope(fragmentAST),root=fragmentScope.declarations.find(item=>item.kind==='UINodeDeclaration');
 if(!root)fail('SOURCE_UI_ROOT','Визуальному интерфейсу нужен один корневой элемент.');
 const rootText=declarationText(fragment,root),routes=fragmentScope.declarations.filter(item=>item.kind==='UIEventBindingDeclaration').map(item=>declarationText(fragment,item));
 const ast=parseEMSModule(original,{maxTokens:20000,maxDepth:128}),target=scope(ast),roots=target.declarations.filter(item=>item.kind==='UINodeDeclaration');
 if(roots.length!==1)fail('SOURCE_UI_SCOPE','В исходном файле должен быть ровно один корневой UI-контракт.');
 let candidate=original;
 const rootNode=roots[0],rootIndent=indentAt(original,rootNode.location.start.offset);
 candidate=candidate.slice(0,rootNode.location.start.offset)+indent(rootText,rootIndent)+candidate.slice(rootNode.location.end.offset);
 const nextAST=parseEMSModule(candidate,{maxTokens:20000,maxDepth:128}),nextScope=scope(nextAST),oldRoutes=nextScope.declarations.filter(item=>item.kind==='UIEventBindingDeclaration');
 const edits=[];
 if(oldRoutes.length){
  const at=oldRoutes[0].location.start.offset,prefix=indentAt(candidate,at);
  edits.push({start:at,end:oldRoutes[0].location.end.offset,text:routes.map(item=>indent(item,prefix)).join('\n')});
  for(const route of oldRoutes.slice(1))edits.push({start:route.location.start.offset,end:route.location.end.offset,text:''});
 }else if(routes.length){
  const at=nextScope.container?nextScope.container.location.end.offset-1:candidate.length;
  const prefix=nextScope.container?indentAt(candidate,nextScope.container.location.start.offset)+'  ':'\n';
  edits.push({start:at,end:at,text:(at&&candidate[at-1]!=='\n'?'\n':'')+routes.map(item=>indent(item,prefix)).join('\n')+'\n'});
 }
 for(const edit of edits.sort((a,b)=>b.start-a.start))candidate=candidate.slice(0,edit.start)+edit.text+candidate.slice(edit.end);
 const nextSources=new Map(project.sources);nextSources.set(file,candidate);const result=serializeSourceProject(project.entry,nextSources),checked=compileSourceWorkspace(result,{...options,mode:'native'},base);
 if(checked.kind!=='native'||serializeInstanceModule(checked.bundle.project.module,base)!==serializeInstanceModule(module,base))fail('SOURCE_UI_MODULE_CHANGED','Изменение интерфейса затронуло контрактную логику.');
 if(formatFiniteJSON(checked.bundle.project.ui)!==formatFiniteJSON(ui))fail('SOURCE_UI_MISMATCH','Проверенный интерфейс отличается от визуальных правок.');
 return result;
}

/** UI authoring session commits through the checked source workspace compare-before-write. */
export class SourceProjectUISession{
 constructor(storage,id,{file,entry='Main'}={}){this.storage=storage;this.id=id;this.file=file;this.options={entry};this.base=createCoreRegistry();this.workspace=new SourceWorkspace(storage,id);if(this.workspace.dirty||this.workspace.warning)fail('SOURCE_DRAFT_PENDING','Сначала примените или восстановите текстовый черновик проекта.');this.load();}
 load(){const parsed=this.workspace.project;this.file??=parsed.entry;const context=sourceProjectGraphs(this.workspace.expected,{...this.options,mode:'native'}),compiled=context.compiled;if(compiled.kind!=='native'||!compiled.bundle.project?.ui)fail('SOURCE_UI_REQUIRED','Исходный проект не содержит проверенный UI.');if(this.file!==parsed.entry)fail('SOURCE_UI_SCOPE','UI редактируется во входном EMS-файле.');this.document=compiled.bundle.project;this.targets=context.targets;this.expected=this.workspace.expected;return this.document;}
 graphTarget(handler){const [instance,operation]=handler.split('::'),target=this.targets.find(item=>item.kind==='transition'&&item.instance===instance&&item.operation===operation);if(!target)fail('SOURCE_UI_HANDLER','Граф этой операции недоступен.');return target;}
 apply(ui){this.workspace.assertCurrent();const candidate=applySourceProjectUI(this.expected,this.file,ui,this.base,this.options),parsed=parseSourceProject(candidate);this.workspace.change(project=>{project.entry=parsed.entry;project.sources=parsed.sources;});const checked=this.workspace.commit({...this.options,mode:'native'});this.expected=this.workspace.expected;this.document=checked.bundle.project;this.load();return this.document;}
 refresh(){this.expected=this.workspace.expected;return this.load();}
}

import {fail} from '../reference/errors.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {validateDescription} from '../contracts/descriptions.mjs';
export {validateDescription} from '../contracts/descriptions.mjs';
/** Adjacent /// documentation belongs to a declaration/statement, never to its semantic IR. */
export function sourceDescription(source,location){
 const end=location.start.offset,line=source.lastIndexOf('\n',end-1)+1;if(source.slice(line,end).trim())return {text:'',start:end,end};
 let start=line,lines=[];
 while(start>0){const previous=source.lastIndexOf('\n',start-2)+1,value=source.slice(previous,start).trimEnd(),match=value.match(/^\s*\/\/\/ ?(.*)$/);if(!match)break;lines.unshift(match[1]);start=previous;}
 return {text:lines.join('\n'),start:lines.length?start:end,end};
}
export function descriptionEdit(source,location,value){
 validateDescription(value);const existing=sourceDescription(source,location),text=value.trim();
 return {start:existing.start,end:location.start.offset,text:text?(existing.start===location.start.offset&&source.slice(source.lastIndexOf('\n',location.start.offset-1)+1,location.start.offset).trim()?'\n':'')+text.split(/\r?\n/).map(line=>'/// '+line).join('\n')+'\n':''};
}
/** Bind original located documentation to the compiler's actual operation/statement addresses. */
export function sourceFlowchartDescriptions(source,provenance){
 const comments=new Map(),ast=parseEMSModule(source,{maxTokens:20000,maxDepth:128});
 function visit(node){if(!node||typeof node!=='object')return;if(node.location){const annotation=sourceDescription(source,node.location);if(annotation.text){validateDescription(annotation.text);comments.set(node.location.start.offset+':'+node.location.end.offset,annotation.text);if(['LetDeclaration','ReturnStatement','ExpressionStatement'].includes(node.kind)&&node.value)comments.set(node.value.location.start.offset+':'+node.value.location.end.offset,annotation.text);}}for(const [key,value]of Object.entries(node))if(key!=='location'){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
 visit(ast);const result={};for(const [id,fn]of Object.entries(provenance.functions)){const labels={};for(const [path,location]of Object.entries(fn.nodes??{})){const text=comments.get(location.start.offset+':'+location.end.offset);if(text)Object.defineProperty(labels,path,{value:text,enumerable:true});}Object.defineProperty(result,id,{value:labels,enumerable:true});}return result;
}

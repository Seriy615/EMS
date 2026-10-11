import {fail} from '../reference/errors.mjs';
import {createStateRegistry} from '../runtime/reactor.mjs';
import {parseEMSModule} from '../frontend/index.mjs';
import {typecheckModule} from '../frontend/check.mjs';
import {lowerCheckedModule} from '../frontend/lower.mjs';
import {serializeIR} from '../ir/index.mjs';
/** UI handlers are ordinary EMS functions. Control lowering keeps source helpers in the shared program IR. */
export function compileUIHandler(source,entry,application,base){
 if(typeof source!=='string'||source.length>262144||new TextEncoder().encode(source).length>262144||typeof entry!=='string'||!entry||entry.length>1024)fail('SOURCE_LIMIT','Invalid bounded UI handler source/entry');
 const registry=createStateRegistry(base,application.reactor.state);
 return lowerCheckedModule(typecheckModule(parseEMSModule(source,{maxTokens:20000,maxDepth:128}),registry),entry,registry,{profile:'control'});
}
/** Source metadata must be a reproducible witness for the saved executable handler, not an unrelated draft. */
export function validateUISources(application,base,sources){
 if(!sources||typeof sources!=='object'||Array.isArray(sources)||![Object.prototype,null].includes(Object.getPrototypeOf(sources))||Reflect.ownKeys(sources).length!==Object.keys(sources).length||Object.keys(sources).length>100)fail('INVALID_UI_PROJECT','Invalid handler sources');
 const handlers=new Map(application.reactor.handlers.map(handler=>[handler.event,handler.program])),registry=createStateRegistry(base,application.reactor.state);
 for(const [event,draft]of Object.entries(sources)){
  if(!handlers.has(event)||!draft||typeof draft!=='object'||Array.isArray(draft)||Reflect.ownKeys(draft).length!==2||!Object.hasOwn(draft,'source')||!Object.hasOwn(draft,'entry'))fail('INVALID_UI_PROJECT','Source must identify a real handler');
  const compiled=compileUIHandler(draft.source,draft.entry,application,base);
  if(serializeIR(compiled.ir,compiled.registry)!==serializeIR(handlers.get(event),registry))fail('SOURCE_IR_MISMATCH','Handler source disagrees with saved semantic IR',{event});
 }
 return Object.fromEntries(Object.keys(sources).sort().map(event=>[event,{source:sources[event].source,entry:sources[event].entry}]));
}

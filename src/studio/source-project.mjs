import {fail} from '../reference/errors.mjs';
import {modulePath} from '../frontend/modules.mjs';
const limit=4*1024*1024;
function fields(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_SOURCE_PROJECT','Unexpected source project fields');}
/** A source project is compiler input, distinct from a compiled module or an editor canvas. */
export function parseSourceProject(source){
 if(typeof source!=='string'||source.length>limit)fail('MODULE_LIMIT','Source project exceeds 4 MiB');let data;try{data=JSON.parse(source);}catch{fail('INVALID_SOURCE_PROJECT','Malformed source project');}
 fields(data,['schemaVersion','entry','files']);if(data.schemaVersion!=='ems-source-project/1'||!Array.isArray(data.files)||!data.files.length||data.files.length>64)fail('INVALID_SOURCE_PROJECT','Unsupported source project');
 const sources=new Map();let bytes=0;for(const file of data.files){fields(file,['path','source']);const path=modulePath(file.path);if(path!==file.path||sources.has(path)||typeof file.source!=='string')fail('INVALID_SOURCE_PROJECT','Invalid source file identity');if(file.source.length>1048576||(bytes+=new TextEncoder().encode(file.source).length)>1048576)fail('MODULE_LIMIT','Source text exceeds 1 MiB');sources.set(path,file.source);}
 const entry=modulePath(data.entry);if(entry!==data.entry||!sources.has(entry))fail('MISSING_MODULE','Source project entry is absent',{file:entry});return {entry,sources};
}

export function serializeSourceProject(entry,sources){const source=JSON.stringify({schemaVersion:'ems-source-project/1',entry,files:[...sources].map(([path,source])=>({path,source}))},null,2)+'\n';parseSourceProject(source);return source;}
export function newSourceProject(){return serializeSourceProject('main.ems',new Map([['main.ems','@Main()->Number graph {\n  @std::program::Result #result { value: 0; }\n  + #result;\n}\n']]));}

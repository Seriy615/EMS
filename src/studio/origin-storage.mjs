import {normalizeOriginPolicy,verifyBoundOriginPolicy} from '../semantics/origin-policy.mjs';
import {fail} from '../reference/errors.mjs';

/** Project-local label metadata only. Inspection grants and runtime values are never persisted. */
export class StudioOriginStorage{
 constructor(storage,project){if(typeof project!=='string'||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(project)||project.length>1024)fail('INVALID_ORIGIN_STORAGE','Invalid project owner');this.storage=storage;this.project=project;this.key='ems.studio.origins.v1:'+project;}
 check(source){
  if(typeof source!=='string'||new TextEncoder().encode(source).length>1048576)fail('INVALID_ORIGIN_STORAGE','Origin metadata exceeds its budget');
  let data;try{data=JSON.parse(source);}catch{fail('INVALID_ORIGIN_STORAGE','Malformed origin document');}
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==3||data.schemaVersion!=='ems-studio-origins/1'||data.project!==this.project||!Object.hasOwn(data,'policy'))fail('INVALID_ORIGIN_STORAGE','Origin version/owner/fields mismatch');
  const policy=normalizeOriginPolicy(data.policy);if(policy.schemaVersion!=='ems-origin-policy/2')fail('INVALID_ORIGIN_STORAGE','Persisted annotations require binding');return policy;
 }
 load(){const source=this.storage.getItem(this.key);return source===null?null:this.check(source);}
 save(policy){const source=JSON.stringify({schemaVersion:'ems-studio-origins/1',project:this.project,policy:normalizeOriginPolicy(policy)});this.check(source);this.storage.setItem(this.key,source);}
 clear(){this.storage.removeItem(this.key);}
 async checked(ir,registry){const policy=this.load();if(policy)await verifyBoundOriginPolicy(ir,registry,policy);return policy;}
}

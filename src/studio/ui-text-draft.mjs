import {formatFiniteJSON} from '../semantics/data-json.mjs';
import {printInstanceUISource} from '../instances/ui-source.mjs';
import {fail} from '../reference/errors.mjs';
/** A UI text draft is independent of checked UI, implementation IR and layout. */
export class InstanceUITextDraft{
 constructor(storage,owner,module,ui,{fromCurrent=false}={}){this.storage=storage;this.key='ems.instance.ui-text.'+owner;this.reset(module,ui,false);const raw=storage.getItem(this.key);if(raw!==null&&fromCurrent){storage.setItem(this.key+'.previous',raw);storage.removeItem(this.key);}else if(raw!==null){let draft;try{draft=JSON.parse(raw);}catch{fail('INVALID_UI_TEXT_DRAFT','Malformed UI text draft');}if(draft?.schemaVersion!=='ems-ui-text-draft/1'||Object.keys(draft).sort().join(',')!=='base,schemaVersion,text'||typeof draft.base!=='string'||draft.base.length>4*1024*1024||typeof draft.text!=='string'||draft.text.length>1_000_000)fail('INVALID_UI_TEXT_DRAFT','Invalid UI text draft');this.base=draft.base;this.text=draft.text;this.dirty=true;}}
 reset(module,ui,write=true){const text=printInstanceUISource(module,ui),base=formatFiniteJSON(ui);if(write){const previous=this.storage.getItem(this.key);if(previous!==null)this.storage.setItem(this.key+'.previous',previous);this.storage.removeItem(this.key);}this.text=text;this.base=base;this.dirty=false;}
 save(text){if(typeof text!=='string')fail('INVALID_SOURCE','UI text must be a string');this.text=text;this.dirty=true;if(text.length>1_000_000)fail('SOURCE_LIMIT','UI text exceeds source limit');this.storage.setItem(this.key,JSON.stringify({schemaVersion:'ems-ui-text-draft/1',base:this.base,text}));}
 stale(ui){return this.base!==formatFiniteJSON(ui);}
}

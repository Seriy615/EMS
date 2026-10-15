import {projectManagerForLocation} from './manager.mjs';
import {fail} from '../reference/errors.mjs';
import {savedSourceFlow} from './source-flow-session.mjs';
/** Resolve bookmarks without modifying saved documents or their authoring drafts. */
export function studioEntryRoute(storage,pathname,search){
 const params=new URLSearchParams(search),id=params.get('project');
 if(!params.has('project'))return pathname==='/'?'/web/projects.html':null;
 if(!id)fail('UNKNOWN_PROJECT','Проект не найден');
 const manager=projectManagerForLocation(storage,search),record=manager.load(manager.fileId??id);
 if(!record)fail('UNKNOWN_PROJECT','Проект не найден. Сохранённые проекты доступны на главной.');
 if(record.kind==='graph'){
  // The explicit legacy URL remains available for editing the original text.
  if(pathname!=='/'||!record.draft)return null;
  try{savedSourceFlow(record);}catch{return null;}
  const query=new URLSearchParams({project:id,source:'1'});if(manager.fileId)query.set('file',manager.fileId);
  return '/web/flow.html?'+query;
 }
 const route=record.kind==='contract'?'/web/contracts.html':record.kind==='flow'?'/web/flow.html':record.kind==='ui'?'/web/ui-demo.html':'/web/workspace.html',query=new URLSearchParams({project:id});
 if(manager.fileId)query.set('file',manager.fileId);
 return route+'?'+query;
}

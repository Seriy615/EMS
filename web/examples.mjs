import {ProjectManager,projectURL} from '../src/studio/manager.mjs';
/** Import a fresh editable copy through the same validated project importer. */
export async function openExample(path,name,{ui=false}={}){
 const response=await fetch(path);if(!response.ok)throw Error('Не удалось загрузить пример.');
 const manager=new ProjectManager(localStorage),record=manager.import(await response.text(),'p'+crypto.randomUUID().replaceAll('-',''));
 manager.rename(record.id,name);location.href=ui?'/web/ui-demo.html?project='+encodeURIComponent(record.id)+'&native=1&preview=1':projectURL(manager.load(record.id));
}

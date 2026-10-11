import {createCoreRegistry} from '../reference/registry.mjs';
import {UIRuntime} from '../ui/model.mjs';
import {parseUIProject} from '../ui/project.mjs';
import {compileUIJS} from './ui.mjs';

/** Build verified static package files in Node or Web. No handler executes during packaging. */
export async function buildUIProjectPackage(projectSource,{policy}={}){
 const base=createCoreRegistry(),application=parseUIProject(projectSource,base);
 const grants=structuredClone(policy);
 const checked=new UIRuntime(application,base,{policy:grants});await checked.close();
 const generated=compileUIJS(application,base);
 const bootstrap=`import {mountApplication} from './application.mjs';\nexport const controller=mountApplication(document.querySelector('#application'),{policy:${JSON.stringify(grants)},onError:error=>{document.querySelector('#error').textContent=error.code??'APPLICATION_ERROR';}});\nwindow.addEventListener('pagehide',()=>{void controller.close();},{once:true});\n`;
 const files={'application.mjs':generated,'bootstrap.mjs':bootstrap,'index.html':'<!doctype html>\n<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMS application</title><link rel="stylesheet" href="./style.css"><main id="application"></main><p id="error" role="alert"></p><script type="module" src="./bootstrap.mjs"></script></html>\n','style.css':'body{font:16px system-ui;margin:2rem;color:#172330;background:#f5f7fa}main{max-width:60rem;margin:auto}button,input{font:inherit;margin:.25rem;padding:.5rem}button{cursor:pointer}[data-ems-kind="column"],[data-ems-kind="row"]{gap:.5rem}#error{color:#a32020}\n'};
 return files;
}

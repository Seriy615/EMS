import {parseInstanceProject} from '../studio/instance-project.mjs';
import {validateInstanceUI} from '../instances/ui.mjs';
import {linkInstanceBoundary,validateInstanceModule} from '../instances/module.mjs';
import {checkControlPolicy} from '../runtime/control.mjs';
import {checkUIPolicy} from '../ui/kernel.mjs';
import {compileInstanceUIJS} from './instance-ui.mjs';
/** Build is validation/code generation only; native initializers and invariants run at owner creation. */
export function buildInstanceUIPackage(source,{policy}={}){
 const project=parseInstanceProject(source);checkUIPolicy(policy??{});validateInstanceUI(project.module,project.ui);for(const action of validateInstanceModule(project.module).transitions){const bundle=linkInstanceBoundary(project.module,action);checkControlPolicy(bundle.ir.functions.find(fn=>fn.id===bundle.ir.entry).policy,policy);}
 return {'application.mjs':compileInstanceUIJS(project.module,project.ui),'bootstrap.mjs':`import {mountApplication} from './application.mjs';\nlet controller;try{controller=await mountApplication(document.querySelector('#application'),{policy:${JSON.stringify(policy)},onError:error=>{document.querySelector('#error').textContent=error.code??'APPLICATION_ERROR';}});}catch(error){document.querySelector('#error').textContent=error.code??'APPLICATION_ERROR';}\nwindow.addEventListener('pagehide',()=>{void controller?.close();},{once:true});\n`,'index.html':'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMS application</title><link rel="stylesheet" href="./style.css"><main id="application"></main><p id="error" role="alert"></p><script type="module" src="./bootstrap.mjs"></script></html>\n','style.css':'body{font:16px system-ui;margin:2rem;color:#172330;background:#f5f7fa}main{max-width:60rem;margin:auto}button,input{font:inherit;margin:.25rem;padding:.5rem}button{cursor:pointer}#error{color:#a32020}\n'};
}

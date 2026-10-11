#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {UIRuntime} from '../src/ui/model.mjs';
import {parseUIProject} from '../src/ui/project.mjs';
import {compileUIJS} from '../src/compiler/ui.mjs';

/** Build a static package from a verified project with explicit permissions. No handler executes during build. */
export async function exportUIProject(projectSource,directory,{policy}={}){
 const base=createCoreRegistry(),application=parseUIProject(projectSource,base);
 const grants=structuredClone(policy);
 const checked=new UIRuntime(application,base,{policy:grants});await checked.close();
 const generated=compileUIJS(application,base);
 const bootstrap=`import {mountApplication} from './application.mjs';\nexport const controller=mountApplication(document.querySelector('#application'),{policy:${JSON.stringify(grants)},onError:error=>{document.querySelector('#error').textContent=error.code??'APPLICATION_ERROR';}});\nwindow.addEventListener('pagehide',()=>{void controller.close();},{once:true});\n`;
 const files={'application.mjs':generated,'bootstrap.mjs':bootstrap,'index.html':'<!doctype html>\n<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMS application</title><link rel="stylesheet" href="./style.css"><main id="application"></main><p id="error" role="alert"></p><script type="module" src="./bootstrap.mjs"></script></html>\n','style.css':'body{font:16px system-ui;margin:2rem;color:#172330;background:#f5f7fa}main{max-width:60rem;margin:auto}button,input{font:inherit;margin:.25rem;padding:.5rem}button{cursor:pointer}[data-ems-kind="column"],[data-ems-kind="row"]{gap:.5rem}#error{color:#a32020}\n'};
 // Generate and validate everything before writing any package files.
 await mkdir(directory,{recursive:true});
 for(const [name,source]of Object.entries(files))await writeFile(resolve(directory,name),source);
 return {directory,files:Object.keys(files)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==5||args[1]!=='--policy'||args[3]!=='--out'){
  console.error('Usage: node tools/export-ui.mjs <project.ems-ui.json> --policy <policy.json> --out <directory>');process.exitCode=1;
 }else try{const result=await exportUIProject(await readFile(resolve(args[0]),'utf8'),resolve(args[4]),{policy:JSON.parse(await readFile(resolve(args[2]),'utf8'))});console.log(`Built standalone UI: ${result.directory}`);}
 catch(error){console.error(`${error.code??'EXPORT_FAILED'}: ${error.message}`);process.exitCode=1;}
}

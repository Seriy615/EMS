#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildUIProjectPackage} from '../src/compiler/ui-package.mjs';

/** Build a static package from a verified project with explicit permissions. No handler executes during build. */
export async function exportUIProject(projectSource,directory,{policy}={}){
 const files=await buildUIProjectPackage(projectSource,{policy});
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

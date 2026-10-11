#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCoreRegistry} from '../src/reference/registry.mjs';
import {createStateRegistry} from '../src/runtime/reactor.mjs';
import {parseUIProject} from '../src/ui/project.mjs';
import {compileReactorJS} from '../src/compiler/reactor.mjs';

/** Export the actual linked reactor from a typed UI project. This command does not package its UI. */
export async function exportProjectReactor(projectPath,outputPath){
 const base=createCoreRegistry();
 const application=parseUIProject(await readFile(projectPath,'utf8'),base);
 const registry=createStateRegistry(base,application.reactor.state);
 const generated=compileReactorJS(application.reactor,registry);
 await mkdir(dirname(outputPath),{recursive:true});
 await writeFile(outputPath,generated);
 return outputPath;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==3||args[1]!=='--out'){
  console.error('Usage: node tools/export-reactor.mjs <project.ems-ui.json> --out <session.mjs>');process.exitCode=1;
 }else try{console.log(`Built standalone reactor: ${await exportProjectReactor(resolve(args[0]),resolve(args[2]))}`);}
 catch(error){console.error(`${error.code??'EXPORT_FAILED'}: ${error.message}`);process.exitCode=1;}
}

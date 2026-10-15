#!/usr/bin/env node
import {compileContractFlowJS,executeContractFlow} from '../src/compiler/contract-flow.mjs';
import {exportContractFlowSVG} from '../src/compiler/flowchart-contract-flow.mjs';
import {buildAtomicPackage} from '../src/compiler/atomic-package.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCoreRegistry, validateGraph, executeGraph, compileStandaloneJS, compiledAtomicManifest, parseTextEMS } from '../src/reference/index.mjs';
import { lowerGraphToIR, serializeIR, parseIR, graphFromIR, analyzeControlOrigins, classifyControlOrigins, createBoundOriginPolicy, classifyBoundControlOrigins } from '../src/ir/index.mjs';
import { parseEMSModule } from '../src/frontend/index.mjs';
import { typecheckModule } from '../src/frontend/check.mjs';
import { lowerCheckedModule } from '../src/frontend/lower.mjs';
import { executeIR, compileIRToJS } from '../src/ir/index.mjs';
import { validateContractInterface, compareContractInterfaces, checkContractBinding } from '../src/contracts/idl.mjs';
import { createProgramLock,executeLockedIR,compileLockedIRToJS,serializeProgramLock,parseProgramLock } from '../src/contracts/lock.mjs';
const [command, file, ...args] = process.argv.slice(2);
function usage() {
  console.log(`EMS reference CLI (M0, NOT production)
  node tools/ems.mjs flow-run <graph.json> '<inputs-json>'
  node tools/ems.mjs flow-build <graph.json> --out <application.mjs>
  node tools/ems.mjs flow-svg <graph.json> --out <diagram.svg>
  node tools/ems.mjs lock <program.ir.json> --target <target> --out <lock.json>
  node tools/ems.mjs locked-run <program.ir.json> --lock <lock.json> --target <target> '<inputs-json>'
  node tools/ems.mjs locked-build <program.ir.json> --lock <lock.json> --target <target> --out <output.mjs>
  node tools/ems.mjs interface-check <interface.json>
  node tools/ems.mjs interface-compare <old.json> <new.json>
  node tools/ems.mjs binding-check <binding.json> --interface <interface.json> --target <target>
  node tools/ems.mjs validate <graph.json>
  node tools/ems.mjs run <graph.json> '<inputs-json>'
  node tools/ems.mjs build <graph.json> --out <output.mjs>
  node tools/ems.mjs seal <graph.json> --out <directory>
  node tools/ems.mjs text-parse <source.ems>
  node tools/ems.mjs text-run <source.ems> '<inputs-json>'
  node tools/ems.mjs text-build <source.ems> --out <output.mjs>`);
  console.log(`  node tools/ems.mjs ir <graph.json> --out <program.ir.json>
  node tools/ems.mjs text-ir <source.ems> --out <program.ir.json>
  node tools/ems.mjs ir-run <program.ir.json> '<inputs-json>'
  node tools/ems.mjs ir-build <program.ir.json> --out <output.mjs>
  node tools/ems.mjs parse <source.ems>
  node tools/ems.mjs check <source.ems>
  node tools/ems.mjs module-run <source.ems> --entry <name> '<inputs-json>' [--policy <policy.json>]
  node tools/ems.mjs module-ir <source.ems> --entry <name> --out <program.ir.json>
  node tools/ems.mjs module-origins <source.ems> --entry <name> --out <origins.json>
  node tools/ems.mjs module-classify <source.ems> --entry <name> --policy <origin-policy.json> --out <classification.json>
  node tools/ems.mjs module-bind-origins <source.ems> --entry <name> --policy <annotations.json> --out <bound-policy.json>
  node tools/ems.mjs module-build <source.ems> --entry <name> --out <output.mjs>
  node tools/ems.mjs module-seal <source.ems> --entry <name> --id <contract-id> --out <directory>`);
}
async function main() {
  if (!file || !['flow-run','flow-build','flow-svg','lock','locked-run','locked-build','interface-check', 'interface-compare', 'binding-check', 'validate', 'run', 'build', 'seal', 'text-parse', 'text-run', 'text-build', 'ir', 'text-ir', 'ir-run', 'ir-build', 'parse', 'check', 'module-run', 'module-build', 'module-ir', 'module-origins', 'module-classify', 'module-bind-origins', 'module-seal'].includes(command)) { usage(); process.exitCode = 2; return; }
  const content = await readFile(file, 'utf8');
  if(['flow-run','flow-build','flow-svg'].includes(command)){
    const parsed=JSON.parse(content),graph=parsed.schemaVersion==='ems-flow-project/1'?parsed.graph:parsed,registry=createCoreRegistry();
    if(command==='flow-run'){if(args.length>1)throw Error('Use optional JSON inputs');console.log(JSON.stringify({result:await executeContractFlow(graph,registry,JSON.parse(args[0]??'{}'))},null,2));}
    else{if(args.length!==2||args[0]!=='--out')throw Error('Use --out <file>');const source=command==='flow-build'?compileContractFlowJS(graph,registry):exportContractFlowSVG(graph,registry,{descriptions:parsed.canvas?.descriptions??{}}),dest=resolve(args[1]);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,source);console.log('Built '+dest);}return;
  }

  if(['lock','locked-run','locked-build'].includes(command)){
    const registry=createCoreRegistry(),ir=parseIR(content,registry);
    if(command==='lock'){
      if(args.length!==4||args[0]!=='--target'||args[2]!=='--out')throw new Error('Use lock <IR> --target <target> --out <lock.json>');
      const dest=resolve(args[3]);const lock=await createProgramLock(ir,registry,{target:args[1]});await mkdir(dirname(dest),{recursive:true});await writeFile(dest,serializeProgramLock(lock));console.log(`Built dependency lock: ${dest}`);
    }else{
      if(args[0]!=='--lock'||args[2]!=='--target')throw new Error('Use --lock <lock.json> --target <target>');
      const lock=parseProgramLock(await readFile(args[1],'utf8')),options={target:args[3]};
      if(command==='locked-run'){
        if(args.length>5)throw new Error('Use JSON inputs after --target');console.log(JSON.stringify({result:await executeLockedIR(lock,ir,JSON.parse(args[4]??'{}'),registry,options)},null,2));
      }else{
        if(args.length!==6||args[4]!=='--out')throw new Error('Use --out <module.mjs>');const generated=await compileLockedIRToJS(lock,ir,registry,options),dest=resolve(args[5]);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,generated);console.log(`Built locked standalone: ${dest}`);
      }
    }return;
  }
  if(command==='interface-check') { console.log(JSON.stringify(validateContractInterface(JSON.parse(content)),null,2));return; }
  if(command==='interface-compare') {
    if(args.length!==1)throw new Error('Use interface-compare <old.json> <new.json>');
    const result=compareContractInterfaces(JSON.parse(content),JSON.parse(await readFile(args[0],'utf8')));
    console.log(JSON.stringify(result,null,2));if(!result.compatible)process.exitCode=1;return;
  }
  if(command==='binding-check') {
    if(args.length!==4||args[0]!=='--interface'||args[2]!=='--target')throw new Error('Use binding-check <binding.json> --interface <interface.json> --target <target>');
    const result=checkContractBinding(JSON.parse(await readFile(args[1],'utf8')),JSON.parse(content),createCoreRegistry(),args[3]);
    console.log(JSON.stringify({interface:result.contract.id,binding:result.binding.id,implementation:result.implementation.id,target:args[3]},null,2));return;
  }
  if (command === 'parse') { console.log(JSON.stringify(parseEMSModule(content), null, 2)); return; }
  if (command === 'check' || command.startsWith('module-')) {
    const base = createCoreRegistry();
    const checked = typecheckModule(parseEMSModule(content), base);
    if (command === 'check') { console.log(`PASS: ${checked.signatures.size} typed callable declarations; linking and target support are separate checks`); return; }
    if (args[0] !== '--entry' || !args[1]) throw new Error('Use --entry <name>');
    const bundle = lowerCheckedModule(checked, args[1], base,['module-origins','module-classify', 'module-bind-origins', 'module-seal'].includes(command)?{profile:'control'}:{});
    if(command==='module-origins'){
      if(args.length!==4||args[2]!=='--out'||!args[3])throw new Error('Use module-origins <source> --entry <name> --out <origins.json>');
      const artifact=analyzeControlOrigins(bundle.ir,bundle.registry),dest=resolve(args[3]);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(artifact,null,2)+'\n');console.log(`Built static origins (not a security decision): ${dest}`);return;
    }
    if(['module-classify','module-bind-origins'].includes(command)){
      if(args.length!==6||args[2]!=='--policy'||!args[3]||args[4]!=='--out'||!args[5])throw new Error('Use module-classify <source> --entry <name> --policy <origin-policy.json> --out <classification.json>');
      const policy=JSON.parse(await readFile(args[3],'utf8')),artifact=command==='module-bind-origins'?await createBoundOriginPolicy(bundle.ir,bundle.registry,policy):policy.schemaVersion==='ems-origin-policy/2'?await classifyBoundControlOrigins(bundle.ir,bundle.registry,policy):classifyControlOrigins(bundle.ir,bundle.registry,policy),dest=resolve(args[5]);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(artifact,null,2)+'\n');console.log(`Built origin classification (diagnostic restriction only): ${dest}`);return;
    }
    if(command==='module-seal'){
      if(args.length!==6||args[2]!=='--id'||!args[3]||args[4]!=='--out'||!args[5])throw new Error('Use --entry <name> --id <contract-id> --out <directory>');
      const artifact=await buildAtomicPackage(bundle.ir,bundle.registry,{id:args[3]}),dest=resolve(args[5]);await mkdir(dest,{recursive:true});for(const [name,source]of Object.entries(artifact.files))await writeFile(resolve(dest,name),source);console.log(`Built atomic package: ${dest}`);return;
    }
    if (command === 'module-run') {
      let policy = {};
      if (args.length > 3) {
        if (args.length !== 5 || args[3] !== '--policy') throw new Error('Use --policy <execution-policy.json> after inputs');
        policy = JSON.parse(await readFile(args[4], 'utf8'));
        if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
            Object.keys(policy).some(key => !['capabilities', 'allowedEffects'].includes(key)))
          throw new Error('Execution policy only accepts capabilities and allowedEffects');
      }
      const result = await executeIR(bundle.ir, JSON.parse(args[2] || '{}'), bundle.registry, policy);
      console.log(JSON.stringify({ contract: bundle.ir.id, result }, null, 2));
    } else {
      if (args[2] !== '--out' || !args[3]) throw new Error('Use --out <path>');
      const dest = resolve(args[3]); await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, command === 'module-ir' ? serializeIR(bundle.ir, bundle.registry) : compileIRToJS(bundle.ir, bundle.registry));
      console.log(`Built ${command === 'module-ir' ? 'semantic IR' : 'independent module'}: ${dest}`);
    }
    return;
  }
  const registry = createCoreRegistry();
  if (command === 'ir-run' || command === 'ir-build') {
    const ir = parseIR(content, registry);
    if (command === 'ir-run') console.log(JSON.stringify({ contract: ir.id, result: await executeIR(ir, JSON.parse(args[0] || '{}'), registry) }, null, 2));
    else {
      if (args[0] !== '--out' || !args[1]) throw new Error('Use --out <path>');
      const dest = resolve(args[1]); await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, compileIRToJS(ir, registry)); console.log(`Built independent module: ${dest}`);
    }
    return;
  }
  const graph = command.startsWith('ir-') ? graphFromIR(parseIR(content, registry), registry)
    : command.startsWith('text-') ? parseTextEMS(content) : JSON.parse(content);
  if (command === 'ir' || command === 'text-ir') {
    if (args[0] !== '--out' || !args[1]) throw new Error('Use --out <path>');
    const dest = resolve(args[1]);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, serializeIR(lowerGraphToIR(graph, registry), registry));
    console.log(`Built typed semantic IR: ${dest}`);
  }
  if (command === 'validate') { validateGraph(graph, registry); console.log(`PASS: ${graph.id} (${graph.nodes.length} nodes)`); }
  if (command === 'text-parse') { validateGraph(graph, registry); console.log(JSON.stringify(graph, null, 2)); }
  if (command === 'run' || command === 'text-run' || command === 'ir-run') {
    const inputs = JSON.parse(args[0] || '{}');
    const value = await executeGraph(graph, inputs, registry);
    console.log(JSON.stringify({ contract: graph.id, result: value }, null, 2));
  }
  if (command === 'build' || command === 'text-build' || command === 'ir-build') {
    if (args[0] !== '--out' || !args[1]) throw new Error('Use --out <path>');
    const source = compileStandaloneJS(graph, registry);
    const dest = resolve(args[1]);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, source);
    console.log(`Built independent module: ${dest}`);
    const mod = await import(pathToFileURL(dest).href);
    console.log(`Verified export: ${typeof mod.execute}`);
  }
  if (command === 'seal') {
    if (args[0] !== '--out' || !args[1]) throw new Error('Use seal <graph.json> --out <directory>');
    const dir = resolve(args[1]);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'module.mjs'), compileStandaloneJS(graph, registry));
    await writeFile(resolve(dir, 'contract.json'), JSON.stringify(compiledAtomicManifest(graph), null, 2) + '\n');
    console.log(`Sealed atomic package at ${dir}; original source graph is not included. This is not DRM.`);
  }
}
main().catch(e => { console.error(`[${e.code || 'ERROR'}] ${e.message}`); process.exitCode = 1; });

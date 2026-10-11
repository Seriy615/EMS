import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareProgram } from '../src/conformance/program.mjs';
import { createProgramLock, compileLockedIRToJS, serializeProgramLock } from '../src/contracts/index.mjs';
import { sha256 } from '../src/contracts/provenance.mjs';

/** Package the portable analysis example with a static UI; no EMS installation is needed to run it. */
export async function exportPortableAnalysis(directory) {
  const source = await readFile(new URL('../examples/portable-analysis.ems', import.meta.url), 'utf8');
  const { ir, registry } = prepareProgram({ source, entry: 'analyze' });
  const lock = await createProgramLock(ir, registry, { target: 'web' });
  const generated = await compileLockedIRToJS(lock, ir, registry, { target: 'web' });
  const manifest = { schemaVersion: 'ems-portable-proof/1', source: { file: 'portable-analysis.ems', sha256: await sha256(source) },
    semanticIR: lock.program, artifact: { file: 'program.mjs', sha256: await sha256(generated) },
    profile: ir.profile, bindings: lock.contracts, grants: [], dependencies: [] };
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'program.mjs'), generated);
  await writeFile(resolve(directory, 'portable-analysis.ems'), source);
  await writeFile(resolve(directory, 'program.lock.json'), serializeProgramLock(lock));
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(resolve(directory, 'index.html'), `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Анализ чисел — EMS</title><link rel="stylesheet" href="./style.css">
<main><h1>Анализ чисел</h1><p>Введите массив чисел, чтобы получить их среднее значение.</p>
<form id="analysis"><label for="values">Числа в формате JSON</label><textarea id="values" rows="3">[2,4,6]</textarea>
<button>Рассчитать</button></form><p role="status" id="result"></p></main><script type="module" src="./app.mjs"></script></html>`);
  await writeFile(resolve(directory, 'app.mjs'), `import {execute} from './program.mjs';
const form=document.querySelector('#analysis'),input=document.querySelector('#values'),result=document.querySelector('#result');
form.addEventListener('submit',async event=>{event.preventDefault();try{const value=await execute({values:JSON.parse(input.value)});result.textContent='Среднее: '+value;result.dataset.status='success';}catch(error){result.textContent=error.code==='USER_THROW'?'Добавьте хотя бы одно число.':'Проверьте формат: нужен массив чисел.';result.dataset.status='error';}});
form.requestSubmit();
`);
  await writeFile(resolve(directory, 'style.css'), 'body{font:18px system-ui;background:#f4f6f8;color:#172033;margin:0}main{max-width:640px;margin:8vh auto;padding:32px;background:white;border-radius:16px}label,textarea{display:block}textarea{box-sizing:border-box;width:100%;margin:12px 0;padding:12px;font:inherit}button{font:inherit;padding:10px 20px;background:#1647be;color:white;border:0;border-radius:8px}#result{min-height:28px}\n');
  return { source, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node tools/export-portable.mjs --out directory');
  const { manifest } = await exportPortableAnalysis(resolve(args[1]));
  console.log(JSON.stringify(manifest, null, 2));
}

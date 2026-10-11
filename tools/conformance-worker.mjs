// QA transport only: the generated program has no compiler/runtime/IDE imports.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { captureOutcome, encodeValue, decodeValue } from '../src/conformance/index.mjs';

const [modulePath, inputPath] = process.argv.slice(2);
const request = decodeValue(JSON.parse(await readFile(inputPath, 'utf8')));
const program = await import(pathToFileURL(modulePath));
const outcome = await captureOutcome(() => program.execute(request.inputs, request.options));
process.stdout.write(JSON.stringify(encodeValue(outcome)));

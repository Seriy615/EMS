import {parentPort} from 'node:worker_threads';
import {createUIWorkerHost} from '../../src/ui/worker-host.mjs';
const handle=createUIWorkerHost(message=>parentPort.postMessage(message));
parentPort.on('message',handle);

import {parentPort} from 'node:worker_threads';
import {createUIWorkerHost} from '../../src/ui/worker-host.mjs';
import {UI_WORKER_PROTOCOL} from '../../src/ui/worker-protocol.mjs';
const handle=createUIWorkerHost(message=>parentPort.postMessage(message));
parentPort.on('message',handle);
parentPort.postMessage({type:'ready',protocol:UI_WORKER_PROTOCOL});

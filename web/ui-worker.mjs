import {UI_WORKER_PROTOCOL} from '/src/ui/worker-protocol.mjs';
import {createUIWorkerHost} from '/src/ui/worker-host.mjs';
const handle=createUIWorkerHost(message=>self.postMessage(message));
self.onmessage=event=>{handle(event.data);};
self.postMessage({type:'ready',protocol:UI_WORKER_PROTOCOL});

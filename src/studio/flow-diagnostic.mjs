/** Bind an execution diagnostic to actual current ports, never to stale node names alone. */
export function flowValueDiagnostic(error,graph){
 if(error?.code!=='UNINITIALIZED_FLOW_VALUE'||error.details?.graph!==undefined&&error.details.graph!==graph.id)return null;
 const node=graph.nodes.find(node=>node.id===error.details?.node),producer=graph.nodes.find(node=>node.id===error.details?.producer);
 if(!node||!producer)return null;
 const port=error.details?.port??Object.keys(node.args).find(port=>node.args[port]?.node===producer.id);
 if(typeof port!=='string'||node.args[port]?.node!==producer.id)return null;
 return {node:node.id,producer:producer.id,port};
}

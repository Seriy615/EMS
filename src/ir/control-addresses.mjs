/** Stable structural addresses for diagnostics; never embed editor metadata in semantic IR. */
export function* controlNodeEntries(fn){
  function* walk(value,path){
    if(!value||typeof value!=='object')return;
    if(typeof value.kind==='string')yield [path,value];
    for(const [key,child] of Object.entries(value))yield* walk(child,path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'));
  }
  yield* walk(fn.body,'/body');
}

/** Unfold a validated semantic tree so diagnostic addresses denote occurrences rather than JS object aliases. */
export function copyControlDiagnosticTree(value){
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(copyControlDiagnosticTree);
 return Object.fromEntries(Object.keys(value).map(key=>[key,copyControlDiagnosticTree(Object.getOwnPropertyDescriptor(value,key).value)]));
}

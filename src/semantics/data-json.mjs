/** Encode already validated finite own data, preserving signed zero in nested values. */
export function formatFiniteJSON(value){
 if(typeof value==='number')return Object.is(value,-0)?'-0':JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(formatFiniteJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+formatFiniteJSON(item)).join(',')+'}';
 return JSON.stringify(value);
}

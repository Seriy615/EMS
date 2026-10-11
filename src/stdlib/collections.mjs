/** Compile-time typed collection templates; callbacks are static references, never String values. */
export const COLLECTION_TEMPLATES=Object.freeze([
 Object.freeze({id:'std.array.map',input:'NumberArray',callback:Object.freeze({input:'Number',output:'Number',async:false,effects:Object.freeze([]),capabilities:Object.freeze([]),localEffects:Object.freeze([])}),output:'NumberArray'}),
 Object.freeze({id:'std.array.filter',input:'NumberArray',callback:Object.freeze({input:'Number',output:'Boolean',async:false,effects:Object.freeze([]),capabilities:Object.freeze([]),localEffects:Object.freeze([])}),output:'NumberArray'})
]);

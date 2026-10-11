/** Resolve the lexical value identity at a source AST path. No evaluation or new language rules. */
export function bindingAtPath(ast,path,name){
 const keys=path.split('/'),scope=new Map();let node=ast,prefix=[];
 for(let index=0;index<keys.length;index++){
  const key=keys[index];
  if(['FunctionDeclaration','ContractDeclaration'].includes(node.kind))for(const [i,param]of node.parameters.entries())scope.set(param.name,{id:[...prefix,'parameters',i].join('/'),name:param.name});
  if(node.kind==='Block'&&key==='statements'){
   const position=Number(keys[index+1]);for(const [i,statement]of node.statements.entries()){
    if(i>=position)break;if(['LetDeclaration','UsingDeclaration'].includes(statement.kind))scope.set(statement.name,{id:[...prefix,'statements',i].join('/'),name:statement.name});
   }
  }
  if(['ForStatement','CatchClause'].includes(node.kind)&&key==='body')scope.set(node.binding,{id:[...prefix,'binding'].join('/'),name:node.binding});
  node=node[key];prefix.push(key);
 }
 return scope.get(name)??null;
}

export const vectors=[
 ['std.value.Number',{value:-0},-0],['std.value.Boolean',{value:false},false],['std.value.String',{value:'text'},'text'],['std.value.NumberArray',{value:[1,-0]},[1,-0]],
 ['std.select.Number',{condition:false,whenTrue:1,whenFalse:-0},-0],['std.select.Boolean',{condition:true,whenTrue:false,whenFalse:true},false],['std.select.String',{condition:false,whenTrue:'yes',whenFalse:'no'},'no'],['std.select.NumberArray',{condition:true,whenTrue:[-0,2],whenFalse:[3]},[-0,2]],
 ['std.logic.and',{a:true,b:false},false],['std.logic.or',{a:false,b:true},true],['std.logic.not',{value:true},false],
 ['std.number.equal',{a:0,b:-0},true],['std.number.notEqual',{a:2,b:2},false],['std.number.less',{a:-3,b:1},true],['std.number.lessEqual',{a:2,b:2},true],['std.number.greater',{a:9,b:2},true],['std.number.greaterEqual',{a:2,b:9},false],
 ['std.number.abs',{value:-0},0],['std.number.floor',{value:-1.2},-2],['std.number.ceil',{value:-0.2},-0],['std.number.round',{value:-0.5},-0],
 ['std.text.concat',{a:'EMS',b:' 😀'},'EMS 😀'],['std.text.equal',{a:'é',b:'e\u0301'},false],['std.text.length',{text:'A😀e\u0301'},4],['std.text.contains',{text:'EMS',part:''},true],['std.text.slice',{text:'A😀e\u0301',start:1,end:3},'😀e'],['std.text.toNumber',{text:'-0e2'},-0],['std.text.fromNumber',{value:-0},'-0'],
 ['std.array.length',{values:[]},0],['std.array.at',{values:[3,-0],index:1},-0],['std.array.append',{values:[1],value:2},[1,2]],['std.array.concat',{a:[1,-0],b:[2]},[1,-0,2]],['std.array.reverse',{values:[1,-0,3]},[3,-0,1]],['std.array.sort',{values:[1,-0,0,-3,-0]},[-3,-0,0,-0,1]],['std.array.slice',{values:[1,-0,3],start:1,end:2},[-0]],['std.array.contains',{values:[1,-0],value:0},true]
];

import {fail} from '../reference/errors.mjs';
export const UI_STYLE_TYPES=Object.freeze({backgroundColor:'String',color:'String',borderColor:'String',borderRadius:'Number',borderWidth:'Number',fontSize:'Number',fontFamily:'String',padding:'Number',gap:'Number',width:'Number',height:'Number'});
/** Bounded portable literal presentation properties; no CSS text, URLs or remote fonts. */
export function validateUIStyles(props){
 const numbers={borderRadius:[0,1000],borderWidth:[0,32],fontSize:[6,256],padding:[0,256],gap:[0,256],width:[1,4096],height:[1,4096]};
 for(const [name,binding]of Object.entries(props)){
  if(!Object.hasOwn(numbers,name)&&!['backgroundColor','color','borderColor','fontFamily'].includes(name))continue;
  if(!binding||typeof binding!=='object'||!Object.hasOwn(binding,'literal'))fail('UNSUPPORTED_UI','Presentation properties currently require literal values');const value=binding.literal;
  if(Object.hasOwn(numbers,name)){const [min,max]=numbers[name];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('INVALID_UI','Presentation length outside supported bounds');}
  else if(name==='fontFamily'){if(!['system-ui','Arial','Georgia','monospace','serif','sans-serif'].includes(value))fail('INVALID_UI','Unsupported portable font family');}
  else if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))fail('INVALID_UI','Expected six-digit hexadecimal colour');
 }
}

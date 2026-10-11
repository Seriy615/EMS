import {fail} from '../reference/errors.mjs';
const maxBytes=16*1024*1024;
/** Deterministic POSIX ustar regular-file archive. Flat ASCII names; UTF-8 contents; no links or extraction. */
export function packageTAR(files){
 if(!files||typeof files!=='object'||Array.isArray(files)||![Object.prototype,null].includes(Object.getPrototypeOf(files))||Reflect.ownKeys(files).some(key=>typeof key!=='string'))fail('INVALID_PACKAGE','Expected package file record');
 const entries=Object.entries(files);if(entries.length>16)fail('PACKAGE_LIMIT','Too many package files');
 const encoder=new TextEncoder(),encoded=[];let length=1024;
 for(const [name,source]of entries){
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(name)||name==='.'||name==='..'||typeof source!=='string')fail('INVALID_PACKAGE','Expected flat safe names and text files');
  if(source.length>maxBytes)fail('PACKAGE_LIMIT','Package exceeds 16 MiB');
  const bytes=encoder.encode(source);length+=512+Math.ceil(bytes.length/512)*512;
  if(length>maxBytes)fail('PACKAGE_LIMIT','Package exceeds 16 MiB');encoded.push({name,bytes});
 }
 const archive=new Uint8Array(length);let offset=0;
 for(const {name,bytes}of encoded){
  const header=archive.subarray(offset,offset+512);
  const field=(start,text)=>header.set(encoder.encode(text),start);
  const octal=(start,size,value)=>field(start,value.toString(8).padStart(size-1,'0')+'\0');
  field(0,name);octal(100,8,0o644);octal(108,8,0);octal(116,8,0);octal(124,12,bytes.length);octal(136,12,0);
  header.fill(32,148,156);field(156,'0');field(257,'ustar\0');field(263,'00');
  field(148,header.reduce((sum,value)=>sum+value,0).toString(8).padStart(6,'0')+'\0 ');
  archive.set(bytes,offset+512);offset+=512+Math.ceil(bytes.length/512)*512;
 }
 return archive;
}

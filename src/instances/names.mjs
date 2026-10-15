export function instanceSlot(instance,field){const hex=name=>Array.from(name,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');return 'ems_i'+hex(instance)+'_f'+hex(field);}
export function instanceEvent(instance,name){return 'i'+Array.from(instance+'.'+name,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');}

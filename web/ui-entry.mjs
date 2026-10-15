// Both modes use the same designer, binding forms, DOM mapping and UI event kernel.
if(new URLSearchParams(location.search).get('native')==='1')await import('./instance-ui-demo.mjs');
else await import('./ui-demo.mjs');

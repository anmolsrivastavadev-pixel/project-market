import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
const files={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else files['/'+path.relative('public',full)]={body:(await readFile(full)).toString('base64'),type:types[path.extname(full)]||'application/octet-stream'};}}
await walk('public');
const api=await readFile('worker/api.js','utf8');
const source=api+`\nconst files=${JSON.stringify(files)};\nexport default {async fetch(request,env){const url=new URL(request.url);try{if(url.pathname.startsWith('/api/'))return await api(request,env);let key=url.pathname;if(!key.split('/').pop().includes('.'))key=key.replace(/\\/$/,'')+'/index.html';const file=files[key]||files['/404.html'];const bytes=Uint8Array.from(atob(file.body),c=>c.charCodeAt(0));return new Response(bytes,{status:files[key]?200:404,headers:{'content-type':file.type,'cache-control':'no-cache'}})}catch(error){return new Response(JSON.stringify({error:'Unable to save or load projects. Please try again.'}),{status:500,headers:{'content-type':'application/json'}})}}};`;
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',source);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Worker with',Object.keys(files).length,'assets');

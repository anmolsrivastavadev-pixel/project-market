import {api} from './api.js';

// Minimal R2-style wrapper over Workers KV so api.js runs unchanged on the free plan.
// Bodies live at `key`; custom metadata lives at `__meta/key`.
function kvBucket(kv) {
 const meta=key=>kv.get('__meta/'+key,'json');
 return {
  async head(key) {
   const r=await kv.getWithMetadata(key,'arrayBuffer');if(r.value===null)return null;
   return {customMetadata:(await meta(key))||{},httpMetadata:{contentType:r.metadata?.type}};
  },
  async get(key) {
   const r=await kv.getWithMetadata(key,'arrayBuffer');if(r.value===null)return null;
   return {body:r.value,httpMetadata:{contentType:r.metadata?.type}};
  },
  async put(key,value,opts={}) {
   await kv.put(key,value,{metadata:{type:opts.httpMetadata?.contentType}});
   if(opts.customMetadata)await kv.put('__meta/'+key,JSON.stringify(opts.customMetadata));
  },
  async list({prefix,cursor}={}) {
   const r=await kv.list({prefix,cursor});
   const objects=await Promise.all(r.keys.map(async k=>({key:k.name,customMetadata:(await meta(k.name))||{}})));
   return {objects,truncated:!r.list_complete,cursor:r.cursor};
  }
 };
}

// Safari and iOS only play video when byte-range requests are honoured.
async function withRanges(request,res) {
 const range=request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
 if(!res.ok||!range){const r=new Response(res.body,res);r.headers.set('accept-ranges','bytes');return r}
 const buf=await res.arrayBuffer(),size=buf.byteLength;
 let start=range[1]===''?size-Number(range[2]):Number(range[1]);
 let end=range[1]===''||range[2]===''?size-1:Math.min(Number(range[2]),size-1);
 if(start<0)start=0;
 if(start>end||start>=size)return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
 const headers=new Headers(res.headers);
 headers.set('accept-ranges','bytes');headers.set('content-range',`bytes ${start}-${end}/${size}`);headers.set('content-length',String(end-start+1));
 return new Response(buf.slice(start,end+1),{status:206,headers});
}

export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')) {
   try{return await api(request,{...env,BUCKET:kvBucket(env.PROJECTS)})}
   catch{return new Response(JSON.stringify({error:'Unable to save or load projects. Please try again.'}),{status:500,headers:{'content-type':'application/json'}})}
  }
  if(url.pathname.startsWith('/media/'))return withRanges(request,await env.ASSETS.fetch(request));
  return env.ASSETS.fetch(request);
 }
};

import {webcrypto} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {api} from '../../worker/api.js';

// Netlify's Node runtime doesn't expose Web Crypto as a global; api.js needs crypto.subtle.
globalThis.crypto??=webcrypto;

// Minimal R2-style wrapper over Netlify Blobs so api.js runs unchanged.
// Bodies live at `key`; custom metadata lives at `__meta/key`.
function blobBucket(store) {
 const meta=key=>store.get('__meta/'+key,{type:'json'});
 return {
  async head(key) {
   const r=await store.getMetadata(key);if(!r)return null;
   return {customMetadata:(await meta(key))||{},httpMetadata:{contentType:r.metadata?.type}};
  },
  async get(key) {
   const r=await store.getWithMetadata(key,{type:'arrayBuffer'});if(!r)return null;
   return {body:r.data,httpMetadata:{contentType:r.metadata?.type}};
  },
  async put(key,value,opts={}) {
   await store.set(key,value,{metadata:{type:opts.httpMetadata?.contentType}});
   if(opts.customMetadata)await store.setJSON('__meta/'+key,opts.customMetadata);
  },
  async list({prefix}={}) {
   const {blobs}=await store.list({prefix});
   const objects=await Promise.all(blobs.map(async b=>({key:b.key,customMetadata:(await meta(b.key))||{}})));
   return {objects,truncated:false};
  }
 };
}

export default async request => {
 try{return await api(request,{BUCKET:blobBucket(getStore({name:'projects',consistency:'strong'}))})}
 catch(error){console.error('api error',error?.stack||error);return new Response(JSON.stringify({error:'Unable to save or load projects. Please try again.'}),{status:500,headers:{'content-type':'application/json'}})}
};

export const config={path:'/api/*'};

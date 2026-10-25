function publicURL(value,base) {
 const u=new URL(value,base),host=u.hostname.toLowerCase();
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))throw Error('Invalid public URL');
 return u;
}
async function publicFetch(value){
 let url=publicURL(value);
 for(let i=0;i<4;i++){
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{'user-agent':'ProjectMarket/1.0 (website icon preview)'}});
  if(r.status>=300&&r.status<400&&r.headers.get('location')){url=publicURL(r.headers.get('location'),url);continue}
  if(!r.ok)throw Error('Not found');return {response:r,url:url.href};
 }
 throw Error('Too many redirects');
}
async function projectLogo(id,env){
 if(!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404});
 const record=await env.BUCKET.head('projects/'+id);if(!record)return new Response('Not found',{status:404});
 const key='logos/'+id;const cached=await env.BUCKET.get(key);
 if(cached)return new Response(cached.body,{headers:{'content-type':cached.httpMetadata.contentType,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
 const project=JSON.parse(record.customMetadata.project);let candidates=[];
 try{
  const {response,url}=await publicFetch(project.url);const html=(await response.text()).slice(0,200000);
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
   const rel=tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]||'';
   const href=tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
   if(href&&/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(rel))candidates.push(publicURL(href.replace(/&amp;/g,'&'),url).href);
  }
 }catch{}
 candidates.push(new URL('favicon.ico',project.url).href,new URL('/favicon.ico',project.url).href);
 for(const candidate of [...new Set(candidates)]){try{
  const {response}=await publicFetch(candidate);const type=(response.headers.get('content-type')||'').split(';')[0];
  if(!/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd.microsoft.icon|avif)$/.test(type))continue;
  if(Number(response.headers.get('content-length'))>524288)continue;
  const body=await response.arrayBuffer();if(body.byteLength>524288)continue;
  await env.BUCKET.put(key,body,{httpMetadata:{contentType:type}});
  return new Response(body,{headers:{'content-type':type,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
 }catch{}}
 return new Response('No logo found',{status:404});
}
const json = (data,status=200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function api(request,env) {
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/logo/')&&request.method==='GET')return projectLogo(url.pathname.split('/').pop(),env);
 if(url.pathname!='/api/projects') return json({error:'Not found'},404);
 if(!env.BUCKET) return json({error:'Project storage is unavailable. Please try again shortly.'},503);
 if(request.method==='GET') {
  let objects=[],cursor;
  do {const page=await env.BUCKET.list({prefix:'projects/',cursor,include:['customMetadata']});objects.push(...page.objects);cursor=page.truncated?page.cursor:undefined;} while(cursor);
  const projects=objects.map(o=>{try{return JSON.parse(o.customMetadata.project)}catch{return null}}).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return json({projects});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin') && request.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
 if(Number(request.headers.get('content-length'))>4096)return json({error:'Project details are too long.'},413);
 let body;try{const text=await request.text();if(text.length>4096)return json({error:'Project details are too long.'},413);body=JSON.parse(text)}catch{return json({error:'Invalid project details.'},400)}
 const name=typeof body.name==='string'?body.name.trim():'';
 const description=typeof body.description==='string'?body.description.trim():'';
 let site;try{site=new URL(body.url);if(!['http:','https:'].includes(site.protocol)||site.username||site.password)throw Error()}catch{return json({error:'Enter a valid http or https website URL.'},400)}
 if(!name||name.length>80||!description||description.length>180)return json({error:'Add a name and description within the character limits.'},400);
 site.hash='';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(site.href));
 const id=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 const key='projects/'+id;const existing=await env.BUCKET.head(key);
 if(existing)return json({project:JSON.parse(existing.customMetadata.project),existing:true});
 const project={id,name,description,url:site.href,createdAt:new Date().toISOString()};
 await env.BUCKET.put(key,JSON.stringify(project),{httpMetadata:{contentType:'application/json'},customMetadata:{project:JSON.stringify(project)}});
 return json({project},201);
}

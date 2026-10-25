const json = (data,status=200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function api(request,env) {
 const url=new URL(request.url);
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

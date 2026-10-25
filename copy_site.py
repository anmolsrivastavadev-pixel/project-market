import subprocess, re, pathlib, urllib.request, urllib.parse, concurrent.futures, hashlib
ROOT=pathlib.Path(__file__).parent/'dist'
BASE='https://proofoftraction.com'
pages=['/','/?view=sealed','/methods','/badge','/about','/privacy','/p/bangerkit','/p/thegroove','/p/talk-first','/p/quoteboomerang','/p/specula','/p/notch-design','/p/daypero']
def fetch(url):
 return subprocess.check_output(['curl','-fsSL','--max-time','40',url])
def getpage(p):
 return p,fetch(BASE+p).decode()
raw=dict(concurrent.futures.ThreadPoolExecutor(8).map(getpage,pages))
assets={}
for s in raw.values():
 for tag in re.findall(r'<(?:link|img)\b[^>]*>',s):
  if 'as="script"' in tag: continue
  if tag.startswith('<link') and not any(x in tag for x in ['as="image"','rel="stylesheet"','rel="icon"','rel="apple-touch-icon"']): continue
  m=re.search(r'(?:src|href)="([^"]+)"',tag)
  if m and m[1].startswith('/'): assets[m[1]]=None

def getasset(url):
 data=fetch(BASE+url)
 ext=pathlib.Path(urllib.parse.urlsplit(url).path).suffix or '.png'
 dest='/assets/'+hashlib.sha256(url.encode()).hexdigest()[:14]+ext
 if ext=='.css':
  css=data.decode()
  for font in set(re.findall(r'url\(([^)]+)\)',css)):
   full=urllib.parse.urljoin(BASE+url,font)
   name='/assets/'+full.split('/')[-1]
   (ROOT/name.lstrip('/')).write_bytes(fetch(full))
   css=css.replace(font,name)
  data=css.encode()
 (ROOT/dest.lstrip('/')).write_bytes(data)
 return url,dest
(ROOT/'assets').mkdir(exist_ok=True)
assets=dict(concurrent.futures.ThreadPoolExecutor(8).map(getasset,assets))
for p,s in raw.items():
 s=re.sub(r'<script\b[^>]*>.*?</script>','',s,flags=re.S)
 s=re.sub(r'<link\b[^>]*as="script"[^>]*>','',s)
 s=re.sub(r'<(?:link[^>]*rel="canonical"|meta[^>]*(?:property="og:|name="twitter:))[^>]*>','',s)
 for old,new in assets.items(): s=s.replace('"'+old+'"','"'+new+'"')
 s=s.replace('href="/?view=sealed"','href="/sealed/"').replace('href="/?view=live"','href="/"')
 s=re.sub(r'href="/api/auth/[^\"]+"','href="#demo-account" data-demo-auth="true"',s)
 s=s.replace('href="/dashboard/new"','href="#submit-project" data-demo-submit="true"')
 s=s.replace('</body>','<script src="/app.js"></script></body>')
 target=ROOT/('sealed/index.html' if '?' in p else p.strip('/')+'/index.html' if p!='/' else 'index.html')
 target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s)
print('Copied',len(raw),'pages and',len(assets),'assets plus fonts')

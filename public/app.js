(() => {
  const style = document.createElement('style');
  style.textContent = 'dialog{border:1px solid #dddde7;border-radius:16px;padding:28px;width:min(460px,calc(100% - 32px));color:#151823;font:inherit;box-shadow:0 24px 80px #15182330}dialog::backdrop{background:#15182360}dialog h2{margin:0 0 12px}dialog p{color:#686b75;line-height:1.6}dialog input{display:block;width:100%;box-sizing:border-box;padding:12px;border:1px solid #dcdde5;border-radius:8px;margin:6px 0 16px;font:inherit}dialog button{cursor:pointer}dialog .close{float:right;border:0;background:none;font-size:24px}dialog label{display:block}';
  document.head.append(style);
  const dialog = document.createElement('dialog');
  document.body.append(dialog);
  function show(content) {
    dialog.innerHTML = '<button class="close" aria-label="Close">×</button>' + content;
    dialog.querySelector('.close').onclick = () => dialog.close();
    dialog.showModal();
  }
  dialog.addEventListener('click', e => {if(e.target === dialog) dialog.close()});
  document.querySelectorAll('[data-demo-auth]').forEach(a => a.addEventListener('click',e => {
    e.preventDefault();show('<h2>Preview account</h2><p>Your market is getting started. Account sign-in and analytics are not connected in this preview.</p><button class="btn dark" id="dismiss-account">Got it</button>');
    document.getElementById('dismiss-account').onclick=()=>dialog.close();
  }));
  const escape = text => String(text).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extra=document.createElement('style');extra.textContent='.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;width:100%;text-align:left}.project-card{padding:24px;background:#eeedff;border:1px solid #dedbf8;border-radius:8px;display:block;color:inherit;text-decoration:none}.project-card h2{margin:0 0 10px;font-size:20px}.project-card p{margin:0 0 18px;font-size:14px}.project-card small{color:#6255b6}.fresh-table td.project-cell{text-align:left;padding:18px 14px}.project-cell a{font-weight:600}.project-cell p{font-size:12px;margin:4px 0 0}.project-identity{display:flex;align-items:center;gap:12px}.project-card .project-identity{margin-bottom:14px}.project-card .project-identity h2{margin:0}.project-logo{position:relative;display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9px;background:#e2defb;color:#5947d5;font-weight:700;overflow:hidden;border:1px solid #d9d5ef}.project-card .project-logo{width:44px;height:44px;border-radius:11px}.project-logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;opacity:0}.project-logo img.loaded{opacity:1}.form-error{color:#a21e37!important;font-size:14px}';document.head.append(extra);
  const logo = p => '<span class="project-logo" aria-hidden="true"><span>'+escape(p.name.slice(0,1).toUpperCase())+'</span><img src="/api/logo/'+encodeURIComponent(p.id)+'" alt="" loading="lazy"></span>';
  async function loadProjects(){
    if(!document.querySelector('.fresh-empty')||location.pathname.startsWith('/sealed'))return;
    try{
      const response=await fetch('/api/projects');if(!response.ok)throw Error();const {projects}=await response.json();
      const count=projects.length;
      document.querySelector('.page-sub').textContent=count+' project'+(count===1?'':'s')+' · visitor data pending';
      document.querySelector('.fresh-list span').textContent=count+' listed';
      if(!count)return;
      document.querySelector('.fresh-tape').textContent='YOUR COMMUNITY · '+count+' PROJECT'+(count===1?'':'S')+' LISTED';
      document.querySelector('.mk-index-val').textContent='—';
      document.querySelector('.mk-index-vs').textContent='traffic measurement pending';
      document.querySelector('.mk-pill').textContent='Projects added';
      const empty=document.querySelector('.fresh-empty');empty.innerHTML='<div class="project-grid">'+projects.map(p=>'<a class="project-card" href="'+escape(p.url)+'" target="_blank" rel="noopener noreferrer"><div class="project-identity">'+logo(p)+'<h2>'+escape(p.name)+'</h2></div><p>'+escape(p.description)+'</p><small>'+escape(new URL(p.url).hostname)+' ↗</small></a>').join('')+'</div>';
      document.querySelector('.fresh-table tbody').innerHTML=projects.map(p=>'<tr><td>—</td><td class="project-cell"><div class="project-identity">'+logo(p)+'<div><a href="'+escape(p.url)+'" target="_blank" rel="noopener noreferrer">'+escape(p.name)+'</a><p>'+escape(p.description)+'</p></div></div></td><td>—</td><td>New</td><td>—</td></tr>').join('');
      document.querySelectorAll('.project-logo img').forEach(img=>{img.onload=()=>img.classList.add('loaded');img.onerror=()=>img.remove();if(img.complete&&img.naturalWidth)img.classList.add('loaded');});
    }catch{const body=document.querySelector('.fresh-table tbody');if(body)body.innerHTML='<tr><td colspan="5">Could not load projects. <button class="btn" id="retry-projects">Try again</button></td></tr>';document.getElementById('retry-projects')?.addEventListener('click',loadProjects);}
  }
  document.querySelectorAll('[data-demo-submit]').forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();let draft={};try{draft=JSON.parse(localStorage.getItem('traction-project-draft')||'{}')}catch{}
    show('<h2>Add your project</h2><p>List your project in the market.</p><form><label>Project name<input name="name" required maxlength="80" placeholder="Your project"></label><label>Website URL<input name="url" type="url" required placeholder="https://example.com"></label><label>Short description<input name="description" required maxlength="180" placeholder="What are you building?"></label><p class="form-error" role="alert" hidden></p><button class="btn dark" type="submit">Add project</button></form>');
    const form=dialog.querySelector('form');for(const key of ['name','url','description'])form.elements[key].value=typeof draft[key]==='string'?draft[key]:'';
    form.onsubmit=async ev=>{
      ev.preventDefault();const data=Object.fromEntries(new FormData(form));const button=form.querySelector('button');const error=form.querySelector('[role="alert"]');
      button.disabled=true;button.textContent='Adding…';error.hidden=true;
      try{const response=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not add project. Please try again.');
        try{localStorage.removeItem('traction-project-draft')}catch{}
        await loadProjects();show('<h2>'+ (result.existing?'Project already listed':'Project added')+'</h2><p>Your project is saved and available in the market.</p><a class="btn dark" href="/">View market</a>');
      }catch(err){error.textContent=err.message||'Could not add project. Please try again.';error.hidden=false;button.disabled=false;button.textContent='Add project';}
    };
  }));
  loadProjects();
})();

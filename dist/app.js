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
  document.querySelectorAll('[data-demo-submit]').forEach(a => a.addEventListener('click',e=>{
    e.preventDefault();show('<h2>Submit a project</h2><p>Save a project draft in this browser. You can publish it once submissions are connected.</p><form><label>Project name<input name="name" required maxlength="80" placeholder="Your project"></label><label>Website URL<input name="url" type="url" required placeholder="https://example.com"></label><label>Short description<input name="description" required maxlength="180" placeholder="What are you building?"></label><button class="btn dark" type="submit">Save draft</button></form>');
    dialog.querySelector('form').onsubmit=ev=>{ev.preventDefault();const data=Object.fromEntries(new FormData(ev.target));try{localStorage.setItem('traction-project-draft',JSON.stringify(data));show('<h2>Draft saved</h2><p>Your project draft is saved in this browser. Publishing and traffic measurement require a connected backend.</p>')}catch{show('<h2>Storage unavailable</h2><p>Your browser could not save the draft. Please enable local storage and try again.</p>')}};
  }));
})();

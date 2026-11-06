/* R45 QA-only session indicator. Never store passwords, tokens, or legal data. */
(() => {
  'use strict';
  const el = s => document.querySelector(s);
  const workspaceUUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  async function loadWorkspaces(){
    try {
      const r=await fetch('/api/qa/workspaces',{credentials:'same-origin',cache:'no-store'});
      if(r.status===401){location.replace('/login');return;}
      if(!r.ok)return;
      const data=await r.json();
      if(!Array.isArray(data.workspaces)||data.workspaces.length<2||
         !workspaceUUID.test(data.current_tenant_id||''))return;
      const rows=data.workspaces.filter(w=>workspaceUUID.test(w.tenant_id||'')&&
        (w.workspace_type==='personal'||w.workspace_type==='organization')&&
        (w.role==='lawyer'||w.role==='tenant_admin'));
      if(rows.length<2||!rows.some(w=>w.tenant_id===data.current_tenant_id))return;
      const controls=[];
      for(const id of ['workspace-switch-desktop','workspace-switch-drawer']){
        const host=el('#'+id);if(!host)continue;
        const label=document.createElement('label');
        label.textContent='Không gian làm việc';
        const select=document.createElement('select');select.setAttribute('aria-label','Chuyển không gian làm việc QA');
        select.id=id+'-select';
        for(const w of rows){
          const option=document.createElement('option');
          option.value=w.tenant_id;
          const kind=w.workspace_type==='personal'?'Cá nhân':'Tổ chức';
          const role=w.role==='tenant_admin'?'Quản trị':'Luật sư';
          option.textContent=kind+' · '+role+' · '+w.tenant_id.slice(-4);
          select.append(option);
        }
        select.value=data.current_tenant_id;
        label.append(select);host.replaceChildren(label);host.hidden=false;
        controls.push(select);
      }
      async function change(next){
        if(next===data.current_tenant_id)return;
        if(!rows.some(w=>w.tenant_id===next))return;
        controls.forEach(select=>{select.disabled=true;});
        try{
          const response=await fetch('/api/qa/switch-workspace',{
            method:'POST',credentials:'same-origin',cache:'no-store',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:next})
          });
          if(response.status===401){location.replace('/login');return;}
          if(!response.ok)throw Error('denied');
          // Purge the old tenant's rendered metadata before navigating.
          window.dispatchEvent(new Event('ai-law:workspace-switch'));
          location.replace('/app');
        }catch{
          controls.forEach(select=>{select.value=data.current_tenant_id;select.disabled=false;});
          const role=el('#profile-role');
          if(role)role.textContent='Không thể chuyển không gian. Vui lòng thử lại.';
        }
      }
      controls.forEach(select=>select.addEventListener('change',()=>{void change(select.value);}));
    }catch{/* Fail closed: do not show a fabricated workspace selector. */}
  }
  async function check() {
    try {
      const r = await fetch('/api/qa/session', {credentials:'same-origin',cache:'no-store'});
      if (r.status === 401) { location.replace('/login'); return; }
      if (!r.ok) throw Error('session');
      const data = await r.json();
      el('#profile-identity').textContent = data.email || 'Tài khoản QA';
      const kind = data.workspace_type === 'personal' ? 'Cá nhân' :
        data.workspace_type === 'organization' ? 'Tổ chức' : 'Loại không gian chưa xác định';
      const role = data.role === 'tenant_admin' ? 'Quản trị đơn vị' :
        data.role === 'lawyer' ? 'Luật sư' : 'Vai trò chưa xác định';
      el('#profile-role').textContent = kind + ' · ' + role + ' · QA';
      void loadWorkspaces();
    } catch { el('#profile-role').textContent = 'Không thể kiểm tra phiên'; }
  }
  async function logout() {
    const btn=el('#drawer-logout')?.offsetParent ? el('#drawer-logout') : el('#preview-logout'); btn.disabled=true;
    try {
      const r=await fetch('/api/qa/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store'});
      if(!r.ok) throw Error('logout');
      location.replace('/');
    } catch { btn.disabled=false; btn.textContent='Thử đăng xuất lại'; }
  }
  // Passwords are sent only in a same-origin POST, never in URLs or localStorage.
  function setupPasswordChange(){
    const dialog=el('#change-password-dialog'),form=el('#change-password-form');
    const error=el('#change-password-error'),submit=el('#change-password-submit');
    if(!dialog||!form||!error||!submit)return;
    const report=message=>{error.textContent=message||'';error.hidden=!message;};
    const open=()=>{
      form.reset();report('');
      dialog.showModal();
      el('#current-password')?.focus();
    };
    for(const id of ['change-password-top','change-password-drawer']){
      el('#'+id)?.addEventListener('click',open);
    }
    el('#change-password-close')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{form.reset();report('');});
    form.addEventListener('submit',async event=>{
      event.preventDefault();report('');
      const current=el('#current-password').value;
      const next=el('#new-password').value;
      const confirm=el('#confirm-password').value;
      if(next.length<8||next.length>256){report('Mật khẩu mới cần từ 8 đến 256 ký tự.');return;}
      if(current===next){report('Hãy chọn mật khẩu khác mật khẩu hiện tại.');return;}
      if(next!==confirm){report('Hai lần nhập mật khẩu mới chưa khớp.');return;}
      submit.disabled=true;
      try{
        const response=await fetch('/api/qa/change-password',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({current_password:current,new_password:next})
        });
        if(!response.ok){
          if(response.status===401)report('Mật khẩu hiện tại không đúng hoặc phiên đã hết hạn.');
          else if(response.status===429)report('Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.');
          else report('Không thể đổi mật khẩu. Vui lòng kiểm tra thông tin và thử lại.');
          return;
        }
        // The server revokes all sessions and clears the old cookie.
        form.reset();dialog.close();
        location.replace('/login?changed=1');
      }catch{report('Không thể kết nối dịch vụ QA. Vui lòng thử lại.');}
      finally{submit.disabled=false;}
    });
  }
  el('#preview-logout').addEventListener('click', logout);
  el('#drawer-logout').addEventListener('click', logout);
  setupPasswordChange();
  check();
})();

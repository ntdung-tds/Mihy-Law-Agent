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
  el('#preview-logout').addEventListener('click', logout);
  el('#drawer-logout').addEventListener('click', logout);
  check();
})();

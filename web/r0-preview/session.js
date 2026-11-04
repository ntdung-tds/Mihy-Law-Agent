/* R45 QA-only session indicator. Never store passwords, tokens, or legal data. */
(() => {
  'use strict';
  const el = s => document.querySelector(s);
  async function check() {
    try {
      const r = await fetch('/api/qa/session', {credentials:'same-origin',cache:'no-store'});
      if (r.status === 401) { location.replace('/' + location.hash); return; }
      if (!r.ok) throw Error('session');
      const data = await r.json();
      el('#profile-identity').textContent = data.email || 'Tài khoản QA';
      const kind = data.workspace_type === 'personal' ? 'Cá nhân' : 'Tổ chức';
      const role = data.role === 'tenant_admin' ? 'Quản trị đơn vị' : 'Luật sư';
      el('#profile-role').textContent = kind + ' · ' + role + ' · QA';
    } catch { el('#profile-role').textContent = 'Không thể kiểm tra phiên'; }
  }
  el('#preview-logout').addEventListener('click', async () => {
    const btn=el('#preview-logout'); btn.disabled=true;
    try {
      const r=await fetch('/api/qa/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store'});
      if(!r.ok) throw Error('logout');
      location.replace('/');
    } catch { btn.disabled=false; btn.textContent='Thử đăng xuất lại'; }
  });
  check();
})();

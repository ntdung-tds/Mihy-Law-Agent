import {mountPlatformAdmin} from './platform_admin_view_gpt.mjs';
const root=document.getElementById('platform-root');
try {
  const response=await fetch('/api/platform/session',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('SESSION_UNAVAILABLE');
  const session=await response.json();
  if(session.kind!=='system_admin'||typeof session.csrfToken!=='string'||!/^[0-9a-f]{64}$/.test(session.csrfToken))
    throw Error('INVALID_SESSION');
  mountPlatformAdmin(root,{fetchImpl:fetch.bind(globalThis),csrfToken:session.csrfToken,externalStyle:true});
} catch {
  root.textContent='Không xác minh được phiên quản trị nền tảng. Vui lòng đăng nhập lại qua hệ thống quản trị.';
}

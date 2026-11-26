import {mountPlatformCatalog} from './platform_catalog_gpt.mjs';
import {mountPlatformAdmin} from './platform_admin_view_gpt.mjs';
const root=document.getElementById('platform-root');
try {
  const response=await fetch('/api/platform/session',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('SESSION_UNAVAILABLE');
  const session=await response.json();
  if(session.kind!=='system_admin'||typeof session.csrfToken!=='string'||!/^[0-9a-f]{64}$/.test(session.csrfToken))
    throw Error('INVALID_SESSION');
  const logout=document.createElement('button');logout.type='button';logout.textContent='Đăng xuất';
  logout.addEventListener('click',async()=>{
    logout.disabled=true;
    try{const r=await fetch('/api/platform/logout',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-CSRF-Token':session.csrfToken}});
      if(!r.ok)throw Error('LOGOUT_FAILED');location.replace('/platform/login');
    }catch{logout.disabled=false;logout.textContent='Đăng xuất chưa thành công — thử lại';}
  });
  document.querySelector('.platform-header').append(logout);
  const catalogRoot=document.createElement('section');root.after(catalogRoot);
  const view=mountPlatformAdmin(root,{fetchImpl:fetch.bind(globalThis),csrfToken:session.csrfToken,externalStyle:true});
  mountPlatformCatalog(catalogRoot,{csrf:session.csrfToken,refresh:()=>view.refresh(true)});
} catch {
  root.textContent='Không xác minh được phiên quản trị nền tảng. ';
  const link=document.createElement('a');link.href='/platform/login';link.textContent='Đăng nhập lại';root.append(link);
}

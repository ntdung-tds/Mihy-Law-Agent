/* Public homepage only. No secrets, cookies, or user data. */
(() => {
 'use strict';
 const toggle=document.getElementById('menu-toggle');
 const menu=document.getElementById('mobile-menu');
 if(toggle&&menu){
   const setOpen=open=>{
      toggle.setAttribute('aria-expanded',String(open));
      toggle.setAttribute('aria-label',open?'Đóng menu':'Mở menu');
      menu.hidden=!open;
   };
   toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
   menu.addEventListener('click',e=>{if(e.target.closest('a'))setOpen(false);});
   window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){setOpen(false);toggle.focus();}});
   window.matchMedia('(min-width: 971px)').addEventListener('change',e=>{if(e.matches)setOpen(false);});
 }
 const year=document.getElementById('footer-year');
 if(year)year.textContent=String(new Date().getFullYear());
})();

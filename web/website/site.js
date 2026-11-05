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
 // Decorative reveal only: no content is hidden by default, and reduced-motion is honored.
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduce&&'IntersectionObserver' in window){
   const targets=document.querySelectorAll('.home-story,.home-audience-card,.detail-value,.detail-use-grid>article,.editorial-value-card,.editorial-step,.deep-dive-card,.perspective-copy,.solution-card');
   const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('motion-enter');observer.unobserve(entry.target);}
      });
   },{threshold:.08,rootMargin:'0px 0px -18px 0px'});
   targets.forEach(el=>observer.observe(el));
 }
 const year=document.getElementById('footer-year');
 if(year)year.textContent=String(new Date().getFullYear());
})();

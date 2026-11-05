/* Public marketing pages only. No secrets, cookies, or user data. */
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

 // Mẫu 11 (Owner-approved): inline text + gold link. Desktop dots;
 // mobile hides dots but keeps 3.8-second rotation and all real destinations.
 const banners=document.querySelectorAll('.announcement,.detail-announcement');
 for(const banner of banners){
   const home=banner.classList.contains('announcement');
   const copy=banner.querySelector('.announcement-copy,.detail-announcement-copy');
   const link=banner.querySelector('.announcement-action,.detail-announcement-action');
   const dots=[...banner.querySelectorAll('.mihy08-dots button')];
   if(!copy||!link||dots.length!==3)continue;
   const slides=[
     {html:'Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI — <strong>nhanh hơn, vẫn chuẩn chuyên môn.</strong>',url:home?'#benefits':'/#benefits'},
     {html:'Hai giải pháp linh hoạt: <strong>triển khai riêng cho tổ chức</strong> hoặc <strong>dùng theo gói.</strong>',url:'/giai-phap'},
     {html:'Dữ liệu của bạn được bảo mật — <strong>con người luôn là người quyết định cuối cùng.</strong>',url:'/an-toan-du-lieu'}
   ];
   const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
   let index=0,timer=null;
   function show(n){
     index=(n+slides.length)%slides.length;
     const s=slides[index];
     copy.innerHTML=s.html; // Trusted, fixed marketing strings only.
     link.setAttribute('href',s.url);
     dots.forEach((dot,i)=>{const active=i===index;dot.classList.toggle('on',active);dot.setAttribute('aria-pressed',String(active));});
     if(!mq.matches&&typeof copy.animate==='function')copy.animate([{opacity:.4},{opacity:1}],{duration:250,easing:'ease-out'});
   }
   function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
   function start(){if(timer!==null||mq.matches||document.hidden)return;timer=setInterval(()=>show(index+1),3800);}
   dots.forEach((dot,i)=>dot.addEventListener('click',()=>{show(i);stop();start();}));
   banner.addEventListener('mouseenter',stop);
   banner.addEventListener('mouseleave',start);
   banner.addEventListener('focusin',stop);
   banner.addEventListener('focusout',e=>{if(!banner.contains(e.relatedTarget))start();});
   document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
   if(mq.addEventListener)mq.addEventListener('change',()=>mq.matches?stop():start());
   start();
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

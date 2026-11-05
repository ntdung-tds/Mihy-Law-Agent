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

 // Mẫu 08: shared marketing ribbon across home and editorial pages.
 // Claims are deliberately nonabsolute: deep AI capabilities are in development.
 const banners=document.querySelectorAll('.announcement,.detail-announcement');
 for(const banner of banners){
   const home=banner.classList.contains('announcement');
   const copy=banner.querySelector('.announcement-copy,.detail-announcement-copy');
   const full=copy?.querySelector('.mihy08-full-copy'),short=copy?.querySelector('.mihy08-mobile-copy');
   const extra=copy?.querySelector('.announcement-sub');
   const link=banner.querySelector('.announcement-action,.detail-announcement-action');
   const prev=banner.querySelector('.mihy08-prev'),next=banner.querySelector('.mihy08-next');
   const close=banner.querySelector('.mihy08-close');
   const dots=[...banner.querySelectorAll('.mihy08-dots button')];
   if(!full||!short||!link||!prev||!next||!close||dots.length!==3)continue;
   const slides=[
     home
       ? {full:'Công nghệ đồng hành cùng tư duy pháp lý.',short:'Công nghệ đồng hành cùng tư duy pháp lý.',extra:'Khám phá điều làm nên khác biệt.',label:'Khám phá lợi ích',href:'#benefits'}
       : {full:'Mihy Law AI Agent — công nghệ đồng hành cùng chuyên môn pháp lý.',short:'Công nghệ đồng hành cùng chuyên môn pháp lý.',extra:'',label:'Khám phá hai giải pháp',href:'/giai-phap'},
     {full:'Hai hướng sử dụng linh hoạt: triển khai riêng hoặc dịch vụ theo gói.',short:'Triển khai riêng hoặc dịch vụ theo gói.',extra:'',label:'Xem hai giải pháp',href:'/giai-phap'},
     {full:'Tư duy pháp lý dẫn dắt. Công nghệ hỗ trợ từng bước làm việc.',short:'Chuyên môn pháp lý luôn là trọng tâm.',extra:'',label:'Tìm hiểu cách tiếp cận',href:'/gioi-thieu'}
   ];
   let index=0,timer=null;
   const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
   function show(n){
     index=(n+slides.length)%slides.length;
     const s=slides[index];
     full.textContent=s.full;short.textContent=s.short;
     if(extra)extra.textContent=s.extra;
     link.setAttribute('href',s.href);
     const arrow=document.createElement('span');
     arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';
     link.replaceChildren(document.createTextNode(s.label+' '),arrow);
     dots.forEach((dot,i)=>{dot.classList.toggle('on',i===index);dot.setAttribute('aria-pressed',String(i===index));});
   }
   function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
   function start(){if(timer!==null||mq.matches||document.hidden||banner.hidden)return;timer=setInterval(()=>show(index+1),3800);}
   prev.addEventListener('click',()=>show(index-1));
   next.addEventListener('click',()=>show(index+1));
   dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i)));
   close.addEventListener('click',()=>{stop();banner.hidden=true;});
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

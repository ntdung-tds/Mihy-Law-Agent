/* R46 actual QA matter metadata from authenticated D1. No fake case rows. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const list=$('#matter-list'),form=$('#matter-form'),search=$('#matter-search');
  if(!list||!form)return;
  let matters=[],fetchInProgress=false;
  const note=(message,isError=false)=>{
    const n=$('#matter-feedback');n.textContent=message;n.style.color=isError?'#a52c35':'#267653';
  };
  // Invalidate previously rendered matter metadata as soon as the server revokes access.
  // This is client-side privacy cleanup, not an authorization decision.
  function sessionExpired(){
    matters=[];
    list.replaceChildren();
    const recent=$('#recent-documents');if(recent)recent.replaceChildren();
    for(const selector of ['#matter-total','#nav-matter-count','#dashboard-matter-count']){
      const counter=$(selector);if(counter)counter.textContent='0';
    }
    note('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',true);
    location.replace('/login');
  }
  const dateOf=epoch=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
      .format(new Date(Number(epoch)*1000));
  function show(){
    const q=search.value.trim().toLocaleLowerCase('vi-VN');
    const matching=matters.filter(m=>m.title.toLocaleLowerCase('vi-VN').includes(q));
    list.replaceChildren();
    matching.forEach(m=>{
      const row=document.createElement('div');row.className='matter-row';row.setAttribute('role','listitem');
      const detail=document.createElement('div');
      const name=document.createElement('strong');name.textContent=m.title;
      const info=document.createElement('small');info.textContent='Tạo ngày '+dateOf(m.created_at)+' · Mã '+m.id.slice(0,8);
      const status=document.createElement('span');status.className='matter-read-label';
      status.textContent='Có quyền truy cập';detail.append(name,info);row.append(detail,status);list.append(row);
    });
    $('#matter-empty').hidden=matching.length>0;
    $('#matter-empty').textContent=q?'Không tìm thấy hồ sơ phù hợp.':'Chưa có hồ sơ QA nào được lưu. Tạo hồ sơ thử nghiệm đầu tiên.';
    $('#matter-total').textContent=String(matters.length);
    const nav=$('#nav-matter-count');if(nav)nav.textContent=String(matters.length);
    const stat=$('#dashboard-matter-count');if(stat)stat.textContent=String(matters.length);
    const recent=$('#recent-documents');if(recent){
      recent.replaceChildren();
      if(!matters.length){
        const p=document.createElement('p');p.className='recent-meta';p.textContent='Chưa có hồ sơ QA nào được tạo.';recent.append(p);
      }
      matters.slice(0,3).forEach(m=>{
        const row=document.createElement('button');row.type='button';row.className='recent-row';
        const detail=document.createElement('span');detail.className='recent-info';
        const name=document.createElement('strong');name.className='recent-name';name.textContent=m.title;
        const date=document.createElement('small');date.className='recent-meta';date.textContent='Hồ sơ QA · '+dateOf(m.created_at);
        detail.append(name,date);row.append(detail);
        row.addEventListener('click',()=>{location.hash='#documents';$('#matter-search').focus();});
        recent.append(row);
      });
    }
  }
  async function load(){
    if(fetchInProgress)return;
    fetchInProgress=true;$('#matter-refresh').disabled=true;
    try{
      const res=await fetch('/api/qa/matters',{credentials:'same-origin',cache:'no-store'});
      if(res.status===401){sessionExpired();return;}
      if(!res.ok)throw Error('server');
      const payload=await res.json();
      if(!Array.isArray(payload.matters))throw Error('invalid');
      matters=payload.matters.filter(x=>typeof x.id==='string'&&typeof x.title==='string'&&Number.isInteger(x.created_at));
      show();
      note('Đã đồng bộ '+matters.length+' hồ sơ QA từ máy chủ.');
    }catch{
      note('Không thể tải danh mục hồ sơ từ D1. Hãy thử lại.',true);
    }finally{fetchInProgress=false;$('#matter-refresh').disabled=false;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const title=$('#matter-title').value.trim();
    if(title.length<3||title.length>100){note('Tên hồ sơ cần từ 3 đến 100 ký tự.',true);return;}
    const button=$('#matter-create');button.disabled=true;
    try{
      const res=await fetch('/api/qa/matters',{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});
      if(res.status===401){sessionExpired();return;}
      if(!res.ok){
        const obj=await res.json().catch(()=>({}));
        note(obj.error||'Không thể tạo hồ sơ QA.',true);return;
      }
      const created=await res.json();
      if(!created?.id)throw Error('missing id');
      $('#matter-title').value='';
      note('Hồ sơ đã được lưu vào D1 và gắn quyền truy cập.');
      await load();
    }catch{note('Lỗi kết nối khi tạo hồ sơ. Vui lòng thử lại.',true);}
    finally{button.disabled=false;}
  });
  search.addEventListener('input',show);
  $('#matter-refresh').addEventListener('click',load);
  window.addEventListener('ai-law:documents-open',load);
  load();
})();

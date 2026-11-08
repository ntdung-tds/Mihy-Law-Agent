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
  function scrubMatters(){
    matters=[];
    list.replaceChildren();
    const recent=$('#recent-documents');if(recent)recent.replaceChildren();
    for(const selector of ['#matter-total','#nav-matter-count','#dashboard-matter-count']){
      const counter=$(selector);if(counter)counter.textContent='0';
    }
  }
  function sessionExpired(){
    scrubMatters();
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
      const actions=document.createElement('div');actions.className='matter-actions';
      const status=document.createElement('span');status.className='matter-read-label';
      status.textContent='Có quyền truy cập';actions.append(status);
      detail.append(name,info);
      if(m.can_write===true&&Number.isInteger(m.version)&&m.version>=1){
        const editButton=document.createElement('button');
        editButton.type='button';editButton.className='matter-edit-button';
        editButton.textContent='Đổi tên';editButton.setAttribute('aria-label','Đổi tên hồ sơ '+m.title);
        editButton.addEventListener('click',()=>{
          const editor=document.createElement('form');editor.className='matter-inline-editor';
          const label=document.createElement('label');
          label.textContent='Tên hồ sơ mới';
          const input=document.createElement('input');
          input.type='text';input.minLength=3;input.maxLength=100;input.required=true;
          input.value=m.title;input.setAttribute('aria-label','Tên mới cho '+m.title);
          const save=document.createElement('button');save.type='submit';save.textContent='Lưu tên';
          const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Hủy';
          cancel.addEventListener('click',()=>show());
          editor.addEventListener('submit',async e=>{
            e.preventDefault();
            const title=input.value.trim().normalize('NFC');
            if(title.length<3||title.length>100){note('Tên hồ sơ cần từ 3 đến 100 ký tự.',true);return;}
            save.disabled=true;cancel.disabled=true;
            try{
              const response=await fetch('/api/qa/matters/'+encodeURIComponent(m.id),{
                method:'PATCH',credentials:'same-origin',cache:'no-store',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({title,expected_version:m.version})
              });
              if(response.status===401){sessionExpired();return;}
              if(!response.ok){
                const result=await response.json().catch(()=>({}));
                if(response.status===409||response.status===404){
                  await load();
                  note(result.error||'Hồ sơ hoặc quyền ghi đã thay đổi. Danh sách đã làm mới.',true);
                  return;
                }
                throw Error(result.error||'Không thể cập nhật tên hồ sơ.');
              }
              await load();note('Đã cập nhật tên hồ sơ và ghi lịch sử thay đổi.');
            }catch(error){
              note(error.message||'Không thể đổi tên hồ sơ. Vui lòng thử lại.',true);
              save.disabled=false;cancel.disabled=false;
            }
          });
          editor.append(label,input,save,cancel);
          actions.replaceChildren(editor);input.focus();
        });
        actions.append(editButton);
      }
      const detailsButton=document.createElement('button');
      detailsButton.type='button';detailsButton.className='matter-edit-button';
      detailsButton.textContent='Mở hồ sơ';detailsButton.setAttribute('aria-label','Mở chi tiết hồ sơ '+m.title);
      detailsButton.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('ai-law:case-open',{detail:{id:m.id}})));
      actions.append(detailsButton);
      row.append(detail,actions);list.append(row);
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
      matters=payload.matters.filter(x=>typeof x.id==='string'&&typeof x.title==='string'&&Number.isInteger(x.created_at)).map(x=>({...x,version:Number(x.version||0),can_write:x.can_write===true}));
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
      window.dispatchEvent(new CustomEvent('ai-law:case-open',{detail:{id:created.id}}));
    }catch{note('Lỗi kết nối khi tạo hồ sơ. Vui lòng thử lại.',true);}
    finally{button.disabled=false;}
  });
  search.addEventListener('input',show);
  $('#matter-refresh').addEventListener('click',load);
  window.addEventListener('ai-law:documents-open',load);
  window.addEventListener('ai-law:workspace-switch',scrubMatters);
  load();
})();


/* R116: real isolated QA case details + private R2 files. No customer data in QA. */
(() => {
 'use strict';
 const $=id=>typeof document.getElementById==='function'?document.getElementById(id):null;
 const root=$('qa-case-detail'),form=$('case-detail-form'),upload=$('case-r2-upload-form');
 if(!root||!form||!upload)return;
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 const FILE_MAX=10*1024*1024;
 const MIMES={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 const fields=['reference','category','status','priority','assignee_user_id',
  'client_label','counterparty_label','summary','deadline'];
 let current='',generation=0,version=0,canWrite=false,files=[],uploading=false;
 function msg(id,text,bad=false){const n=$(id);n.textContent=text;n.dataset.state=bad?'error':'info';}
 function reset(){
  generation++;current='';version=0;canWrite=false;files=[];root.hidden=true;
  form.reset();$('case-r2-file').value='';$('case-r2-list').replaceChildren();
  $('case-history-list').replaceChildren();
  msg('case-save-feedback','');msg('case-r2-feedback','');
 }
 const url=rest=>'/api/qa/cases/'+encodeURIComponent(current)+(rest||'');
 const fetchQa=(url,options={})=>fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const auth=res=>{if(res.status===401){reset();location.replace('/login');return false;}return true;};
 function addOption(select,v,label){
  const option=document.createElement('option');option.value=v;option.textContent=label;select.append(option);
 }
 async function openCase(id){
  if(!uuid.test(id))return;
  reset();current=id;root.hidden=false;
  const seq=generation,still=()=>seq===generation&&id===current;
  msg('case-save-feedback','Đang tải hồ sơ và phân quyền…');
  try{
   const res=await fetchQa(url());
   if(!still()||!auth(res))return;
   if(!res.ok)throw Error('Không tìm thấy hồ sơ hoặc không có quyền xem.');
   const data=await res.json();if(!still())return;
   const entry=data.case||{};version=Number(entry.version||0);
   canWrite=data.can_write===true;
   $('case-title-caption').textContent=entry.title||'Hồ sơ QA';
   $('case-detail-heading').textContent='Chi tiết hồ sơ';
   for(const field of fields){
    if(field==='assignee_user_id')continue;
    const node=form.elements.namedItem(field);
    if(node)node.value=typeof entry[field]==='string'?entry[field]:'';
   }
   const assignee=form.elements.namedItem('assignee_user_id');
   assignee.replaceChildren();
   for(const member of data.members||[]){
    if(uuid.test(member.id))addOption(assignee,member.id,String(member.label||member.id));
   }
   assignee.value=String(entry.assignee_user_id||'');
   // Do not let a reader see editable controls and assume unauthorized edits succeed.
   for(const control of form.querySelectorAll('input,select,textarea,button'))control.disabled=!canWrite;
   $('case-r2-file').disabled=!canWrite;$('case-r2-upload').disabled=!canWrite;
   msg('case-save-feedback',canWrite?'Thông tin hồ sơ lưu trên D1.':'Chỉ có quyền xem hồ sơ.');
   void Promise.all([refreshFiles(seq),refreshHistory(seq)]);
   root.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(still())msg('case-save-feedback',e?.message||'Không thể tải hồ sơ.',true);}
 }
 async function refreshFiles(seq=generation){
  const list=$('case-r2-list');if(!current)return;
  try{
   const res=await fetchQa(url('/files'));
   if(seq!==generation||!auth(res))return;
   if(!res.ok)throw Error('Không thể đọc tệp R2.');
   const data=await res.json();if(seq!==generation)return;
   files=Array.isArray(data.files)?data.files:[];
   list.replaceChildren();
   if(!files.length){const p=document.createElement('p');p.textContent='Hồ sơ chưa có tài liệu R2.';list.append(p);}
   for(const file of files){
    if(!uuid.test(file.id))continue;
    const row=document.createElement('div');row.className='matter-row';
    const label=document.createElement('span');
    label.textContent=String(file.name||'Tệp')+' · '+Math.ceil(Number(file.bytes)/1024)+' KB';
    const button=document.createElement('button');button.type='button';
    button.className='matter-edit-button';button.textContent='Tải về';
    button.addEventListener('click',()=>void download(file,button));
    row.append(label,button);list.append(row);
   }
  }catch{if(seq===generation)msg('case-r2-feedback','Không thể tải danh mục tệp R2.',true);}
 }
 async function refreshHistory(seq=generation){
  if(!current)return;const list=$('case-history-list');
  try{
   const res=await fetchQa(url('/events'));
   if(seq!==generation||!auth(res))return;
   if(!res.ok)throw Error('history');
   const data=await res.json();if(seq!==generation)return;
   list.replaceChildren();
   const events=Array.isArray(data.events)?data.events:[];
   if(!events.length){const p=document.createElement('p');p.textContent='Chưa có lịch sử chỉnh sửa chi tiết.';list.append(p);return;}
   for(const item of events.slice(0,50)){
    const line=document.createElement('p');
    const action=item.action==='r2_file_uploaded'?'Lưu tệp lên R2':'Cập nhật hồ sơ';
    const when=new Date(Number(item.created_at)*1000);
    line.textContent=action+' · '+(Number.isNaN(when.getTime())?'':when.toLocaleString('vi-VN'));
    list.append(line);
   }
  }catch{if(seq===generation){list.replaceChildren();const p=document.createElement('p');p.textContent='Chưa tải được lịch sử.';list.append(p);}}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!current||!canWrite)return;
  const seq=generation,save=$('case-save');save.disabled=true;
  const data={expected_version:version};
  for(const field of fields){
   const value=String(form.elements.namedItem(field)?.value||'');
   data[field]=value.normalize('NFC').trim();
  }
  try{
   const res=await fetchQa(url(),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   if(seq!==generation||!auth(res))return;
   const reply=await res.json().catch(()=>({}));
   if(!res.ok){
    if(res.status===409){void openCase(current);throw Error('Phiên bản thay đổi, đã tải lại hồ sơ.');}
    throw Error(reply.error||'Không lưu được hồ sơ.');
   }
   version=Number(reply.version);
   msg('case-save-feedback','Đã lưu thông tin hồ sơ thực trên D1 và ghi lịch sử.');
   void refreshHistory(seq);
  }catch(e){if(seq===generation)msg('case-save-feedback',e?.message||'Lỗi cập nhật.',true);}
  finally{if(seq===generation)save.disabled=!canWrite;}
 });
 upload.addEventListener('submit',async event=>{
  event.preventDefault();if(!current||!canWrite||uploading)return;
  const file=$('case-r2-file').files?.[0];if(!file)return;
  const ext=file.name.split('.').pop().toLowerCase(),mime=MIMES[ext];
  if(!mime||file.size<22||file.size>FILE_MAX){
   msg('case-r2-feedback','Chỉ nhận PDF/DOCX mẫu tối đa 10 MB.',true);return;
  }
  if(!/^[\p{L}\p{N}._ ()-]{5,120}$/u.test(file.name)||file.name.includes('..')){
   msg('case-r2-feedback','Tên tệp không hợp lệ.',true);return;
  }
  uploading=true;const seq=generation,button=$('case-r2-upload');button.disabled=true;
  msg('case-r2-feedback','Đang lưu tệp thật lên R2 private…');
  try{
   const res=await fetchQa(url('/files'),{method:'POST',
    headers:{'Content-Type':mime,'X-File-Name':encodeURIComponent(file.name)},body:file});
   if(seq!==generation||!auth(res))return;
   const reply=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(reply.error||'R2 chưa nhận được tệp.');
   $('case-r2-file').value='';
   msg('case-r2-feedback','Đã lưu trên R2: '+reply.bytes+' byte · SHA-256 '+String(reply.sha256).slice(0,12)+'…');
   await refreshFiles(seq);void refreshHistory(seq);
  }catch(e){if(seq===generation)msg('case-r2-feedback',e?.message||'Lưu tệp thất bại.',true);}
  finally{uploading=false;if(seq===generation)button.disabled=!canWrite;}
 });
 async function download(file,button){
  if(!current||!uuid.test(file.id)||!/^[a-f0-9]{64}$/.test(file.sha256||''))return;
  const seq=generation;button.disabled=true;button.textContent='Đang xác minh…';
  try{
   const res=await fetchQa(url('/files/'+file.id+'/download'),{redirect:'error'});
   if(seq!==generation||!auth(res))return;
   if(!res.ok)throw Error('Không tải được tệp gốc từ R2.');
   const bytes=new Uint8Array(await res.arrayBuffer());
   if(seq!==generation)return;
   if(bytes.length!==Number(file.bytes))throw Error('Dung lượng không khớp tệp gốc.');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==file.sha256)throw Error('SHA-256 không khớp. Từ chối tải tệp.');
   const blobUrl=URL.createObjectURL(new Blob([bytes],{type:file.mime_type}));
   try{
    const a=document.createElement('a');a.href=blobUrl;a.download=file.name;
    document.body.append(a);a.click();a.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);}
   msg('case-r2-feedback','Tải xuống thành công và khớp SHA-256 với tệp R2.');
  }catch(e){if(seq===generation)msg('case-r2-feedback',e?.message||'Tải xuống thất bại.',true);}
  finally{button.disabled=false;button.textContent='Tải về';}
 }
 $('case-close').addEventListener('click',reset);
 window.addEventListener('ai-law:case-open',e=>void openCase(e.detail?.id));
 window.addEventListener('ai-law:workspace-switch',reset);
})();

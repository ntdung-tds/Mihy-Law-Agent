/* R72 QA only: synthetic document transfer to customer-owned Drive; no AI extraction. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const select=$('document-matter'),form=$('document-upload-form');
 const file=$('document-file'),feedback=$('document-feedback'),list=$('qa-document-list');
 if(!select||!form||!file||!list)return;
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 function message(text){feedback.textContent=text;}
 function reset(){select.replaceChildren();list.replaceChildren();message('');file.value='';}
 function opt(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
 async function refreshMatters(){
  reset();select.append(opt('','Chọn hồ sơ QA…'));
  try{
   const res=await fetch('/api/qa/matters',{credentials:'same-origin',cache:'no-store'});
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('Không thể tải hồ sơ.');
   const data=await res.json();
   for(const m of data.matters||[]){
    if(uuid.test(m.id))select.append(opt(m.id,m.title||m.id));
   }
   select.disabled=select.options.length<2;
   if(!select.disabled){select.selectedIndex=1;await refreshFiles();}
  }catch{message('Chưa thể tải hồ sơ QA.');}
 }
 async function refreshFiles(){
  list.replaceChildren();const id=select.value;
  if(!uuid.test(id))return;
  try{
   const res=await fetch('/api/qa/documents?matter_id='+encodeURIComponent(id),
     {credentials:'same-origin',cache:'no-store'});
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('not_ready');
   const {documents=[]}=await res.json();
   if(!documents.length){const p=document.createElement('p');p.textContent='Chưa có tệp QA.';list.append(p);}
   for(const d of documents){
    if(!uuid.test(d.id))continue;
    const row=document.createElement('div');row.className='matter-row';
    const label=document.createElement('span');
    label.textContent=(d.name||'Tệp QA')+' · Chưa kiểm chứng nội dung · '+Math.ceil(Number(d.bytes)/1024)+' KB';
    const a=document.createElement('a');a.href='/api/qa/documents/'+d.id+'/download';
    a.textContent='Tải về';a.rel='nofollow';
    row.append(label,a);list.append(row);
   }
  }catch{message('Tệp Google Drive chưa sẵn sàng hoặc chưa được cấp quyền.');}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();message('');
  const id=select.value,chosen=file.files?.[0];
  if(!uuid.test(id)||!chosen||chosen.size>1500000||chosen.size<22){
   message('Chọn hồ sơ và tệp PDF/DOCX QA dưới 1,5 MB.');return;
  }
  const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
  try{
   const body=new FormData();body.set('matter_id',id);body.set('file',chosen);
   const res=await fetch('/api/qa/documents',{method:'POST',credentials:'same-origin',
    cache:'no-store',body});
   if(res.status===401){location.replace('/login');return;}
   const result=await res.json();
   if(!res.ok)throw Error(result.error||'Tải lên chưa thành công.');
   file.value='';message('Đã lưu tệp QA cách ly trên Drive. Chưa xử lý AI.');
   await refreshFiles();
  }catch(e){message(e.message||'Không thể tải tệp.');}
  finally{submit.disabled=false;}
 });
 select.addEventListener('change',()=>{void refreshFiles();});
 window.addEventListener('ai-law:documents-open',()=>{void refreshMatters();});
 window.addEventListener('ai-law:workspace-switch',reset);
})();

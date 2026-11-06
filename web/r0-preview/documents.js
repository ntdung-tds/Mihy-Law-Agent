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
 const driveBox=$('drive-setup'),driveMessage=$('drive-status'),connect=$('drive-connect');
 const uploadButton=form.querySelector('button[type="submit"]');
 const returned=new URL(location.href).searchParams.get('drive');
 if(returned==='connected'||returned==='failed'){
  const cleaned=new URL(location.href);
  cleaned.searchParams.delete('drive');
  history.replaceState(null,'',cleaned.pathname+cleaned.search+cleaned.hash);
 }
 function setDrive(state,text){
  if(driveBox)driveBox.dataset.state=state;
  if(driveMessage)driveMessage.textContent=text;
 }
 async function driveStatus(){
  if(!connect||!driveMessage)return;
  connect.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
  setDrive('loading','Đang kiểm tra kết nối Google Drive…');
  try{
   const res=await fetch('/api/qa/drive/status',{credentials:'same-origin',cache:'no-store'});
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('status');
   const data=await res.json();
   if(data.connected===true&&data.configuration_ready===true){
    setDrive('connected','Đã kết nối Google Drive cho không gian làm việc này. Có thể tải tệp QA lên.');
    if(uploadButton)uploadButton.disabled=false;
    return;
   }
   if(data.configuration_ready!==true){
    setDrive('setup','AI Law đang hoàn tất cấu hình kết nối Google. Bạn chưa cần thực hiện thao tác kỹ thuật.');
    return;
   }
   if(data.can_connect!==true){
    setDrive('admin','Không gian tổ chức chưa kết nối Google Drive. Hãy liên hệ quản trị đơn vị để cấp quyền.');
    return;
   }
   setDrive('disconnected',returned==='failed'
    ?'Google chưa cấp quyền hoặc kết nối bị gián đoạn. Bạn có thể thử lại.'
    :'Chưa kết nối. Nhấn nút bên dưới, chọn tài khoản Google và Đồng ý.');
   connect.hidden=false;
  }catch{
   setDrive('error','Không thể kiểm tra kết nối Google Drive lúc này. Vui lòng thử lại.');
  }
 }
 if(connect)connect.addEventListener('click',async()=>{
  connect.disabled=true;
  connect.textContent='Đang mở Google…';
  setDrive('loading','Đang chuyển đến màn hình cấp quyền Google…');
  try{
   const r=await fetch('/api/qa/drive/connect',{method:'POST',credentials:'same-origin',
    cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});
   if(r.status===401){location.replace('/login');return;}
   if(!r.ok)throw Error(r.status===503
    ?'AI Law chưa hoàn tất cấu hình kết nối Google. Vui lòng thử lại sau.'
    :'Chưa thể mở trang cấp quyền Google. Vui lòng thử lại.');
   const data=await r.json();
   const url=new URL(data.authorization_url);
   if(url.origin!=='https://accounts.google.com'||url.protocol!=='https:')
    throw Error('Liên kết cấp quyền Google không hợp lệ.');
   location.assign(url.toString());
  }catch(e){setDrive('error',e.message||'Không thể mở Google.');}
  finally{connect.disabled=false;connect.textContent='Kết nối Google Drive';}
 });
 void driveStatus();
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
  finally{submit.disabled=!(driveBox?.dataset.state==='connected');}
 });
 select.addEventListener('change',()=>{void refreshFiles();});
 window.addEventListener('ai-law:documents-open',()=>{void driveStatus();void refreshMatters();});
 window.addEventListener('ai-law:workspace-switch',()=>{
  reset();setDrive('loading','Đang chuyển không gian làm việc…');
  if(connect)connect.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
 });
 // app.js can dispatch documents-open before this deferred script registers its listener.
 if(location.hash==='#documents')void refreshMatters();
})();

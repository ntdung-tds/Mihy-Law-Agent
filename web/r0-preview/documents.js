/* R72 QA only: synthetic document transfer to customer-owned Drive; no AI extraction. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const select=$('document-matter'),form=$('document-upload-form');
 const file=$('document-file'),feedback=$('document-feedback'),list=$('qa-document-list');
 const fileName=$('document-file-name');
 if(!select||!form||!file||!list)return;
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 function message(text,state=''){feedback.textContent=text;feedback.dataset.state=state;}
 function showSelectedFile(){
  if(fileName)fileName.textContent=file.files?.[0]?.name||'Chưa có tệp được chọn';
 }
 file.addEventListener('change',showSelectedFile);
 function reset(){select.replaceChildren();list.replaceChildren();message('');file.value='';showSelectedFile();}
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
    if(driveBox?.dataset.state==='connected'){
     const a=document.createElement('a');a.href='/api/qa/documents/'+d.id+'/download';
     a.textContent='Tải về';a.rel='nofollow';
     row.append(label,a);
    }else{
     const note=document.createElement('small');note.textContent='Kết nối Drive để tải về';
     row.append(label,note);
    }
    list.append(row);
   }
  }catch{message('Tệp Google Drive chưa sẵn sàng hoặc chưa được cấp quyền.');}
 }
 const driveBox=$('drive-setup'),driveMessage=$('drive-status'),connect=$('drive-connect'),
  disconnect=$('drive-disconnect');
 const uploadButton=form.querySelector('button[type="submit"]');
 const link=new URL(location.href);
 const returned=link.searchParams.get('drive');
 const issue=link.searchParams.get('issue');
 if(returned==='connected'||returned==='failed'){
  link.searchParams.delete('drive');
  link.searchParams.delete('issue');
  history.replaceState(null,'',link.pathname+link.search+link.hash);
 }
 function setDrive(state,text){
  if(driveBox)driveBox.dataset.state=state;
  if(driveMessage)driveMessage.textContent=text;
 }
 async function driveStatus(){
  if(!connect||!driveMessage)return;
  connect.hidden=true;
  if(disconnect)disconnect.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
  setDrive('loading','Đang kiểm tra kết nối Google Drive…');
  try{
   const res=await fetch('/api/qa/drive/status',{credentials:'same-origin',cache:'no-store'});
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('status');
   const data=await res.json();
   connect.dataset.canConnect=data.can_connect===true?'true':'false';
   if(data.connected===true&&data.configuration_ready===true){
    setDrive('connected','Đã kết nối Google Drive cho không gian làm việc này. Có thể tải tệp QA lên.');
    if(uploadButton)uploadButton.disabled=false;
    if(disconnect)disconnect.hidden=data.can_connect!==true;
    void refreshFiles();
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
   const errors={
    consent:'Google chưa cấp quyền hoặc yêu cầu đã hết hạn. Vui lòng thử lại.',
    session:'Phiên đăng nhập AI Law đã hết hạn trong khi cấp quyền. Đăng nhập lại rồi kết nối.',
    provider:'Google chưa trả quyền truy cập hợp lệ. Vui lòng cấp quyền lại.',
    drive:'Đã nhận quyền Google nhưng chưa tạo được thư mục lưu trữ. Quản trị QA cần kiểm tra Google Drive API đã bật.',
    save:'Google đã cấp quyền nhưng AI Law chưa lưu được kết nối. Vui lòng thử lại.'
   };
   setDrive('disconnected',returned==='failed'
    ?(errors[issue]||'Kết nối chưa hoàn tất. Bạn có thể thử lại.')
    :returned==='connected'
     ?'Google đã trả về nhưng kết nối chưa được lưu. Vui lòng thử lại.'
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
 if(disconnect)disconnect.addEventListener('click',async()=>{
  // A native confirmation prevents accidental loss of the local Drive grant.
  if(!window.confirm('Ngắt kết nối Google Drive khỏi không gian làm việc này? Tệp trên Google Drive không bị xóa. Bạn có thể kết nối lại sau.'))return;
  disconnect.disabled=true;
  if(connect)connect.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
  setDrive('loading','Đang ngắt kết nối Google Drive…');
  try{
   const r=await fetch('/api/qa/drive/disconnect',{method:'POST',
    credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:'{}'});
   if(r.status===401){location.replace('/login');return;}
   let data={};try{data=await r.json();}catch{}
   if(!r.ok||data.disconnected!==true||data.connected!==false)
    throw Error(data.error||'Không thể ngắt kết nối Google Drive. Vui lòng thử lại.');
   await driveStatus();
   if(driveBox?.dataset.state!=='disconnected')
    throw Error('Chưa xác minh được trạng thái ngắt kết nối. Vui lòng tải lại trang.');
   setDrive('disconnected','Đã ngắt kết nối Google Drive. Tệp đã lưu vẫn còn trên Google Drive; kết nối lại để truy cập.');
   void refreshFiles();
  }catch(e){
   setDrive('error',e.message||'Không thể ngắt kết nối. Vui lòng thử lại.');
   // Keep the upload gate closed until the next verified status response.
   if(uploadButton)uploadButton.disabled=true;
  }finally{disconnect.disabled=false;}
 });
 void driveStatus();
 form.addEventListener('submit',async e=>{
  e.preventDefault();message('');
  const id=select.value,chosen=file.files?.[0];
  if(!uuid.test(id)||!chosen){
   message('Chọn hồ sơ và tệp PDF/DOCX mẫu trước khi tải lên.','error');return;
  }
  if(chosen.size>1500000||chosen.size<22){
   message('Tệp chưa hợp lệ hoặc vượt 1,5 MB. Chỉ sử dụng tệp thử nghiệm nhỏ hơn giới hạn.','error');return;
  }
  if(!/\.(pdf|docx)$/i.test(chosen.name)){
   message('Chỉ chấp nhận tệp PDF hoặc DOCX mẫu.','error');return;
  }
  const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
  try{
   const body=new FormData();body.set('matter_id',id);body.set('file',chosen);
   const res=await fetch('/api/qa/documents',{method:'POST',credentials:'same-origin',
    cache:'no-store',body});
   if(res.status===401){location.replace('/login');return;}
   let result={};
   try{result=await res.json();}catch{}
   if(!res.ok){
    const error=new Error(result.error||'Tải lên chưa thành công.');
    error.code=result.code||'';
    throw error;
   }
   file.value='';showSelectedFile();
   message('Đã lưu tệp thử nghiệm vào Google Drive. Nội dung chưa được dùng cho AI.','success');
   await refreshFiles();
  }catch(e){
   message(e.message||'Không thể tải tệp.','error');
   if(e.code==='DRIVE_GRANT_UNAVAILABLE'&&connect){
    // Only show the consent action for an administrator/personal owner who
    // was already granted connect rights by the verified status endpoint.
    if(connect.dataset.canConnect==='true'){
     connect.hidden=false;connect.textContent='Kết nối lại Google Drive';
     setDrive('error','Phiên cấp quyền lưu trữ cần được kết nối lại.');
    }
   }
  }
  finally{submit.disabled=!(driveBox?.dataset.state==='connected');}
 });
 select.addEventListener('change',()=>{void refreshFiles();});
 window.addEventListener('ai-law:documents-open',()=>{void driveStatus();void refreshMatters();});
 window.addEventListener('ai-law:workspace-switch',()=>{
  reset();setDrive('loading','Đang chuyển không gian làm việc…');
  if(connect)connect.hidden=true;
  if(disconnect)disconnect.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
 });
 // app.js can dispatch documents-open before this deferred script registers its listener.
 if(location.hash==='#documents')void refreshMatters();
})();

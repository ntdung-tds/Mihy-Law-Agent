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
   // R96: The organization connector still points to the deleted QA OAuth
   // client. Never redirect users into Google's guaranteed 401 deleted_client.
   // This public client ID is not a secret; no backend grant is overwritten.
   const deletedClient='873907439100-vlno9kus5k18ikvfgj6smodoho71djsg.apps.googleusercontent.com';
   if(url.searchParams.get('client_id')===deletedClient){
    const panel=$('qa-direct-drive-panel');
    if(panel)panel.open=true;
    setDrive('error','Kết nối Drive theo hồ sơ đang dùng OAuth Client đã bị xóa. Quản trị cần cập nhật Client ID và Client Secret mới trên Cloudflare. Để thử tải trực tiếp, mở mục kiểm thử Google Drive bên dưới; tệp thử chưa được gắn vào hồ sơ AI Law.');
    return;
   }
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
   // R86: browser→Google Drive direct file data plane. Only JSON manifests
   // and receipt proofs reach Cloudflare; never the PDF/DOCX bytes.
   const ext=chosen.name.toLowerCase().endsWith('.pdf')?'pdf':'docx';
   const mime=ext==='pdf'?'application/pdf':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
   const bytes=new Uint8Array(await chosen.arrayBuffer());
   if(ext==='pdf'){
    const head=new TextDecoder().decode(bytes.slice(0,5));
    const tail=new TextDecoder().decode(bytes.slice(-1024));
    if(head!=='%PDF-'||!tail.includes('%%EOF'))throw Error('Tệp PDF mẫu không đúng định dạng.');
   }else{
    let endMarker=false;
    for(let j=bytes.length-22;j>=Math.max(0,bytes.length-65557);j--)
     if(bytes[j]===80&&bytes[j+1]===75&&bytes[j+2]===5&&bytes[j+3]===6){
      endMarker=true;break;
     }
    if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4||!endMarker)
     throw Error('Tệp DOCX mẫu không đúng định dạng.');
   }
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
   const api=async(path,body)=>{
    const r=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){location.replace('/login');throw Error('Cần đăng nhập lại AI Law.');}
    let data={};try{data=await r.json();}catch{}
    if(!r.ok){
     // R88: show only allowlisted Google/Worker diagnostics. The server already
     // returns bounded stage/status/reason; never show raw provider bodies,
     // OAuth tokens, filenames, or the sensitive single-file upload URL.
     const stages={
      transport:'Máy chủ QA chưa khởi tạo được phiên tại Google.',
      provider:'Google đã từ chối yêu cầu khởi tạo phiên tải tệp.',
      response:'Google trả về phiên tải tệp không hợp lệ.',
      verify:'Google chưa xác minh được tệp sau khi truyền.'
     };
     const reasons={
      storageQuotaExceeded:'Dung lượng Google Drive đã đầy.',
      insufficientFilePermissions:'Thiếu quyền ghi vào thư mục Google Drive.',
      appNotAuthorizedToFile:'Ứng dụng chưa được phép thao tác trên thư mục.',
      accessNotConfigured:'Google Drive API chưa được bật.',
      rateLimitExceeded:'Google đang giới hạn số yêu cầu.',
      userRateLimitExceeded:'Google đang giới hạn số yêu cầu.',
      dailyLimitExceeded:'Google đang giới hạn số yêu cầu.',
      badRequest:'Google từ chối yêu cầu.',
      notFound:'Google không tìm thấy đối tượng yêu cầu.',
      forbidden:'Google từ chối quyền truy cập.'
     };
     let detail=data.error||'Lưu trữ Google Drive chưa hoàn tất.';
     if(data.code==='DRIVE_UPLOAD_UNAVAILABLE'){
      detail=stages[data.stage]||'Không thể khởi tạo phiên tải lên Google Drive.';
      if(typeof reasons[data.provider_reason]==='string')detail+=' '+reasons[data.provider_reason];
      const parts=['DRIVE_UPLOAD_UNAVAILABLE'];
      if(Object.hasOwn(stages,data.stage))parts.push('stage='+data.stage);
      if(Number.isInteger(data.provider_status)&&data.provider_status>=400&&data.provider_status<=599)
       parts.push('HTTP '+data.provider_status);
      if(Object.hasOwn(reasons,data.provider_reason))parts.push('reason='+data.provider_reason);
      detail+=' Mã chẩn đoán: '+parts.join(' · ')+'.';
     }else if(['DRIVE_GRANT_UNAVAILABLE','QA_RECEIPT_UNAVAILABLE','QA_STORAGE_UNAVAILABLE'].includes(data.code)){
      detail+=' Mã chẩn đoán: '+data.code+'.';
     }
     const e=new Error(detail);e.code=data.code||'';throw e;
    }
    return data;
   };
   message('Đang cấp quyền tải lên Google Drive…');
   const init=await api('/api/qa/documents/upload/start',{
    matter_id:id,file_name:chosen.name,mime_type:mime,byte_length:chosen.size,sha256:digest
   });
   let u;try{u=new URL(init.upload_url);}catch{throw Error('Google không trả về phiên tải tệp hợp lệ.');}
   if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com'||
      u.pathname!=='/upload/drive/v3/files'||u.searchParams.get('uploadType')!=='resumable')
    throw Error('Phiên tải lên không thuộc Google Drive.');
   // Never write the sensitive one-file upload URL to history, DOM, storage or logs.
   message('Đang tải tệp trực tiếp đến Google Drive…');
   let google;
   try{google=await fetch(u.toString(),{method:'PUT',body:chosen,
    headers:{'Content-Type':mime},credentials:'omit',redirect:'error',mode:'cors'});}
   catch{throw Error('Trình duyệt chưa gửi được tệp trực tiếp tới Google Drive. Không thử lại ngay để tránh tệp trùng.');}
   if(!google.ok)throw Error('Google Drive chưa xác nhận tệp (HTTP '+google.status+'). Vui lòng kiểm tra trước khi thử lại.');
   let remote={};try{remote=await google.json();}catch{}
   if(!/^[A-Za-z0-9_-]{10,200}$/.test(remote?.id||''))
    throw Error('Google đã phản hồi nhưng thiếu ID tệp. Không tải lại ngay để tránh trùng.');
   message('Đang xác minh thư mục và ghi nhận hồ sơ…');
   await api('/api/qa/documents/upload/finish',{ticket:init.ticket,file_id:remote.id});
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

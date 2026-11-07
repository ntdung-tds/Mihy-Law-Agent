/* R72 QA only: synthetic document transfer to customer-owned Drive; no AI extraction. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const select=$('document-matter'),form=$('document-upload-form');
 const file=$('document-file'),feedback=$('document-feedback'),list=$('qa-document-list');
 const fileName=$('document-file-name');
 const storageProvider=$('document-storage-provider'),destination=$('document-destination');
 const storageHint=$('document-storage-hint'),storageAdmin=$('storage-admin-controls');
 const folderName=$('storage-folder-name'),createFolder=$('storage-create');
 const memberSelect=$('storage-member'),assignFolder=$('storage-assign'),revokeFolder=$('storage-revoke');
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
 async function downloadVerified(d,link){
  const bytesExpected=Number(d.bytes);
  const id=d.id;
  if(!uuid.test(id)||!Number.isInteger(bytesExpected)||bytesExpected<22||bytesExpected>1500000||
     !/^[a-f0-9]{64}$/.test(d.sha256||'')||
     !['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(d.mime_type)||
     !/^[\p{L}\p{N}._ ()-]{5,120}$/u.test(d.name||'')||
     !/\.(pdf|docx)$/i.test(d.name||'')){
   message('Thông tin tệp lưu trong hồ sơ không hợp lệ. Không tải xuống.','error');return;
  }
  link.textContent='Đang kiểm tra…';link.setAttribute('aria-disabled','true');
  try{
   const res=await fetch('/api/qa/documents/'+id+'/download',{
    credentials:'same-origin',cache:'no-store',redirect:'error'
   });
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('Không tải được tệp gốc (HTTP '+res.status+').');
   const lengthHeader=res.headers.get('Content-Length');
   if(lengthHeader&&Number(lengthHeader)>1500000)
    throw Error('Phản hồi tải xuống vượt giới hạn. Không lưu tệp.');
   const type=(res.headers.get('Content-Type')||'').split(';')[0].trim();
   if(type!==d.mime_type)throw Error('Máy chủ trả về kiểu dữ liệu khác tệp gốc. Không lưu tệp.');
   const bytes=new Uint8Array(await res.arrayBuffer());
   if(bytes.length!==bytesExpected)
    throw Error('Kích thước tệp tải về khác tệp đã lưu ('+bytes.length+' / '+bytesExpected+' byte). Không lưu tệp.');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==d.sha256)throw Error('Tệp tải xuống không khớp SHA-256 gốc. Không lưu tệp.');
   // Save exactly the verified bytes rather than an HTML response rendered by
   // a mobile webview or intermediate login redirect.
   const blobUrl=URL.createObjectURL(new Blob([bytes],{type:d.mime_type}));
   try{
    const node=document.createElement('a');
    node.href=blobUrl;node.download=d.name;node.rel='noopener';
    document.body.appendChild(node);node.click();node.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);}
   message('Đã xác minh tải về: '+bytes.length+' byte, trùng SHA-256 với tệp gốc.','success');
  }catch(e){message(e?.message||'Không thể xác minh tệp tải về.','error');}
  finally{link.textContent='Tải về';link.removeAttribute('aria-disabled');}
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
     a.addEventListener('click',e=>{e.preventDefault();return downloadVerified(d,a);});
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
 const browserStatus=$('document-google-status');
 const SCOPE='https://www.googleapis.com/auth/drive.file';
 let browserToken='',expiresAt=0,googleScript=null,uploading=false,authorizing=false,uncertainUpload=false,consentSeq=0;
 let choosingDestination=false,pendingSaveChoice='',grantResumePending=false;
 const browserReady=()=>browserToken.length>10&&Date.now()+60000<expiresAt;
 const storageReady=()=>!destination||
   (storageProvider?.value==='google_drive'&&uuid.test(destination.value));
 const connected=()=>driveBox?.dataset.state==='connected';
 function uploadGate(){
  if(uploadButton)uploadButton.disabled=uploading||authorizing||choosingDestination||uncertainUpload||!connected()||!storageReady();
 }
 async function refreshStorageDestinations(preferred=''){
  if(!destination)return;
  const previous=preferred||destination.value;
  destination.replaceChildren();destination.append(opt('','Chọn thư mục được cấp quyền…'));
  destination.value='';
  destination.disabled=true;
  if(storageAdmin)storageAdmin.hidden=true;
  if(!connected()||storageProvider?.value!=='google_drive'){
   if(storageHint)storageHint.textContent='Chọn Google Drive và thư mục được phép. OneDrive sẽ có sau khi tích hợp tài khoản Microsoft.';
   uploadGate();return;
  }
  try{
   const r=await fetch('/api/qa/storage/destinations',{credentials:'same-origin',cache:'no-store'});
   if(r.status===401){location.replace('/login');return;}
   if(!r.ok)throw Error('storage');
   const data=await r.json();
   const allowed=(data.destinations||[]).filter(d=>d.provider==='google_drive'&&d.assigned===true&&uuid.test(d.id));
   for(const d of allowed)destination.append(opt(d.id,d.label));
   destination.disabled=!allowed.length;
   if(allowed.some(d=>d.id===previous))destination.value=previous;
   if(storageHint)storageHint.textContent=allowed.length
    ?'Chọn thư mục đích; tài liệu sẽ không tự động lưu vào thư mục gốc.'
    :'Bạn chưa có thư mục được cấp quyền. Quản trị có thể tạo thư mục và phân quyền bên dưới.';
   if(storageAdmin)storageAdmin.hidden=data.can_manage!==true;
   if(data.can_manage===true&&memberSelect)void refreshStorageMembers();
  }catch{
   if(storageHint)storageHint.textContent='Chưa đọc được danh sách thư mục được cấp quyền. Không thể lưu cho đến khi xác minh.';
  }
  uploadGate();
 }
 async function refreshStorageMembers(){
  if(!memberSelect)return;
  memberSelect.replaceChildren();memberSelect.append(opt('','Chọn thành viên…'));
  try{
   const r=await fetch('/api/qa/storage/members',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)return;
   const data=await r.json();
   for(const m of data.members||[])if(uuid.test(m.id))memberSelect.append(opt(m.id,m.label||m.id));
  }catch{/* Keep empty rather than showing another tenant's members. */}
 }
 if(storageProvider)storageProvider.addEventListener('change',()=>{
  if(destination)destination.value='';
  void refreshStorageDestinations();
 });
 if(destination)destination.addEventListener('change',uploadGate);
 if(createFolder)createFolder.addEventListener('click',async()=>{
  const name=folderName?.value?.trim()||'';
  if(!/^.{3,80}$/u.test(name)){message('Nhập tên thư mục 3–80 ký tự.','error');return;}
  createFolder.disabled=true;
  try{
   const r=await fetch('/api/qa/storage/destinations',{method:'POST',
    credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Không thể tạo thư mục.');
   if(storageProvider)storageProvider.value='google_drive';
   await refreshStorageDestinations(data.destination?.id||'');
   if(folderName)folderName.value='';
   message('Đã tạo thư mục. Có thể cấp quyền cho nhân viên.','success');
  }catch(e){message(e.message||'Không tạo được thư mục.','error');}
  finally{createFolder.disabled=false;}
 });
 async function changeStorageAssignment(enabled,button){
  if(!uuid.test(destination?.value||'')||!uuid.test(memberSelect?.value||'')){
   message('Chọn thư mục và thành viên cần cấp hoặc thu hồi quyền.','error');return;
  }
  button.disabled=true;
  try{
   const r=await fetch('/api/qa/storage/assignments',{method:'POST',
    credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({destination_id:destination.value,user_id:memberSelect.value,enabled})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Chưa cập nhật quyền.');
   message(enabled?'Đã cấp quyền thư mục cho thành viên.':'Đã thu hồi quyền thư mục.','success');
  }catch(e){message(e.message||'Không cập nhật được quyền thư mục.','error');}
  finally{button.disabled=false;}
 }
 if(assignFolder)assignFolder.addEventListener('click',()=>changeStorageAssignment(true,assignFolder));
 if(revokeFolder)revokeFolder.addEventListener('click',()=>changeStorageAssignment(false,revokeFolder));
 function resetGoogleBrowser(){
  consentSeq++;authorizing=false;browserToken='';expiresAt=0;
  if(browserStatus)browserStatus.textContent='Drive đã kết nối. Khi lưu tệp lần đầu, Google có thể yêu cầu xác nhận quyền trong trình duyệt.';
  uploadGate();
 }
 function loadGoogleBrowser(){
  if(window.google?.accounts?.oauth2?.initTokenClient)return Promise.resolve();
  if(googleScript)return googleScript;
  googleScript=new Promise((resolve,reject)=>{
   const node=document.createElement('script');
   node.src='https://accounts.google.com/gsi/client';node.async=true;
   node.onload=()=>resolve();
   node.onerror=()=>reject(Error('Google Identity Services không tải được.'));
   document.head.appendChild(node);
  }).catch(e=>{googleScript=null;throw e;});
  return googleScript;
 }
 function prepareBrowserConsent(){
  if(browserStatus)browserStatus.textContent=browserReady()
   ?'Đã sẵn sàng tải tệp vào thư mục Drive của đơn vị.'
   :'Drive đã kết nối. Bấm Lưu tệp; Google có thể yêu cầu xác nhận một lần trong trình duyệt.';
  // Preload Google Identity Services before the user submits, so its popup
  // can be requested synchronously from the save-button gesture.
  void loadGoogleBrowser().catch(()=>{
   if(connected()&&browserStatus)
    browserStatus.textContent='Chưa tải được thư viện Google. Hãy kiểm tra mạng và thử Lưu tệp lại.';
  });
 }
 function requestBrowserGrant(matterId,selectedFile,selectedDest){
  if(!connected()||authorizing||uploading||uncertainUpload)return;
  const clientId=$('drive-blob-test')?.dataset.googleClientId||'';
  if(!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientId)){
   message('Cấu hình Google trên trang QA chưa hợp lệ.','error');return;
  }
  if(!window.google?.accounts?.oauth2?.initTokenClient){
   message('Google chưa nạp xong. Hãy thử nhấn Lưu tệp khi trang đã sẵn sàng.','error');
   void loadGoogleBrowser().catch(()=>{});
   return;
  }
  const seq=++consentSeq;
  authorizing=true;uploadGate();
  // Google OAuth may never invoke the callback if its sign-in window is
  // dismissed or stalls on Android. Never leave the Save button locked.
  setTimeout(()=>{
   if(seq!==consentSeq||!authorizing)return;
   authorizing=false;pendingSaveChoice='';uploadGate();
   message('Google chưa hoàn tất xác thực. Trở lại AI Law, mở bằng Chrome rồi thử Lưu lại.','error');
  },45000);
  if(browserStatus)browserStatus.textContent='Đang xác nhận quyền Google để lưu tệp…';
  try{
   const client=window.google.accounts.oauth2.initTokenClient({
    client_id:clientId,scope:SCOPE,include_granted_scopes:false,
    callback:answer=>{
     if(seq!==consentSeq||!connected())return;
     authorizing=false;
     if(answer?.error||typeof answer?.access_token!=='string'||answer.access_token.length<11){
      pendingSaveChoice='';
      message('Google chưa cấp quyền tải tệp. Hãy kiểm tra tài khoản được chọn.','error');
      uploadGate();return;
     }
     browserToken=answer.access_token;
     expiresAt=Date.now()+Math.max(0,Number(answer.expires_in||0))*1000;
     if(browserStatus)browserStatus.textContent='Google đã xác nhận quyền cho phiên tải lên.';
     uploadGate();
     // Continue the same save intent only when the file and authorized matter
     // have not changed while Google's popup was open.
     if(browserReady()&&select.value===matterId&&file.files?.[0]===selectedFile&&(!destination||destination.value===selectedDest)){
      // Google normally replies later. Keep a short pending continuation for
      // browsers/tests which return the grant before the location dialog closes.
      if(choosingDestination)grantResumePending=true;
      else form.requestSubmit();
     }else{
      pendingSaveChoice='';
      message('Hồ sơ hoặc tệp đã thay đổi. Hãy bấm Lưu lại.','error');
     }
    },
    error_callback:()=>{
     if(seq!==consentSeq)return;
     pendingSaveChoice='';authorizing=false;uploadGate();
     message('Không thể mở cửa sổ Google. Hãy kiểm tra popup và thử Lưu tệp lại.','error');
    }
   });
   // Google retains user consent per OAuth Client ID and requested scope.
   // A forced "consent" prompt makes returning users select their Google
   // account again. Empty prompt asks only when authorization is truly needed.
   // Never persist bearer tokens or expose the tenant's backend refresh grant.
   client.requestAccessToken({prompt:''});
  }catch{
   if(seq===consentSeq){pendingSaveChoice='';authorizing=false;uploadGate();}
   message('Không mở được Google. Vui lòng thử Lưu tệp lại.','error');
  }
 }
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
    setDrive('connected','Đã kết nối Google Drive cho không gian làm việc này. Có thể tải tệp theo hồ sơ.');
    prepareBrowserConsent();
    void refreshStorageDestinations();
    uploadGate();
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
   resetGoogleBrowser();
   if(destination){destination.replaceChildren();destination.append(opt('','Chọn thư mục…'));destination.disabled=true;}
  }catch{
   resetGoogleBrowser();
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
   resetGoogleBrowser();
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
 // One Save gesture opens a destination chooser. No admin-created folder wizard.
 let pickerLoader=null;
 function loadPicker(){
  if(window.google?.picker?.PickerBuilder)return Promise.resolve();
  if(pickerLoader)return pickerLoader;
  pickerLoader=new Promise((resolve,reject)=>{
   if(window.gapi?.load){resolve();return;}
   const s=document.createElement('script');
   s.src='https://apis.google.com/js/api.js';s.async=true;
   s.onload=resolve;s.onerror=()=>reject(Error('Không tải được Google Picker.'));
   document.head.append(s);
  }).then(()=>new Promise((resolve,reject)=>{
   window.gapi.load('picker',{callback:resolve,onerror:reject,timeout:15000,
    ontimeout:()=>reject(Error('Google Picker không phản hồi.'))});
  })).catch(e=>{pickerLoader=null;throw e;});
  return pickerLoader;
 }
 async function pickGoogleFolder(){
  const r=await fetch('/api/qa/drive/picker-config',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('Chức năng chọn thư mục Drive chưa sẵn sàng. AI Law đang hoàn thiện kết nối; bạn không cần cấu hình gì.');
  const config=await r.json();
  if(!config.configured||!/^AIza[A-Za-z0-9_-]{25,}$/.test(config.api_key||''))
   throw Error('Google Picker chưa sẵn sàng.');
  const clientId=$('drive-blob-test')?.dataset.googleClientId||'';
  const appId=clientId.split('-')[0];
  if(!/^\d{8,20}$/.test(appId)||!browserReady())throw Error('Cần kết nối lại tài khoản Google.');
  await loadPicker();
  const G=window.google?.picker;
  if(!G?.PickerBuilder||!G.DocsView||!G.ViewId?.FOLDERS)
   throw Error('Google Picker chưa được tải đầy đủ.');
  return new Promise((resolve,reject)=>{
   try{
    const view=new G.DocsView(G.ViewId.FOLDERS)
     .setIncludeFolders(true).setSelectFolderEnabled(true);
    // Separate Shared Drives tab: Google Picker setEnableDrives(true) filters
    // to shared-drive items only (not normal My Drive / shared-with-me folders).
    const sharedView=new G.DocsView(G.ViewId.FOLDERS)
     .setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true);
    const picker=new G.PickerBuilder().setDeveloperKey(config.api_key)
     .setAppId(appId).setOAuthToken(browserToken).addView(view).addView(sharedView)
     .setCallback(data=>{
      if(data.action===G.Action.PICKED){
       const docs=data[G.Response.DOCUMENTS]||data.docs||[];
       const id=docs?.[0]?.[G.Document.ID]||docs?.[0]?.id||'';
       if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))
        reject(Error('Thư mục Google được chọn chưa hợp lệ.'));
       else resolve(id);
      }else if(data.action===G.Action.CANCEL)resolve(null);
     }).build();
    picker.setVisible(true);
   }catch(e){reject(e);}
  });
 }
 // One location chooser appears first. Google authentication, if still
 // needed for THIS browser, is requested only after the user selects a place.
 async function pickAndRegisterFolder(){
  const id=await pickGoogleFolder();
  if(!id)return null;
  const r=await fetch('/api/qa/storage/select',{method:'POST',
   credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({folder_id:id})});
  const body=await r.json().catch(()=>({}));
  if(r.status===401){location.replace('/login');throw Error('Phiên AI Law đã hết hạn.');}
  if(!r.ok||!uuid.test(body.destination?.id||''))
   throw Error(body.error||'Thư mục này không cho phép lưu tài liệu. Hãy chọn thư mục có quyền ghi.');
  return body.destination.id;
 }
 async function chooseSaveDestination(matterId,selectedFile){
  // After first-time Google consent, resume the *same* root/folder selection
  // without opening the location chooser a second time.
  if(pendingSaveChoice&&browserReady()){
   const mode=pendingSaveChoice;pendingSaveChoice='';
   return mode==='root'?'root':pickAndRegisterFolder();
  }
  const dialog=$('document-save-dialog');
  const root=$('document-save-root'),folder=$('document-save-folder'),
   cancel=$('document-save-cancel');
  if(!dialog||!root||!folder||!cancel||!dialog.showModal)
   throw Error('Trình duyệt chưa hỗ trợ chọn nơi lưu.');
  // A tenant admin's OAuth root is not an employee's own My Drive.
  // Only admin/personal-owner accounts with a verified tenant grant may use it.
  root.disabled=connect?.dataset.canConnect!=='true';
  root.title=root.disabled?'My Drive cá nhân cần kết nối tài khoản Google riêng.':'';
  return new Promise(resolve=>{
   let done=false;
   const finish=value=>{
    if(done)return;done=true;
    if(dialog.open)dialog.close();
    root.onclick=folder.onclick=cancel.onclick=null;
    dialog.oncancel=null;resolve(value);
   };
   const authorizeThenResume=mode=>{
    // Request Google from the actual button click, not from an asynchronous
    // task after browser user activation has expired (important on mobile).
    pendingSaveChoice=mode;
    finish('oauth_pending');
    requestBrowserGrant(matterId,selectedFile,destination?.value||'');
   };
   root.onclick=()=>browserReady()?finish('root'):authorizeThenResume('root');
   cancel.onclick=()=>finish(null);
   dialog.oncancel=e=>{e.preventDefault();finish(null);};
   folder.onclick=()=>{
    if(!browserReady()){authorizeThenResume('folder');return;}
    dialog.close();
    void pickAndRegisterFolder().then(finish)
     .catch(e=>{message(e.message||'Không mở được Drive.','error');finish(null);});
   };
   try{dialog.showModal();}catch{finish(null);}
  });
 }
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
  if(!connected()||choosingDestination||uploading||authorizing||uncertainUpload){uploadGate();return;}
  choosingDestination=true;uploadGate();
  let selectedDestination;
  try{selectedDestination=await chooseSaveDestination(id,chosen);}
  catch(e){pendingSaveChoice='';message(e.message||'Không mở được Drive.','error');return;}
  finally{
   choosingDestination=false;uploadGate();
   if(grantResumePending){grantResumePending=false;form.requestSubmit();}
  }
  if(selectedDestination==='oauth_pending')return; // Google popup on first use, not a canceled upload
  if(!selectedDestination){
   if(!feedback?.textContent)message('Đã hủy lưu. Không gửi tệp lên Drive.');
   return;
  }
  if(!browserReady()){message('Phiên Google đã hết hạn. Vui lòng nhấn Lưu lại.','error');return;}
  if(select.value!==id||file.files?.[0]!==chosen||!connected()){
   message('Hồ sơ, tài khoản Drive hoặc tệp đã thay đổi. Không lưu tệp.','error');return;
  }
  uploading=true;
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
   const manifest={matter_id:id,file_name:chosen.name,mime_type:mime,byte_length:chosen.size,sha256:digest};
   manifest.destination_id=selectedDestination;
   const init=await api('/api/qa/documents/upload/start',manifest);
   // Server checked MatterACL and refreshed the tenant Drive grant. The
   // approved parent and single-use upload ticket are the only returned data.
   if(!uuid.test(init.ticket||'')||
      !/^[A-Za-z0-9_-]{10,200}$/.test(init.drive_folder_id||''))
    throw Error('AI Law chưa xác nhận được thư mục Drive của đơn vị. Không gửi tệp.');
   if(!browserReady())throw Error('Quyền Google trong trình duyệt đã hết hạn. Cấp quyền lại rồi tải lên.');
   // R99: Google-supported multipart/related (<1.5 MB), same as the Owner-
   // verified browser Blob upload. No resumable-session PUT or file relay.
   const boundary='ai_law_matter_'+crypto.randomUUID().replace(/-/g,'');
   const metadata=JSON.stringify({name:chosen.name,mimeType:mime,
    parents:[init.drive_folder_id],appProperties:{ai_law_upload_ticket:init.ticket}});
   const body=new Blob([
    '--'+boundary+'\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,'\r\n--'+boundary+'\r\n',
    'Content-Type: '+mime+'\r\n\r\n',bytes,
    '\r\n--'+boundary+'--'
   ],{type:'multipart/related; boundary='+boundary});
   message('Đang gửi tệp trực tiếp đến thư mục Google Drive của đơn vị…');
   const url='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true';
   let google;
   try{
    google=await fetch(url,{method:'POST',body,headers:{
     'Authorization':'Bearer '+browserToken,
     'Content-Type':'multipart/related; boundary='+boundary
    },credentials:'omit',redirect:'error',mode:'cors',cache:'no-store'});
   }catch{
    uncertainUpload=true;
    throw Error('Chưa đọc được phản hồi Google. Hãy kiểm tra Drive trước khi thử lại để tránh tệp trùng.');
   }
   if(!google.ok){
    if(google.status>=500)uncertainUpload=true;
    throw Error(google.status===403?
     'Google từ chối quyền ghi thư mục (HTTP 403). Hãy chọn đúng tài khoản Google của đơn vị.':
     'Google Drive từ chối tải tệp (HTTP '+google.status+').');
   }
   let remote={};try{remote=await google.json();}catch{}
   if(!/^[A-Za-z0-9_-]{10,200}$/.test(remote?.id||'')){
    uncertainUpload=true;
    throw Error('Google có thể đã nhận tệp nhưng chưa trả ID. Kiểm tra Drive trước khi thử lại.');
   }
   message('Đang xác minh thư mục, quyền và ghi nhận hồ sơ…');
   try{await api('/api/qa/documents/upload/finish',{ticket:init.ticket,file_id:remote.id});}
   catch(e){
    uncertainUpload=true;
    throw Error('Google đã nhận tệp nhưng AI Law chưa ghi nhận vào hồ sơ. Không tải lại để tránh trùng. '+(e.message||''));
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
  finally{uploading=false;uploadGate();}
 });
 select.addEventListener('change',()=>{void refreshFiles();});
 window.addEventListener('ai-law:documents-open',()=>{void driveStatus();void refreshMatters();});
 window.addEventListener('ai-law:workspace-switch',()=>{
  reset();setDrive('loading','Đang chuyển không gian làm việc…');
  if(connect)connect.hidden=true;
  if(disconnect)disconnect.hidden=true;
  resetGoogleBrowser();
  if(storageProvider)storageProvider.value='';
  if(destination){destination.replaceChildren();destination.append(opt('','Chọn thư mục…'));destination.disabled=true;}
  if(storageAdmin)storageAdmin.hidden=true;
  if(uploadButton)uploadButton.disabled=true;
 });
 // app.js can dispatch documents-open before this deferred script registers its listener.
 if(location.hash==='#documents')void refreshMatters();
})();

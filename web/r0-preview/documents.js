/* R72 QA only: synthetic document transfer to customer-owned Drive; no AI extraction. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const select=$('document-matter'),form=$('document-upload-form');
 const file=$('document-file'),feedback=$('document-feedback'),list=$('qa-document-list');
 const fileName=$('document-file-name');
 const search=$('qa-document-search'),searchRun=$('qa-document-search-run');
 // Older cached HTML may not contain the new search inputs yet. Its file
 // upload/download controls must remain usable during asset-version skew.
 if(!select||!form||!file||!list)return;
 let filesLoadGeneration=0,filesLoadController=null;
 function invalidateFileSearch(){
  filesLoadGeneration++;
  filesLoadController?.abort();
  filesLoadController=null;
 }
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 function message(text,state=''){feedback.textContent=text;feedback.dataset.state=state;}
 function showSelectedFile(){
  if(fileName)fileName.textContent=file.files?.[0]?.name||'Chưa có tệp được chọn';
 }
 file.addEventListener('change',showSelectedFile);
 function reset(){
  invalidateFileSearch();
  select.replaceChildren();list.replaceChildren();message('');
  if(search)search.value='';
  file.value='';showSelectedFile();
 }
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
  invalidateFileSearch();
  const generation=filesLoadGeneration;
  const matterId=select.value,q=search?.value?.trim()||'';
  list.replaceChildren();
  if(!uuid.test(matterId))return;
  if(q.length===1||q.length>80){
   message('Nhập từ khóa từ 2–80 ký tự hoặc để trống để xem tệp trong hồ sơ.','error');
   return;
  }
  const controller=typeof AbortController==='function'
    ?new AbortController():{signal:undefined,abort(){}};
  filesLoadController=controller;
  const current=()=>generation===filesLoadGeneration&&
    select.value===matterId&&(search?.value?.trim()||'')===q;
  if(searchRun)searchRun.disabled=true;
  try{
   const url='/api/qa/documents?matter_id='+encodeURIComponent(matterId)+
     (q?'&q='+encodeURIComponent(q):'');
   const res=await fetch(url,{credentials:'same-origin',cache:'no-store',
     signal:controller.signal});
   if(!current())return;
   if(res.status===401){location.replace('/login');return;}
   if(!res.ok)throw Error('NOT_READY');
   const data=await res.json();
   if(!current())return;
   const docs=Array.isArray(data.documents)?data.documents:[];
   if((q&&data.search_scope!=='file_name_only')||docs.length>50)
    throw Error('BAD_LIST_RESPONSE');
   if(!docs.length){
    const p=document.createElement('p');
    p.textContent=q?'Không tìm thấy tệp theo tên trong hồ sơ có quyền truy cập.':
      'Chưa có tệp QA đã ghi nhận trong hồ sơ.';
    list.append(p);
   }
   for(const d of docs){
    if(!uuid.test(d.id))continue;
    const row=document.createElement('div');row.className='matter-row';
    const label=document.createElement('span');
    label.textContent=(d.name||'Tệp QA')+
      ' · Chưa kiểm chứng nội dung · '+Math.ceil(Number(d.bytes)/1024)+' KB';
    if(driveBox?.dataset.state==='connected'){
     const a=document.createElement('a');
     a.href='/api/qa/documents/'+d.id+'/download';
     a.textContent='Tải về';a.rel='nofollow';
     a.addEventListener('click',e=>{e.preventDefault();return downloadVerified(d,a);});
     row.append(label,a);
    }else{
     const note=document.createElement('small');
     note.textContent='Kết nối Drive để tải về';
     row.append(label,note);
    }
    list.append(row);
   }
   if(data.has_more){
    const warning=document.createElement('p');
    warning.textContent='Đang hiển thị 50 tệp đầu tiên. Hãy tìm bằng tên cụ thể hơn.';
    list.append(warning);
   }
  }catch(e){
   if(!current()||e?.name==='AbortError')return;
   message('Không tìm được danh sách tệp trong hồ sơ được cấp quyền.','error');
  }finally{
   if(generation===filesLoadGeneration){
    filesLoadController=null;
    if(searchRun)searchRun.disabled=false;
   }
  }
 }
 if(searchRun)searchRun.addEventListener('click',()=>{void refreshFiles();});
 if(search)search.addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  event.preventDefault();void refreshFiles();
 });
 const driveBox=$('drive-setup'),driveMessage=$('drive-status'),connect=$('drive-connect'),
  disconnect=$('drive-disconnect');
 const uploadButton=form.querySelector('button[type="submit"]');
 const browserStatus=$('document-google-status');
 const SCOPE='https://www.googleapis.com/auth/drive.file';
 let browserToken='',expiresAt=0,googleScript=null,uploading=false,authorizing=false,uncertainUpload=false,consentSeq=0;
 const browserReady=()=>browserToken.length>10&&Date.now()+60000<expiresAt;
 const connected=()=>driveBox?.dataset.state==='connected';
 function uploadGate(){
  if(uploadButton)uploadButton.disabled=uploading||authorizing||uncertainUpload||!connected();
 }
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
 function requestBrowserGrant(matterId,selectedFile){
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
  if(browserStatus)browserStatus.textContent='Đang xác nhận quyền Google để lưu tệp…';
  try{
   const client=window.google.accounts.oauth2.initTokenClient({
    client_id:clientId,scope:SCOPE,include_granted_scopes:false,
    callback:answer=>{
     if(seq!==consentSeq||!connected())return;
     authorizing=false;
     if(answer?.error||typeof answer?.access_token!=='string'||answer.access_token.length<11){
      message('Google chưa cấp quyền tải tệp. Hãy kiểm tra tài khoản được chọn.','error');
      uploadGate();return;
     }
     browserToken=answer.access_token;
     expiresAt=Date.now()+Math.max(0,Number(answer.expires_in||0))*1000;
     if(browserStatus)browserStatus.textContent='Google đã xác nhận quyền cho phiên tải lên.';
     uploadGate();
     // Continue the same save intent only when the file and authorized matter
     // have not changed while Google's popup was open.
     if(browserReady()&&select.value===matterId&&file.files?.[0]===selectedFile){
      form.requestSubmit();
     }else message('Hồ sơ hoặc tệp đã thay đổi. Hãy bấm Lưu tệp lại.','error');
    },
    error_callback:()=>{
     if(seq!==consentSeq)return;
     authorizing=false;uploadGate();
     message('Không thể mở cửa sổ Google. Hãy kiểm tra popup và thử Lưu tệp lại.','error');
    }
   });
   // Google retains user consent per OAuth Client ID and requested scope.
   // A forced "consent" prompt makes returning users select their Google
   // account again. Empty prompt asks only when authorization is truly needed.
   // Never persist bearer tokens or expose the tenant's backend refresh grant.
   client.requestAccessToken({prompt:''});
  }catch{
   if(seq===consentSeq){authorizing=false;uploadGate();}
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
  if(!connected()||uploading||authorizing||uncertainUpload){uploadGate();return;}
  if(!browserReady()){
   // One save button, no separate browser permission button. Only this first
   // Google popup is needed to obtain the user's scoped browser access token.
   requestBrowserGrant(id,chosen);return;
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
   const init=await api('/api/qa/documents/upload/start',{
    matter_id:id,file_name:chosen.name,mime_type:mime,byte_length:chosen.size,sha256:digest
   });
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
   const url='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
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
 select.addEventListener('change',()=>{
  // A different Matter starts with its own complete receipt list, not the
  // previous Matter's filename filter or its delayed response.
  if(search)search.value='';
  void refreshFiles();
 });
 window.addEventListener('ai-law:documents-open',()=>{void driveStatus();void refreshMatters();});
 window.addEventListener('ai-law:workspace-switch',()=>{
  reset();setDrive('loading','Đang chuyển không gian làm việc…');
  if(connect)connect.hidden=true;
  if(disconnect)disconnect.hidden=true;
  resetGoogleBrowser();
  if(uploadButton)uploadButton.disabled=true;
 });
 // app.js can dispatch documents-open before this deferred script registers its listener.
 if(location.hash==='#documents')void refreshMatters();
})();

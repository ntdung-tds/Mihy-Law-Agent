/* R117: one real QA case editor (create/update/attachments), categorized list below.
   D1 metadata and MatterACL; private R2 files. Never cache client source or auth data. */
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector);
 const form=$('#matter-form'),list=$('#matter-list'),search=$('#matter-search');
 if(!form||!list||!search)return;
 const categoryFilter=$('#matter-category-filter'),filePicker=$('#case-r2-file');
 const title=$('#matter-title'),save=$('#matter-create'),saveState=$('#case-save-state');
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 const mimes={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 const fields=['reference','category','status','priority','assignee_user_id',
  'client_label','counterparty_label','summary','deadline'];
 const defaults={reference:'',category:'',status:'open',priority:'normal',assignee_user_id:'',
  client_label:'',counterparty_label:'',summary:'',deadline:''};
 let matters=[],currentId='',caseVersion=0,titleVersion=0,originalTitle='',originalDetails=null;
 let canWrite=true,saving=false,workspaceGeneration=0,loadGeneration=0;

 // Mobile navigation contract: list first; create, detail and edit are explicit.
 // Desktop keeps the R117 full editor + list side-by-side.
 const media=typeof window.matchMedia==='function'
   ?window.matchMedia('(max-width: 720px)'):{matches:false};
 const screen=$('#matter-workspace');
 let pendingCreate=false,mobileMode='list';
 function mobileView(mode,focus=false){
  mobileMode=mode;
  if(screen?.dataset)screen.dataset.mobileMode=mode;
  const onMobile=media.matches;
  const close=$('#case-close');
  if(close)close.textContent=onMobile?'← Danh sách hồ sơ':'+ Hồ sơ mới';
  const edit=$('#case-mobile-edit');
  if(edit)edit.hidden=!(onMobile&&mode==='detail'&&canWrite);
  const heading=$('#matter-title-heading');
  if(heading)heading.textContent=onMobile?({
   create:'Tạo hồ sơ mới',detail:'Chi tiết hồ sơ',
   edit:'Chỉnh sửa hồ sơ',list:'Thông tin hồ sơ vụ việc'
  }[mode]||'Thông tin hồ sơ vụ việc'):'Thông tin hồ sơ vụ việc';
  if(onMobile){
   if(mode!=='list')screen?.scrollIntoView?.({behavior:'instant',block:'start'});
   if(focus){
    if(mode==='create')title.focus?.();
    else if(mode==='list')$('#matter-search')?.focus?.();
    else close?.focus?.();
   }
  }
 }
 function lockMobileDetail(){
  if(!media.matches)return;
  for(const control of form.querySelectorAll('input,textarea,select,button'))control.disabled=true;
  save.disabled=true;
  filePicker.disabled=true;
 }
 function startNew(){
  if(saving)return;
  resetEditor();
  mobileView('create',true);
 }
 function backToList(){
  if(saving)return;
  resetEditor();
  mobileView('list',true);
 }
 function startEdit(){
  if(saving||!currentId||!canWrite||!media.matches)return;
  for(const control of form.querySelectorAll('input,textarea,select,button'))control.disabled=false;
  filePicker.disabled=false;
  save.disabled=false;
  mobileView('edit',true);
 }

 const base=()=>'/api/qa/cases/'+encodeURIComponent(currentId);
 const note=(message,bad=false)=>{
  const n=$('#matter-feedback');n.textContent=message;n.style.color=bad?'#a52c35':'#267653';
 };
 const fileNote=(message,bad=false)=>{
  const n=$('#case-r2-feedback');n.textContent=message;n.dataset.state=bad?'error':'info';
 };
 const dateOf=epoch=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})
  .format(new Date(Number(epoch)*1000));
 const field=name=>form.elements.namedItem(name);
 const dataFromForm=()=>{
  const details={};
  for(const name of fields)details[name]=String(field(name)?.value||'').normalize('NFC').trim();
  return details;
 };
 const req=(url,options={})=>fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 function clearList(){
  matters=[];list.replaceChildren();
  const recent=$('#recent-documents');if(recent)recent.replaceChildren();
  for(const id of ['#matter-total','#nav-matter-count','#dashboard-matter-count']){
   const node=$(id);if(node)node.textContent='0';
  }
  if(categoryFilter)categoryFilter.replaceChildren(makeOption('Tất cả lĩnh vực',''));
 }
 function expired(){
  workspaceGeneration++;loadGeneration++;
  clearList();resetEditor(true);
  note('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',true);
  location.replace('/login');
 }
 function resetEditor(silent=false){
  workspaceGeneration++;
  currentId='';caseVersion=0;titleVersion=0;originalTitle='';originalDetails=null;canWrite=true;
  form.reset();title.value='';filePicker.value='';
  const assignee=field('assignee_user_id');
  assignee.replaceChildren(makeOption('Tôi phụ trách (mặc định)',''));
  for(const control of form.querySelectorAll('input,textarea,select,button'))control.disabled=false;
  $('#case-r2-list').replaceChildren();
  $('#case-history-list').replaceChildren();
  $('#case-history-details').hidden=true;
  save.textContent='Lưu hồ sơ';
  saveState.textContent='Hồ sơ mới · Chưa lưu';
  $('#case-title-caption').textContent='Điền thông tin và đính kèm tệp, sau đó bấm một lần “Lưu hồ sơ”.';
  $('#case-save-feedback').textContent='';
  if(!silent){note('');fileNote('');}
 }
 function makeOption(text,value){
  const opt=document.createElement('option');opt.textContent=text;opt.value=value;return opt;
 }
 function updateFilter(){
  if(!categoryFilter)return;
  const selected=categoryFilter.value;
  const categories=[...new Set(matters.map(m=>m.category.trim()).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,'vi'));
  categoryFilter.replaceChildren(makeOption('Tất cả lĩnh vực',''));
  for(const category of categories)categoryFilter.append(makeOption(category,category));
  categoryFilter.value=categories.includes(selected)?selected:'';
 }
 function show(){
  const query=search.value.trim().toLocaleLowerCase('vi-VN');
  const cat=categoryFilter?.value||'';
  const filtered=matters.filter(m=>(!cat||m.category===cat)&&
   (m.title+' '+m.case_reference+' '+m.category).toLocaleLowerCase('vi-VN').includes(query));
  list.replaceChildren();
  const statusLabels={open:'Mới mở',in_progress:'Đang xử lý',on_hold:'Tạm dừng',closed:'Đã đóng'};
  for(const m of filtered){
   const row=document.createElement('div');row.className='matter-row';row.setAttribute('role','listitem');
   const detail=document.createElement('button');detail.type='button';
   detail.className='case-saved-summary case-row-open';
   detail.setAttribute('aria-label','Xem chi tiết '+m.title);
   detail.addEventListener('click',()=>void openCase(m.id));
   const name=document.createElement('strong');name.textContent=m.title;
   const sub=document.createElement('small');
   sub.textContent=[m.category||'Chưa phân loại',m.case_reference||('Mã '+m.id.slice(0,8)),
    statusLabels[m.case_status]||'Mới mở',dateOf(m.created_at)].join(' · ');
   detail.append(name,sub);
   const actions=document.createElement('div');actions.className='matter-actions';
   const button=document.createElement('button');button.type='button';button.className='matter-edit-button';
   button.textContent=m.can_write?'Mở / Sửa':'Xem hồ sơ';
   button.setAttribute('aria-label','Mở hồ sơ '+m.title);
   button.addEventListener('click',()=>void openCase(m.id));
   actions.append(button);row.append(detail,actions);list.append(row);
  }
  const empty=$('#matter-empty');empty.hidden=filtered.length>0;
  empty.textContent=matters.length===0?'Chưa có hồ sơ nào được lưu.'
   :'Không tìm thấy hồ sơ phù hợp với tìm kiếm hoặc lĩnh vực.';
  $('#matter-total').textContent=String(matters.length);
  for(const id of ['#nav-matter-count','#dashboard-matter-count']){
   const n=$(id);if(n)n.textContent=String(matters.length);
  }
  const recent=$('#recent-documents');
  if(recent){
   recent.replaceChildren();
   if(!matters.length){const p=document.createElement('p');p.textContent='Chưa có hồ sơ đã lưu.';recent.append(p);}
   for(const m of matters.slice(0,3)){
    const btn=document.createElement('button');btn.type='button';btn.className='recent-row';
    const label=document.createElement('span');label.className='recent-info';
    const strong=document.createElement('strong');strong.className='recent-name';strong.textContent=m.title;
    const small=document.createElement('small');small.className='recent-meta';
    small.textContent=(m.category||'Chưa phân loại')+' · '+dateOf(m.created_at);
    label.append(strong,small);btn.append(label);
    btn.addEventListener('click',()=>{location.hash='#documents';void openCase(m.id);});
    recent.append(btn);
   }
  }
 }
 async function load({silent=false}={}){
  const seq=++loadGeneration,scope=workspaceGeneration;
  $('#matter-refresh').disabled=true;
  try{
   const r=await req('/api/qa/matters');
   if(seq!==loadGeneration||scope!==workspaceGeneration)return;
   if(r.status===401){expired();return;}
   if(!r.ok)throw Error('not_ready');
   const data=await r.json();
   if(seq!==loadGeneration||scope!==workspaceGeneration)return;
   if(!Array.isArray(data.matters))throw Error('invalid');
   matters=data.matters.filter(x=>uuid.test(x.id||'')&&typeof x.title==='string'&&Number.isInteger(x.created_at))
    .map(x=>({...x,category:String(x.category||''),case_reference:String(x.case_reference||''),
      case_status:String(x.case_status||'open'),can_write:x.can_write===true,version:Number(x.version||0)}));
   if(currentId&&!matters.some(m=>m.id===currentId))resetEditor(true);
   updateFilter();show();
   if(!silent)note('Đã tải '+matters.length+' hồ sơ đã lưu.');
  }catch{
   if(seq===loadGeneration&&scope===workspaceGeneration)note('Không thể tải danh sách hồ sơ. Hãy thử lại.',true);
  }finally{if(seq===loadGeneration)$('#matter-refresh').disabled=false;}
 }
 async function refreshFiles(scope=workspaceGeneration,id=currentId){
  if(!id||scope!==workspaceGeneration)return;
  const container=$('#case-r2-list');
  try{
   const r=await req('/api/qa/cases/'+encodeURIComponent(id)+'/files');
   if(scope!==workspaceGeneration||id!==currentId)return;
   if(r.status===401){expired();return;}
   if(!r.ok)throw Error('load_files');
   const data=await r.json();
   if(scope!==workspaceGeneration||id!==currentId)return;
   container.replaceChildren();
   const files=Array.isArray(data.files)?data.files:[];
   if(!files.length){const p=document.createElement('p');p.textContent='Chưa có tệp đã lưu.';container.append(p);}
   for(const file of files){
    if(!uuid.test(file.id||''))continue;
    const line=document.createElement('div');line.className='matter-row';
    const info=document.createElement('span');info.textContent=String(file.name||'Tệp')+' · '+
      Math.ceil(Number(file.bytes)/1024)+' KB';
    const download=document.createElement('button');download.type='button';
    download.className='matter-edit-button';download.textContent='Tải xuống';
    download.addEventListener('click',()=>void downloadFile(id,file,download));
    line.append(info,download);container.append(line);
   }
  }catch{if(scope===workspaceGeneration&&id===currentId)fileNote('Không tải được danh sách tệp trên R2.',true);}
 }
 async function refreshEvents(scope=workspaceGeneration,id=currentId){
  if(!id||scope!==workspaceGeneration)return;
  try{
   const r=await req('/api/qa/cases/'+encodeURIComponent(id)+'/events');
   if(scope!==workspaceGeneration||id!==currentId)return;
   if(r.status===401){expired();return;}
   if(!r.ok)throw Error('history');
   const data=await r.json();
   if(scope!==workspaceGeneration||id!==currentId)return;
   const container=$('#case-history-list');container.replaceChildren();
   for(const item of (data.events||[]).slice(0,50)){
    const row=document.createElement('p');
    row.textContent=(item.action==='r2_file_uploaded'?'Đã lưu tài liệu R2':'Đã cập nhật hồ sơ')+
      ' · '+new Date(Number(item.created_at)*1000).toLocaleString('vi-VN');
    container.append(row);
   }
  }catch{/* history is not a blocker for saving; no sensitive error logs */}
 }
 async function openCase(id){
  if(!uuid.test(id)||saving)return;
  resetEditor(true);
  const scope=workspaceGeneration;currentId=id;
  mobileView('detail',true);
  lockMobileDetail();
  saveState.textContent='Đang tải hồ sơ…';save.disabled=true;
  try{
   const r=await req('/api/qa/cases/'+encodeURIComponent(id));
   if(scope!==workspaceGeneration||id!==currentId)return;
   if(r.status===401){expired();return;}
   if(!r.ok)throw Error('Không thể mở hồ sơ hoặc không có quyền đọc.');
   const data=await r.json();
   if(scope!==workspaceGeneration||id!==currentId)return;
   const entry=data.case||{},matched=matters.find(m=>m.id===id);
   originalTitle=String(entry.title||'');
   title.value=originalTitle;titleVersion=Number(entry.title_version||matched?.version||1);
   caseVersion=Number(entry.version||0);
   canWrite=data.can_write===true;
   const assignee=field('assignee_user_id');assignee.replaceChildren();
   assignee.append(makeOption('Tôi phụ trách (mặc định)',''));
   for(const member of data.members||[]){
    if(uuid.test(member.id||''))assignee.append(makeOption(String(member.label||member.id),member.id));
   }
   for(const k of fields){
    const node=field(k);
    if(node)node.value=String(entry[k]??defaults[k]);
   }
   originalDetails=dataFromForm();
   for(const control of form.querySelectorAll('input,select,textarea'))control.disabled=!canWrite;
   save.disabled=!canWrite;filePicker.disabled=!canWrite;
   save.textContent=canWrite?'Lưu thay đổi':'Chỉ xem';
   saveState.textContent=canWrite?'Đang sửa hồ sơ đã lưu':'Chỉ xem · Không có quyền sửa';
   $('#case-title-caption').textContent=originalTitle;
   $('#case-history-details').hidden=false;
   note(canWrite?'Đã mở hồ sơ. Chỉnh sửa hoặc chọn thêm tệp rồi bấm “Lưu thay đổi”.':'Bạn chỉ có quyền xem hồ sơ.');
   fileNote('');
   if(media.matches){lockMobileDetail();mobileView('detail');}
   else mobileView('edit');
   void Promise.all([refreshFiles(scope,id),refreshEvents(scope,id)]);
   $('#matter-title-heading').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
   if(scope===workspaceGeneration){saveState.textContent='Không mở được hồ sơ';note(e?.message||'Không thể tải hồ sơ.',true);}
  }finally{if(scope===workspaceGeneration)save.disabled=media.matches||!canWrite;}
 }
 async function downloadFile(id,file,button){
  if(!uuid.test(file.id||'')||!/^[a-f0-9]{64}$/.test(file.sha256||''))return;
  const scope=workspaceGeneration;button.disabled=true;button.textContent='Đang kiểm tra…';
  try{
   const r=await req('/api/qa/cases/'+encodeURIComponent(id)+'/files/'+file.id+'/download',{redirect:'error'});
   if(scope!==workspaceGeneration||currentId!==id)return;
   if(r.status===401){expired();return;}
   if(!r.ok)throw Error('Không thể tải tệp.');
   if((r.headers.get('Content-Type')||'').split(';')[0]!==file.mime_type)throw Error('Sai định dạng tệp tải về.');
   const bytes=new Uint8Array(await r.arrayBuffer());
   if(bytes.byteLength!==Number(file.bytes)||bytes.length>10*1024*1024)throw Error('Dung lượng không khớp.');
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    x=>x.toString(16).padStart(2,'0')).join('');
   if(sha!==file.sha256)throw Error('SHA-256 không khớp, từ chối tệp.');
   const address=URL.createObjectURL(new Blob([bytes],{type:file.mime_type}));
   try{const a=document.createElement('a');a.href=address;a.download=file.name;
    document.body.append(a);a.click();a.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(address),30000);}
   fileNote('Tải tệp thành công, đã đối chiếu SHA-256.');
  }catch(e){if(scope===workspaceGeneration)fileNote(e?.message||'Không tải được tệp.',true);}
  finally{button.disabled=false;button.textContent='Tải xuống';}
 }
 function selectedFiles(){
  const files=Array.from(filePicker.files||[]);
  if(files.length>20)throw Error('Một lượt chỉ chọn tối đa 20 tệp.');
  for(const file of files){
   const extension=file.name.split('.').pop().toLowerCase();
   if(!mimes[extension]||file.size<22||file.size>10*1024*1024||
     file.name.length<5||file.name.length>120||file.name.includes('..')||
     !/^[\p{L}\p{N}._ ()-]+$/u.test(file.name))
     throw Error('Tệp '+file.name+' không hợp lệ. Chỉ nhận PDF/DOCX tối đa 10 MB/tệp.');
  }
  return files;
 }
 async function uploadSelected(id,files,scope){
  let succeeded=0,failed=[],uncertain=false;
  for(let i=0;i<files.length;i++){
   if(scope!==workspaceGeneration||currentId!==id){uncertain=true;break;}
   const f=files[i],extension=f.name.split('.').pop().toLowerCase();
   fileNote('Đang lưu R2: '+(i+1)+'/'+files.length+' · '+f.name);
   try{
    const r=await req('/api/qa/cases/'+encodeURIComponent(id)+'/files',{
     method:'POST',headers:{'Content-Type':mimes[extension],'X-File-Name':encodeURIComponent(f.name)},body:f
    });
    if(scope!==workspaceGeneration||currentId!==id){uncertain=true;break;}
    if(r.status===401){expired();return {succeeded,failed,uncertain:true};}
    const data=await r.json().catch(()=>({}));
    if(!r.ok){failed.push(f.name+' ('+(data.error||'lỗi lưu tệp')+')');continue;}
    if(!uuid.test(data.id||'')||Number(data.bytes)!==f.size){uncertain=true;failed.push(f.name+' (chưa xác minh kết quả)');continue;}
    succeeded++;
   }catch{uncertain=true;failed.push(f.name+' (không chắc đã ghi, kiểm tra danh sách trước khi thử lại)');}
  }
  if(scope===workspaceGeneration&&id===currentId){
   filePicker.value='';
   await refreshFiles(scope,id);
   void refreshEvents(scope,id);
  }
  return {succeeded,failed,uncertain};
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!canWrite)return;
  const name=title.value.trim().normalize('NFC');
  if(name.length<3||name.length>100){note('Tên hồ sơ cần từ 3–100 ký tự.',true);return;}
  let files;try{files=selectedFiles();}catch(e){note(e.message,true);return;}
  const details=dataFromForm();
  const scope=workspaceGeneration,wasNew=!currentId;
  saving=true;save.disabled=true;$('#case-close').disabled=true;
  try{
   const headers={'Content-Type':'application/json'};
   if(wasNew){
    note('Đang lưu thông tin hồ sơ đầy đủ vào D1…');
    const r=await req('/api/qa/matters',{method:'POST',headers,
     body:JSON.stringify({title:name,details})});
    if(scope!==workspaceGeneration)return;
    if(r.status===401){expired();return;}
    const result=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(result.error||'Không thể tạo hồ sơ.');
    if(!uuid.test(result.id||'')||result.details_saved!==true)throw Error('Máy chủ chưa xác nhận đủ thông tin hồ sơ. Kiểm tra danh sách trước khi tạo lại.');
    currentId=result.id;caseVersion=Number(result.details_version||1);
    titleVersion=1;originalTitle=name;originalDetails={...details};
   }else{
    if(name!==originalTitle){
     note('Đang lưu tên hồ sơ…');
     const r=await req('/api/qa/matters/'+encodeURIComponent(currentId),{
      method:'PATCH',headers,body:JSON.stringify({title:name,expected_version:titleVersion})
     });
     if(scope!==workspaceGeneration)return;
     if(r.status===401){expired();return;}
     const data=await r.json().catch(()=>({}));
     if(!r.ok)throw Error(data.error||'Không thể cập nhật tên hồ sơ. Các trường khác chưa được lưu.');
     titleVersion=Number(data.version);originalTitle=name;
    }
    if(!originalDetails||JSON.stringify(details)!==JSON.stringify(originalDetails)){
     note('Đang lưu thông tin chi tiết hồ sơ…');
     const r=await req('/api/qa/cases/'+encodeURIComponent(currentId),{
      method:'PATCH',headers,body:JSON.stringify({...details,expected_version:caseVersion})
     });
     if(scope!==workspaceGeneration)return;
     if(r.status===401){expired();return;}
     const data=await r.json().catch(()=>({}));
     if(!r.ok)throw Error(data.error||'Không thể cập nhật chi tiết. Kiểm tra danh sách để biết phần đã lưu.');
     caseVersion=Number(data.version);originalDetails={...details};
    }
   }
   const id=currentId;
   note(files.length?'Thông tin D1 đã lưu. Đang tải '+files.length+' tệp lên R2…':'Đã lưu đầy đủ thông tin hồ sơ vào D1.');
   let uploaded={succeeded:0,failed:[],uncertain:false};
   if(files.length)uploaded=await uploadSelected(id,files,scope);
   if(scope!==workspaceGeneration)return;
   save.textContent='Lưu thay đổi';saveState.textContent='Hồ sơ đã lưu · '+(name||id);
   $('#case-title-caption').textContent=name;
   $('#case-history-details').hidden=false;
   if(uploaded.failed.length||uploaded.uncertain){
    note('Đã lưu thông tin hồ sơ trên D1. '+uploaded.succeeded+'/'+files.length+
     ' tệp xác nhận đã lưu trên R2. Các tệp còn lại chưa được xác nhận: '+
     uploaded.failed.join('; ')+'. Hãy kiểm tra danh sách tệp trước khi thử lại.',true);
   }else{
    note(files.length?'Đã lưu hồ sơ và '+files.length+' tệp vào R2 thành công.':'Đã lưu hồ sơ thành công.');
   }
   await load({silent:true});
   if(scope===workspaceGeneration&&media.matches){
    lockMobileDetail();
    mobileView('detail');
   }
   void refreshEvents(scope,id);
  }catch(e){
   if(scope===workspaceGeneration)
    note((currentId?'Có thể hồ sơ đã lưu một phần. ':'')+(e?.message||'Không thể hoàn thành lưu hồ sơ.')+
     ' Kiểm tra danh sách phía dưới trước khi thao tác lại.',true);
   if(currentId)void load({silent:true});
  }finally{
   saving=false;$('#case-close').disabled=false;
   if(scope===workspaceGeneration)save.disabled=!canWrite||(media.matches&&mobileMode==='detail');
  }
 });
 $('#case-close').addEventListener('click',()=>{if(media.matches)backToList();else startNew();});
 $('#case-mobile-edit')?.addEventListener('click',startEdit);
 search.addEventListener('input',show);
 categoryFilter?.addEventListener('change',show);
 $('#matter-refresh').addEventListener('click',()=>void load());
 window.addEventListener('ai-law:case-open',e=>void openCase(e.detail?.id));
 // The navigation controller sends create intent BEFORE changing URL hash.
 // Consuming it on documents-open avoids the browser hashchange race.
 window.addEventListener('ai-law:case-create',()=>{
  pendingCreate=true;
  if(!$('#view-documents')?.hidden)startNew();
 });
 window.addEventListener('ai-law:documents-open',()=>{
  if(media.matches){
   if(pendingCreate)startNew();
   else if(!saving)backToList();
  }else if(pendingCreate)startNew();
  pendingCreate=false;
  void load({silent:true});
 });
 window.addEventListener('ai-law:workspace-switch',()=>{
  pendingCreate=false;
  workspaceGeneration++;loadGeneration++;
  clearList();resetEditor(true);
  mobileView('list');
  note('Đã chuyển không gian. Đang tải danh sách hồ sơ mới…');
  void load({silent:true});
 });
 if(typeof media.addEventListener==='function')media.addEventListener('change',()=>{
  if(media.matches&&!saving)backToList();
  else if(!media.matches)mobileView(currentId?'edit':'create');
 });
 resetEditor(true);
 mobileView(media.matches?'list':'create');
 void load({silent:true});
})();

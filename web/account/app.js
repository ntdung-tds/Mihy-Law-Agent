/* R67 QA account center. Passwords, profile data and photos are never put in localStorage. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const state={loaded:false,avatar:'',email:'',plan:'demo'};
  const roleLabel=role=>role==='tenant_admin'?'Quản trị đơn vị':
    role==='lawyer'?'Luật sư':'Không xác định';
  const spaceLabel=kind=>kind==='personal'?'Cá nhân':
    kind==='organization'?'Tổ chức':'Không xác định';
  const flash=(id,text,error=false)=>{
    const node=el(id);if(!node)return;
    node.textContent=text||'';node.classList.toggle('error',!!error);
  };
  const toast=message=>{
    const node=el('account-toast');node.textContent=message;node.hidden=false;
    // No timer needed; the next action replaces it and it is a live region.
  };
  function initials(name){
    const words=(name||'').trim().split(/\s+/).filter(Boolean);
    const raw=words.length>1?words[0].slice(0,1)+words[words.length-1].slice(0,1):
      (words[0]||'AL').slice(0,2);
    return raw.toLocaleUpperCase('vi');
  }
  function avatarRender(image,name){
    for(const id of ['hero-avatar-initials','avatar-preview-initials'])el(id).textContent=initials(name);
    for(const id of ['hero-avatar-img','avatar-preview-img']){
      const img=el(id);
      if(image){img.src=image;img.hidden=false;}
      else{img.hidden=true;img.removeAttribute('src');}
    }
    state.avatar=image||'';
    el('avatar-remove').disabled=!image;
  }
  function workspacesRender(items,current){
    const host=el('workspaces-list');host.replaceChildren();
    for(const w of items){
      if(!w||!['personal','organization'].includes(w.type)||
         !['lawyer','tenant_admin'].includes(w.role))continue;
      const item=document.createElement('div');item.className='workspace-list-item';item.setAttribute('role','listitem');
      const icon=document.createElement('span');icon.className='workspace-item-icon';icon.textContent=w.type==='personal'?'◎':'▣';
      const info=document.createElement('span');info.className='workspace-item-detail';
      const title=document.createElement('strong');title.textContent=w.type==='personal'?'Không gian cá nhân':'Không gian tổ chức';
      const subtitle=document.createElement('small');subtitle.textContent=roleLabel(w.role)+' · '+String(w.tenant_id||'').slice(-4);
      info.append(title,subtitle);
      const status=document.createElement('span');status.className='workspace-item-status';
      status.textContent=w.tenant_id===current?'Đang sử dụng':'Được cấp';
      item.append(icon,info,status);host.append(item);
    }
    if(!host.childElementCount){
      const message=document.createElement('p');message.textContent='Không có không gian đã được cấp quyền.';
      message.className='panel-intro';host.append(message);
    }
  }
  async function readAccount(){
    el('account-loading').hidden=false;el('account-error').hidden=true;
    try{
      const response=await fetch('/api/qa/profile',{credentials:'same-origin',cache:'no-store'});
      if(response.status===401){location.replace('/login');return;}
      if(!response.ok)throw Error('profile_unavailable');
      const body=await response.json();
      if(!body.profile||!body.active_workspace||!body.plan||!Array.isArray(body.workspaces))
        throw Error('profile_invalid');
      state.loaded=true;state.email=String(body.email||'');
      state.plan=body.plan.code==='pro'?'pro':'demo';
      const profile=body.profile;
      const name=String(profile.display_name||'').trim();
      const fallback=state.email.split('@')[0]||'Tài khoản AI Law';
      el('hero-name').textContent=name||fallback;
      el('hero-email').textContent=state.email;
      el('profile-email').value=state.email;
      el('profile-display-name').value=name;
      el('profile-phone').value=profile.phone||'';
      el('profile-job-title').value=profile.job_title||'';
      el('profile-bio').value=profile.bio||'';
      el('bio-length').textContent=el('profile-bio').value.length;
      avatarRender(profile.avatar_data||'',name||fallback);
      const plan=state.plan==='pro'?'Pro':'Demo';
      el('plan-name').textContent=plan;
      el('hero-plan').textContent=plan+' · QA';
      el('plan-status').textContent=state.plan==='pro'?
        'Gói được cấp · QA (chưa kết nối thanh toán)':'Tài khoản thử nghiệm · Không thanh toán';
      el('plan-description').textContent=state.plan==='pro'?
        'Nhãn gói được quản trị viên cấp. Đây vẫn là môi trường kiểm thử QA.':
        'Trải nghiệm thử nghiệm trong không gian AI Law, chưa kích hoạt tính phí.';
      const work=body.active_workspace;
      el('hero-role').textContent=roleLabel(work.role);
      el('access-role').textContent=roleLabel(work.role);
      el('access-workspace').textContent='Không gian '+spaceLabel(work.type).toLowerCase();
      workspacesRender(body.workspaces,work.tenant_id);
      el('account-loading').hidden=true;el('account-sections').hidden=false;
    }catch{
      state.loaded=false;el('account-loading').hidden=true;el('account-error').hidden=false;
      el('account-sections').hidden=true;
    }
  }
  async function saveJSON(url,payload){
    const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(response.status===401){location.replace('/login');throw Error('session');}
    if(!response.ok)throw Error(response.status===400?'invalid':
      response.status===429?'rate':'service');
    return response.json();
  }
  async function updateAvatar(data){
    flash('avatar-feedback','Đang lưu ảnh…');
    try{
      await saveJSON('/api/qa/profile/avatar',{avatar_data:data});
      avatarRender(data,el('profile-display-name').value||state.email.split('@')[0]);
      flash('avatar-feedback',data?'Đã cập nhật ảnh đại diện.':'Đã xóa ảnh đại diện.');
      toast(data?'Ảnh đại diện đã được cập nhật.':'Ảnh đại diện đã được xóa.');
    }catch(error){
      if(error.message!=='session')flash('avatar-feedback','Không thể lưu ảnh. Vui lòng thử lại.',true);
    }
  }
  async function imageToThumbnail(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)
      throw Error('file');
    const objectURL=URL.createObjectURL(file);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{
        img.onload=resolve;img.onerror=reject;img.src=objectURL;
      });
      if(img.naturalWidth<32||img.naturalHeight<32)throw Error('small');
      for(const side of [160,128,112,96]){
        const canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas');
        const crop=Math.min(img.naturalWidth,img.naturalHeight);
        const x=(img.naturalWidth-crop)/2,y=(img.naturalHeight-crop)/2;
        ctx.drawImage(img,x,y,crop,crop,0,0,side,side);
        for(const quality of [.78,.65,.52]){
          const data=canvas.toDataURL('image/jpeg',quality);
          if(data.startsWith('data:image/jpeg;base64,')&&data.length<42500)return data;
        }
      }
      throw Error('size');
    }finally{URL.revokeObjectURL(objectURL);}
  }
  function wire(){
    el('account-retry').addEventListener('click',()=>void readAccount());
    el('profile-bio').addEventListener('input',e=>{
      el('bio-length').textContent=e.target.value.length;
    });
    el('profile-form').addEventListener('submit',async event=>{
      event.preventDefault();if(!state.loaded)return;
      const payload={
        display_name:el('profile-display-name').value.trim(),
        phone:el('profile-phone').value.trim(),
        job_title:el('profile-job-title').value.trim(),
        bio:el('profile-bio').value.trim()
      };
      if(!payload.display_name){flash('profile-feedback','Vui lòng nhập họ tên.',true);return;}
      const button=el('profile-save');button.disabled=true;flash('profile-feedback','Đang lưu…');
      try{
        await saveJSON('/api/qa/profile',payload);
        el('hero-name').textContent=payload.display_name;
        avatarRender(state.avatar,payload.display_name);
        flash('profile-feedback','Thông tin đã được lưu.');
        toast('Hồ sơ của bạn đã được cập nhật.');
      }catch(error){
        if(error.message!=='session')flash('profile-feedback',
          error.message==='invalid'?'Hãy kiểm tra lại thông tin đã nhập.':'Lưu thông tin chưa thành công.',true);
      }finally{button.disabled=false;}
    });
    el('avatar-file').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      el('avatar-file').disabled=true;
      flash('avatar-feedback','Đang xử lý ảnh…');
      try{const data=await imageToThumbnail(file);await updateAvatar(data);}
      catch{flash('avatar-feedback','Ảnh không hợp lệ hoặc quá lớn. Chọn JPG/PNG/WebP dưới 5 MB.',true);}
      finally{el('avatar-file').disabled=false;event.target.value='';}
    });
    el('avatar-remove').addEventListener('click',async()=>{
      el('avatar-remove').disabled=true;
      await updateAvatar('');
      el('avatar-remove').disabled=!state.avatar;
    });
    el('account-password-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const current=el('account-current-password').value,next=el('account-new-password').value,
            confirmation=el('account-confirm-password').value;
      if(next.length<8||next.length>256||next===current){
        flash('password-feedback','Mật khẩu mới phải khác mật khẩu cũ và có từ 8 đến 256 ký tự.',true);return;
      }
      if(next!==confirmation){flash('password-feedback','Hai lần nhập mật khẩu mới chưa khớp.',true);return;}
      const button=el('password-save');button.disabled=true;
      flash('password-feedback','Đang đổi mật khẩu…');
      try{
        await saveJSON('/api/qa/change-password',{current_password:current,new_password:next});
        el('account-password-form').reset();
        location.replace('/login?changed=1');
      }catch(error){
        if(error.message!=='session')flash('password-feedback',error.message==='rate'?
          'Bạn thao tác quá nhiều. Vui lòng thử lại sau.':
          'Không thể đổi mật khẩu. Kiểm tra mật khẩu hiện tại và thử lại.',true);
      }finally{button.disabled=false;}
    });
    el('account-logout').addEventListener('click',async()=>{
      el('account-logout').disabled=true;
      try{await saveJSON('/api/qa/logout',{});location.replace('/login');}
      catch{el('account-logout').disabled=false;toast('Không thể đăng xuất. Vui lòng thử lại.');}
    });
    for(const link of document.querySelectorAll('.account-nav-link')){
      link.addEventListener('click',()=>{
        document.querySelectorAll('.account-nav-link').forEach(a=>a.classList.toggle('is-current',a===link));
      });
    }
  }
  wire();void readAccount();
})();

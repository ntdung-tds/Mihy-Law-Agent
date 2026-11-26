const form=document.getElementById('platform-login-form'),email=document.getElementById('email'),password=document.getElementById('password'),submit=document.getElementById('submit'),error=document.getElementById('login-error');
form.addEventListener('submit',async event=>{
 event.preventDefault();if(submit.disabled)return;
 submit.disabled=true;error.hidden=true;
 try{
  const r=await fetch('/api/platform/login',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})});
  password.value='';
  if(r.ok){const b=await r.json();if(b.ok===true){location.replace('/platform');return;}}
  error.textContent=r.status===429?'Đã vượt giới hạn đăng nhập. Vui lòng thử lại sau vài phút.':r.status===503?'Dịch vụ đăng nhập QA chưa sẵn sàng.':'Thông tin đăng nhập không hợp lệ.';
 }catch{password.value='';error.textContent='Không thể kết nối. Vui lòng thử lại.';}
 error.hidden=false;submit.disabled=false;
});

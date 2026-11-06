/* Same-origin QA login; user credentials never stored in site, URL, or localStorage. */
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector);
 const form=$('#login-form'),error=$('#form-error'),submit=$('#submit');
 if(!form)return;
 if(new URLSearchParams(location.search).get('changed')==='1'){
   const success=$('#password-change-success');if(success)success.hidden=false;
 }
 function report(message){error.hidden=!message;error.textContent=message||'';}
 form.addEventListener('submit',async event=>{
   event.preventDefault();report('');submit.disabled=true;
   try {
      const response=await fetch('/api/qa/login',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:$('#email').value,password:$('#password').value})
      });
      let result={};
      try{result=await response.json();}catch{}
      if(!response.ok){report(result.error||'Không thể đăng nhập. Vui lòng kiểm tra tài khoản.');return;}
      $('#password').value='';
      window.location.replace('/app');
   }catch{report('Không thể kết nối máy chủ. Vui lòng thử lại.');}
   finally{submit.disabled=false;}
 });
 $('#reveal').addEventListener('click',()=>{
    const input=$('#password'),visible=input.type==='text';
    input.type=visible?'password':'text';
    $('#reveal').textContent=visible?'Hiện':'Ẩn';
    $('#reveal').setAttribute('aria-label',visible?'Hiện mật khẩu':'Ẩn mật khẩu');
 });
})();

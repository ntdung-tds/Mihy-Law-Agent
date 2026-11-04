/* QA login at the same preview origin, R44 verifier remains server-side. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),form=$('#login-form'),error=$('#form-error'),button=$('#submit');
  const feedback=msg=>{error.hidden=!msg;error.textContent=msg||'';};
  form.addEventListener('submit',async event=>{
    event.preventDefault();feedback('');button.disabled=true;
    try {
      const r=await fetch('/api/qa/login',{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:$('#email').value,password:$('#password').value})});
      const data=await r.json();
      if(!r.ok){feedback(data.error||'Không thể đăng nhập.');return;}
      $('#password').value='';location.reload();
    } catch { feedback('Không thể kết nối. Vui lòng thử lại.'); }
    finally { button.disabled=false; }
  });
  $('#reveal').addEventListener('click',()=>{
    const input=$('#password');const shown=input.type==='text';input.type=shown?'password':'text';
    $('#reveal').textContent=shown?'Hiện':'Ẩn';
    $('#reveal').setAttribute('aria-label',shown?'Hiện mật khẩu':'Ẩn mật khẩu');
  });
})();

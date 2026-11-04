/* QA mobile, same-origin auth API; HttpOnly cookie managed by browser. */
export const script = `(function(){
"use strict";
var active=null,$=id=>document.getElementById(id);
function show(view){["loading","login","dashboard"].forEach(id=>$(id).hidden=id!==view);}
async function api(url,method,body,csrf){
 const h={"Accept":"application/json"},o={method:method||"GET",credentials:"same-origin",cache:"no-store",headers:h};
 if(body){h["Content-Type"]="application/json";o.body=JSON.stringify(body);}
 if(csrf)h["X-CSRF-Token"]=csrf;
 const res=await fetch(url,o);return {res,body:await res.json().catch(()=>({}))};
}
function display(value){
 active=value;
 $("user-email").textContent=value.account.email;
 $("current-workspace").textContent=value.current.label;
 $("current-role").textContent=value.current.role_key==="tenant_admin"?"Quản trị đơn vị":"Luật sư";
 $("workspace").replaceChildren();
 for(const w of value.workspaces){const opt=document.createElement("option");
 opt.value=w.tenant_id;opt.textContent=w.label;opt.selected=w.tenant_id===value.current.tenant_id;
 $("workspace").appendChild(opt);}
 $("switch-wrap").hidden=value.workspaces.length<2;show("dashboard");
}
function error(value){$("login-error").textContent=value;$("login-error").hidden=!value;}
async function load(){
 try{const r=await api("/v1/auth/me");if(r.res.ok&&r.body.authenticated)display(r.body);
 else{active=null;show("login");}}
 catch{active=null;show("login");error("Không kết nối được máy chủ.");}
}
$("login-form").addEventListener("submit",async e=>{
 e.preventDefault();error("");
 const email=$("login-email").value.trim(),password=$("login-password").value;
 if(!email||!password){error("Vui lòng điền email và mật khẩu.");return;}
 $("login-submit").disabled=true;
 try{const r=await api("/v1/auth/login","POST",{email,password});
 if(r.res.ok&&r.body.authenticated){$("login-password").value="";display(r.body);}
 else error(r.res.status===429?"Quá nhiều lần đăng nhập sai. Thử lại sau.":"Đăng nhập không thành công hoặc tài khoản chưa có quyền.");}
 catch{error("Không kết nối được máy chủ.");}
 finally{$("login-submit").disabled=false;}
});
$("toggle-password").addEventListener("click",()=>{
 const input=$("login-password"),showing=input.type==="password";
 input.type=showing?"text":"password";$("toggle-password").textContent=showing?"Ẩn":"Hiện";
});
$("switch").addEventListener("click",async()=>{
 if(!active)return;
 const tenant_id=$("workspace").value;if(tenant_id===active.current.tenant_id)return;
 const r=await api("/v1/auth/switch","POST",{tenant_id},active.csrf).catch(()=>null);
 if(r&&r.res.ok)display(r.body);else await load();
});
$("logout").addEventListener("click",async()=>{
 if(!active)return;await api("/v1/auth/logout","POST",{},active.csrf).catch(()=>{});
 active=null;show("login");
});
load();
})();`;
export function renderClient(){
 return new Response(script,{headers:{
  "Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
 }});
}

// Separate metadata administration panel, mounted only after platform session verification.
export function mountPlatformCatalog(root,{csrf,refresh}){
 const doc=root.ownerDocument;root.className='mihy-platform';
 const el=(tag,text)=>{const x=doc.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
 const title=el('h3','Quản lý gói và giấy phép'),form=el('form'),select=el('select'),fields=el('div'),status=el('p'),audit=el('div');
 status.setAttribute('role','status');status.className='notice';audit.className='cards';
 const actions={plan_create:'Tạo gói',plan_update:'Cập nhật gói',plan_retire:'Ngừng gói',service_create:'Đăng ký thuê bao chờ kích hoạt',license_update:'Đổi gói / gia hạn'};
 for(const [value,label] of Object.entries(actions)){const o=el('option',label);o.value=value;select.append(o);}
 const label=el('label','Thao tác');label.append(select);const submit=el('button','Lưu thay đổi');submit.type='submit';
 const auditHeading=el('h3','Nhật ký thay đổi gói / giấy phép'),reload=el('button','Làm mới nhật ký');reload.type='button';
 form.append(label,fields,submit,status);root.append(title,form,auditHeading,reload,audit);
 let inputs={},busy=false;
 function field(key,labelText,type='text',max=120){const l=el('label',labelText),i=el('input');i.type=type;i.required=true;if(type==='text')i.maxLength=max;if(type==='number'){i.min='0';i.step='1';i.max=String(Number.MAX_SAFE_INTEGER);}l.append(i);fields.append(l);inputs[key]=i;}
 function redraw(){fields.replaceChildren();inputs={};const a=select.value;field('objectId',a.startsWith('plan_')?'Mã gói':'Mã tenant', 'text',a.startsWith('plan_')?80:120);
 if(a==='plan_create'||a==='plan_update'){field('planName','Tên gói');field('maxUsers','Số người dùng tối đa','number');inputs.maxUsers.min='1';field('maxStorageBytes','Dung lượng tối đa (byte)','number');}
 if(a==='service_create'||a==='license_update'){field('planId','Mã gói','text',80);field('licenseExpiresAt','Ngày hết hạn','date');}
 field('reasonCode','Mã lý do (chữ hoa và gạch dưới)','text',80);inputs.reasonCode.pattern='[A-Z][A-Z0-9_]{1,79}';}
 select.addEventListener('change',redraw);redraw();
 async function loadAudit(){try{const r=await fetch('/api/platform/catalog',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.items)||data.items.length>50)throw Error();audit.replaceChildren();for(const x of data.items){const card=el('article');card.className='card';card.append(el('strong',actions[x.action]||'Thay đổi'),el('p',String(x.object_id)),el('p','Người thực hiện: '+x.actor_id),el('p','Lý do: '+x.reason_code),el('p',new Date(x.event_at*1000).toLocaleString('vi-VN')));audit.append(card);}if(!data.items.length)audit.append(el('p','Chưa có nhật ký thay đổi gói.'));}catch{audit.replaceChildren(el('p','Không tải được nhật ký.'));}}
 reload.addEventListener('click',()=>void loadAudit());
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const payload={action:select.value};for(const [key,i] of Object.entries(inputs))payload[key]=i.type==='number'?Number(i.value):i.value.trim();if(payload.action==='plan_retire'&&!doc.defaultView?.confirm?.('Xác nhận ngừng gói này?'))return;
 busy=true;submit.disabled=true;select.disabled=true;status.textContent='Đang lưu…';try{const r=await fetch('/api/platform/catalog',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)});if(r.status!==201){status.textContent=r.status===409?'Không thể thay đổi: dữ liệu trùng, không đổi hoặc gói đang sử dụng.':'Không xác nhận được thay đổi.';return;}const b=await r.json();if(b.ok!==true)throw Error();status.textContent='Đã lưu.';await Promise.all([loadAudit(),refresh?.()]);}catch{status.textContent='Chưa xác nhận được kết quả. Tải lại dữ liệu trước khi thử lại.';}finally{busy=false;submit.disabled=false;select.disabled=false;}});
 void loadAudit();
}

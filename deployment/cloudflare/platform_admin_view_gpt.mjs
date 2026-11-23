// R279: opt-in System Admin metadata panel. Mount ONLY behind verified Worker session.
// This is a DOM component, not an authentication or authorization boundary.
import {createPlatformAdminClient} from './platform_admin_client_gpt.mjs';
const STYLES=`
.mihy-platform{font:inherit;color:inherit;max-width:1100px;margin:auto;padding:1rem}
.mihy-platform *{box-sizing:border-box}
.mihy-platform .toolbar{display:flex;gap:.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap}
.mihy-platform .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:.75rem;margin:1rem 0}
.mihy-platform .card{border:1px solid #a1a1aa;border-radius:12px;padding:1rem;min-width:0;overflow-wrap:anywhere}
.mihy-platform label{display:block;margin:.65rem 0 .25rem}
.mihy-platform input,.mihy-platform select,.mihy-platform button{font:inherit;min-height:42px;border-radius:8px;padding:.5rem;max-width:100%}
.mihy-platform input,.mihy-platform select{width:100%;border:1px solid #71717a;background:transparent;color:inherit}
.mihy-platform button{border:1px solid #71717a;background:transparent;color:inherit;cursor:pointer}
.mihy-platform button:disabled{opacity:.55;cursor:wait}
.mihy-platform .notice{margin:.75rem 0;min-height:1.5rem}
.mihy-platform .actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}
@media(max-width:480px){.mihy-platform{padding:.5rem}.mihy-platform .cards{grid-template-columns:minmax(0,1fr)}}
`;
export function mountPlatformAdmin(root,{fetchImpl,csrfToken,documentImpl}={}) {
  if (!root || typeof root.replaceChildren!=='function') throw new TypeError('root required');
  const doc=documentImpl || root.ownerDocument;
  if (!doc || typeof doc.createElement!=='function') throw new TypeError('document required');
  const client=createPlatformAdminClient({fetchImpl,csrfToken});
  let disposed=false, generation=0, busy=false;
  const node=(tag,text='',cls='')=>{
    const el=doc.createElement(tag);
    if (text!==undefined) el.textContent=String(text);
    if (cls) el.className=cls;
    return el;
  };
  const shell=node('section',undefined,'mihy-platform');
  shell.setAttribute('aria-label','Quản trị nền tảng');
  const style=node('style',STYLES);
  const heading=node('h2','Quản trị nền tảng');
  const toolbar=node('div',undefined,'toolbar');
  const reload=node('button','Làm mới');
  reload.type='button';
  const status=node('p','Chưa tải dữ liệu','notice');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const plansTitle=node('h3','Gói dịch vụ');
  const plans=node('div',undefined,'cards');
  const servicesTitle=node('h3','Dịch vụ tenant (chỉ metadata)');
  const services=node('div',undefined,'cards');
  toolbar.append(reload);
  shell.append(style,heading,toolbar,status,plansTitle,plans,servicesTitle,services);
  root.replaceChildren(shell);
  const setBusy=value=>{busy=value;reload.disabled=value;};
  const showError=()=>{status.textContent='Không tải được metadata. Kiểm tra phiên quản trị hoặc thử lại.';};
  const showPlan=plan=>{
    const card=node('article',undefined,'card');
    card.append(node('strong',plan.plan_name),node('p','Mã gói: '+plan.plan_id),
      node('p','Trạng thái: '+plan.status),
      node('p','Số người dùng tối đa: '+plan.max_users),
      node('p','Giới hạn lưu trữ (byte): '+plan.max_storage_bytes));
    plans.append(card);
  };
  const showService=service=>{
    const card=node('article',undefined,'card');
    card.append(node('strong','Tenant: '+service.tenant_id),
      node('p','Gói: '+service.plan_id),
      node('p','Trạng thái: '+service.service_status),
      node('p','Hạn giấy phép: '+(service.license_expires_at || 'Chưa đặt')));
    const label=node('label','Trạng thái mới');
    const select=node('select');
    select.setAttribute('aria-label','Trạng thái mới cho '+service.tenant_id);
    for (const value of ['active','suspended','revoked']) {
      const option=node('option',value);option.value=value;select.append(option);
    }
    select.value=service.service_status==='pending'?'active':service.service_status;
    label.append(select); // Native label association supports touch and assistive technology.
    const reasonLabel=node('label','Mã lý do (chữ hoa, dấu gạch dưới)');
    const reason=node('input');reason.type='text';reason.maxLength=80;
    reason.placeholder='ADMIN_REQUEST';reason.autocomplete='off';
    reasonLabel.append(reason);
    const save=node('button','Cập nhật trạng thái');save.type='button';
    const localStatus=node('p','', 'notice');localStatus.setAttribute('role','status');
    save.addEventListener('click',async()=>{
      if (disposed || busy) return;
      const wanted=select.value,reasonCode=reason.value.trim();
      if (wanted===service.service_status) {
        localStatus.textContent='Trạng thái không thay đổi.';return;
      }
      if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(reasonCode)) {
        localStatus.textContent='Mã lý do không hợp lệ.';return;
      }
      if (wanted==='revoked' && !doc.defaultView?.confirm?.('Xác nhận thu hồi dịch vụ tenant này?')) return;
      setBusy(true);save.disabled=true;localStatus.textContent='Đang lưu…';
      try {
        await client.changeService({tenantId:service.tenant_id,status:wanted,reasonCode});
        if (!disposed) {localStatus.textContent='Đã gửi thay đổi. Đang tải lại…';await refresh(true);}
      } catch {
        if (!disposed) localStatus.textContent='Không cập nhật được. Không có xác nhận thay đổi.';
      } finally {if (!disposed){setBusy(false);save.disabled=false;}}
    });
    card.append(label,reasonLabel,save,localStatus);
    services.append(card);
  };
  async function refresh(force=false) {
    if (disposed || (busy && !force)) return;
    const id=++generation;
    setBusy(true);status.textContent='Đang tải…';
    try {
      const [p,s]=await Promise.all([client.listPlans(),client.listServices()]);
      if (disposed || id!==generation) return;
      plans.replaceChildren();services.replaceChildren();
      if (!p.length) plans.append(node('p','Chưa có gói dịch vụ.'));
      else p.forEach(showPlan);
      if (!s.length) services.append(node('p','Chưa có tenant.'));
      else s.forEach(showService);
      status.textContent='Đã tải metadata nền tảng.';
    } catch {
      if (!disposed && id===generation) {
        plans.replaceChildren();services.replaceChildren();showError();
      }
    } finally {if (!disposed && id===generation) setBusy(false);}
  }
  reload.addEventListener('click',()=>{void refresh();});
  void refresh();
  return Object.freeze({refresh,dispose(){disposed=true;generation++;root.replaceChildren();}});
}

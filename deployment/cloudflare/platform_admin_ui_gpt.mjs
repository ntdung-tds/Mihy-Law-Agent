// R218: isolated, dependency-injected platform control-plane UI.
// Not mounted until Worker exposes a verified System Admin session and API.
// API contract: listPlans(), listTenantServices(), changeService({tenantId,status,reasonCode}).
// Never render customer matters, documents, clients, file contents or impersonation.
const STATES = new Set(['active', 'suspended', 'revoked']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const REASON = /^[A-Z][A-Z0-9_]{1,79}$/;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (cls) node.className = cls;
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function safeString(value) { return typeof value === 'string' ? value : ''; }
function serviceView(value) {
  if (!value || typeof value !== 'object') return null;
  const tenantId = safeString(value.tenant_id);
  const status = safeString(value.service_status);
  if (!ID.test(tenantId) || !['pending','active','suspended','revoked'].includes(status)) return null;
  return {tenantId, status};
}
export function mountPlatformAdmin(root, api) {
  if (!root || typeof root.appendChild !== 'function' ||
      !api || typeof api.listPlans !== 'function' ||
      typeof api.listTenantServices !== 'function' ||
      typeof api.changeService !== 'function') throw new Error('PLATFORM_UI_UNAVAILABLE');
  const host = el('section', undefined, 'platform-admin');
  host.setAttribute('aria-label', 'Quản trị nền tảng');
  const heading = el('h2', 'Quản trị nền tảng');
  const notice = el('p', '', 'platform-admin-status');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const plans = el('div', undefined, 'platform-admin-plans');
  const services = el('div', undefined, 'platform-admin-services');
  host.append(heading, notice, el('h3', 'Gói dịch vụ'), plans, el('h3', 'Dịch vụ Tenant'), services);
  root.appendChild(host);
  let disposed = false;
  let generation = 0;
  let busy = false;
  function status(message) { if (!disposed) notice.textContent = message; }
  async function refresh() {
    const token = ++generation;
    status('Đang tải dữ liệu quản trị…');
    try {
      const [p, s] = await Promise.all([api.listPlans(), api.listTenantServices()]);
      if (disposed || token !== generation) return;
      if (!Array.isArray(p) || !Array.isArray(s)) throw new Error('INVALID_RESPONSE');
      clear(plans); clear(services);
      for (const plan of p.slice(0, 100)) {
        const id = safeString(plan?.plan_id);
        const name = safeString(plan?.plan_name);
        if (!ID.test(id)) continue;
        const card = el('article', undefined, 'platform-admin-card');
        card.append(el('strong', name || id), el('p', 'Mã gói: ' + id));
        plans.appendChild(card);
      }
      if (!plans.childNodes.length) plans.appendChild(el('p', 'Chưa có gói dịch vụ.'));
      for (const raw of s.slice(0, 100)) {
        const item = serviceView(raw);
        if (!item) continue;
        const card = el('article', undefined, 'platform-admin-card');
        const label = el('strong', 'Tenant: ' + item.tenantId);
        const state = el('p', 'Trạng thái: ' + item.status);
        card.append(label, state);
        if (item.status !== 'revoked') {
          const form = el('form');
          const select = el('select');
          select.setAttribute('aria-label', 'Trạng thái mới của ' + item.tenantId);
          for (const target of ['active','suspended','revoked']) {
            if (target === item.status) continue;
            const opt = el('option', target);
            opt.value = target;
            select.appendChild(opt);
          }
          const reason = el('input');
          reason.placeholder = 'Mã lý do (VD: POLICY_REVIEW)';
          reason.setAttribute('aria-label', 'Mã lý do cho ' + item.tenantId);
          reason.maxLength = 80;
          reason.required = true;
          const submit = el('button', 'Cập nhật trạng thái');
          submit.type = 'submit';
          form.append(select, reason, submit);
          form.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy || disposed) return;
            const next = select.value;
            const code = reason.value.trim();
            if (!STATES.has(next) || !REASON.test(code)) {
              status('Mã lý do phải viết hoa, 2–80 ký tự A–Z, 0–9 hoặc _.');
              return;
            }
            if (next === 'revoked' && !globalThis.confirm('Thu hồi dịch vụ Tenant này?')) return;
            busy = true; submit.disabled = true;
            status('Đang cập nhật…');
            try {
              await api.changeService({tenantId:item.tenantId,status:next,reasonCode:code});
              if (!disposed) await refresh();
            } catch {
              status('Không thể cập nhật. Dữ liệu chưa được xác nhận thay đổi.');
            } finally { busy = false; submit.disabled = false; }
          });
          card.appendChild(form);
        }
        services.appendChild(card);
      }
      if (!services.childNodes.length) services.appendChild(el('p', 'Chưa có dịch vụ Tenant.'));
      status('Đã tải thông tin quản trị.');
    } catch {
      if (!disposed && token === generation) status('Không tải được dữ liệu. Kiểm tra quyền System Admin hoặc kết nối.');
    }
  }
  const style = el('style');
  style.textContent = `.platform-admin{font:inherit;max-width:100%;padding:1rem;overflow-wrap:anywhere}.platform-admin-card{border:1px solid #a3a3a3;border-radius:12px;padding:1rem;margin:.75rem 0}.platform-admin form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto;gap:.5rem;margin-top:.75rem}.platform-admin input,.platform-admin select,.platform-admin button{font:inherit;min-height:44px;min-width:0;padding:.5rem;border-radius:8px}.platform-admin button{cursor:pointer}@media(max-width:640px){.platform-admin{padding:.75rem}.platform-admin form{grid-template-columns:minmax(0,1fr)}.platform-admin button{width:100%}}`;
  host.prepend(style);
  void refresh();
  return {refresh, dispose(){disposed=true;generation++;host.remove();}};
}

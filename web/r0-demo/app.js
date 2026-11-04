/* AI Law R31: isolated SYNTHETIC browser showcase, NOT an auth/API/AI product. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const state = { data: null, scenario: null, revoked: false, search: '' };
  const roleLabels = {
    lawyer: 'Luật sư (mô phỏng)',
    tenant_admin: 'Quản trị tenant (mô phỏng)',
    none: 'Không có membership'
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function membership(userId, tenantId) {
    return state.data.memberships.find(m => m.user_id === userId &&
      m.tenant_id === tenantId && m.status === 'active');
  }

  function permittedDocs(scenario) {
    if (!scenario || state.revoked) return [];
    if (!membership(scenario.user_id, scenario.tenant_id)) return [];
    const allowed = new Set(state.data.matters
      .filter(m => m.tenant_id === scenario.tenant_id &&
        m.read_user_ids.includes(scenario.user_id)).map(m => m.id));
    // UI-only illustration: every document label is public synthetic JSON.
    // Security must be enforced separately by database RLS and backend.
    return state.data.documents.filter(doc =>
      doc.tenant_id === scenario.tenant_id && allowed.has(doc.matter_id));
  }

  function renderScenarios() {
    const list = $('#scenario-list');
    list.replaceChildren();
    const tones = ['blue', 'green', 'amber', 'green', 'red'];
    state.data.scenarios.forEach((scenario, index) => {
      const button = make('button', 'scenario-btn');
      button.type = 'button';
      button.dataset.tone = tones[index];
      button.dataset.scenarioKey = scenario.key;
      button.setAttribute('aria-pressed', scenario.key === state.scenario?.key ? 'true' : 'false');
      const avatar = make('span', 'scenario-avatar', String(index + 1).padStart(2, '0'));
      avatar.setAttribute('aria-hidden', 'true');
      const copy = make('span', 'scenario-copy');
      copy.append(make('strong', '', scenario.label), make('small', '', scenario.intent));
      button.append(avatar, copy);
      button.addEventListener('click', () => chooseScenario(scenario.key));
      list.append(button);
    });
  }

  function updateAccessStatus(scenario, docs) {
    const result = $('#permission-result');
    const member = membership(scenario.user_id, scenario.tenant_id);
    result.classList.toggle('denied', !member || state.revoked || docs.length === 0);
    if (state.revoked) {
      result.textContent = 'TỪ CHỐI (mô phỏng) · Membership đã bị thu hồi trong phiên demo này.';
    } else if (!member) {
      result.textContent = 'TỪ CHỐI (mô phỏng) · Người dùng không thuộc tenant đang xem.';
    } else if (docs.length === 0) {
      result.textContent = 'TỪ CHỐI (mô phỏng) · Có membership nhưng chưa được cấp MatterACL đọc hồ sơ.';
    } else {
      result.textContent = 'ĐƯỢC PHÉP (mô phỏng) · Có membership và MatterACL đọc vụ việc mẫu.';
    }
  }

  function openDocument(doc) {
    $('#dialog-title').textContent = doc.name;
    $('#dialog-description').textContent =
      'Đây chỉ là tên tài liệu tổng hợp. Nội dung thật không tồn tại trong bản demo và không có chức năng mở, tải hoặc xử lý bằng AI. Mã minh họa: ' + doc.id;
    $('#doc-dialog').showModal();
    $('#dialog-close').focus();
  }

  function renderDocuments() {
    const list = $('#doc-list');
    list.replaceChildren();
    const docs = permittedDocs(state.scenario);
    const query = state.search.trim().toLocaleLowerCase('vi-VN');
    const visible = docs.filter(doc => (doc.name + ' ' + doc.kind).toLocaleLowerCase('vi-VN').includes(query));
    $('#doc-count').textContent = docs.length + ' hồ sơ';
    $('#doc-empty').hidden = visible.length !== 0;
    $('#empty-reason').textContent = state.revoked
      ? 'Quyền đã được thu hồi trong mô phỏng; chuyển kịch bản hoặc bấm Khôi phục demo.'
      : docs.length === 0
        ? 'Vai trò này không có quyền đọc hồ sơ trong ngữ cảnh mô phỏng.'
        : 'Không có tài liệu mẫu khớp từ khóa lọc.';
    for (const doc of visible) {
      const button = make('button', 'doc-card');
      button.type = 'button';
      button.dataset.format = doc.name.endsWith('.pdf') ? 'pdf' : 'docx';
      const fileIcon = make('span', 'doc-icon', button.dataset.format.toUpperCase());
      fileIcon.setAttribute('aria-hidden', 'true');
      const details = make('span', 'doc-copy');
      details.append(make('strong', '', doc.name),
        make('small', '', doc.kind + ' · ' + doc.updated + ' · Chỉ tên tệp mẫu'));
      const arrow = make('span', 'doc-arrow', '›');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(fileIcon, details, arrow);
      button.addEventListener('click', () => openDocument(doc));
      list.append(button);
    }
    updateAccessStatus(state.scenario, docs);
  }

  function chooseScenario(key) {
    const scenario = state.data.scenarios.find(s => s.key === key);
    if (!scenario) return;
    // Explicitly reset context-scoped UI state on every switch.
    state.scenario = scenario;
    state.revoked = false;
    state.search = '';
    $('#doc-search').value = '';
    const user = state.data.users.find(u => u.id === scenario.user_id);
    const tenant = state.data.tenants.find(t => t.id === scenario.tenant_id);
    $('#current-user').textContent = user?.name || 'Không xác định';
    $('#current-tenant').textContent = tenant?.name || 'Không xác định';
    $('#current-role').textContent = roleLabels[scenario.role] || 'Không xác định';
    $('#workspace-title').textContent = scenario.label;
    $('#persona-description').textContent = scenario.intent;
    $('#test-result').classList.remove('denied');
    $('#test-result').textContent = 'Đã đổi kịch bản và xóa lựa chọn/từ khóa cũ (mô phỏng).';
    document.querySelectorAll('[data-scenario-key]').forEach(button => {
      button.setAttribute('aria-pressed',
        button.dataset.scenarioKey === scenario.key ? 'true' : 'false');
    });
    renderDocuments();
  }

  function simulateCrossTenant() {
    const foreign = state.data.documents.find(d => d.tenant_id !== state.scenario.tenant_id);
    const result = $('#test-result');
    result.classList.add('denied');
    result.textContent = foreign
      ? 'TỪ CHỐI (mô phỏng) · Hồ sơ của tenant khác không được đưa vào danh sách. Chỉ kiểm thử PostgreSQL/RLS ở backend mới chứng minh cách ly thực.'
      : 'Không tìm thấy hồ sơ tenant khác trong bộ dữ liệu giả.';
  }

  function simulateRevoke() {
    state.revoked = true;
    renderDocuments();
    const result = $('#test-result');
    result.classList.add('denied');
    result.textContent = 'TỪ CHỐI (mô phỏng) · Đã ẩn hồ sơ trong giao diện sau khi thu hồi quyền. Không có tài khoản hay phiên máy chủ bị thay đổi.';
  }

  function init(data) {
    if (!data || data.synthetic_only !== true || data.schema_version !== 1) {
      throw new Error('Unsupported or unsafe fixture');
    }
    state.data = data;
    renderScenarios();
    chooseScenario('personal');
    $('#doc-search').addEventListener('input', event => {
      state.search = event.target.value;
      renderDocuments();
    });
    $('#try-cross-tenant').addEventListener('click', simulateCrossTenant);
    $('#revoke-demo').addEventListener('click', simulateRevoke);
    $('#reset-demo').addEventListener('click', () => chooseScenario(state.scenario.key));
    $('#dialog-close').addEventListener('click', () => $('#doc-dialog').close());
  }

  fetch('./customers.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Demo metadata unavailable');
      return response.json();
    })
    .then(init)
    .catch(() => {
      $('#permission-result').classList.add('denied');
      $('#permission-result').textContent =
        'Không thể tải dữ liệu demo tổng hợp. Không có thông tin khách hàng thật được xử lý.';
      $('#test-result').textContent = 'Dữ liệu mẫu chưa khả dụng.';
    });
})();

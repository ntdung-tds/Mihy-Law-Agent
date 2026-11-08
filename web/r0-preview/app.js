/* AI Law R0 UI preview: synthetic metadata only. No document upload, AI calls, auth or network APIs. */
(() => {
  'use strict';
  const documents = Object.freeze([]); // No fabricated file records in the live QA workspace.
  const viewLabels = { overview: 'Tổng quan', documents: 'Tài liệu', assistant: 'Trợ lý AI', research: 'Tra cứu pháp lý' };
  const workflows = Object.freeze({
    UC01: {title: "Soạn hợp đồng / văn bản", stage: "R1 · Bản nháp QA", summary: "Tạo bản nháp từ dữ kiện giả lập; chỗ thiếu căn cứ phải được xác minh."},
    UC02: {title: "Rà soát hợp đồng", stage: "R1 · Bản nháp QA", summary: "Đọc điều khoản mẫu, xác định nội dung cần xem xét; luật sư phải rà soát."},
    UC03: {title: "Dịch tài liệu, hợp đồng", stage: "R0 · Ưu tiên QA", summary: "Dịch văn bản mẫu, kiểm tra thuật ngữ và số liệu; chưa bảo đảm bố cục Word."},
    UC04: {title: "Tóm tắt văn bản", stage: "R0 · Ưu tiên QA", summary: "Tóm tắt các ý chính, nghĩa vụ, mốc thời gian dựa trên nguồn giả lập."},
    UC05: {title: "Phân tích văn bản", stage: "R1 · Bản nháp QA", summary: "Phân tích cấu trúc và rủi ro từ văn bản mẫu, không tự tạo căn cứ luật."},
    UC06: {title: "So sánh hai văn bản QPPL", stage: "R1 · Bản nháp QA", summary: "Đối chiếu hai văn bản mẫu; chưa xác minh hiệu lực pháp luật thực tế."},
    UC07: {title: "Sửa lỗi ngữ pháp", stage: "R0 · Ưu tiên QA", summary: "Gợi ý sửa từ ngữ, giữ nguyên ý nghĩa; chưa tích hợp Word Track Changes."},
    UC08: {title: "Đọc và phân tích nhiều hồ sơ", stage: "R1 · Bản nháp QA", summary: "Đối chiếu hai nguồn giả lập, nêu điểm thống nhất và mâu thuẫn."},
    UC09: {title: "Trả lời câu hỏi pháp lý", stage: "R1 · Bản nháp QA", summary: "Trả lời trong phạm vi nguồn mẫu, không tra cứu cơ sở pháp luật chính thức."},
    UC10: {title: "Tìm bản án theo chủ đề", stage: "R1 · Tìm trong nguồn mẫu", summary: "Chỉ tìm trong văn bản mẫu đã dán, chưa có kho bản án chính thức."},
    UC11: {title: "Tìm quy định theo chủ đề", stage: "R1 · Tìm trong nguồn mẫu", summary: "Chỉ tìm trong văn bản mẫu đã dán, chưa có cơ sở dữ liệu luật chính thức."}
  });
  let filter = 'all';
  let currentView = 'overview';
  let resumeUc = null; // Page-local route only; never persist legal text or Matter metadata.
  let lastFocus = null;
  let toastTimeout = null;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.classList.add('icon');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', `#i-${name}`);
    s.append(u);
    return s;
  };
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function statusTag(doc) { return el('span', `status-tag status-${doc.status}`, doc.label); }
  function docIcon(doc) { const n = el('span', `doc-file-icon ${doc.type === 'pdf' ? 'pdf' : ''}`); n.append(icon('file')); return n; }
  function openModal(title, description, meta = '') {
    lastFocus = document.activeElement;
    $('#modal-title').textContent = title;
    $('#modal-description').textContent = description;
    $('#modal-meta').textContent = meta;
    $('#modal-meta').hidden = !meta;
    $('#modal-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#modal-close').focus();
  }
  function closeModal() {
    $('#modal-backdrop').hidden = true;
    document.body.style.overflow = '';
    if (lastFocus?.focus) lastFocus.focus();
  }
  function toast(message) {
    if (toastTimeout) clearTimeout(toastTimeout);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 3800);
  }
  function renderRecent() {
    const root = $('#recent-documents');
    root.replaceChildren();
    documents.slice(0, 3).forEach((doc) => {
      const row = el('div', 'recent-row');
      row.setAttribute('role', 'button'); row.tabIndex = 0;
      row.setAttribute('aria-label', `Xem tài liệu minh họa ${doc.name}`);
      const info = el('div', 'recent-info');
      info.append(el('div', 'recent-name', doc.name), el('div', 'recent-meta', `${doc.category} · ${doc.date}`));
      row.append(docIcon(doc), info, statusTag(doc));
      row.addEventListener('click', () => showDoc(doc));
      row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showDoc(doc); } });
      root.append(row);
    });
  }
  function showDoc(doc) {
    openModal(doc.name, 'Đây là một tài liệu mẫu dành riêng cho việc xem trước giao diện. Nội dung tài liệu không tồn tại trên máy chủ và chưa có chức năng mở hoặc xử lý tài liệu thật.', `Mã demo: ${doc.id} · ${doc.category} · ${doc.label}`);
  }
  function renderDocuments() {
    const root = $('#document-list');
    const query = $('#document-search').value.trim().toLocaleLowerCase('vi-VN');
    root.replaceChildren();
    const items = documents.filter(d => (filter === 'all' || d.status === filter) && (`${d.name} ${d.category}`).toLocaleLowerCase('vi-VN').includes(query));
    items.forEach(doc => {
      const row = el('button', 'document-row'); row.type = 'button';
      const info = el('span', 'document-detail');
      info.append(el('strong', '', doc.name), el('small', '', `${doc.category} · ${doc.date} · Dữ liệu minh họa`));
      row.append(docIcon(doc), info, statusTag(doc), icon('chevron'));
      row.addEventListener('click', () => showDoc(doc));
      root.append(row);
    });
    $('#empty-docs').hidden = items.length !== 0;
  }
  function goto(route, { updateHash = true } = {}) {
    const task = /^uc-(UC(?:0[1-9]|1[01]))$/.exec(route || '');
    const uc = task && Object.hasOwn(workflows, task[1]) ? task[1] : null;
    const view = uc ? 'workflow' : Object.hasOwn(viewLabels, route) ? route : 'overview';
    const nextHash = uc ? 'uc-' + uc : view;
    // Native hash navigation permits deep links and Back/Forward on mobile.
    if (updateHash && window.location.hash !== '#' + nextHash) {
      window.location.hash = '#' + nextHash;
      return;
    }
    if (currentView === 'workflow' && !uc)
      window.dispatchEvent(new Event('ai-law:workflow-close'));
    if (view !== 'documents') resumeUc = null;
    currentView = view;
    $('#workflow-resume-panel').hidden = view !== 'documents' || !resumeUc;
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    $$('[data-view]').forEach(btn => {
      const selected = btn.dataset.view === view || (uc && btn.dataset.view === 'assistant');
      btn.classList.toggle('active', !!selected);
      if (selected) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    $('#breadcrumb-current').textContent = uc ? workflows[uc].title : viewLabels[view];
    if (view === 'documents') { renderDocuments(); window.dispatchEvent(new Event('ai-law:documents-open')); }
    if (uc) {
      $('#workflow-code').textContent = uc;
      $('#workflow-title').textContent = workflows[uc].title;
      $('#workflow-stage').textContent = workflows[uc].stage;
      $('#workflow-summary').textContent = workflows[uc].summary;
      window.dispatchEvent(new CustomEvent('ai-law:workflow-open', { detail: { uc } }));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  $('#workflow-create-matter').addEventListener('click', () => {
    resumeUc = $('#workflow-code').textContent;
    if (!/^UC(?:0[1-9]|1[01])$/.test(resumeUc)) { resumeUc = null; return; }
    goto('documents');
    $('#matter-title').focus();
  });
  $('#workflow-resume').addEventListener('click', () => {
    const previous = resumeUc;
    resumeUc = null;
    if (previous) goto('uc-' + previous);
  });
  window.addEventListener('ai-law:workspace-switch', () => {
    resumeUc = null;
    $('#workflow-resume-panel').hidden = true;
  });
  $('[data-view]').forEach(n => n.addEventListener('click', () => goto(n.dataset.view)));
  $$('[data-go]').forEach(n => n.addEventListener('click', () => goto(n.dataset.go)));

  const drawer = $('#function-drawer'), backdrop = $('#drawer-backdrop'), trigger = $('#rail-features');
  const desktopTrigger=$('#desktop-features');
  let lastDrawerTrigger=trigger;
  function closeFunctionDrawer(restoreFocus = true) {
    drawer.hidden = true; backdrop.hidden = true; drawer.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    desktopTrigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
    if (restoreFocus) lastDrawerTrigger.focus();
  }
  function openFunctionDrawer(event) {
    lastDrawerTrigger=event?.currentTarget||trigger;
    drawer.hidden = false; backdrop.hidden = false; drawer.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    desktopTrigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
    $('#drawer-close').focus();
  }
  trigger.addEventListener('click', openFunctionDrawer);
  desktopTrigger.addEventListener('click', openFunctionDrawer);
  $('#drawer-close').addEventListener('click', () => closeFunctionDrawer());
  backdrop.addEventListener('click', () => closeFunctionDrawer());
  $$('[data-drawer-view]').forEach(n => n.addEventListener('click', () => {
    goto(n.dataset.drawerView); closeFunctionDrawer(false);
  }));
  $$('[data-feature-jump]').forEach(n => n.addEventListener('click', () => {
    closeFunctionDrawer(false);
    goto('uc-' + n.dataset.featureJump);
  }));
  drawer.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...drawer.querySelectorAll('button:not([disabled])')];
    if (!focusables.length) return;
    if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables[focusables.length-1].focus(); }
    if (!event.shiftKey && document.activeElement === focusables[focusables.length-1]) { event.preventDefault(); focusables[0].focus(); }
  });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawer.hidden) closeFunctionDrawer(); });

  $$('[data-demo-action]').forEach(n => n.addEventListener('click', () => {
    const isR0 = n.dataset.stage === 'r0';
    const description = isR0
      ? 'Tác vụ này đang được ưu tiên phát triển trong R0 theo SRS. Chưa thể thực hiện tác vụ, tải hồ sơ hay nhận kết quả từ AI trên bản xem trước.'
      : 'Tác vụ này được dự kiến cho giai đoạn R1 theo SRS. Chưa thể thực hiện tác vụ hoặc xử lý tài liệu trên bản xem trước.';
    const phase = isR0 ? 'R0 · Đang triển khai' : 'R1 · Sắp triển khai';
    openModal(n.dataset.demoAction, description, `${n.dataset.feature} · ${phase} · Chưa khả dụng`);
  }));
  $$('.filter-tab').forEach(n => n.addEventListener('click', () => {
    filter = n.dataset.filter;
    $$('.filter-tab').forEach(b => b.classList.toggle('selected', b === n));
    renderDocuments();
  }));
  $('#document-search').addEventListener('input', renderDocuments);
  $('#search-shortcut').addEventListener('click', () => { goto('documents'); ($('#matter-search') || $('#document-search')).focus(); });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); goto('documents'); $('#document-search').focus(); }
    if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal();
    if (event.key === 'Tab' && !$('#modal-backdrop').hidden) {
      const focusables = $$('#modal-backdrop button');
      if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables[focusables.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) { event.preventDefault(); focusables[0].focus(); }
    }
  });
  $('#notifications').addEventListener('click', () => toast('Chưa có hệ thống thông báo — chức năng đang triển khai.'));
  $('#side-guide').addEventListener('click', () => openModal('R0 · Bản xem trước', 'Ứng dụng QA hiện đã kết nối đăng nhập, danh mục hồ sơ và MatterACL trên D1. Không sử dụng hồ sơ thật. Tệp Google Drive, các tác vụ AI và nghiệm thu production chưa hoàn thành.'));
  $('#sidebar-explore').addEventListener('click', () => goto('assistant'));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-ack').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
  $('#upload-btn').addEventListener('click', () => { goto('documents'); $('#matter-title').focus(); });
  $('#local-file').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) openModal('Đã chọn tệp trên thiết bị', 'Ứng dụng chỉ đọc tên tệp để minh họa thao tác chọn tài liệu. Tệp không được tải lên, đọc nội dung hay lưu trữ trên máy chủ.', `Tên tệp: ${file.name} · ${Math.round(file.size / 1024)} KB`);
    event.target.value = '';
  });
  $$('[data-prompt]').forEach(n => n.addEventListener('click', () => { $('#chat-input').value = n.dataset.prompt; $('#chat-input').focus(); }));
  $('#chat-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('#chat-input').value.trim()) { toast('Hãy nhập một câu hỏi mẫu.'); return; }
    $('#chat-preview-reply').hidden = false;
    $('#chat-preview-reply').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#research-form').addEventListener('submit', event => { event.preventDefault(); toast('Tra cứu là giao diện minh họa — chưa kết nối nguồn dữ liệu pháp luật.'); });
  window.addEventListener('hashchange', () => goto(location.hash.slice(1), { updateHash: false }));
  const now = new Date();
  $('#today-date').textContent = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  $('#year').textContent = String(now.getFullYear());
  renderRecent();
  goto(location.hash.slice(1), { updateHash: false });
})();
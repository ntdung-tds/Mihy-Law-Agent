/* AI Law R0 UI preview: synthetic metadata only. No document upload, AI calls, auth or network APIs. */
(() => {
  'use strict';
  const documents = Object.freeze([
    { id: 'AL-DEMO-01', name: 'Hợp đồng cung cấp dịch vụ.docx', category: 'Hợp đồng', type: 'docx', status: 'review', label: 'Đang rà soát', date: '02/11/2026' },
    { id: 'AL-DEMO-02', name: 'Phụ lục điều khoản bảo mật.pdf', category: 'Phụ lục', type: 'pdf', status: 'draft', label: 'Bản nháp', date: '01/11/2026' },
    { id: 'AL-DEMO-03', name: 'Thỏa thuận hợp tác kinh doanh.docx', category: 'Thỏa thuận', type: 'docx', status: 'review', label: 'Đang rà soát', date: '31/10/2026' },
    { id: 'AL-DEMO-04', name: 'Bản ghi nhớ pháp lý.pdf', category: 'Ghi nhớ', type: 'pdf', status: 'done', label: 'Hoàn tất', date: '28/10/2026' }
  ]);
  const viewLabels = { overview: 'Tổng quan', documents: 'Tài liệu', assistant: 'Trợ lý AI', research: 'Tra cứu pháp lý' };
  let filter = 'all';
  let currentView = 'overview';
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
  function goto(view, { updateHash = true } = {}) {
    if (!(view in viewLabels)) view = 'overview';
    currentView = view;
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    $$('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
      if (btn.dataset.view === view) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    $('#breadcrumb-current').textContent = viewLabels[view];
    if (view === 'documents') renderDocuments();
    if (updateHash && window.location.hash !== `#${view}`) window.history.replaceState(null, '', `#${view}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  $$('[data-view]').forEach(n => n.addEventListener('click', () => goto(n.dataset.view)));
  $$('[data-go]').forEach(n => n.addEventListener('click', () => goto(n.dataset.go)));
  $$('[data-demo-action]').forEach(n => n.addEventListener('click', () => openModal(n.dataset.demoAction, 'Màn hình tác vụ sẽ được triển khai theo SRS trong các bước R0 tiếp theo. Đây là bản xem trước UI, chưa xử lý nghiệp vụ hoặc gọi API.')));
  $$('.filter-tab').forEach(n => n.addEventListener('click', () => {
    filter = n.dataset.filter;
    $$('.filter-tab').forEach(b => b.classList.toggle('selected', b === n));
    renderDocuments();
  }));
  $('#document-search').addEventListener('input', renderDocuments);
  $('#search-shortcut').addEventListener('click', () => { goto('documents'); $('#document-search').focus(); });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); goto('documents'); $('#document-search').focus(); }
    if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal();
    if (event.key === 'Tab' && !$('#modal-backdrop').hidden) {
      const focusables = $$('#modal-backdrop button');
      if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables[focusables.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) { event.preventDefault(); focusables[0].focus(); }
    }
  });
  $('#notifications').addEventListener('click', () => toast('Chưa có hệ thống thông báo — đây là bản xem trước R0.'));
  $('#side-guide').addEventListener('click', () => openModal('R0 · Bản xem trước', 'Giao diện chạy độc lập, responsive mobile-first. Dữ liệu tài liệu là giả lập, không có tài khoản, API, AI, lưu trữ hoặc tải tệp lên máy chủ. POC1 vẫn tạm dừng và chưa nghiệm thu cuối.'));
  $('#sidebar-explore').addEventListener('click', () => goto('assistant'));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-ack').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
  $('#upload-btn').addEventListener('click', () => $('#local-file').click());
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
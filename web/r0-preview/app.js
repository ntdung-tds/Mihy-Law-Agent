/* AI Law R0 UI preview: synthetic metadata only. No document upload, AI calls, auth or network APIs. */
(() => {
  'use strict';
  const documents = Object.freeze([]); // No fabricated file records in the live QA workspace.
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
    if (view === 'documents') { renderDocuments(); window.dispatchEvent(new Event('ai-law:documents-open')); }
    if (updateHash && window.location.hash !== `#${view}`) window.history.replaceState(null, '', `#${view}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  $$('[data-view]').forEach(n => n.addEventListener('click', () => goto(n.dataset.view)));
  $$('[data-go]').forEach(n => n.addEventListener('click', () => goto(n.dataset.go)));

  const drawer = $('#function-drawer'), backdrop = $('#drawer-backdrop'), trigger = $('#rail-features');
  function closeFunctionDrawer(restoreFocus = true) {
    drawer.hidden = true; backdrop.hidden = true; drawer.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('drawer-open');
    if (restoreFocus) trigger.focus();
  }
  function openFunctionDrawer() {
    drawer.hidden = false; backdrop.hidden = false; drawer.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true'); document.body.classList.add('drawer-open');
    $('#drawer-close').focus();
  }
  trigger.addEventListener('click', openFunctionDrawer);
  $('#drawer-close').addEventListener('click', () => closeFunctionDrawer());
  backdrop.addEventListener('click', () => closeFunctionDrawer());
  $$('[data-drawer-view]').forEach(n => n.addEventListener('click', () => {
    goto(n.dataset.drawerView); closeFunctionDrawer(false);
  }));
  $$('[data-feature-jump]').forEach(n => n.addEventListener('click', () => {
    const target = $('[data-feature="' + n.dataset.featureJump + '"]');
    goto('overview'); closeFunctionDrawer(false);
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.focus({ preventScroll: true }); }
  }));
  drawer.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...drawer.querySelectorAll('button:not([disabled])')];
    if (!focusables.length) return;
    if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables[focusables.length-1].focus(); }
    if (!event.shiftKey && document.activeElement === focusables[focusables.length-1]) { event.preventDefault(); focusables[0].focus(); }
  });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawer.hidden) closeFunctionDrawer(); });

  $('[data-demo-action]').forEach(n => n.addEventListener('click', () => {
    if (['UC03','UC04','UC07'].includes(n.dataset.feature)) {
      goto('assistant');
      const operation = $('#legal-text-action');
      operation.value = n.dataset.feature;
      operation.dispatchEvent(new Event('change'));
      $('#legal-text-lab').scrollIntoView({behavior:'smooth',block:'start'});
      $('#legal-text-source').focus({preventScroll:true});
      return;
    }
    const isR0 = n.dataset.stage === 'r0';
    const description = isR0
      ? 'Tác vụ này đang được ưu tiên phát triển trong R0 theo SRS. Chưa thể thực hiện tác vụ, tải hồ sơ hay nhận kết quả từ AI trên bản xem trước.'
      : 'Tác vụ này được dự kiến cho giai đoạn R1 theo SRS. Chưa thể thực hiện tác vụ hoặc xử lý tài liệu trên bản xem trước.';
    const phase = isR0 ? 'R0 · Đang triển khai' : 'R1 · Sắp triển khai';
    openModal(n.dataset.demoAction, description, `${n.dataset.feature} · ${phase} · Chưa khả dụng`);
  }));
  // R109: authenticated QA-only legal text drafts (no Drive integration, no persistence).
  const legalForm=$('#legal-text-form');
  const legalAction=$('#legal-text-action');
  const legalSource=$('#legal-text-source');
  const legalLanguage=$('#legal-text-language-group');
  const legalResults=$('#legal-text-results');
  const legalFeedback=$('#legal-text-feedback');
  const legalButton=$('#legal-text-submit');
  legalAction.addEventListener('change',()=>{legalLanguage.hidden=legalAction.value!=='UC03';});
  legalAction.dispatchEvent(new Event('change'));
  function legalDraftClear(){
    legalSource.value='';
    legalResults.replaceChildren();
    legalResults.hidden=true;
    legalFeedback.textContent='';
  }
  window.addEventListener('ai-law:workspace-switch',legalDraftClear);
  function draftItem(heading,fields){
    const card=el('article','legal-draft-item');
    card.append(el('strong','',heading));
    for(const [label,value] of fields){
      const p=el('p','');
      p.append(el('b','',label+': '),document.createTextNode(String(value)));
      card.append(p);
    }
    return card;
  }
  legalForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const operation=legalAction.value;
    const text=legalSource.value;
    if(text.trim().length<20||text.length>4000){
      legalFeedback.textContent='Chỉ dùng văn bản QA giả lập từ 20 đến 4.000 ký tự.';
      return;
    }
    legalButton.disabled=true;
    legalResults.hidden=true;legalResults.replaceChildren();
    legalFeedback.textContent='Đang xử lý trên Workers AI; không đóng trang trong lúc nhận bản nháp.';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),35000);
    try{
      const payload={action:operation,text};
      if(operation==='UC03')payload.direction=$('#legal-text-direction').value;
      const r=await fetch('/api/qa/legal-text',{method:'POST',
        credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r.status===401){
        legalDraftClear();location.replace('/login');return;
      }
      const result=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(result.error||'AI chưa tạo được bản nháp đáng tin cậy. Không lưu kết quả.');
      if(result.status!=='draft_requires_human_review'||result.action!==operation||
         result.review_required!==true)throw Error('Kết quả chưa đủ điều kiện hiển thị.');
      legalResults.append(el('h3','','Bản nháp cần kiểm tra từng nguồn'));
      legalResults.append(el('p','legal-draft-meta','Nguồn: '+result.source_count+
        ' dòng · Định danh SHA-256: '+result.source_sha256.slice(0,16)+'…'));
      if(operation==='UC03'&&Array.isArray(result.rows)){
        for(const row of result.rows)legalResults.append(
          draftItem(row.id,[['Nguyên văn',row.source],['Bản dịch nháp',row.draft]]));
      }else if(operation==='UC04'&&Array.isArray(result.bullets)){
        for(const row of result.bullets)legalResults.append(
          draftItem(row.id,[['Trích nguyên văn',row.quote],['Tóm lược nháp',row.summary]]));
        legalResults.append(el('p','legal-draft-meta','Số dòng chưa được trích yếu: '+result.omitted_lines));
      }else if(operation==='UC07'&&Array.isArray(result.suggestions)){
        for(const row of result.suggestions)legalResults.append(
          draftItem(row.id,[['Cụm gốc',row.original],['Gợi ý',row.replacement],['Lý do',row.reason]]));
        if(result.suggestions.length===0)legalResults.append(
          el('p','legal-draft-meta','AI không đề xuất sửa đổi đủ căn cứ; hãy tự rà soát bản gốc.'));
      }else throw Error('Kết quả không đúng định dạng.');
      legalResults.hidden=false;
      legalFeedback.textContent='Đã tạo bản nháp · Chưa phê duyệt và chưa lưu vào hồ sơ.';
    }catch(error){
      legalResults.replaceChildren();legalResults.hidden=true;
      legalFeedback.textContent=error.name==='AbortError'
       ?'Dịch vụ AI phản hồi quá lâu; chưa có bản nháp. Vui lòng thử lại sau.'
       :(error.message||'Dịch vụ AI chưa sẵn sàng.');
    }finally{
      clearTimeout(timeout);legalButton.disabled=false;
    }
  });
  $('.filter-tab').forEach(n => n.addEventListener('click', () => {
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
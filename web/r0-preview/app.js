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
    // QA preview of source-only textual tasks: do not imply R1 releases or
    // authoritative legal research and DOCX editing have been accepted.
    goto('assistant');
    const uc=$('#legal-qa-uc');
    if(uc) {
      uc.value=n.dataset.feature;
      uc.dispatchEvent(new Event('change'));
      uc.focus({preventScroll:true});
      $('#legal-qa-heading')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
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

  // R109: independent text-only QA workflows. No Drive/file access and no
  // local persistence of customer text or model output.
  const legalForm=$('#legal-qa-form');
  if(legalForm) {
    const byId=id=>$('#'+id);
    const uc=byId('legal-qa-uc'),matter=byId('legal-qa-matter');
    const question=byId('legal-qa-question'),secondary=byId('legal-qa-source-b');
    const status=byId('legal-qa-feedback'),result=byId('legal-qa-result');
    const output=byId('legal-qa-output'),copy=byId('legal-qa-copy');
    const setStatus=(msg,bad=false)=>{status.textContent=msg;status.dataset.state=bad?'error':'info';};
    let isSubmitting=false;
    function clearResult(){
      result.hidden=true;output.textContent='';
      byId('legal-qa-sources').replaceChildren();
    }
    function updateTaskFields(){
      const dual=['UC06','UC08'].includes(uc.value);
      byId('legal-qa-source-b-label').hidden=!dual;
      secondary.required=dual;
      const needingQuestion=['UC09','UC10','UC11'].includes(uc.value);
      question.required=needingQuestion;
      byId('legal-qa-language').disabled=uc.value!=='UC03';
      byId('legal-qa-run').textContent=['UC10','UC11'].includes(uc.value)
        ?'Tìm trong nguồn mẫu':'Tạo bản nháp QA';
      clearResult();
    }
    uc.addEventListener('change',updateTaskFields);
    updateTaskFields();
    async function loadLegalMatters(){
      try {
        const r=await fetch('/api/qa/matters',{credentials:'same-origin',cache:'no-store'});
        if(r.status===401){location.replace('/login');return;}
        if(!r.ok)throw Error('matter unavailable');
        const data=await r.json();
        const previously=matter.value;
        matter.replaceChildren();
        const empty=document.createElement('option');
        empty.value='';empty.textContent='Chọn hồ sơ QA…';
        matter.append(empty);
        for(const m of data.matters||[]){
          if(typeof m.id!=='string'||typeof m.title!=='string')continue;
          const item=document.createElement('option');
          item.value=m.id;item.textContent=m.title;
          matter.append(item);
        }
        matter.value=previously&&[...matter.options].some(o=>o.value===previously)?previously:'';
        setStatus((data.matters||[]).length
          ?'Chọn hồ sơ có quyền truy cập để thử nghiệp vụ AI với văn bản mẫu.'
          :'Chưa có hồ sơ QA. Vào Tài liệu → Tạo hồ sơ trước.');
      } catch {
        matter.replaceChildren();
        const opt=document.createElement('option');
        opt.value='';opt.textContent='Danh mục hồ sơ chưa sẵn sàng';matter.append(opt);
        setStatus('Không thể tải hồ sơ QA. Hãy thử lại.',true);
      }
    }
    window.addEventListener('ai-law:legal-open',()=>void loadLegalMatters());
    window.addEventListener('ai-law:workspace-switch',()=>{
      matter.replaceChildren();clearResult();byId('legal-qa-source').value='';
      secondary.value='';question.value='';byId('legal-qa-consent').checked=false;
      void loadLegalMatters();
    });
    legalForm.addEventListener('submit',async event=>{
      event.preventDefault();
      if(isSubmitting)return;
      const source=byId('legal-qa-source').value.trim();
      const extra=secondary.value.trim();
      if(!matter.value){setStatus('Hãy tạo và chọn hồ sơ QA trước.',true);return;}
      if(source.length<30||source.length>5000||
        (secondary.required&&(extra.length<30||extra.length>5000))){
        setStatus('Nguồn A/B cần tối thiểu 30 và tối đa 5000 ký tự.',true);return;
      }
      if(!byId('legal-qa-consent').checked){
        setStatus('Chỉ sử dụng văn bản giả lập và xác nhận trước khi chạy.',true);return;
      }
      isSubmitting=true;byId('legal-qa-run').disabled=true;clearResult();
      setStatus('Đang xử lý nguồn QA. Không tải dữ liệu lên Drive…');
      try {
        const response=await fetch('/api/qa/legal/run',{method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'same-origin',cache:'no-store',
          body:JSON.stringify({uc:uc.value,matter_id:matter.value,
            source_text:source,source_text_2:extra,
            question:question.value.trim(),
            language:byId('legal-qa-language').value,synthetic_consent:true})
        });
        if(response.status===401){location.replace('/login');return;}
        const data=await response.json().catch(()=>({}));
        if(!response.ok){
          if(response.status===404)void loadLegalMatters();
          throw Error(data.error||'Tác vụ QA không thể thực hiện.');
        }
        if(typeof data.answer!=='string'||!data.answer)throw Error('Kết quả từ máy chủ không hợp lệ.');
        output.textContent=data.answer;
        byId('legal-qa-result-title').textContent=data.title+' · '+(data.mode==='local_example_only'?'Tìm trong nguồn mẫu':'Bản nháp AI');
        byId('legal-qa-review').textContent=data.review_notice||
          'Chỉ truy xuất từ nguồn giả lập. Chưa xác minh dữ liệu văn bản pháp luật/bản án chính thức.';
        const sources=byId('legal-qa-sources');
        sources.replaceChildren();
        const title=document.createElement('strong');
        title.textContent='Nguồn đã sử dụng · SHA-256 '+String(data.source_hash||'').slice(0,12)+'…';
        sources.append(title);
        for(const ref of data.source_anchors||[]){
          const line=document.createElement('p');
          line.textContent='['+ref.id+'] '+ref.preview;
          sources.append(line);
        }
        if(Array.isArray(data.findings)&&data.findings.length){
          const found=document.createElement('p');
          found.textContent='Các đoạn phù hợp: '+data.findings.map(x=>x.source_id).join(', ');
          sources.append(found);
        }
        result.hidden=false;
        setStatus('Hoàn tất bản nháp QA. Hãy đối chiếu nguồn và kiểm duyệt thủ công.');
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
      } catch(error){setStatus(error?.message||'Lỗi kết nối đến mô hình QA.',true);}
      finally{isSubmitting=false;byId('legal-qa-run').disabled=false;}
    });
    copy.addEventListener('click',async()=>{
      if(result.hidden||!output.textContent)return;
      try{await navigator.clipboard.writeText(output.textContent);
        setStatus('Đã sao chép bản nháp. Chưa xác minh pháp lý.');
      }catch{setStatus('Không sao chép tự động được. Bạn có thể chọn và sao chép văn bản.',true);}
    });
    void loadLegalMatters();
  }
  goto(location.hash.slice(1), { updateHash: false });
})();
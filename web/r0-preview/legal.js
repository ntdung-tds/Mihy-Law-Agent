/* R109: authenticated, source-limited QA legal operations. Separate from R0 static shell. */
(() => {
 'use strict';
 const $=q=>document.querySelector(q);
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
    let activeUc=null, requestGeneration=0, activeController=null;
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
      const language=byId('legal-qa-language');
      language.disabled=uc.value!=='UC03';
      language.closest('label').hidden=uc.value!=='UC03';
      question.placeholder=['UC10','UC11'].includes(uc.value)
        ?'Nhập từ khóa tìm trong nguồn văn bản mẫu'
        :uc.value==='UC09'?'Bạn muốn hỏi điều gì từ nguồn mẫu?'
        :'Ví dụ: Các mốc thời gian và nghĩa vụ chính?';
      byId('legal-qa-run').textContent=['UC10','UC11'].includes(uc.value)
        ?'Tìm trong nguồn mẫu':'Tạo bản nháp QA';
      clearResult();
    }
    uc.addEventListener('change',updateTaskFields);
    updateTaskFields();
    function clearWorkflow(){
      // Never carry source, result or consent between separate screens.
      requestGeneration++;
      activeController?.abort();
      activeController=null;isSubmitting=false;activeUc=null;
      byId('legal-qa-run').disabled=false;
      byId('legal-qa-source').value='';
      secondary.value='';question.value='';
      byId('legal-qa-consent').checked=false;
      matter.value='';
      clearResult();
    }
    function activateWorkflow(ucCode){
      if(!/^UC(?:0[1-9]|1[01])$/.test(ucCode))return;
      if(activeUc!==ucCode)clearWorkflow();
      activeUc=ucCode;
      uc.value=ucCode;
      updateTaskFields();
      void loadLegalMatters();
    }
    window.addEventListener('ai-law:workflow-open',event=>activateWorkflow(event.detail?.uc));
    window.addEventListener('ai-law:workflow-close',clearWorkflow);
    byId('legal-qa-example').addEventListener('click',()=>{
      byId('legal-qa-source').value=
        'Điều 1. Bên A bàn giao 10 bộ tài liệu vào ngày 15 tháng 9 năm 2026. Bên B thanh toán 2.000.000 đồng sau khi nghiệm thu đủ 10 bộ tài liệu.\n\nĐiều 2. Nếu giao thiếu tài liệu, hai bên lập biên bản ghi nhận số lượng đã giao và hẹn ngày hoàn tất.';
      secondary.value=
        'Điều 1. Bên A bàn giao 12 bộ tài liệu vào ngày 30 tháng 9 năm 2026. Bên B thanh toán 3.000.000 đồng trong vòng 5 ngày sau nghiệm thu.';
      question.value='Bên B thanh toán khi nào?';
      byId('legal-qa-language').value=uc.value==='UC03'?'en':'vi';
      byId('legal-qa-consent').checked=false;
      clearResult();
      setStatus('Đã nạp dữ liệu giả lập. Chọn hồ sơ và xác nhận trước khi chạy.');
    });
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
      const generation=requestGeneration;
      const currentTask=uc.value;
      const controller=new AbortController();
      activeController=controller;
      setStatus('Đang xử lý nguồn QA. Không tải dữ liệu lên Drive…');
      try {
        const response=await fetch('/api/qa/legal/run',{method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'same-origin',cache:'no-store',signal:controller.signal,
          body:JSON.stringify({uc:currentTask,matter_id:matter.value,
            source_text:source,source_text_2:extra,
            question:question.value.trim(),
            language:byId('legal-qa-language').value,synthetic_consent:true})
        });
        if(response.status===401){location.replace('/login');return;}
        const data=await response.json().catch(()=>({}));
        if(generation!==requestGeneration||activeUc!==currentTask)return;
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
          const found=document.createElement('strong');
          found.textContent='Các đoạn nguồn khớp từ khóa:';
          sources.append(found);
          for(const match of data.findings.slice(0,8)){
            const paragraph=document.createElement('p');
            paragraph.textContent='['+match.source_id+'] '+match.excerpt;
            sources.append(paragraph);
          }
        }
        result.hidden=false;
        setStatus('Hoàn tất bản nháp QA. Hãy đối chiếu nguồn và kiểm duyệt thủ công.');
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
      } catch(error){
        if(generation===requestGeneration&&error?.name!=='AbortError')
          setStatus(error?.message||'Lỗi kết nối đến mô hình QA.',true);
      } finally {
        if(generation===requestGeneration){
          isSubmitting=false;byId('legal-qa-run').disabled=false;activeController=null;
        }
      }
    });
    copy.addEventListener('click',async()=>{
      if(result.hidden||!output.textContent)return;
      try{await navigator.clipboard.writeText(output.textContent);
        setStatus('Đã sao chép bản nháp. Chưa xác minh pháp lý.');
      }catch{setStatus('Không sao chép tự động được. Bạn có thể chọn và sao chép văn bản.',true);}
    });
    // app.js initializes the route before this deferred module.
    const direct=/^#uc-(UC(?:0[1-9]|1[01]))$/.exec(location.hash);
    if(direct)activateWorkflow(direct[1]);
    else void loadLegalMatters();
  }

 // Overview cards open their own workflow screen; never reuse #assistant.
 document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-demo-action]');
  if(!target||!document.querySelector('#legal-qa-form'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const uc=target.dataset.feature;
  if(!/^UC(?:0[1-9]|1[01])$/.test(uc))return;
  const destination='#uc-'+uc;
  if(window.location.hash!==destination)window.location.hash=destination;
  else window.dispatchEvent(new CustomEvent('ai-law:workflow-open',{detail:{uc}}));
 },true);
})();

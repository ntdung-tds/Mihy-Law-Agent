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
    const inputDetails=byId('legal-qa-input-details');
    const workflowPanel=$('#view-workflow');
    const uc07Compare=byId('legal-qa-uc07-compare');
    const uc07Original=byId('legal-qa-uc07-original');
    const uc07Edited=byId('legal-qa-uc07-edited');
    const uc07Acknowledged=byId('legal-qa-uc07-reviewed');
    const uc07Copy=byId('legal-qa-uc07-copy-edited');
    const uc07CopyStatus=byId('legal-qa-uc07-copy-status');
    const setStatus=(msg,bad=false)=>{status.textContent=msg;status.dataset.state=bad?'error':'info';};
    let isSubmitting=false;
    let activeUc=null, requestGeneration=0, activeController=null;
    let uc07Review=null; // In-memory only; never a persisted legal sign-off.
    // R134: keep the exact source/Matter/question snapshot belonging to a
    // displayed result. An old response must not appear or be copied after
    // edits, even when an input was changed programmatically (no DOM event).
    let currentResultContext=null;
    const captureInputs=()=>({
      uc:activeUc,source:byId('legal-qa-source').value.trim(),
      extra:secondary.value.trim(),matter:matter.value,
      question:question.value.trim(),language:byId('legal-qa-language').value,
      consent:byId('legal-qa-consent').checked
    });
    const unchangedInputs=old=>{
      if(!old)return false;
      const now=captureInputs();
      return Object.keys(now).every(key=>now[key]===old[key]);
    };
    const uc07StillSame=()=>!!uc07Review&&unchangedInputs(currentResultContext)&&activeUc==='UC07'&&
      byId('legal-qa-source').value.trim()===uc07Review.source&&
      matter.value===uc07Review.matter&&
      question.value.trim()===uc07Review.question&&
      byId('legal-qa-language').value===uc07Review.language&&
      byId('legal-qa-consent').checked;
    function clearUc07Review(){
      uc07Review=null;
      uc07Compare.hidden=true;uc07Compare.open=false;
      uc07Original.textContent='';uc07Edited.textContent='';
      uc07Acknowledged.checked=false;uc07Copy.disabled=true;
      uc07CopyStatus.textContent='Xác nhận chỉ áp dụng cho lần xem này; không phải phê duyệt pháp lý và không lưu vào hồ sơ.';
      copy.hidden=false;copy.disabled=false;copy.textContent='Sao chép bản nháp';
    }
    function showUc07Review(data,source,selectedMatter){
      // This is the edited version extracted BY THE SERVER, never scraped
      // from untrusted model commentary or accepted as legally equivalent.
      copy.hidden=true;copy.disabled=true;
      const revised=data?.grammar_edited_text;
      if(data?.grammar_review?.isolated_proposal!==true||
         typeof revised!=='string'||!revised.trim()||revised.length>8500)return;
      uc07Review={source,edited:revised,matter:selectedMatter,
        question:question.value.trim(),language:byId('legal-qa-language').value};
      uc07Original.textContent=source;
      uc07Edited.textContent=revised;
      uc07Compare.hidden=false;
      // Keep the comparison visible on desktop; on narrow mobile screens the
      // reviewer must deliberately expand it to reach the confirmation box.
      uc07Compare.open=!(window.matchMedia?.('(max-width: 620px)')?.matches);
      uc07Acknowledged.checked=false;uc07Copy.disabled=true;
    }
    let matterLoadGeneration=0; // Abort effect of late responses from old workspace or UC.
    function clearResult(){
      currentResultContext=null;
      clearUc07Review();
      result.hidden=true;output.textContent='';
      byId('legal-qa-sources').replaceChildren();
      for(const id of ['legal-qa-translation-check','legal-qa-source-coverage','legal-qa-summary-review','legal-qa-grammar-review']){
       const check=byId(id);
       check.hidden=true;check.replaceChildren();delete check.dataset.state;
      }
    }
    function showTranslationCheck(check){
      // Server-side deterministic QA flag only, not legal/linguistic validation.
      const root=byId('legal-qa-translation-check');
      root.replaceChildren();root.hidden=true;
      if(!check||typeof check!=='object')return;
      const needsReview=check.status==='review_required';
      if(!needsReview&&check.status!=='no_obvious_numeric_omission')return;
      root.dataset.state=needsReview?'warning':'info';
      const title=document.createElement('strong');
      title.textContent=needsReview
        ?'Cần đối chiếu lại số liệu hoặc số điều trong bản dịch'
        :'Chưa thấy thiếu chữ số hoặc số điều qua phép đối chiếu đơn giản';
      root.append(title);
      if(needsReview){
        const numbers=Array.isArray(check.missing_numbers)?check.missing_numbers.slice(0,12):[];
        const articles=Array.isArray(check.missing_article_numbers)?check.missing_article_numbers.slice(0,12):[];
        if(numbers.length){
          const line=document.createElement('p');
          line.textContent='Số cần kiểm tra: '+numbers.map(String).join(', ');
          root.append(line);
        }
        if(articles.length){
          const line=document.createElement('p');
          line.textContent='Số điều cần kiểm tra: '+articles.map(String).join(', ');
          root.append(line);
        }
      }
      const note=document.createElement('p');
      note.textContent='Đây chỉ là đối chiếu chữ số tự động, không xác nhận bản dịch đầy đủ hoặc tương đương pháp lý. Kiểm tra với văn bản nguồn trước khi sử dụng.';
      root.append(note);root.hidden=false;
    }
    function showSourceCoverage(coverage){
      const root=byId('legal-qa-source-coverage');
      root.replaceChildren();root.hidden=true;delete root.dataset.state;
      if(!coverage||typeof coverage!=='object')return;
      const total=Number(coverage.source_segment_count);
      const marked=Number(coverage.marked_segment_count);
      const missing=Number(coverage.missing_source_count);
      if(!Number.isInteger(total)||total<0||!Number.isInteger(marked)||
        marked<0||!Number.isInteger(missing)||missing<0)return;
      const warning=coverage.status==='review_required';
      if(!warning&&coverage.status!=='markers_present_not_verified')return;
      root.dataset.state=warning?'warning':'info';
      const heading=document.createElement('strong');
      heading.textContent='Đối chiếu mã đoạn nguồn: '+marked+'/'+total+
        ' đoạn có nhãn trong bản nháp';
      root.append(heading);
      if(warning){
       const ids=Array.isArray(coverage.missing_source_ids)?
        coverage.missing_source_ids.filter(id=>/^A[1-9]\d*$/.test(id)).slice(0,30):[];
       const p=document.createElement('p');
       p.textContent='Đoạn cần kiểm tra: '+ids.join(', ')+
        (missing>ids.length?' và '+(missing-ids.length)+' đoạn khác':'');
       root.append(p);
      }
      const note=document.createElement('p');
      note.textContent='Có nhãn [A#] không chứng minh nội dung đã dịch đúng, đủ hoặc tương đương pháp lý. Bắt buộc luật sư đối chiếu từng đoạn nguồn.';
      root.append(note);root.hidden=false;
    }
    function showSummaryReview(check){
      const panel=byId('legal-qa-summary-review');
      panel.hidden=true;panel.replaceChildren();delete panel.dataset.state;
      panel.open=false;
      if(!check||typeof check!=='object')return;
      const status=check.status;
      if(!['review_required','no_obvious_omission_not_verified'].includes(status))return;
      const important=Number(check.critical_source_count);
      const marked=Number(check.marked_critical_count);
      const missing=Number(check.missing_critical_source_count);
      const missingNumbers=Number(check.missing_number_count);
      const missingDates=Number(check.missing_date_count);
      if(![important,marked,missing,missingNumbers,missingDates].every(
        n=>Number.isInteger(n)&&n>=0))return;
      panel.dataset.state=status==='review_required'?'warning':'info';
      const title=document.createElement('summary');
      title.className='legal-qa-summary-toggle';
      title.textContent=status==='review_required'
       ?'Cần đối chiếu thông tin · '+(missing+missingNumbers+missingDates)+' mục cần rà'
       :'Đối chiếu nguồn · Chưa phát hiện dấu hiệu thiếu';
      const content=document.createElement('div');
      content.className='legal-qa-summary-content';
      panel.append(title,content);
      const count=document.createElement('p');
      count.textContent='Đoạn nghĩa vụ có dẫn nguồn: '+marked+'/'+important+
       ' · Số cần rà: '+missingNumbers+' · Mốc ngày cần rà: '+missingDates;
      content.append(count);
      const add=(label,values,max)=>{
       if(!Array.isArray(values)||!values.length)return;
       const p=document.createElement('p');
       p.textContent=label+': '+values.slice(0,12).map(String).join(', ')+
        (max>12?' (và các giá trị khác)':'');
       content.append(p);
      };
      add('Đoạn nguồn cần đối chiếu',check.missing_critical_source_ids,missing);
      add('Chữ số cần đối chiếu',check.missing_numbers,missingNumbers);
      add('Mốc ngày cần đối chiếu',check.missing_dates,missingDates);
      const disclaimer=document.createElement('p');
      disclaimer.textContent='Đây chỉ là cảnh báo hình thức. Tóm tắt có thể diễn đạt hoặc lược bỏ chi tiết hợp lệ. Không xác nhận đã đầy đủ ý, đúng nghĩa hay có giá trị pháp lý; luật sư phải đối chiếu nguồn.';
      content.append(disclaimer);
      panel.open=!(window.matchMedia?.('(max-width: 620px)')?.matches);
      panel.hidden=false;
    }
    function showGrammarReview(review){
      const panel=byId('legal-qa-grammar-review');
      panel.hidden=true;panel.open=false;panel.replaceChildren();delete panel.dataset.state;
      if(!review||typeof review!=='object')return;
      if(!['review_required','no_obvious_change_not_verified',
           'manual_review_no_proposed_version'].includes(review.status))return;
      const isolated=review.isolated_proposal===true;
      const kinds=[
       ['number','Số liệu'],['date','Mốc ngày'],
       ['duty','Quyền, nghĩa vụ/phủ định'],['party','Chủ thể, tên riêng']
      ];
      let changed=0;
      for(const [key] of kinds){
       const n=Number(review[key+'_changed_count']);
       if(!Number.isInteger(n)||n<0)return;
       changed+=n;
      }
      const risky=!isolated||review.status==='review_required';
      panel.dataset.state=risky?'warning':'info';
      const title=document.createElement('summary');
      title.className='legal-qa-grammar-toggle';
      title.textContent=!isolated
       ?'Không tách được bản sửa · Cần rà soát thủ công'
       :risky?'Cần đối chiếu '+changed+' nhóm giá trị thay đổi'
        :'Chưa thấy thay đổi qua kiểm tra hình thức · Vẫn cần duyệt';
      const details=document.createElement('div');details.className='legal-qa-grammar-content';
      panel.append(title,details);
      const intro=document.createElement('p');
      intro.textContent=!isolated
       ?'AI không trả đủ cặp nhãn đầu/kết thúc bản sửa. Không sử dụng phần giải thích để thay cho văn bản đề xuất.'
       :'Hệ thống chỉ so sánh bản sửa đã tách với nguồn ban đầu; thay đổi ngữ nghĩa ngoài nhóm chỉ báo có thể bị bỏ sót.';
      details.append(intro);
      for(const [key,label] of kinds){
       const total=Number(review[key+'_changed_count']);
       if(!total)continue;
       const row=document.createElement('p');
       row.className='legal-qa-grammar-diff';
       const bold=document.createElement('strong');
       bold.textContent=label+' ('+total+'): ';
       row.append(bold);
       const parts=Array.isArray(review[key+'_changes'])?
        review[key+'_changes'].slice(0,12).filter(v=>v&&typeof v==='object'):[];
       const names=parts.map(v=>{
        const old=Number(v.from_count),next=Number(v.to_count);
        const safe=String(v.value||'').slice(0,80);
        return safe+' ('+(Number.isInteger(old)?old:'?')+' → '+(Number.isInteger(next)?next:'?')+')';
       });
       const span=document.createElement('span');
       span.textContent=names.join('; ')+(total>parts.length?' …':'');
       row.append(span);details.append(row);
      }
      const note=document.createElement('p');
      note.className='legal-qa-review-note';
      note.textContent='Đây là cảnh báo hình thức, KHÔNG xác minh bản sửa giữ nguyên nghĩa pháp lý. Luật sư phải so sánh toàn văn, đặc biệt quyền/nghĩa vụ, ngày, số liệu và chủ thể.';
      details.append(note);
      panel.open=!(window.matchMedia?.('(max-width: 620px)')?.matches);
      panel.hidden=false;
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
      if(inputDetails)inputDetails.open=true;
      clearResult();
    }
    uc.addEventListener('change',updateTaskFields);
    updateTaskFields();
    function clearWorkflow(){
      // Never carry source, result or consent between separate screens.
      requestGeneration++;
      matterLoadGeneration++;
      activeController?.abort();
      activeController=null;isSubmitting=false;activeUc=null;
      if(workflowPanel)delete workflowPanel.dataset.activeUc;
      if(inputDetails)inputDetails.open=true;
      byId('legal-qa-run').disabled=false;
      byId('legal-qa-source').value='';
      secondary.value='';question.value='';
      byId('legal-qa-consent').checked=false;
      matter.value='';
      matter.replaceChildren();
      clearResult();
    }
    function activateWorkflow(ucCode){
      if(!/^UC(?:0[1-9]|1[01])$/.test(ucCode))return;
      if(activeUc!==ucCode)clearWorkflow();
      activeUc=ucCode;
      if(workflowPanel)workflowPanel.dataset.activeUc=ucCode;
      uc.value=ucCode;
      updateTaskFields();
      void loadLegalMatters();
    }
    window.addEventListener('ai-law:workflow-open',event=>activateWorkflow(event.detail?.uc));
    window.addEventListener('ai-law:workflow-close',clearWorkflow);
    byId('legal-qa-example').addEventListener('click',()=>{
      if(isSubmitting){
        requestGeneration++;activeController?.abort();activeController=null;
        isSubmitting=false;byId('legal-qa-run').disabled=false;
      }
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
      // Only the most recent authorized workspace/UC response may populate the
      // visible selector. No account IDs or source text are persisted locally.
      const loadedUc=activeUc, generation=++matterLoadGeneration;
      if(!loadedUc)return;
      const stillCurrent=()=>generation===matterLoadGeneration&&activeUc===loadedUc;
      try {
        const r=await fetch('/api/qa/matters',{credentials:'same-origin',cache:'no-store'});
        if(!stillCurrent())return;
        if(r.status===401){location.replace('/login');return;}
        if(!r.ok)throw Error('matter unavailable');
        const data=await r.json();
        if(!stillCurrent())return;
        if(!Array.isArray(data.matters))throw Error('invalid matter response');
        const previously=matter.value;
        matter.replaceChildren();
        const empty=document.createElement('option');
        empty.value='';empty.textContent='Chọn hồ sơ QA…';
        matter.append(empty);
        for(const m of data.matters){
          if(typeof m.id!=='string'||typeof m.title!=='string')continue;
          const item=document.createElement('option');
          item.value=m.id;item.textContent=m.title;
          matter.append(item);
        }
        matter.value=previously&&[...matter.options].some(o=>o.value===previously)?previously:'';
        if(previously!==matter.value)invalidateResultOnInput();
        setStatus(data.matters.length
          ?'Chọn hồ sơ có quyền truy cập để thử nghiệp vụ AI với văn bản mẫu.'
          :'Chưa có hồ sơ QA. Chọn “Tạo hồ sơ QA mới” để tiếp tục.');
      } catch {
        if(!stillCurrent())return;
        matter.replaceChildren();
        const opt=document.createElement('option');
        opt.value='';opt.textContent='Danh mục hồ sơ chưa sẵn sàng';matter.append(opt);
        setStatus('Không thể tải hồ sơ QA. Hãy thử lại.',true);
      }
    }
    window.addEventListener('ai-law:legal-open',()=>void loadLegalMatters());
    window.addEventListener('ai-law:workspace-switch',()=>{
      const current=activeUc;
      clearWorkflow();
      matter.replaceChildren();
      if(current)activateWorkflow(current);
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
      const submittedContext=captureInputs();
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
        if(!unchangedInputs(submittedContext)){
          clearResult();
          setStatus('Đầu vào đã thay đổi. Hãy tạo lại bản nháp với nội dung hiện tại.',true);
          return;
        }
        if(!response.ok){
          if(response.status===404)void loadLegalMatters();
          throw Error(data.error||'Tác vụ QA không thể thực hiện.');
        }
        if(typeof data.answer!=='string'||!data.answer)throw Error('Kết quả từ máy chủ không hợp lệ.');
        currentResultContext=submittedContext;
        output.textContent=data.answer;
        if(currentTask==='UC03'){
         showTranslationCheck(data.translation_check);
         showSourceCoverage(data.source_coverage);
        }
        if(currentTask==='UC04')showSummaryReview(data.summary_review);
        if(currentTask==='UC07')showGrammarReview(data.grammar_review);
        if(currentTask==='UC07')showUc07Review(data,source,matter.value);
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
        // R129: On small screens, close only the UC04 source form AFTER a
        // verified response. Keep source in the in-memory form for reopening;
        // never submit or persist it again without a deliberate user action.
        const smallScreen=window.matchMedia?.('(max-width: 620px)')?.matches===true;
        if(currentTask==='UC04'&&smallScreen&&inputDetails)inputDetails.open=false;
        const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
        result.scrollIntoView({
          behavior:reduceMotion?'auto':'smooth',
          block:['UC04','UC07'].includes(currentTask)?'start':'nearest'
        });
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
      if(activeUc==='UC07')return; // R131: no raw model-output clipboard bypass.
      if(result.hidden||!output.textContent)return;
      if(['UC03','UC04'].includes(activeUc)&&!unchangedInputs(currentResultContext)){
        clearResult();
        setStatus('Đầu vào đã thay đổi. Hãy tạo lại bản nháp trước khi sao chép.',true);
        return;
      }
      try{await navigator.clipboard.writeText(output.textContent);
        setStatus('Đã sao chép bản nháp. Chưa xác minh pháp lý.');
      }catch{setStatus('Không sao chép tự động được. Bạn có thể chọn và sao chép văn bản.',true);}
    });
    // Acknowledgement is a LOCAL user action, not a legal approval, audit
    // event or authorization escalation. It is invalidated by any input change.
    uc07Acknowledged.addEventListener('change',()=>{
      const allowed=uc07StillSame()&&!uc07Compare.hidden;
      if(!allowed)uc07Acknowledged.checked=false;
      uc07Copy.disabled=!allowed||!uc07Acknowledged.checked;
    });
    uc07Copy.addEventListener('click',async()=>{
      if(result.hidden||uc07Compare.hidden||!uc07Acknowledged.checked||
         uc07Copy.disabled||!uc07StillSame())return;
      try{
        await navigator.clipboard.writeText(uc07Review.edited);
        uc07CopyStatus.textContent='Đã sao chép riêng bản sửa đã đối chiếu. Kết quả chưa được phê duyệt pháp lý hoặc lưu vào hồ sơ.';
      }catch{
        uc07CopyStatus.textContent='Không sao chép tự động được; vui lòng chọn và sao chép trực tiếp bản sửa đề xuất.';
      }
    });
    function invalidateResultOnInput(){
      if(!['UC03','UC04','UC07'].includes(activeUc)||
         (result.hidden&&!isSubmitting))return;
      requestGeneration++;activeController?.abort();
      activeController=null;isSubmitting=false;
      byId('legal-qa-run').disabled=false;
      clearResult();
      setStatus('Đầu vào đã thay đổi. Hãy tạo lại bản nháp và đối chiếu nguồn.',true);
    }
    for(const [node,type] of [
      [byId('legal-qa-source'),'input'],[secondary,'input'],
      [question,'input'],[matter,'change'],
      [byId('legal-qa-language'),'change'],
      [byId('legal-qa-consent'),'change']
    ])node.addEventListener(type,invalidateResultOnInput);
    // app.js initializes the route before this deferred module.
    const direct=/^#uc-(UC(?:0[1-9]|1[01]))$/.exec(location.hash);
    if(direct)activateWorkflow(direct[1]);
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

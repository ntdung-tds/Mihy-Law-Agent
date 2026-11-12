/* R109: authenticated, source-limited QA legal operations. Separate from R0 static shell. */
(() => {
 'use strict';
 const $=q=>document.querySelector(q);
  // R140: QA text-only workflows may read selected TXT locally. No Drive,
  // provider upload or persistence until an authorized user submits the text.
  const legalForm=$('#legal-qa-form');
  if(legalForm) {
    const byId=id=>$('#'+id);
    const uc=byId('legal-qa-uc'),matter=byId('legal-qa-matter');
    const question=byId('legal-qa-question'),secondary=byId('legal-qa-source-b');
    const status=byId('legal-qa-feedback'),result=byId('legal-qa-result');
    const output=byId('legal-qa-output'),copy=byId('legal-qa-copy');
    const setStatus=(msg,bad=false)=>{status.textContent=msg;status.dataset.state=bad?'error':'info';};
    let isSubmitting=false;
    // Invalidate all in-flight AI results on workspace or task changes.
    let workspaceGeneration=0;
    let matterLoadGeneration=0;
    let matterLoadController=null;
    let runController=null;
    const localFileSequence={a:0,b:0};
    function invalidateRun(){
      workspaceGeneration++;
      runController?.abort();
      runController=null;
      isSubmitting=false;
      byId('legal-qa-run').disabled=false;
      clearResult();
    }
    function clearResult(){
      result.hidden=true;output.textContent='';
      byId('legal-qa-sources').replaceChildren();
      byId('legal-qa-translation-review').hidden=true;
      byId('legal-qa-translation-rows').replaceChildren();
      byId('legal-qa-grammar-review').hidden=true;
      byId('legal-qa-grammar-rows').replaceChildren();
    }
    function updateTaskFields(){
      const dual=['UC06','UC08'].includes(uc.value);
      byId('legal-qa-source-b-label').hidden=!dual;
      byId('legal-qa-file-b-label').hidden=!dual;
      secondary.required=dual;
      if(!dual){
        secondary.value='';
        byId('legal-qa-file-b').value='';
      }
      const needingQuestion=['UC09','UC10','UC11'].includes(uc.value);
      question.required=needingQuestion;
      byId('legal-qa-language').disabled=uc.value!=='UC03';
      byId('legal-qa-run').textContent=['UC10','UC11'].includes(uc.value)
        ?'Tìm trong nguồn mẫu':'Tạo bản nháp QA';
      clearResult();
    }
    uc.addEventListener('change',()=>{invalidateRun();updateTaskFields();});
    updateTaskFields();
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
    // Read text locally: users still must select a permitted Matter and
    // actively consent before any text reaches /api/qa/legal/run.
    function bindLocalTxt(which,fieldId){
      const input=byId('legal-qa-file-'+which),field=byId(fieldId);
      input.addEventListener('change',async()=>{
        const file=input.files?.[0];
        if(!file)return;
        const generation=workspaceGeneration;
        const sequence=++localFileSequence[which];
        const isCurrent=()=>generation===workspaceGeneration &&
          sequence===localFileSequence[which];
        try {
          if(!/\.txt$/iu.test(file.name||'')||file.size>20_000 ||
             file.size===0||file.type&&file.type!=='text/plain'){
            if(isCurrent())setStatus('Chỉ đọc tệp TXT UTF-8 tối đa 20 KB. Tệp PDF/DOCX cần luồng xử lý riêng.',true);
            return;
          }
          const text=await file.text();
          if(!isCurrent())return;
          if(typeof text!=='string'||text.length<30||text.length>5000||
             /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(text)){
            setStatus('Tệp TXT không hợp lệ hoặc vượt giới hạn 30–5000 ký tự. Không nạp nội dung.',true);
            return;
          }
          field.value=text;
          byId('legal-qa-consent').checked=false;
          clearResult();
          setStatus('Đã đọc TXT '+which.toUpperCase()+' trên thiết bị. Chưa gửi lên máy chủ; xác nhận trước khi chạy.');
        } catch {
          if(isCurrent())setStatus('Không thể đọc tệp TXT trên thiết bị.',true);
        } finally {
          if(isCurrent())input.value='';
        }
      });
    }
    bindLocalTxt('a','legal-qa-source');
    bindLocalTxt('b','legal-qa-source-b');

    async function loadLegalMatters(){
      matterLoadController?.abort();
      const generation=++matterLoadGeneration;
      const controller=new AbortController();
      matterLoadController=controller;
      const current=()=>generation===matterLoadGeneration;
      try {
        const r=await fetch('/api/qa/matters',{
          credentials:'same-origin',cache:'no-store',signal:controller.signal
        });
        if(!current())return;
        if(r.status===401){location.replace('/login');return;}
        if(!r.ok)throw Error('matter unavailable');
        const data=await r.json();
        if(!current())return;
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
        if(!current())return;
        matter.replaceChildren();
        const opt=document.createElement('option');
        opt.value='';opt.textContent='Danh mục hồ sơ chưa sẵn sàng';matter.append(opt);
        setStatus('Không thể tải hồ sơ QA. Hãy thử lại.',true);
      } finally {
        if(current())matterLoadController=null;
      }
    }
    window.addEventListener('ai-law:legal-open',()=>void loadLegalMatters());
    window.addEventListener('ai-law:workspace-switch',()=>{
      invalidateRun();
      matterLoadController?.abort();
      matterLoadGeneration++;
      matter.replaceChildren();
      matter.value='';
      byId('legal-qa-source').value='';
      byId('legal-qa-file-a').value='';byId('legal-qa-file-b').value='';
      secondary.value='';question.value='';byId('legal-qa-consent').checked=false;
      setStatus('Đang tải hồ sơ của không gian mới…');
      void loadLegalMatters();
    });
    legalForm.addEventListener('submit',async event=>{
      event.preventDefault();
      if(isSubmitting)return;
      const source=byId('legal-qa-source').value.trim();
      const extra=secondary.required?secondary.value.trim():'';
      if(!matter.value){setStatus('Hãy tạo và chọn hồ sơ QA trước.',true);return;}
      if(source.length<30||source.length>5000||
        (secondary.required&&(extra.length<30||extra.length>5000))){
        setStatus('Nguồn A/B cần tối thiểu 30 và tối đa 5000 ký tự.',true);return;
      }
      if(!byId('legal-qa-consent').checked){
        setStatus('Chỉ sử dụng văn bản giả lập và xác nhận trước khi chạy.',true);return;
      }
      isSubmitting=true;byId('legal-qa-run').disabled=true;clearResult();
      const generation=workspaceGeneration;
      const controller=new AbortController();
      runController=controller;
      setStatus('Đang xử lý nguồn QA. Không tải dữ liệu lên Drive…');
      try {
        const response=await fetch('/api/qa/legal/run',{method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'same-origin',cache:'no-store',signal:controller.signal,
          body:JSON.stringify({uc:uc.value,matter_id:matter.value,
            source_text:source,source_text_2:extra,
            question:question.value.trim(),
            language:byId('legal-qa-language').value,synthetic_consent:true})
        });
        if(generation!==workspaceGeneration)return;
        if(response.status===401){location.replace('/login');return;}
        const data=await response.json().catch(()=>({}));
        if(generation!==workspaceGeneration)return;
        if(!response.ok){
          if(response.status===404)void loadLegalMatters();
          throw Error(data.error||'Tác vụ QA không thể thực hiện.');
        }
        if(typeof data.answer!=='string'||!data.answer)throw Error('Kết quả từ máy chủ không hợp lệ.');
        output.textContent=data.answer;
        // R142: render only an explicitly anchored per-segment UC03 review.
        // Missing/duplicate segments are visibly unresolved, not silently paired.
        const translationPanel=byId('legal-qa-translation-review');
        const translationRows=byId('legal-qa-translation-rows');
        translationRows.replaceChildren();
        translationPanel.hidden=true;
        const review=data.translation_review;
        let translationWarnings=false;
        if(data.uc==='UC03'&&review&&Array.isArray(review.rows)){
          const count=review.rows.length;
          if(count>0&&count<=80){
            translationPanel.hidden=false;
            translationWarnings=review.paired_segments!==review.total_segments||
              (Array.isArray(review.flags)&&review.flags.length>0);
            for(const entry of review.rows){
              if(!entry||!/^A[1-9]\d*$/.test(entry.source_id)||
                 typeof entry.source_text!=='string'||
                 typeof entry.draft_text!=='string'||entry.source_text.length>5000||
                 entry.draft_text.length>8500||
                 !['paired','missing','duplicate'].includes(entry.status))continue;
              const row=document.createElement('article');
              row.className='legal-qa-translation-row';
              const heading=document.createElement('strong');
              heading.textContent='['+entry.source_id+'] · '+
                (entry.status==='paired'?'Cần kiểm duyệt':'Chưa có đoạn dịch hợp lệ ('+entry.status+')');
              row.append(heading);
              for(const [label,text] of [
                ['Nguồn gốc',entry.source_text],
                ['Bản dịch nháp',entry.draft_text||'Chưa ghép được đoạn dịch']
              ]){
                const cell=document.createElement('div');
                cell.className='legal-qa-translation-cell';
                const caption=document.createElement('strong');
                caption.textContent=label;
                const body=document.createElement('p');
                body.textContent=text;
                cell.append(caption,body);
                row.append(cell);
              }
              translationRows.append(row);
            }
            if(translationWarnings){
              const warning=document.createElement('p');
              warning.className='legal-qa-evidence-warning';
              warning.textContent='Đối chiếu UC03 chưa đầy đủ hoặc có đoạn trùng. Không sử dụng trước khi rà soát từng đoạn và số liệu.';
              translationRows.prepend(warning);
            }
          }
        }
        // R144: compare each proposed grammatical edit with its exact source
        // segment. Never auto-apply changes to source or to the original file.
        const grammarPanel=byId('legal-qa-grammar-review');
        const grammarRows=byId('legal-qa-grammar-rows');
        grammarPanel.hidden=true;
        grammarRows.replaceChildren();
        let grammarWarnings=false;
        const correction=data.correction_review;
        if(data.uc==='UC07'&&correction&&Array.isArray(correction.rows)&&
           correction.rows.length>0&&correction.rows.length<=80){
          grammarPanel.hidden=false;
          grammarWarnings=correction.paired_segments!==correction.total_segments||
            (Array.isArray(correction.flags)&&correction.flags.length>0);
          if(grammarWarnings){
            const note=document.createElement('p');
            note.className='legal-qa-evidence-warning';
            note.textContent='UC07: Có đoạn bị thiếu/trùng hoặc thay đổi số liệu. Không chấp nhận tự động; luật sư phải kiểm duyệt.';
            grammarRows.append(note);
          }
          for(const entry of correction.rows){
            if(!entry||!/^A[1-9]\\d*$/.test(entry.source_id)||
               typeof entry.source_text!=='string'||
               typeof entry.proposed_text!=='string'||
               entry.source_text.length>5000||entry.proposed_text.length>8500||
               !['unchanged','changed','missing','duplicate'].includes(entry.status))continue;
            const line=document.createElement('article');
            line.className='legal-qa-translation-row';
            const title=document.createElement('strong');
            title.textContent='['+entry.source_id+'] · '+
              ({unchanged:'Giữ nguyên',changed:'Đề xuất sửa',missing:'Thiếu đề xuất',duplicate:'Đề xuất trùng'}[entry.status]);
            line.append(title);
            for(const [name,value] of [
              ['Đoạn nguồn',entry.source_text],
              ['Đề xuất từ AI',entry.proposed_text||'Chưa có đề xuất có thể đối chiếu']
            ]){
              const cell=document.createElement('div');
              cell.className='legal-qa-translation-cell';
              const label=document.createElement('strong');
              label.textContent=name;
              const p=document.createElement('p');
              p.textContent=value;
              cell.append(label,p);
              line.append(cell);
            }
            if(entry.numeric_check==='literal_numeric_change_requires_review'){
              const warning=document.createElement('p');
              warning.className='legal-qa-evidence-warning';
              warning.textContent='Cảnh báo: số liệu ở đoạn này đã thay đổi; cần đối chiếu nguyên bản.';
              line.append(warning);
              grammarWarnings=true;
            }
            grammarRows.append(line);
          }
        }
        byId('legal-qa-result-title').textContent=data.title+' · '+(data.mode==='local_example_only'?'Tìm trong nguồn mẫu':'Bản nháp AI');
        byId('legal-qa-review').textContent=data.review_notice||
          'Chỉ truy xuất từ nguồn giả lập. Chưa xác minh dữ liệu văn bản pháp luật/bản án chính thức.';
        const sources=byId('legal-qa-sources');
        sources.replaceChildren();
        // Diagnostics flag review risks; no text claims to verify a legal fact.
        const diagnostics=data.evidence_diagnostics;
        let evidenceWarnings=[];
        if(diagnostics&&typeof diagnostics==='object'){
          const labels={
            SOURCE_A_CITATION_MISSING:'Kết quả chưa trích dẫn nguồn A.',
            SOURCE_B_CITATION_MISSING:'Kết quả so sánh chưa trích dẫn nguồn B.',
            SOURCE_NUMBER_NOT_PRESERVED:'Một hoặc nhiều số trong nguồn chưa xuất hiện ở bản nháp.',
            UNEXPECTED_NUMBER_IN_DRAFT:'Bản nháp có số không xuất hiện trong nguồn.',
            SOURCE_COVERAGE_INCOMPLETE:'Bản tóm tắt chưa dẫn chiếu đủ các đoạn nguồn.',
          };
          evidenceWarnings=Array.isArray(diagnostics.flags)
            ? diagnostics.flags.filter(flag=>Object.hasOwn(labels,flag)):[];
          const note=document.createElement('p');
          note.className='legal-qa-evidence-note';
          note.textContent=diagnostics.reference_coverage==='local_sample_only_not_official_corpus'
            ? 'Tra cứu chỉ thực hiện trong nguồn mẫu đã dán, không phải kho luật/bản án chính thức.'
            : 'Mã trích dẫn chỉ được so khớp với đoạn nguồn mẫu, không xác minh nội dung hoặc hiệu lực pháp lý.';
          sources.append(note);
          const coverage=diagnostics.segment_coverage;
          if(coverage&&Number.isInteger(coverage.total_source_segments)&&
             Number.isInteger(coverage.explicitly_cited_segments)&&
             Array.isArray(coverage.uncited_source_ids)){
            const uncovered=coverage.uncited_source_ids
              .filter(id=>typeof id==='string'&&/^A[1-9]\d*$/.test(id))
              .slice(0,15);
            const detail=document.createElement('p');
            detail.className='legal-qa-evidence-note';
            detail.textContent='UC04 · Trích dẫn '+coverage.explicitly_cited_segments+
              '/'+coverage.total_source_segments+' đoạn nguồn. Chưa dẫn: '+
              (uncovered.join(', ')||'không')+
              '. Đây chỉ là kiểm tra mã đoạn, không chứng minh tóm tắt đủ ý.';
            sources.append(detail);
          }
          for(const flag of evidenceWarnings){
            const line=document.createElement('p');
            line.className='legal-qa-evidence-warning';
            line.textContent='Cần kiểm duyệt: '+labels[flag];
            sources.append(line);
          }
        }
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
        setStatus(evidenceWarnings.length||translationWarnings||grammarWarnings
          ? 'Có cảnh báo về nguồn, số liệu hoặc ghép đoạn. Không sử dụng trước khi kiểm duyệt.'
          : 'Hoàn tất bản nháp QA. Hãy đối chiếu nguồn và kiểm duyệt thủ công.',
          evidenceWarnings.length>0||translationWarnings||grammarWarnings);
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
      } catch(error){
        if(generation===workspaceGeneration)
          setStatus(error?.message||'Lỗi kết nối đến mô hình QA.',true);
      } finally {
        if(generation===workspaceGeneration){
          isSubmitting=false;
          runController=null;
          byId('legal-qa-run').disabled=false;
        }
      }
    });
    copy.addEventListener('click',async()=>{
      if(result.hidden||!output.textContent)return;
      try{await navigator.clipboard.writeText(output.textContent);
        setStatus('Đã sao chép bản nháp. Chưa xác minh pháp lý.');
      }catch{setStatus('Không sao chép tự động được. Bạn có thể chọn và sao chép văn bản.',true);}
    });
    void loadLegalMatters();
  }

 // Intercept only known workflow cards. The old R0 informational modal
 // remains intact in the static, network-free preview implementation.
 document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-demo-action]');
  if(!target||!document.querySelector('#legal-qa-form'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const selected=document.querySelector('#legal-qa-uc');
  selected.value=target.dataset.feature;
  selected.dispatchEvent(new Event('change'));
  if(window.location.hash!=='#assistant')window.location.hash='#assistant';
  else window.dispatchEvent(new Event('ai-law:legal-open'));
  window.requestAnimationFrame?.(()=>document.querySelector('#legal-qa-heading')?.scrollIntoView({behavior:'smooth',block:'start'}));
 },true);
 window.addEventListener('hashchange',()=>{
  if(location.hash==='#assistant')window.dispatchEvent(new Event('ai-law:legal-open'));
 });
})();

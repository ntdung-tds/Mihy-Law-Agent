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
    let documentReadGeneration=0;
    let documentReadController=null;
    let documentPreviewText='';
    let documentPreviewMatter='';
    function clearDocumentPreview(){
      documentReadGeneration++;
      documentReadController?.abort();
      documentReadController=null;
      documentPreviewText='';
      documentPreviewMatter='';
      byId('legal-qa-doc-read').disabled=false;
      byId('legal-qa-doc-use').hidden=true;
      byId('legal-qa-doc-preview').hidden=true;
      byId('legal-qa-doc-preview').textContent='';
    }
    function clearDocumentInput(){
      clearDocumentPreview();
      byId('legal-qa-doc-file').value='';
      byId('legal-qa-doc-status').textContent='Chỉ tệp QA giả lập; chọn hồ sơ và xác nhận trước khi đọc.';
    }
    function invalidateRun(){
      workspaceGeneration++;
      clearDocumentInput();
      runController?.abort();
      runController=null;
      isSubmitting=false;
      byId('legal-qa-run').disabled=false;
      clearResult();
    }
    function clearResult(){
      result.hidden=true;output.textContent='';
      copy.disabled=false;
      byId('legal-qa-sources').replaceChildren();
      byId('legal-qa-translation-review').hidden=true;
      byId('legal-qa-translation-rows').replaceChildren();
      byId('legal-qa-grammar-review').hidden=true;
      byId('legal-qa-grammar-rows').replaceChildren();
      byId('legal-qa-contract-review').hidden=true;
      byId('legal-qa-contract-rows').replaceChildren();
      byId('legal-qa-drafting-review').hidden=true;
      byId('legal-qa-drafting-rows').replaceChildren();
      byId('legal-qa-extraction-review').hidden=true;
      byId('legal-qa-extraction-rows').replaceChildren();
      byId('legal-qa-question-review').hidden=true;
      byId('legal-qa-question-rows').replaceChildren();
    }
    function updateTaskFields(){
      byId('legal-qa-doc-panel').hidden=!['UC03','UC04','UC07','F08','UC09'].includes(uc.value);
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
    matter.addEventListener('change',()=>{
      invalidateRun();
      setStatus('Đã đổi hồ sơ QA; hãy kiểm tra lại dữ liệu trước khi gửi.');
    });
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
          clearDocumentInput();
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

    // R149 F07: a file is never converted until the user explicitly clicks
    // "Đọc" after choosing a permitted Matter and giving fictional-data consent.
    // Conversion is preview-only; a SECOND click copies text into source A.
    const docFile=byId('legal-qa-doc-file');
    const docRead=byId('legal-qa-doc-read');
    const docUse=byId('legal-qa-doc-use');
    const docPreview=byId('legal-qa-doc-preview');
    const docStatus=byId('legal-qa-doc-status');
    docFile.addEventListener('change',()=>{
      clearDocumentPreview();
      docStatus.textContent=docFile.files?.[0]
        ?'Đã chọn tệp trên thiết bị. Chưa gửi lên máy chủ hoặc vào nguồn AI.'
        :'Chưa chọn tệp PDF/DOCX QA.';
    });
    docRead.addEventListener('click',async()=>{
      const file=docFile.files?.[0];
      const selectedMatter=matter.value,selectedUC=uc.value;
      if(!['UC03','UC04','UC07','F08','UC09'].includes(selectedUC)){
        docStatus.textContent='Tác vụ này chưa hỗ trợ nguồn PDF/DOCX QA.';return;
      }
      if(!selectedMatter||!byId('legal-qa-consent').checked){
        docStatus.textContent='Chọn hồ sơ được phép và xác nhận dữ liệu giả lập trước khi đọc.';return;
      }
      if(!file||!/^.{1,116}\.(pdf|docx)$/iu.test(file.name||'')||
         file.size<5||file.size>1500000){
        docStatus.textContent='Chỉ nhận PDF/DOCX QA tối đa 1,5 MB có tên tệp hợp lệ.';return;
      }
      clearDocumentPreview();
      const generation=documentReadGeneration,workspace=workspaceGeneration;
      const controller=new AbortController();
      documentReadController=controller;
      docRead.disabled=true;
      docStatus.textContent='Đang trích văn bản mẫu. Không chạy AI pháp lý, không lưu tệp.';
      const body=new FormData();
      body.append('uc',selectedUC);
      body.append('matter_id',selectedMatter);
      body.append('synthetic_consent','true');
      body.append('file',file,file.name);
      const current=()=>generation===documentReadGeneration&&
        workspace===workspaceGeneration&&matter.value===selectedMatter&&
        uc.value===selectedUC;
      try {
        const response=await fetch('/api/qa/legal/extract',{
          method:'POST',credentials:'same-origin',cache:'no-store',
          signal:controller.signal,body
        });
        if(!current())return;
        if(response.status===401){location.replace('/login');return;}
        const data=await response.json().catch(()=>({}));
        if(!current())return;
        if(!response.ok)throw Error(data.error||'Không chuyển đổi được tệp QA.');
        if(data.mode!=='qa_file_text_preview_not_verified'||
           data.uc!==selectedUC||data.file_name!==file.name||
           data.file_size!==file.size||
           typeof data.source_text!=='string'||
           data.source_text.length<30||data.source_text.length>5000)
          throw Error('Tệp chuyển đổi chưa có nội dung đủ điều kiện đối chiếu.');
        documentPreviewText=data.source_text;
        documentPreviewMatter=selectedMatter;
        docPreview.textContent=data.source_text;
        docPreview.hidden=false;
        docUse.hidden=false;
        docStatus.textContent='Chỉ xem trước; đối chiếu toàn văn với tệp gốc, bảng, trang scan và số liệu. Nếu đúng, bấm Dùng đoạn này làm nguồn A.';
      }catch(error){
        if(!current())return;
        docStatus.textContent=(error?.message||'Lỗi đọc tài liệu QA.')+
          ' Không thử lại ngay để tránh trừ quota hai lần.';
      }finally{
        if(current()){
          documentReadController=null;
          docRead.disabled=false;
        }
      }
    });
    docUse.addEventListener('click',()=>{
      if(!documentPreviewText||!documentPreviewMatter||
         matter.value!==documentPreviewMatter||
         !['UC03','UC04','UC07','F08','UC09'].includes(uc.value))return;
      byId('legal-qa-source').value=documentPreviewText;
      byId('legal-qa-consent').checked=false;
      clearDocumentInput();
      clearResult();
      docStatus.textContent='Đã nạp văn bản trích xuất vào nguồn A trên thiết bị. Chưa gọi AI; hãy kiểm duyệt và xác nhận lại trước khi chạy.';
      setStatus('Đã nạp nguồn A từ tệp giả lập sau khi xem trước. Chưa gửi yêu cầu AI.');
    });

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
        const correction=data.correction_review;
        // Older/malformed API results are never treated as a complete review.
        let grammarWarnings=data.uc==='UC07'&&
          (!correction||!Array.isArray(correction.rows)||!correction.rows.length);
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
            if(!entry||!/^A[1-9]\d*$/.test(entry.source_id)||
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
        // R145: show an independent UC02 clause/quote evidence gate. Literal
        // source quotation is checked by the server, NOT legal fact accuracy.
        const contractPanel=byId('legal-qa-contract-review');
        const contractRows=byId('legal-qa-contract-rows');
        contractRows.replaceChildren();
        contractPanel.hidden=true;
        const contract=data.contract_review;
        let contractWarnings=data.uc==='UC02'&&
          (!contract||!Array.isArray(contract.rows)||!contract.rows.length);
        if(data.uc==='UC02'&&contract&&Array.isArray(contract.rows)&&
           contract.rows.length>0&&contract.rows.length<=80){
          contractPanel.hidden=false;
          contractWarnings=contract.literal_quote_matched_segments!==contract.total_segments||
            (Array.isArray(contract.flags)&&contract.flags.length>0);
          if(contractWarnings){
            const notice=document.createElement('p');
            notice.className='legal-qa-evidence-warning';
            notice.textContent='UC02: Có điều khoản thiếu, trích dẫn không khớp hoặc bản nháp không đúng cấu trúc. Bắt buộc kiểm duyệt nguồn trước khi dùng.';
            contractRows.append(notice);
          }
          for(const item of contract.rows){
            if(!item||!/^A[1-9][0-9]*$/.test(item.source_id)||
               typeof item.source_text!=='string'||item.source_text.length>5000||
               typeof item.model_quote!=='string'||item.model_quote.length>400||
               typeof item.review_note!=='string'||item.review_note.length>500||
               typeof item.verification_question!=='string'||item.verification_question.length>350||
               !['missing','duplicate','incomplete','quote_mismatch',
                 'quote_matched_not_legally_verified'].includes(item.status))continue;
            const row=document.createElement('article');
            row.className='legal-qa-translation-row';
            const title=document.createElement('strong');
            const descriptions={
              missing:'Thiếu nhận xét',duplicate:'Trùng bản nháp',
              incomplete:'Thiếu trường kiểm chứng',
              quote_mismatch:'Trích dẫn không khớp',
              quote_matched_not_legally_verified:'Trích nguồn đúng chữ — chưa xác minh nhận định'
            };
            title.textContent='['+item.source_id+'] · '+descriptions[item.status];
            row.append(title);
            for(const [label,text] of [
              ['Điều khoản nguồn',item.source_text],
              ['Trích đoạn AI dẫn',item.model_quote||'Chưa có trích đoạn đối chiếu'],
              ['Nhận xét nháp',item.review_note||'Chưa có nhận xét hợp lệ'],
              ['Câu hỏi cần xác minh',item.verification_question||'Chưa có câu hỏi']
            ]){
              const cell=document.createElement('div');
              cell.className='legal-qa-translation-cell';
              const head=document.createElement('strong');
              head.textContent=label;
              const paragraph=document.createElement('p');
              paragraph.textContent=text;
              cell.append(head,paragraph);
              row.append(cell);
            }
            contractRows.append(row);
          }
        }
        // R146: show source-grounded UC01 suggestions as an unapproved review,
        // never apply them to the original or infer legal validity from quotes.
        const draftingPanel=byId('legal-qa-drafting-review');
        const draftingRows=byId('legal-qa-drafting-rows');
        draftingRows.replaceChildren();
        draftingPanel.hidden=true;
        const draft=data.drafting_review;
        let draftingWarnings=data.uc==='UC01'&&
          (!draft||!Array.isArray(draft.rows)||!draft.rows.length);
        if(data.uc==='UC01'&&draft&&Array.isArray(draft.rows)&&
           draft.rows.length>0&&draft.rows.length<=80){
          draftingPanel.hidden=false;
          draftingWarnings=draft.matched_quote_segments!==draft.total_segments||
            (Array.isArray(draft.flags)&&draft.flags.length>0);
          if(draftingWarnings){
            const note=document.createElement('p');
            note.className='legal-qa-evidence-warning';
            note.textContent='UC01: Có dữ kiện thiếu/trùng, trích dẫn sai nguồn hoặc số mới không có trong nguồn. Không chấp nhận điều khoản trước khi luật sư kiểm duyệt.';
            draftingRows.append(note);
          }
          for(const entry of draft.rows){
            if(!entry||!/^A[1-9][0-9]*$/.test(entry.source_id)||
               typeof entry.source_text!=='string'||entry.source_text.length>5000||
               typeof entry.source_quote!=='string'||entry.source_quote.length>400||
               typeof entry.draft_clause!=='string'||entry.draft_clause.length>850||
               typeof entry.verification_question!=='string'||entry.verification_question.length>350||
               !['missing','duplicate','incomplete','unmatched_source_quote',
                 'draft_for_human_review'].includes(entry.status))continue;
            const row=document.createElement('article');
            row.className='legal-qa-translation-row';
            const title=document.createElement('strong');
            const names={
              missing:'Chưa có dự thảo',
              duplicate:'Dự thảo trùng',
              incomplete:'Thiếu trường rà soát',
              unmatched_source_quote:'Trích dẫn không thuộc đoạn nguồn',
              draft_for_human_review:'Điều khoản chờ luật sư kiểm duyệt'
            };
            title.textContent='['+entry.source_id+'] · '+names[entry.status];
            row.append(title);
            for(const [label,text] of [
              ['Dữ kiện nguồn',entry.source_text],
              ['Trích dẫn căn cứ',entry.source_quote||'Chưa có trích dẫn'],
              ['Điều khoản dự thảo',entry.draft_clause||'Chưa có điều khoản hợp lệ'],
              ['Thông tin cần xác minh',entry.verification_question||'Chưa có câu hỏi']
            ]){
              const cell=document.createElement('div');
              cell.className='legal-qa-translation-cell';
              const labelNode=document.createElement('strong');
              labelNode.textContent=label;
              const p=document.createElement('p');
              p.textContent=text;
              cell.append(labelNode,p);
              row.append(cell);
            }
            if(entry.number_check==='draft_has_number_absent_from_source'){
              const warn=document.createElement('p');
              warn.className='legal-qa-evidence-warning';
              warn.textContent='Cảnh báo: dự thảo có số không xuất hiện trong dữ kiện đoạn này. Phải đối chiếu, không tự điền.';
              row.append(warn);
              draftingWarnings=true;
            }
            draftingRows.append(row);
          }
        }
        // R148 F08 is structured, source-linked sample-text extraction.
        // Literal matching does NOT establish legal interpretation or completeness.
        const extractPanel=byId('legal-qa-extraction-review');
        const extractRows=byId('legal-qa-extraction-rows');
        extractRows.replaceChildren();
        extractPanel.hidden=true;
        const extraction=data.extraction_review;
        let extractionWarnings=data.uc==='F08'&&
          (!extraction||!Array.isArray(extraction.rows)||!extraction.rows.length);
        if(data.uc==='F08'&&extraction&&Array.isArray(extraction.rows)&&
           extraction.rows.length>0&&extraction.rows.length<=80){
          extractPanel.hidden=false;
          extractionWarnings=extraction.reviewed_source_segments!==extraction.total_source_segments||
             (Array.isArray(extraction.flags)&&extraction.flags.length>0);
          const note=document.createElement('p');
          note.className=extractionWarnings?'legal-qa-evidence-warning':'legal-qa-evidence-note';
          note.textContent=extractionWarnings
           ? 'F08: Có trích xuất chưa ghép nguồn, thiếu/nhầm dữ kiện hoặc trùng. Không sử dụng trước khi kiểm duyệt.'
           : 'F08: Chỉ đối chiếu chuỗi nguyên văn; luật sư cần rà soát chủ thể, nghĩa vụ, số tiền và thời hạn.';
          extractRows.append(note);
          const kinds={CHU_THE:'Chủ thể',NGHIA_VU:'Nghĩa vụ',SO_TIEN:'Số tiền',
            THOI_HAN:'Thời hạn',KHONG_CO:'AI khai báo không tìm thấy'};
          const statuses={
            source_literal_matched_not_legally_verified:'Khớp chữ · chưa xác minh pháp lý',
            no_item_claim_not_verified:'Chưa chứng minh không có dữ kiện',
            duplicate:'Trùng dữ kiện',
            incomplete:'Thiếu trường',
            source_mismatch:'Không khớp nguồn',
            inconsistent_no_item:'Trạng thái mâu thuẫn'
          };
          for(const item of extraction.rows){
            if(!item||!/^A[1-9][0-9]*$/.test(item.source_id)||
               !Object.hasOwn(kinds,item.kind)||
               !Object.hasOwn(statuses,item.status)||
               typeof item.source_text!=='string'||item.source_text.length>5000||
               typeof item.source_quote!=='string'||item.source_quote.length>400||
               typeof item.value!=='string'||item.value.length>160)continue;
            const row=document.createElement('article');
            row.className='legal-qa-translation-row';
            const heading=document.createElement('strong');
            heading.textContent='['+item.source_id+'] · '+kinds[item.kind]+' · '+statuses[item.status];
            row.append(heading);
            for(const [label,value] of [
              ['Đoạn nguồn',item.source_text],
              ['Trích đoạn AI',item.source_quote],
              ['Giá trị trích xuất',item.value]
            ]){
              const cell=document.createElement('div');
              cell.className='legal-qa-translation-cell';
              const labelNode=document.createElement('strong');
              labelNode.textContent=label;
              const body=document.createElement('p');
              body.textContent=value;
              cell.append(labelNode,body);
              row.append(cell);
            }
            if(item.status!=='source_literal_matched_not_legally_verified'){
              const warning=document.createElement('p');
              warning.className='legal-qa-evidence-warning';
              warning.textContent='Dữ kiện này chưa được xác nhận theo nguồn; không dùng làm căn cứ quyết định.';
              row.append(warning);
              if(item.status!=='no_item_claim_not_verified')extractionWarnings=true;
            }
            extractRows.append(row);
          }
        }
        // R152 F09: source-quote matching is NOT semantic, legal, or
        // effective-date proof. Render untrusted model values as inert text.
        const qPanel=byId('legal-qa-question-review');
        const qRows=byId('legal-qa-question-rows');
        qPanel.hidden=true;
        qRows.replaceChildren();
        const qReview=data.question_review;
        let questionWarnings=data.uc==='UC09'&&
          (!qReview||!Array.isArray(qReview.references)||
           typeof qReview.answer!=='string');
        if(data.uc==='UC09'&&qReview&&Array.isArray(qReview.references)&&
           qReview.references.length<=24&&
           typeof qReview.answer==='string'&&qReview.answer.length<=1000&&
           typeof qReview.question==='string'&&qReview.question.length<=600&&
           typeof qReview.verification_question==='string'&&
           qReview.verification_question.length<=350){
          qPanel.hidden=false;
          questionWarnings=(Array.isArray(qReview.flags)&&qReview.flags.length>0)||
            qReview.reference_integrity==='review_required'||
            qReview.question!==question.value;
          const note=document.createElement('p');
          note.className=questionWarnings?'legal-qa-evidence-warning':'legal-qa-evidence-note';
          note.textContent=questionWarnings
            ?'F09: Câu trả lời hoặc trích dẫn thiếu căn cứ, sai định dạng hay không khớp câu hỏi hiện tại. Luật sư phải xem lại toàn bộ.'
            :qReview.answer_state==='insufficient_source_claim_not_verified'
              ?'AI báo không đủ căn cứ. Đây chưa phải kết luận rằng hồ sơ không có chứng cứ.'
              :'Trích dẫn chỉ khớp nguyên văn. Nội dung, hiệu lực và độ đầy đủ chưa được xác minh.';
          qRows.append(note);
          const main=document.createElement('article');
          main.className='legal-qa-translation-row';
          const heading=document.createElement('strong');
          heading.textContent='Câu hỏi và trả lời nháp · chờ kiểm duyệt';
          main.append(heading);
          for(const [name,value] of [
            ['Câu hỏi',qReview.question],
            ['Trả lời từ AI',qReview.answer||'Không có câu trả lời đủ điều kiện'],
            ['Điểm cần xác minh',qReview.verification_question||'Chưa có câu hỏi xác minh']
          ]){
            const cell=document.createElement('div');
            cell.className='legal-qa-translation-cell';
            const title=document.createElement('strong');
            title.textContent=name;
            const p=document.createElement('p');
            p.textContent=value;
            cell.append(title,p);
            main.append(cell);
          }
          qRows.append(main);
          for(const ref of qReview.references){
            if(!ref||!/^A[1-9][0-9]*$/.test(ref.source_id)||
               typeof ref.source_text!=='string'||ref.source_text.length>5000||
               typeof ref.model_quote!=='string'||ref.model_quote.length>400||
               !['literal_quote_matched_not_semantic_proof','duplicate','incomplete','source_mismatch'].includes(ref.status))continue;
            const row=document.createElement('article');
            row.className='legal-qa-translation-row';
            const heading=document.createElement('strong');
            heading.textContent='['+ref.source_id+'] · '+
              (ref.status==='literal_quote_matched_not_semantic_proof'
                ?'Khớp chữ, chưa chứng minh đúng nghĩa': 'Trích dẫn chưa khớp nguồn');
            row.append(heading);
            for(const [label,value] of [
              ['Đoạn hồ sơ gốc',ref.source_text],
              ['Trích nguyên văn được dẫn',ref.model_quote||'Thiếu trích dẫn']
            ]){
              const cell=document.createElement('div');
              cell.className='legal-qa-translation-cell';
              const title=document.createElement('strong');
              title.textContent=label;
              const p=document.createElement('p');
              p.textContent=value;
              cell.append(title,p);
              row.append(cell);
            }
            qRows.append(row);
          }
        }
        // A known-invalid or missing F09 reference review must not offer
        // one-click copying of an unsupported draft as if it were usable.
        copy.disabled=data.uc==='UC09'&&!!questionWarnings;
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
        setStatus(evidenceWarnings.length||translationWarnings||grammarWarnings||contractWarnings||draftingWarnings||extractionWarnings||questionWarnings
          ? 'Có cảnh báo về nguồn, số liệu hoặc ghép đoạn. Không sử dụng trước khi kiểm duyệt.'
          : 'Hoàn tất bản nháp QA. Hãy đối chiếu nguồn và kiểm duyệt thủ công.',
          evidenceWarnings.length>0||translationWarnings||grammarWarnings||contractWarnings||draftingWarnings||extractionWarnings||questionWarnings);
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

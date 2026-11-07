/* R109 separate QA legal-text UI; source-only review, never trusted HTML. */
(() => {
 'use strict';
 const $=(selector)=>document.querySelector(selector);
 const el=(tag,className,value)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=value;
  return node;
 };
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

})();

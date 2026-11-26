/** R152 / F09: QA answer-to-source quotation review for a fictional matter.
 * Literal matching verifies bytes in the correct paragraph only, NEVER the
 * relevance, completeness, legal accuracy, validity or temporal applicability
 * of the answer. Nothing is persisted or approved by this helper.
 */
const SOURCE_ID=/^A[1-9]\d*$/u;
const HEADER=/^[ \t]*\[(A[1-9]\d*)\][ \t]*$/u;
const FIELD=/^[ \t]*(TRANG_THAI|TRA_LOI|CAN_XAC_MINH|TRICH):[ \t]*(.*)$/u;
const NO_EVIDENCE=/^KHÔNG ĐỦ CĂN CỨ[.!]?$/u;
export function buildMatterQuestionReview(modelAnswer,sourceRows,question){
 if(typeof modelAnswer!=='string'||modelAnswer.length>8500||
    !Array.isArray(sourceRows)||sourceRows.length<1||sourceRows.length>80||
    sourceRows.some(r=>!r||!SOURCE_ID.test(r.id)||
      typeof r.text!=='string'||!r.text.trim()||r.text.length>5000)||
    typeof question!=='string'||question.trim().length<3||question.length>600)
    throw new TypeError('Invalid F09 QA input');
 const indexed=new Map(sourceRows.map(r=>[r.id,r.text]));
 if(indexed.size!==sourceRows.length)throw new TypeError('Duplicate source ID');
 const main={},blocks=[],unknown=new Set();
 let current=null,unexpected=false;
 for(const line of modelAnswer.split(/\r?\n/u)){
  if(!line.trim())continue;
  const match=line.match(HEADER);
  if(match){
   current={source_id:match[1],quote:'',invalid:false};
   if(!indexed.has(current.source_id)){unknown.add(current.source_id);unexpected=true;}
   if(blocks.length>=24){unexpected=true;continue;}
   blocks.push(current);continue;
  }
  const field=line.match(FIELD);
  if(!field){unexpected=true;continue;}
  const [,key,value]=field;
  if(current){
   if(key!=='TRICH'||current.quote||value.length>400||
      !value.trim()){current.invalid=true;unexpected=true;continue;}
   current.quote=value.trim();
  }else{
   if(key==='TRICH'||Object.hasOwn(main,key)||value.length>
       (key==='TRA_LOI'?1000:key==='CAN_XAC_MINH'?350:20)){
    unexpected=true;continue;
   }
   main[key]=value.trim();
  }
 }
 const references=[],seen=new Set(),duplicates=[],mismatches=[],incomplete=[];
 for(const block of blocks){
  if(!indexed.has(block.source_id))continue;
  const duplicate=seen.has(block.source_id);
  seen.add(block.source_id);
  if(duplicate)duplicates.push(block.source_id);
  const complete=!block.invalid&&block.quote.length>=12&&block.quote.length<=400;
  const matched=complete&&indexed.get(block.source_id).includes(block.quote);
  if(!complete)incomplete.push(block.source_id);
  else if(!matched)mismatches.push(block.source_id);
  references.push({
   source_id:block.source_id,
   source_text:indexed.get(block.source_id),
   model_quote:block.quote,
   literal_match:!!matched,
   status:duplicate?'duplicate':!complete?'incomplete':
     matched?'literal_quote_matched_not_semantic_proof':'source_mismatch'
  });
 }
 const enough=main.TRANG_THAI==='CO_CAN_CU';
 const shortage=main.TRANG_THAI==='KHONG_DU_CAN_CU';
 const answer=main.TRA_LOI||'';
 const verification=main.CAN_XAC_MINH||'';
 const missingFields=!enough&&!shortage||answer.length<10||verification.length<5;
 const refusalValid=shortage&&NO_EVIDENCE.test(answer)&&blocks.length===0;
 const flags=[];
 if(missingFields)flags.push('ANSWER_STRUCTURE_INCOMPLETE');
 if(enough&&references.length===0)flags.push('ANSWER_SOURCE_QUOTES_MISSING');
 if(duplicates.length)flags.push('ANSWER_SOURCE_QUOTES_DUPLICATE');
 if(incomplete.length)flags.push('ANSWER_SOURCE_QUOTES_INCOMPLETE');
 if(mismatches.length)flags.push('ANSWER_SOURCE_QUOTES_MISMATCH');
 if(unknown.size)flags.push('ANSWER_UNKNOWN_SOURCE_ID');
 if(unexpected)flags.push('ANSWER_UNSTRUCTURED_CONTENT');
 if(enough&&NO_EVIDENCE.test(answer))flags.push('ANSWER_STATUS_ANSWER_CONTRADICTION');
 if(shortage&&!refusalValid)flags.push('ANSWER_REFUSAL_INCONSISTENT');
 const supported=enough&&references.length>0&&references.every(r=>
   r.status==='literal_quote_matched_not_semantic_proof')&&flags.length===0;
 return {
  mode:'qa_matter_question_source_quotes_not_verified',
  question,answer,verification_question:verification,
  answer_state:shortage?'insufficient_source_claim_not_verified':
    enough?'proposed_answer_not_verified':'invalid_model_output',
  references,source_quote_matched_count:references.filter(r=>
    r.status==='literal_quote_matched_not_semantic_proof').length,
  reference_integrity:supported?'literal_quotes_matched_not_semantic_proof':
    refusalValid&&flags.length===0?'model_declines_no_source_not_verified':'review_required',
  duplicate_source_ids:[...new Set(duplicates)],
  mismatched_source_ids:[...new Set(mismatches)],
  incomplete_source_ids:[...new Set(incomplete)],
  unexpected_source_ids:[...unknown],flags,
  legal_verification:'not_performed',
  answer_semantics_verified:false,
  factual_completeness_verified:false,
  source_effective_date_verified:false,
  human_review_required:true,
  changes_applied_to_document:false
 };
}

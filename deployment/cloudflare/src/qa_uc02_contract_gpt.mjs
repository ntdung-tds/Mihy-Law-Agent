/** R145 UC02 source-clause contract-review QA, local fictional text only.
 * Literal quote containment is evidence of exact bytes, NOT legal accuracy,
 * factual sufficiency, a verified risk level, or current law.
 */
const ID=/^A[1-9]\d*$/u;
const HEADER=/^\s*\[(A[1-9]\d*)\]\s*$/u;
const FIELD=/^\s*(TRICH|NHAN_XET|CAN_XAC_MINH)\s*:\s*(.*)$/u;
const LIMITS={TRICH:400,NHAN_XET:500,CAN_XAC_MINH:350};

export function buildContractClauseReview(answer,sourceRows){
  if(typeof answer!=='string'||!Array.isArray(sourceRows)||
     !sourceRows.length||sourceRows.length>80||
     sourceRows.some(r=>!r||!ID.test(r.id)||typeof r.text!=='string'||
       !r.text.trim()||r.text.length>5000))throw new TypeError('Invalid contract source');
  const ids=new Set(sourceRows.map(r=>r.id));
  if(ids.size!==sourceRows.length)throw new TypeError('Repeated source ID');
  const grouped=new Map(),unknown=new Set();
  let active=null,unstructured=false;
  for(const line of answer.split(/\r?\n/u)){
    const heading=line.match(HEADER);
    if(heading){
      active={id:heading[1],fields:{},invalid:false};
      if(!ids.has(active.id)){unknown.add(active.id);continue;}
      const items=grouped.get(active.id)||[];
      items.push(active);grouped.set(active.id,items);
      continue;
    }
    if(!line.trim())continue;
    if(!active||!ids.has(active.id)){unstructured=true;continue;}
    const field=line.match(FIELD);
    if(!field||!Object.hasOwn(LIMITS,field[1])||
       Object.hasOwn(active.fields,field[1])||
       field[2].length>LIMITS[field[1]]){
      active.invalid=true;
      unstructured=true;
      continue;
    }
    active.fields[field[1]]=field[2].trim();
  }
  const missing=[],duplicates=[],mismatched=[],incomplete=[];
  const rows=sourceRows.map(source=>{
    const candidates=grouped.get(source.id)||[];
    const base={source_id:source.id,source_text:source.text,
      model_quote:'',review_note:'',verification_question:'',
      literal_source_quote_matched:false,status:'missing'};
    if(!candidates.length){missing.push(source.id);return base;}
    if(candidates.length>1){duplicates.push(source.id);
      return {...base,status:'duplicate'};}
    const candidate=candidates[0];
    const quote=candidate.fields.TRICH||'';
    const note=candidate.fields.NHAN_XET||'';
    const question=candidate.fields.CAN_XAC_MINH||'';
    const complete=!candidate.invalid&&quote.length>=12&&
      note.length>=5&&question.length>=5;
    if(!complete){incomplete.push(source.id);
      return {...base,status:'incomplete',model_quote:quote,
        review_note:note,verification_question:question};}
    const matched=source.text.includes(quote);
    if(!matched)mismatched.push(source.id);
    return {...base,status:matched?'quote_matched_not_legally_verified':'quote_mismatch',
      model_quote:quote,review_note:note,verification_question:question,
      literal_source_quote_matched:matched};
  });
  const flags=[];
  if(missing.length)flags.push('CONTRACT_CLAUSES_MISSING');
  if(duplicates.length)flags.push('CONTRACT_CLAUSES_DUPLICATE');
  if(incomplete.length)flags.push('CONTRACT_CLAUSES_INCOMPLETE');
  if(mismatched.length)flags.push('CONTRACT_QUOTES_NOT_IN_SOURCE');
  if(unstructured||unknown.size)flags.push('CONTRACT_UNSTRUCTURED_OUTPUT');
  return {
    mode:'qa_literal_quote_clause_review_not_verified',
    rows,total_segments:sourceRows.length,
    literal_quote_matched_segments:rows.filter(r=>r.literal_source_quote_matched).length,
    missing_source_ids:missing,
    duplicate_source_ids:duplicates,
    incomplete_source_ids:incomplete,
    unmatched_quote_source_ids:mismatched,
    unknown_anchor_ids:[...unknown],
    flags,
    legal_verification:'not_performed',
    semantic_claims_verified:false,
    human_review_required:true,
    changes_applied_to_document:false
  };
}

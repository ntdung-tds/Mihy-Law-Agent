/** R146 UC01: source-grounded drafting review for fictional QA only.
 * Exact quotation and numeric-token checks are conservative signals, never
 * verification of legal correctness, parties, obligations, or enforceability.
 * Nothing is persisted, approved, edited, or exported by this helper.
 */
const ID=/^A[1-9]\d*$/u;
const HEADER=/^\s*\[(A[1-9]\d*)\]\s*$/u;
const FIELD=/^\s*(CAN_CU|DU_THAO|CAN_XAC_MINH)\s*:\s*(.*)$/u;
const LIMITS={CAN_CU:400,DU_THAO:850,CAN_XAC_MINH:350};
function numericTokens(text){
  const out=new Set();
  for(const m of text.matchAll(/\d+(?:[.,]\d+)*/gu)){
    // Ignore punctuation style of decimal/thousand groups. This is NOT a
    // semantic amount/date comparison. We flag candidate surprises only.
    out.add(m[0].replace(/[.,]/gu,''));
  }
  return out;
}
export function buildDraftSourceReview(answer,sourceRows){
  if(typeof answer!=='string'||!Array.isArray(sourceRows)||
     sourceRows.length<1||sourceRows.length>80||
     sourceRows.some(r=>!r||!ID.test(r.id)||typeof r.text!=='string'||
        !r.text.trim()||r.text.length>5000))throw new TypeError('Invalid drafting source');
  const known=new Set(sourceRows.map(r=>r.id));
  if(known.size!==sourceRows.length)throw new TypeError('Duplicate source anchors');
  const blocks=new Map(),unknown=new Set();
  let current=null,unstructured=false;
  for(const line of answer.split(/\r?\n/gu)){
    const match=line.match(HEADER);
    if(match){
      current={id:match[1],fields:{},invalid:false};
      if(!known.has(current.id)){unknown.add(current.id);continue;}
      const group=blocks.get(current.id)||[];
      group.push(current);blocks.set(current.id,group);
      continue;
    }
    if(!line.trim())continue;
    if(!current||!known.has(current.id)){unstructured=true;continue;}
    const field=line.match(FIELD);
    if(!field||!Object.hasOwn(LIMITS,field[1])||
       Object.hasOwn(current.fields,field[1])||field[2].length>LIMITS[field[1]]){
      current.invalid=true;unstructured=true;continue;
    }
    current.fields[field[1]]=field[2].trim();
  }
  const missing=[],duplicate=[],incomplete=[],unmatched=[],unsupported=[];
  const rows=sourceRows.map(source=>{
    const choices=blocks.get(source.id)||[];
    const empty={source_id:source.id,source_text:source.text,
      source_quote:'',draft_clause:'',verification_question:'',
      literal_source_quote_matched:false,
      number_check:'unavailable',status:'missing'};
    if(!choices.length){missing.push(source.id);return empty;}
    if(choices.length!==1){duplicate.push(source.id);return {...empty,status:'duplicate'};}
    const c=choices[0];
    const quote=c.fields.CAN_CU||'';
    const draft=c.fields.DU_THAO||'';
    const question=c.fields.CAN_XAC_MINH||'';
    const common={...empty,source_quote:quote,draft_clause:draft,
      verification_question:question};
    if(c.invalid||quote.length<12||draft.length<12||question.length<5){
      incomplete.push(source.id);
      return {...common,status:'incomplete'};
    }
    const quoteMatched=source.text.includes(quote);
    if(!quoteMatched)unmatched.push(source.id);
    const knownNumbers=numericTokens(source.text);
    const added=[...numericTokens(draft)].some(n=>!knownNumbers.has(n));
    if(added)unsupported.push(source.id);
    return {...common,literal_source_quote_matched:quoteMatched,
      number_check:added?'draft_has_number_absent_from_source':'no_new_numeric_token_not_semantic_proof',
      status:quoteMatched?'draft_for_human_review':'unmatched_source_quote'};
  });
  const flags=[];
  if(missing.length)flags.push('DRAFT_SOURCE_MISSING');
  if(duplicate.length)flags.push('DRAFT_SOURCE_DUPLICATE');
  if(incomplete.length)flags.push('DRAFT_SOURCE_INCOMPLETE');
  if(unmatched.length)flags.push('DRAFT_SOURCE_QUOTE_MISMATCH');
  if(unsupported.length)flags.push('DRAFT_NUMBER_NOT_IN_SOURCE');
  if(unstructured||unknown.size)flags.push('DRAFT_UNSTRUCTURED_CONTENT');
  return {
    mode:'qa_source_to_proposed_clause_not_verified',
    rows,total_segments:sourceRows.length,
    matched_quote_segments:rows.filter(r=>r.literal_source_quote_matched).length,
    missing_source_ids:missing,duplicate_source_ids:duplicate,
    incomplete_source_ids:incomplete,unmatched_quote_source_ids:unmatched,
    numeric_warning_source_ids:unsupported,unknown_anchor_ids:[...unknown],
    flags,legal_verification:'not_performed',
    substantive_terms_verified:false,
    human_review_required:true,
    changes_applied_to_document:false
  };
}

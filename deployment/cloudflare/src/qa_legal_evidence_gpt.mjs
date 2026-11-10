/** R139: deterministic QA-only evidence diagnostics for the eleven source workflows.
 * No legal fact verification is inferred; no supplied source or model text is persisted.
 */
const EVIDENCE_EXPECTED=new Set(['UC01','UC02','UC04','UC05','UC06','UC08','UC09']);
const TWO_SOURCES=new Set(['UC06','UC08']);
const NUMBER_SENSITIVE=new Set(['UC03','UC07']);

/** Extract strictly bracketed anchor references; invalid IDs are rejected by
 * sourceReferencesExist before this diagnostic is returned to the caller. */
export function citedIds(answer){
  return [...new Set([...answer.matchAll(/\[([AB][1-9]\d*)\]/g)].map(m=>m[1]))];
}
function countNumbers(text){
  // Comparison is conservative: it does not claim semantic fidelity, especially
  // for spelled-out numbers or different decimal/thousands conventions.
  const map=new Map();
  const withoutCitations=text.replace(/\[[AB][1-9]\d*\]/g,'');
  for(const m of withoutCitations.matchAll(/\d+(?:[.,]\d+)*/g)){
    const digits=m[0].replace(/[.,]/g,'');
    map.set(digits,(map.get(digits)||0)+1);
  }
  return map;
}
function differenceCount(a,b){
  let n=0;
  for(const [key,count] of a)n+=Math.max(0,count-(b.get(key)||0));
  return n;
}
export function evidenceDiagnostics(uc,answer,sourceRows){
  if(typeof answer!=='string'||!Array.isArray(sourceRows))throw new TypeError('invalid evidence inputs');
  const known=new Set(sourceRows.map(r=>r.id));
  const cited=citedIds(answer).filter(id=>known.has(id));
  const flags=[];
  if(EVIDENCE_EXPECTED.has(uc)){
    if(!cited.some(id=>id.startsWith('A')))flags.push('SOURCE_A_CITATION_MISSING');
    if(TWO_SOURCES.has(uc)&&!cited.some(id=>id.startsWith('B')))
      flags.push('SOURCE_B_CITATION_MISSING');
  }
  let numberCheck='not_applicable';
  if(NUMBER_SENSITIVE.has(uc)){
    const source=sourceRows.filter(r=>r.id.startsWith('A')).map(r=>r.text).join('\n');
    const original=countNumbers(source),generated=countNumbers(answer);
    const omitted=differenceCount(original,generated),added=differenceCount(generated,original);
    numberCheck=omitted||added?'manual_numeric_comparison_required':'numeric_tokens_match_not_semantic_verification';
    if(omitted)flags.push('SOURCE_NUMBER_NOT_PRESERVED');
    if(added)flags.push('UNEXPECTED_NUMBER_IN_DRAFT');
  }
  return {
    citations:cited,
    reference_coverage:flags.some(f=>f.endsWith('CITATION_MISSING'))?
      'incomplete':'cited_ids_exist_not_fact_checked',
    number_check:numberCheck,
    flags,
    legal_verification:'not_performed',
    human_review_required:true
  };
}
export function wasModelTruncated(payload){
  const reason=payload?.finish_reason??payload?.response?.finish_reason??
    payload?.usage?.finish_reason??payload?.choices?.[0]?.finish_reason;
  return reason==='length'||reason==='max_tokens'||reason==='max_output_tokens';
}

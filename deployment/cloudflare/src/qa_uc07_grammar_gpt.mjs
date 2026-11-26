/** R144 UC07 QA: paragraph-level grammar review, never apply edits automatically.
 * This is a synthetic pasted-text review, not a Word tracked-change writer or
 * legally verified redline. Numeric comparison is literal and conservative.
 */
import {buildTranslationReview} from './qa_uc03_bilingual_gpt.mjs';

function numericTokens(text){
  return [...text.replace(/\[[AB][1-9]\d*\]/gu,'')
    .matchAll(/\d+(?:[.,]\d+)*/gu)].map(x=>x[0]).sort();
}
function sameTokens(a,b){
  return a.length===b.length&&a.every((v,i)=>v===b[i]);
}
export function buildGrammarReview(answer,sourceRows){
  const aligned=buildTranslationReview(answer,sourceRows);
  let changed=0,unchanged=0,numericRisks=0;
  const rows=aligned.rows.map(row=>{
    if(row.status!=='paired'){
      return {...row,proposed_text:'',draft_text:undefined,
        status:row.status,numeric_check:'unavailable_missing_or_duplicate'};
    }
    const originalTokens=numericTokens(row.source_text);
    const editedTokens=numericTokens(row.draft_text);
    const exactMatch=sameTokens(originalTokens,editedTokens);
    const isUnchanged=row.source_text===row.draft_text;
    if(!exactMatch)numericRisks++;
    if(isUnchanged)unchanged++;else changed++;
    return {
      source_id:row.source_id,source_text:row.source_text,
      proposed_text:row.draft_text,
      status:isUnchanged?'unchanged':'changed',
      numeric_check:exactMatch?'literal_tokens_match_not_semantic_proof':'literal_numeric_change_requires_review'
    };
  });
  const flags=[];
  if(aligned.missing_source_ids.length)flags.push('GRAMMAR_PARAGRAPHS_MISSING');
  if(aligned.duplicate_source_ids.length)flags.push('GRAMMAR_PARAGRAPHS_DUPLICATE');
  if(aligned.unstructured_prefix||aligned.unexpected_anchor_ids.length)
    flags.push('GRAMMAR_UNSTRUCTURED_CONTENT');
  if(numericRisks)flags.push('GRAMMAR_PARAGRAPH_NUMBERS_CHANGED');
  return {
    mode:'qa_source_vs_suggested_grammar_not_verified',
    rows,
    total_segments:aligned.total_segments,
    paired_segments:aligned.paired_segments,
    changed_segments:changed,
    unchanged_segments:unchanged,
    numeric_risk_segments:numericRisks,
    missing_source_ids:aligned.missing_source_ids,
    duplicate_source_ids:aligned.duplicate_source_ids,
    unexpected_anchor_ids:aligned.unexpected_anchor_ids,
    flags,
    human_review_required:true,
    legal_verification:'not_performed',
    original_formatting_preserved:false,
    changes_applied_to_document:false
  };
}

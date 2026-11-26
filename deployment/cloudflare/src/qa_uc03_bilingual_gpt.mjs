/** R142: UC03 QA translation review layout from model-labelled source anchors.
 * This matches literal anchor tokens only; it never certifies legal translation
 * quality, completeness of meaning, or Word/PDF formatting. No persistence.
 */
const ANCHOR=/^A[1-9]\d*$/u;
const HEADER=/^[ \t]*\[(A[1-9]\d*)\][ \t]*(.*)$/u;

/** Build a conservative bilingual REVIEW COPY for text-only user-pasted QA.
 * Bad/missing/duplicate alignments are warnings; they must not be passed off
 * as clean one-to-one translation pairs.
 */
export function buildTranslationReview(answer, sourceRows){
  if(typeof answer!=='string'||!Array.isArray(sourceRows)||
     sourceRows.length>80||sourceRows.length<1||
     sourceRows.some(r=>!r||!ANCHOR.test(r.id)||typeof r.text!=='string')){
    throw new TypeError('Invalid UC03 translation review input');
  }
  const known=new Set(sourceRows.map(r=>r.id));
  if(known.size!==sourceRows.length)throw new TypeError('Duplicated source IDs');
  const blocks=[];
  let current=null,unstructuredPrefix=false,unexpectedIds=new Set();
  for(const line of answer.split(/\r?\n/u)){
    const match=line.match(HEADER);
    if(match){
      if(current)blocks.push(current);
      current={id:match[1],lines:[match[2]]};
      if(!known.has(current.id))unexpectedIds.add(current.id);
    }else if(current){
      current.lines.push(line);
    }else if(line.trim()){
      unstructuredPrefix=true;
    }
  }
  if(current)blocks.push(current);
  const groups=new Map();
  for(const block of blocks){
    if(!known.has(block.id))continue;
    const existing=groups.get(block.id)||[];
    existing.push(block.lines.join('\n').trim());
    groups.set(block.id,existing);
  }
  const missing=[],duplicates=[],rows=[];
  for(const row of sourceRows){
    const matches=groups.get(row.id)||[];
    const draft=matches.length===1?matches[0]:'';
    let status='paired';
    if(matches.length>1){status='duplicate';duplicates.push(row.id);}
    else if(!draft){status='missing';missing.push(row.id);}
    rows.push({source_id:row.id,source_text:row.text,
      draft_text:status==='paired'?draft:'',status});
  }
  const flags=[];
  if(missing.length)flags.push('TRANSLATION_SEGMENTS_MISSING');
  if(duplicates.length)flags.push('TRANSLATION_SEGMENTS_DUPLICATE');
  if(unstructuredPrefix||unexpectedIds.size)flags.push('TRANSLATION_UNSTRUCTURED_CONTENT');
  return {
    mode:'qa_anchor_pairing_not_verified',
    rows,
    total_segments:sourceRows.length,
    paired_segments:rows.filter(r=>r.status==='paired').length,
    missing_source_ids:missing,
    duplicate_source_ids:duplicates,
    unstructured_prefix:unstructuredPrefix,
    unexpected_anchor_ids:[...unexpectedIds],
    flags,
    human_review_required:true,
    legal_verification:'not_performed',
    original_formatting_preserved:false
  };
}

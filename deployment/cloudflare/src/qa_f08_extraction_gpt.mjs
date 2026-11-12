/** F08 / R148: source-anchored legal data extraction review (fictional QA).
 * Literal substring matches are evidence of provenance only; this does NOT
 * verify legal identity, obligations, amounts, due dates or source authority.
 * No storage, signing, or automatic document changes.
 */
const SOURCE_ID=/^A[1-9]\d*$/u;
const HEADER=/^\s*\[(A[1-9]\d*)\]\s*$/u;
const FIELD=/^\s*(LOAI|TRICH|GIA_TRI)\s*:\s*(.*)$/u;
const ALLOWED=new Set(['CHU_THE','NGHIA_VU','SO_TIEN','THOI_HAN','KHONG_CO']);
const MAX_ITEMS=80;
const MAX_QUOTE=400,MAX_VALUE=160;

export function buildLegalDataReview(answer,sourceRows){
  if(typeof answer!=='string'||!Array.isArray(sourceRows)||
    sourceRows.length<1||sourceRows.length>80||
    sourceRows.some(x=>!x||!SOURCE_ID.test(x.id)||
      typeof x.text!=='string'||!x.text.trim()||x.text.length>5000))
    throw new TypeError('Invalid F08 source');
  const sourceIds=new Set(sourceRows.map(x=>x.id));
  if(sourceIds.size!==sourceRows.length)throw new TypeError('Duplicate F08 source ID');
  const sourceMap=new Map(sourceRows.map(x=>[x.id,x.text]));
  const parsed=[];
  const unknown=new Set();
  let current=null,unstructured=false,overflow=false;
  for(const line of answer.split(/\r?\n/gu)){
    const heading=line.match(HEADER);
    if(heading){
      if(parsed.length>=MAX_ITEMS){overflow=true;break;}
      current={source_id:heading[1],fields:{},invalid:false};
      parsed.push(current);
      if(!sourceIds.has(current.source_id))unknown.add(current.source_id);
      continue;
    }
    if(!line.trim())continue;
    if(!current||!sourceIds.has(current.source_id)){unstructured=true;continue;}
    const field=line.match(FIELD);
    if(!field||Object.hasOwn(current.fields,field[1])||
       field[2].length>(field[1]==='TRICH'?MAX_QUOTE:field[1]==='GIA_TRI'?MAX_VALUE:16)){
      current.invalid=true;unstructured=true;continue;
    }
    current.fields[field[1]]=field[2].trim();
  }
  const rows=[],seen=new Set(),duplicates=[],mismatches=[],incomplete=[];
  const covered=new Set(),noItem=new Set();
  for(const block of parsed){
    if(!sourceIds.has(block.source_id))continue;
    covered.add(block.source_id);
    const type=block.fields.LOAI||'',quote=block.fields.TRICH||'',value=block.fields.GIA_TRI||'';
    const sourceText=sourceMap.get(block.source_id);
    const key=[block.source_id,type,quote,value].join('\u0000');
    const row={source_id:block.source_id,kind:type,source_quote:quote,value,
      status:'incomplete',literal_quote_matched:false,literal_value_matched:false};
    if(seen.has(key)){duplicates.push(block.source_id);row.status='duplicate';rows.push(row);continue;}
    seen.add(key);
    if(block.invalid||!ALLOWED.has(type)){
      incomplete.push(block.source_id);rows.push(row);continue;
    }
    if(type==='KHONG_CO'){
      if(quote!=='KHONG_CO'||value!=='KHONG_CO'){
        incomplete.push(block.source_id);rows.push(row);continue;
      }
      noItem.add(block.source_id);row.status='no_item_claim_not_verified';rows.push(row);continue;
    }
    if(quote.length<8||value.length<2||quote.length>MAX_QUOTE||value.length>MAX_VALUE){
      incomplete.push(block.source_id);rows.push(row);continue;
    }
    const quoteMatch=sourceText.includes(quote);
    const valueMatch=quote.includes(value);
    row.literal_quote_matched=quoteMatch;
    row.literal_value_matched=valueMatch;
    if(!quoteMatch||!valueMatch){
      row.status='source_mismatch';mismatches.push(block.source_id);
    }else row.status='source_literal_matched_not_legally_verified';
    rows.push(row);
  }
  // A claim of no extractable data must not conceal a second claimed item.
  for(const id of noItem)if(rows.some(r=>r.source_id===id&&r.kind!=='KHONG_CO')){
    mismatches.push(id);
    for(const row of rows)if(row.source_id===id&&row.status==='no_item_claim_not_verified')
      row.status='inconsistent_no_item';
  }
  const missing=sourceRows.map(x=>x.id).filter(id=>!covered.has(id));
  const flags=[];
  if(missing.length)flags.push('EXTRACTION_SOURCE_SEGMENTS_MISSING');
  if(duplicates.length)flags.push('EXTRACTION_ITEMS_DUPLICATE');
  if(incomplete.length)flags.push('EXTRACTION_ITEMS_INCOMPLETE');
  if(mismatches.length)flags.push('EXTRACTION_SOURCE_MISMATCH');
  if(unstructured||unknown.size||overflow)flags.push('EXTRACTION_UNSTRUCTURED_OUTPUT');
  return {
    mode:'qa_literal_extraction_not_verified',rows,
    total_source_segments:sourceRows.length,
    reviewed_source_segments:covered.size,
    verified_literal_items:rows.filter(r=>r.status==='source_literal_matched_not_legally_verified').length,
    claimed_empty_source_ids:[...noItem],
    missing_source_ids:missing,
    duplicate_source_ids:[...new Set(duplicates)],
    mismatch_source_ids:[...new Set(mismatches)],
    incomplete_source_ids:[...new Set(incomplete)],
    unknown_anchor_ids:[...unknown],flags,
    human_review_required:true,
    legal_verification:'not_performed',
    extraction_completeness_verified:false,
    changes_applied_to_document:false,
    original_file_format_preserved:false
  };
}

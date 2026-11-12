import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDraftSourceReview} from '../src/qa_uc01_draft_gpt.mjs';
const SOURCE=[
 {id:'A1',text:'Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.'},
 {id:'A2',text:'Bên B thanh toán 20 triệu đồng sau khi có biên bản nghiệm thu.'}
];
function item(id,quote,draft='Bên A phải giao đủ 10 bộ hồ sơ trong thời hạn 30 ngày.',check='Cần xác nhận danh tính và chữ ký của các bên?'){
 return '['+id+']\nCAN_CU: '+quote+'\nDU_THAO: '+draft+'\nCAN_XAC_MINH: '+check;
}

test('R146 UC01 gives each source paragraph an unapproved clause draft with literal quote',()=>{
 const result=buildDraftSourceReview([
  item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.'),
  item('A2','Bên B thanh toán 20 triệu đồng sau khi có biên bản nghiệm thu.',
    'Bên B thanh toán 20 triệu đồng sau khi có biên bản nghiệm thu.')
 ].join('\n'),SOURCE);
 assert.equal(result.total_segments,2);
 assert.equal(result.matched_quote_segments,2);
 assert.deepEqual(result.flags,[]);
 assert.deepEqual(result.rows.map(r=>r.status),['draft_for_human_review','draft_for_human_review']);
 assert.deepEqual(result.numeric_warning_source_ids,[]);
 assert.equal(result.rows[1].number_check,'no_new_numeric_token_not_semantic_proof');
 assert.equal(result.substantive_terms_verified,false);
 assert.equal(result.legal_verification,'not_performed');
 assert.equal(result.human_review_required,true);
 assert.equal(result.changes_applied_to_document,false);
});
test('R146 flags numbers invented within clause even when global source contains them elsewhere',()=>{
 const output=[
  item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.',
   'Bên A giao đủ 20 bộ hồ sơ trong thời hạn 30 ngày.'),
  item('A2','Bên B thanh toán 20 triệu đồng sau khi có biên bản nghiệm thu.',
   'Bên B thanh toán 10 triệu đồng sau khi có biên bản nghiệm thu.')
 ].join('\n');
 const result=buildDraftSourceReview(output,SOURCE);
 assert.deepEqual(result.numeric_warning_source_ids,['A1','A2']);
 assert.ok(result.flags.includes('DRAFT_NUMBER_NOT_IN_SOURCE'));
 assert.ok(result.rows.every(r=>r.number_check==='draft_has_number_absent_from_source'));
 assert.equal(result.matched_quote_segments,2,'valid quote alone cannot certify proposed terms');
});
test('R146 exact quotes cannot be attached to the wrong source paragraph',()=>{
 const output=[
  item('A1','Bên B thanh toán 20 triệu đồng sau khi có biên bản nghiệm thu.'),
  item('A2','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.')
 ].join('\n');
 const result=buildDraftSourceReview(output,SOURCE);
 assert.deepEqual(result.unmatched_quote_source_ids,['A1','A2']);
 assert.ok(result.flags.includes('DRAFT_SOURCE_QUOTE_MISMATCH'));
 assert.ok(result.rows.every(r=>r.status==='unmatched_source_quote'));
});
test('R146 missing, duplicate, incomplete and unknown source labels never pass silently',()=>{
 const missing=buildDraftSourceReview(item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.'),SOURCE);
 assert.deepEqual(missing.missing_source_ids,['A2']);
 assert.equal(missing.rows[1].draft_clause,'');
 const duplicate=buildDraftSourceReview([
   item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.'),
   item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.')
 ].join('\n'),[SOURCE[0]]);
 assert.deepEqual(duplicate.duplicate_source_ids,['A1']);
 assert.equal(duplicate.rows[0].draft_clause,'');
 const incomplete=buildDraftSourceReview('[A1]\nCAN_CU: Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.\nDU_THAO: Dự thảo thiếu câu hỏi.',[SOURCE[0]]);
 assert.deepEqual(incomplete.incomplete_source_ids,['A1']);
 assert.ok(incomplete.flags.includes('DRAFT_SOURCE_INCOMPLETE'));
 const unknown=buildDraftSourceReview(
  'Không thể coi lời mở đầu là dữ kiện.\n'+
  item('A1','Bên A giao 10 bộ hồ sơ trong thời hạn 30 ngày.')+
  '\n[A8]\nDU_THAO: Tạo điều khoản không có nguồn.',[SOURCE[0]]);
 assert.deepEqual(unknown.unknown_anchor_ids,['A8']);
 assert.ok(unknown.flags.includes('DRAFT_UNSTRUCTURED_CONTENT'));
});
test('R146 refuses unsafe/duplicated source ID structures before any proposed draft result',()=>{
 for(const rows of [[],[SOURCE[0],SOURCE[0]],[{id:'A0',text:'example'}],[{id:'A1',text:''}]]){
  assert.throws(()=>buildDraftSourceReview('x',rows),TypeError);
 }
});

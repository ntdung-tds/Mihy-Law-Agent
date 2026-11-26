import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatterQuestionReview} from '../src/qa_f09_answer_gpt.mjs';

const SOURCE=[
 {id:'A1',text:'Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/09/2026.'},
 {id:'A2',text:'Điều 2. Bên B thanh toán số tiền 2.000.000 đồng sau nghiệm thu.'}
];
const QUESTION='Khi nào bên A phải bàn giao hồ sơ?';
const FACT='TRANG_THAI: CO_CAN_CU\n'+
 'TRA_LOI: Đoạn nguồn cho biết lịch bàn giao là ngày 15/09/2026.\n'+
 'CAN_XAC_MINH: Hai bên có xác nhận lịch giao bằng văn bản chưa?\n';

test('R152 F09 source quotation in exact paragraph is a literal check, never legal proof',()=>{
 const result=buildMatterQuestionReview(FACT+
  '[A1]\nTRICH: Bên A giao 10 bộ hồ sơ vào ngày 15/09/2026.',SOURCE,QUESTION);
 assert.equal(result.mode,'qa_matter_question_source_quotes_not_verified');
 assert.equal(result.answer_state,'proposed_answer_not_verified');
 assert.equal(result.reference_integrity,'literal_quotes_matched_not_semantic_proof');
 assert.equal(result.references.length,1);
 assert.equal(result.references[0].source_id,'A1');
 assert.equal(result.references[0].source_text,SOURCE[0].text);
 assert.equal(result.source_quote_matched_count,1);
 assert.deepEqual(result.flags,[]);
 assert.equal(result.answer_semantics_verified,false);
 assert.equal(result.legal_verification,'not_performed');
 assert.equal(result.source_effective_date_verified,false);
 assert.equal(result.factual_completeness_verified,false);
 assert.equal(result.human_review_required,true);
 assert.equal(result.changes_applied_to_document,false);
});

test('R152 F09 fabricated and cross-paragraph quotes are not trusted as evidence',()=>{
 const result=buildMatterQuestionReview(FACT+
  '[A1]\nTRICH: Bên B thanh toán số tiền 2.000.000 đồng sau nghiệm thu.\n'+
  '[A2]\nTRICH: Bên A sẽ giao 99 bộ hồ sơ trước ngày 15/09/2026.',SOURCE,QUESTION);
 assert.deepEqual(result.mismatched_source_ids,['A1','A2']);
 assert.ok(result.flags.includes('ANSWER_SOURCE_QUOTES_MISMATCH'));
 assert.equal(result.source_quote_matched_count,0);
 assert.equal(result.reference_integrity,'review_required');
 assert.ok(result.references.every(r=>r.literal_match===false));
});

test('R152 F09 insufficient-source response is explicit, still not proof of absence',()=>{
 const result=buildMatterQuestionReview(
  'TRANG_THAI: KHONG_DU_CAN_CU\nTRA_LOI: KHÔNG ĐỦ CĂN CỨ.\n'+
  'CAN_XAC_MINH: Cần bổ sung tài liệu hoặc hỏi luật sư phụ trách?',
  SOURCE,QUESTION);
 assert.equal(result.answer_state,'insufficient_source_claim_not_verified');
 assert.equal(result.reference_integrity,'model_declines_no_source_not_verified');
 assert.equal(result.references.length,0);
 assert.deepEqual(result.flags,[]);
 assert.equal(result.factual_completeness_verified,false);
});

test('R152 F09 refusal with invented answer or evidence is flagged',()=>{
 const result=buildMatterQuestionReview(
  'TRANG_THAI: KHONG_DU_CAN_CU\n'+
  'TRA_LOI: Không có dữ liệu nhưng hạn cuối là 30/10/2026.\n'+
  'CAN_XAC_MINH: Cần bổ sung tài liệu nào?\n'+
  '[A1]\nTRICH: Bên A giao 10 bộ hồ sơ',SOURCE,QUESTION);
 assert.ok(result.flags.includes('ANSWER_REFUSAL_INCONSISTENT'));
 assert.equal(result.reference_integrity,'review_required');
});

test('R152 F09 missing/duplicate/unknown or unstructured evidence is review-required',()=>{
 const missing=buildMatterQuestionReview(FACT,SOURCE,QUESTION);
 assert.ok(missing.flags.includes('ANSWER_SOURCE_QUOTES_MISSING'));
 assert.equal(missing.reference_integrity,'review_required');
 const dup=buildMatterQuestionReview(FACT+
  '[A1]\nTRICH: Bên A giao 10 bộ hồ sơ\n'+
  '[A1]\nTRICH: Bên A giao 10 bộ hồ sơ',SOURCE,QUESTION);
 assert.deepEqual(dup.duplicate_source_ids,['A1']);
 assert.ok(dup.flags.includes('ANSWER_SOURCE_QUOTES_DUPLICATE'));
 const bad=buildMatterQuestionReview('Bắt đầu không đúng mẫu\n'+FACT+
  '[A9]\nTRICH: Bịa nguồn không tồn tại\n'+
  '[A1]\nTRICH: quá ngắn',SOURCE,QUESTION);
 assert.deepEqual(bad.unexpected_source_ids,['A9']);
 assert.ok(bad.flags.includes('ANSWER_UNKNOWN_SOURCE_ID'));
 assert.ok(bad.flags.includes('ANSWER_SOURCE_QUOTES_INCOMPLETE'));
 assert.ok(bad.flags.includes('ANSWER_UNSTRUCTURED_CONTENT'));
});

test('R152 F09 refuses invalid source structures and invalid question lengths',()=>{
 for(const rows of [[],[SOURCE[0],SOURCE[0]],[{id:'B1',text:'fake'}],[{id:'A1',text:''}]]){
  assert.throws(()=>buildMatterQuestionReview(FACT,rows,QUESTION),TypeError);
 }
 assert.throws(()=>buildMatterQuestionReview(FACT,SOURCE,'a'),TypeError);
 assert.throws(()=>buildMatterQuestionReview(FACT,SOURCE,'x'.repeat(601)),TypeError);
});

test('R153 F09 contradictory positive status with explicit no-evidence answer must be review-required',()=>{
 const result=buildMatterQuestionReview(
  'TRANG_THAI: CO_CAN_CU\nTRA_LOI: KHÔNG ĐỦ CĂN CỨ.\n'+
  'CAN_XAC_MINH: Cần xác minh tài liệu gốc nào?\n'+
  '[A1]\nTRICH: Bên A giao 10 bộ hồ sơ vào ngày 15/09/2026.',SOURCE,QUESTION);
 assert.ok(result.flags.includes('ANSWER_STATUS_ANSWER_CONTRADICTION'));
 assert.equal(result.reference_integrity,'review_required');
});

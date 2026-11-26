import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGrammarReview} from '../src/qa_uc07_grammar_gpt.mjs';

const SOURCE=[
  {id:'A1',text:'Điều 1. Bên A giao 10 bộ vào ngày 15/9/2026.'},
  {id:'A2',text:'Điều 2. Bên B trả 20 triệu trong vòng 30 ngày.'}
];

test('R144 UC07 supports changed and unchanged grammar paragraphs with explicit human review',()=>{
  const answer=[
    '[A1] Điều 1. Bên A giao 10 bộ tài liệu vào ngày 15/9/2026.',
    '[A2] Điều 2. Bên B trả 20 triệu trong vòng 30 ngày.'
  ].join('\n');
  const result=buildGrammarReview(answer,SOURCE);
  assert.equal(result.total_segments,2);
  assert.equal(result.paired_segments,2);
  assert.equal(result.changed_segments,1);
  assert.equal(result.unchanged_segments,1);
  assert.equal(result.numeric_risk_segments,0);
  assert.deepEqual(result.flags,[]);
  assert.deepEqual(result.rows.map(r=>r.status),['changed','unchanged']);
  assert.equal(result.rows[0].numeric_check,'literal_tokens_match_not_semantic_proof');
  assert.equal(result.changes_applied_to_document,false);
  assert.equal(result.original_formatting_preserved,false);
  assert.equal(result.legal_verification,'not_performed');
  assert.equal(result.human_review_required,true);
});

test('R144 UC07 detects swapped numbers across paragraphs even when global counts match',()=>{
  const revised=[
    '[A1] Điều 1. Bên A giao 20 bộ vào ngày 15/9/2026.',
    '[A2] Điều 2. Bên B trả 10 triệu trong vòng 30 ngày.'
  ].join('\n');
  const result=buildGrammarReview(revised,SOURCE);
  assert.equal(result.numeric_risk_segments,2);
  assert.ok(result.flags.includes('GRAMMAR_PARAGRAPH_NUMBERS_CHANGED'));
  assert.ok(result.rows.every(r=>r.numeric_check==='literal_numeric_change_requires_review'));
  // Source numbers may be shown ONLY as human-review source text, never as a
  // separate assertion that semantic legal integrity has been verified.
  assert.equal(result.legal_verification,'not_performed');
});

test('R144 UC07 refuses silently pairing missing/duplicate paragraphs or unknown labelling',()=>{
  const missing=buildGrammarReview('[A1] Sửa đoạn nguồn đầu.',SOURCE);
  assert.deepEqual(missing.missing_source_ids,['A2']);
  assert.equal(missing.rows[1].status,'missing');
  assert.equal(missing.rows[1].proposed_text,'');
  assert.ok(missing.flags.includes('GRAMMAR_PARAGRAPHS_MISSING'));
  const duplicate=buildGrammarReview(
    '[A1] Bản sửa thứ nhất\n[A1] Bản sửa thứ hai\n[A2] Đoạn giữ nguyên.',SOURCE);
  assert.deepEqual(duplicate.duplicate_source_ids,['A1']);
  assert.equal(duplicate.rows[0].status,'duplicate');
  assert.equal(duplicate.rows[0].proposed_text,'');
  assert.ok(duplicate.flags.includes('GRAMMAR_PARAGRAPHS_DUPLICATE'));
  const unstructured=buildGrammarReview('Lời giới thiệu không được gắn mã.\n[A1] Gợi ý.',SOURCE);
  assert.ok(unstructured.flags.includes('GRAMMAR_UNSTRUCTURED_CONTENT'));
  assert.equal(unstructured.paired_segments,1);
});

test('R144 UC07 rejects invalid or ambiguous source identifiers before result generation',()=>{
  for(const source of [[],[{id:'A0',text:'a'}],[SOURCE[0],SOURCE[0]]]){
    assert.throws(()=>buildGrammarReview('[A1] Nguyên vẹn.',source),TypeError);
  }
});

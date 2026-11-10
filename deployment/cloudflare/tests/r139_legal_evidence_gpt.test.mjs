import test from 'node:test';
import assert from 'node:assert/strict';
import {citedIds,evidenceDiagnostics,wasModelTruncated} from '../src/qa_legal_evidence_gpt.mjs';

const A={id:'A1',text:'Điều 1. Bên A giao 10 bộ vào ngày 15 tháng 9 năm 2026.'};
const B={id:'B1',text:'Điều 1. Bên A giao 12 bộ vào ngày 30 tháng 9 năm 2026.'};

test('R139 citation diagnostics cover all seven source-reasoning UC without pretending legal verification',()=>{
  for(const uc of ['UC01','UC02','UC04','UC05','UC09']){
    const missing=evidenceDiagnostics(uc,'Đề xuất cần thẩm định.',[A]);
    assert.deepEqual(missing.flags,['SOURCE_A_CITATION_MISSING']);
    assert.equal(missing.reference_coverage,'incomplete');
    const cited=evidenceDiagnostics(uc,'Đề xuất chỉ dựa trên [A1].',[A]);
    assert.deepEqual(cited.flags,[]);
    assert.equal(cited.reference_coverage,'anchor_ids_matched_not_fact_checked');
    assert.deepEqual(cited.citations,['A1']);
    assert.equal(cited.legal_verification,'not_performed');
    assert.equal(cited.human_review_required,true);
  }
  for(const uc of ['UC06','UC08']){
    assert.deepEqual(
      evidenceDiagnostics(uc,'Chỉ theo [A1].',[A,B]).flags,
      ['SOURCE_B_CITATION_MISSING']);
    assert.deepEqual(
      evidenceDiagnostics(uc,'Đối chiếu [A1] với [B1].',[A,B]).flags,[]);
  }
});
test('R139 UC03/07 numeric quality flags are advisory and contain no source numbers',()=>{
  for(const uc of ['UC03','UC07']){
    const exact=evidenceDiagnostics(uc,'Article 1. Party A shall hand over 10 items on 15/9/2026.',[A]);
    assert.equal(exact.number_check,'numeric_tokens_match_not_semantic_verification');
    assert.deepEqual(exact.flags,[]);
    const bad=evidenceDiagnostics(uc,'Article 1. The buyer shall hand over 12 items on 15/9/2026.',[A]);
    assert.equal(bad.number_check,'manual_numeric_comparison_required');
    assert.ok(bad.flags.includes('SOURCE_NUMBER_NOT_PRESERVED'));
    assert.ok(bad.flags.includes('UNEXPECTED_NUMBER_IN_DRAFT'));
    assert.equal(JSON.stringify(bad).includes('2026'),false,
      'diagnostics must never echo legal text or source numeric values');
    assert.equal(bad.reference_coverage,'not_required_for_transform');
  }
});
test('R139 citations de-duplicate and only accept known citation format',()=>{
  assert.deepEqual(citedIds('Theo [A1] rồi [A1] và [B1].'),['A1','B1']);
  const refs=evidenceDiagnostics('UC04','Theo [A1].',[A]);
  assert.deepEqual(refs.citations,['A1']);
});
test('R139 refuses provider truncated output rather than presenting partial legal results',()=>{
  for(const reason of ['length','max_tokens','max_output_tokens']){
    assert.equal(wasModelTruncated({response:'Partial',finish_reason:reason}),true);
    assert.equal(wasModelTruncated({response:{finish_reason:reason}}),true);
    assert.equal(wasModelTruncated({usage:{finish_reason:reason}}),true);
    assert.equal(wasModelTruncated({choices:[{finish_reason:reason}]}),true);
  }
  assert.equal(wasModelTruncated({response:'Complete text'}),false);
  assert.equal(wasModelTruncated({choices:[{finish_reason:'stop'}]}),false);
});

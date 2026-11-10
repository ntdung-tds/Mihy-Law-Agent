import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTranslationReview} from '../src/qa_uc03_bilingual_gpt.mjs';

const SOURCE=[
 {id:'A1',text:'Điều 1. Bên A bàn giao 10 bộ tài liệu.'},
 {id:'A2',text:'Điều 2. Bên B thanh toán trong vòng 30 ngày.'}
];

test('R142 UC03 links each source paragraph to its labelled translation, no legal certification',()=>{
 const output='[A1] Article 1. Party A delivers 10 documents.\n[A2] Article 2. Party B pays within 30 days.';
 const review=buildTranslationReview(output,SOURCE);
 assert.equal(review.total_segments,2);
 assert.equal(review.paired_segments,2);
 assert.deepEqual(review.missing_source_ids,[]);
 assert.deepEqual(review.duplicate_source_ids,[]);
 assert.deepEqual(review.flags,[]);
 assert.deepEqual(review.rows.map(r=>r.status),['paired','paired']);
 assert.equal(review.rows[0].source_text,SOURCE[0].text);
 assert.match(review.rows[0].draft_text,/Party A delivers 10/);
 assert.equal(review.original_formatting_preserved,false);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(review.human_review_required,true);
});

test('R142 missing and duplicated paragraph anchors are not silently paired',()=>{
 const missing=buildTranslationReview('[A1] Only the first clause translated.',SOURCE);
 assert.equal(missing.paired_segments,1);
 assert.deepEqual(missing.missing_source_ids,['A2']);
 assert.deepEqual(missing.flags,['TRANSLATION_SEGMENTS_MISSING']);
 assert.equal(missing.rows[1].draft_text,'');
 const duplicated=buildTranslationReview(
  '[A1] First wording\n[A1] Conflicting version\n[A2] Other clause',SOURCE);
 assert.equal(duplicated.paired_segments,1);
 assert.deepEqual(duplicated.duplicate_source_ids,['A1']);
 assert.equal(duplicated.rows[0].draft_text,'','ambiguous translation must not be selected');
 assert.ok(duplicated.flags.includes('TRANSLATION_SEGMENTS_DUPLICATE'));
});

test('R142 unstructured preamble and unknown anchor cannot receive complete QA review status',()=>{
 const review=buildTranslationReview(
  'This introduction is not a labelled translation.\n[A1] Valid.\n[A2] Valid.\n[A9] Unknown.',SOURCE);
 assert.equal(review.unstructured_prefix,true);
 assert.deepEqual(review.unexpected_anchor_ids,['A9']);
 assert.ok(review.flags.includes('TRANSLATION_UNSTRUCTURED_CONTENT'));
 assert.equal(review.paired_segments,2);
 const completelyUnpaired=buildTranslationReview(
  'Article 1 translated without any source label.',SOURCE);
 assert.equal(completelyUnpaired.paired_segments,0);
 assert.deepEqual(completelyUnpaired.missing_source_ids,['A1','A2']);
 assert.ok(completelyUnpaired.flags.includes('TRANSLATION_UNSTRUCTURED_CONTENT'));
});

test('R142 rejects untrusted source ID structures instead of implying correspondence',()=>{
 assert.throws(()=>buildTranslationReview('x',[]),TypeError);
 assert.throws(()=>buildTranslationReview('x',[{id:'A0',text:'abc'}]),TypeError);
 assert.throws(()=>buildTranslationReview('x',[SOURCE[0],SOURCE[0]]),TypeError);
 assert.throws(()=>buildTranslationReview('x',[{id:'A1',text:null}]),TypeError);
});

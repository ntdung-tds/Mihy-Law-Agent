import test from 'node:test';
import assert from 'node:assert/strict';
import {nextReviewState,REVIEW_STATES} from '../src/f21_review_state_gpt.mjs';
test('explicit three-state contract',()=>{
 assert.deepEqual(REVIEW_STATES,['draft','pending_review','approved']);
 assert.deepEqual(nextReviewState({from:'draft',to:'pending_review',version:1}),{
  expectedStatus:'draft',nextStatus:'pending_review',expectedVersion:1,nextVersion:2});
 assert.deepEqual(nextReviewState({from:'pending_review',to:'approved',version:2,authorId:'a',reviewerId:'b'}),{
  expectedStatus:'pending_review',nextStatus:'approved',expectedVersion:2,nextVersion:3});
});
test('reject direct draft approval, backwards transitions and repeat approval',()=>{
 for(const [from,to] of [['draft','approved'],['pending_review','draft'],['approved','approved'],['approved','draft']])
  assert.equal(nextReviewState({from,to,version:2,authorId:'a',reviewerId:'b'}),null);
});
test('reject self-approval and invalid versions',()=>{
 assert.equal(nextReviewState({from:'pending_review',to:'approved',version:2,authorId:'a',reviewerId:'a'}),null);
 for(const version of [0,-1,1.5,Number.MAX_SAFE_INTEGER,NaN])
  assert.equal(nextReviewState({from:'draft',to:'pending_review',version}),null);
});

test('R202: reviewer identity must be canonical and free of control characters',()=>{
 for(const reviewerId of [' a','a ','a\n','a\u200b','a\u202e','a\u007f','', 'x'.repeat(129)])
  assert.equal(nextReviewState({from:'pending_review',to:'approved',version:2,authorId:'a',reviewerId}),null);
 for(const authorId of [' a','a ','a\n','a\u200b','a\u202e','a\u007f','', 'x'.repeat(129)])
  assert.equal(nextReviewState({from:'pending_review',to:'approved',version:2,authorId,reviewerId:'b'}),null);
 assert.equal(nextReviewState({from:'pending_review',to:'approved',version:2,authorId:'a',reviewerId:'b'})?.nextStatus,'approved');
});
test('R202: draft submission cannot smuggle an approval reviewer',()=>{
 assert.equal(nextReviewState({from:'draft',to:'pending_review',version:1,reviewerId:'b'}),null);
 assert.equal(nextReviewState({from:'draft',to:'pending_review',version:1,reviewerId:null})?.nextStatus,'pending_review');
});

test('R208: lifecycle rejects Unicode-equivalent self approval before persistence',()=>{
 const composed='reviewer-\u00e9';
 const decomposed='reviewer-e\u0301';
 const transition=(authorId,reviewerId)=>nextReviewState({from:'pending_review',to:'approved',version:2,authorId,reviewerId});
 assert.equal(transition(composed,decomposed),null);
 assert.equal(transition(decomposed,composed),null);
 assert.equal(transition('author-a',decomposed),null);
 assert.equal(transition(composed,'reviewer-b')?.nextStatus,'approved');
});

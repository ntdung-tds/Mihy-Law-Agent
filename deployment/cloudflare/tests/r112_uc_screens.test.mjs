import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('web/r0-preview/index.html','utf8');
const app=readFileSync('web/r0-preview/app.js','utf8');
const legal=readFileSync('web/r0-preview/legal.js','utf8');
const css=readFileSync('web/r0-preview/styles.css','utf8');
const ids=Array.from({length:11},(_,i)=>'UC'+String(i+1).padStart(2,'0'));

test('R112: 11 menu actions navigate to distinct task routes, never the shared assistant view',()=>{
 for(const uc of ids){
  assert.match(html,new RegExp('data-feature-jump="'+uc+'"'));
  assert.match(html,new RegExp('data-feature="'+uc+'"'));
 }
 assert.match(app,/goto\('uc-'\s*\+/);
 assert.match(app,/hashchange/);
 assert.match(app,/workflow-open/);
 assert.doesNotMatch(app,/goto\('overview'\); closeFunctionDrawer\(false\);[\s\S]{0,140}scrollIntoView/);
});
test('R112: the QA form belongs to exactly one isolated workflow screen with a dedicated heading',()=>{
 assert.equal((html.match(/id="legal-qa-form"/g)||[]).length,1);
 assert.match(html,/id="view-workflow"[^>]*data-panel="workflow"/);
 const assistant=html.indexOf('id="view-assistant"');
 const workflow=html.indexOf('id="view-workflow"');
 const research=html.indexOf('id="view-research"');
 const form=html.indexOf('id="legal-qa-form"');
 assert.ok(assistant>=0&&workflow>assistant&&research>workflow&&form>workflow&&form<research);
 assert.match(html,/id="workflow-title"/);
 assert.match(html,/id="workflow-stage"/);
 assert.match(html,/id="workflow-back"/);
 assert.match(css,/view-workflow/);
});
test('R112: deep links, safe switching, and task-specific fields do not reuse prior results or input',()=>{
 assert.match(app,/uc-UC/);
 assert.match(legal,/ai-law:workflow-open/);
 assert.match(legal,/clearResult\(\)/);
 assert.match(legal,/legal-qa-consent/);
 assert.match(legal,/legal-qa-source/);
 assert.match(legal,/legal-qa-source-b/);
});

/** R147: strict source-derived target catalog regression only.
 * This does NOT prove any of the 36 business features are implemented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const p=new URL('../../../pcs/mihy_scope_gpt_v1.json',import.meta.url);
const catalog=JSON.parse(readFileSync(p,'utf8'));
const rows=catalog.features;

test('R147 Owner scope has all F01-F36 once and preserves source priority totals',()=>{
  assert.equal(catalog.version,1);
  assert.equal(catalog.source_document,'mihy_chucnang_gpt_v1.docx');
  assert.equal(catalog.owner_directive,'Làm đủ nhé, trừ ký số');
  assert.equal(rows.length,36);
  assert.deepEqual(rows.map(x=>x.id),
    Array.from({length:36},(_,i)=>'F'+String(i+1).padStart(2,'0')));
  assert.equal(new Set(rows.map(x=>x.id)).size,36);
  assert.deepEqual(catalog.counts,{total:36,P0:18,P1:16,P2:2});
  const tally=rows.reduce((out,x)=>(out[x.priority]++,out),{P0:0,P1:0,P2:0});
  assert.deepEqual(tally,{P0:18,P1:16,P2:2});
});

test('R147 preserve 7 source groups and AI/support 21 vs operations 15',()=>{
  assert.deepEqual(Object.keys(catalog.groups),['A','B','C','D','E','F','G']);
  const count=Object.fromEntries(Object.keys(catalog.groups).map(g=>
    [g,rows.filter(x=>x.group===g).length]));
  assert.deepEqual(count,{A:6,B:6,C:5,D:5,E:5,F:4,G:5});
  assert.equal(count.A+count.B+count.C+count.F,21);
  assert.equal(count.D+count.E+count.G,15);
});

test('R147 do not silently remove F31 other integrations when excluding signing',()=>{
  const f=rows.find(x=>x.id==='F31');
  assert.equal(f.name,'Tích hợp hệ sinh thái');
  assert.equal(f.priority,'P1');
  assert.equal(f.individual,'Có');
  assert.equal(f.office,'Có');
  assert.equal(catalog.scope_policy.all_36_function_ids_remain_in_scope,true);
  assert.deepEqual(catalog.scope_policy.F31.included,
    ['Email','Lịch','Word','Lưu trữ','API ngoài']);
  assert.ok(catalog.scope_policy.F31.excluded.includes('Ký số'));
  assert.ok(catalog.scope_policy.F31.excluded.includes('Ký điện tử'));
  assert.ok(catalog.scope_policy.F31.excluded.includes('Luồng ký'));
  for(const item of catalog.scope_policy.F31.included){
    assert.ok(!/ký|chữ ký|signature|certificate/i.test(item));
  }
});

test('R147 retain individual vs office differences and do not invent office roles',()=>{
  const byId=new Map(rows.map(x=>[x.id,x]));
  assert.deepEqual([byId.get('F23').individual,byId.get('F23').office],['—','Có']);
  assert.deepEqual([byId.get('F21').individual,byId.get('F21').office],['Cơ bản','Đầy đủ']);
  assert.deepEqual([byId.get('F26').individual,byId.get('F26').office],['Cơ bản','Đầy đủ']);
  assert.deepEqual([byId.get('F27').individual,byId.get('F27').office],['Cơ bản','Đầy đủ']);
  assert.deepEqual([byId.get('F29').individual,byId.get('F29').office],['Cá nhân','Theo quyền']);
  for(const row of rows){
    assert.ok(typeof row.name==='string'&&row.name.length>=5);
    assert.ok(typeof row.description==='string'&&row.description.length>=8);
    assert.ok(['P0','P1','P2'].includes(row.priority));
  }
});

test('R147 do not falsely mark all features delivered from eleven source-only QA UCs',()=>{
  assert.equal(catalog.srs_baseline,
    'v1.1.15 unchanged until individual trace and requirement decomposition');
  for(const row of rows){
    assert.equal(row.verification,'NOT_RUN');
    assert.equal(row.acceptance,'OWNER_PENDING');
    assert.equal(row.srs_trace,'PENDING_DECOMPOSITION');
    assert.equal(row.implementation,'NOT_ASSESSED');
  }
});

test('R147 ensure owner privacy and review/approval gates survive broader scope',()=>{
  assert.match(catalog.scope_policy.security,/System Admin cannot read, search, view, modify, delete or export customer business data/);
  assert.match(catalog.scope_policy.release_gate,/Lawyer approval before AI content is released/);
  assert.match(catalog.scope_policy.release_gate,/Owner final acceptance/);
  assert.match(catalog.scope_policy.conflict_with_prior_paused_storage,/NOT_RUN\/BLOCKED/);
  assert.equal(catalog.priority_order.join(','),'P0,P1,P2');
});

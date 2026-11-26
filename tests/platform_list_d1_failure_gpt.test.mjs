import test from 'node:test';
import assert from 'node:assert/strict';
import {listPlatformPlans, listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const admin={id:'system-qa',kind:'system_admin',verified:true};
const db=(result)=>({prepare(sql){return {async all(){return result;}}},batch:async()=>[]});

for (const [label, fn] of [['plans',listPlatformPlans],['tenant services',listTenantServices]]) {
  test(label+' rejects D1 success:false even when results is empty',async()=>{
    await assert.rejects(fn(db({success:false,results:[]}),admin),/PLATFORM_INVALID_RESULT/);
  });
  test(label+' rejects D1 missing success even when results is empty',async()=>{
    await assert.rejects(fn(db({results:[]}),admin),/PLATFORM_INVALID_RESULT/);
  });
  test(label+' accepts explicit successful empty D1 result',async()=>{
    assert.deepEqual(await fn(db({success:true,results:[]}),admin),[]);
  });
}

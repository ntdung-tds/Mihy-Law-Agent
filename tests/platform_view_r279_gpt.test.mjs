import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPlatformAdmin} from '../deployment/cloudflare/platform_admin_view_gpt.mjs';
class FakeElement {
  constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.listeners={};this.textContent='';this.value='';this.disabled=false;}
  append(...xs){this.children.push(...xs);}
  replaceChildren(...xs){this.children=[...xs];}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
}
function setup(fetchImpl,confirm=()=>true){
  const doc={defaultView:{confirm},createElement(tag){return new FakeElement(tag,doc);}};
  const root=new FakeElement('root',doc);
  return {root,doc,view:mountPlatformAdmin(root,{fetchImpl,csrfToken:'qa',documentImpl:doc})};
}
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const plans={items:[{plan_id:'basic',plan_name:'Basic',status:'active',max_users:2,max_storage_bytes:100}]};
const services={items:[{tenant_id:'t1',plan_id:'basic',service_status:'active',license_expires_at:null}]};
const walk=(el,acc=[])=>{acc.push(el);for(const x of el.children||[])walk(x,acc);return acc;};
test('R279 renders metadata using textContent, no innerHTML or tenant business data',async()=>{
 const {root,view}=setup(async path=>json(path.endsWith('/plans')?plans:services));
 await view.refresh(true);
 const all=walk(root);
 assert.ok(all.some(x=>x.textContent==='Tenant: t1'));
 assert.ok(all.some(x=>x.textContent==='Gói dịch vụ'));
 assert.ok(all.some(x=>x.textContent==='Cập nhật trạng thái'));
 assert.ok(all.every(x=>!Object.hasOwn(x,'innerHTML')));
 view.dispose();assert.equal(root.children.length,0);
});
test('R279 failed GET removes stale cards and displays generic error',async()=>{
 let fail=false;
 const {root,view}=setup(async path=>fail?new Response('private matter',{status:403}):json(path.endsWith('/plans')?plans:services));
 await view.refresh(true);fail=true;await view.refresh(true);
 const all=walk(root);
 assert.ok(all.some(x=>x.textContent==='Không tải được metadata. Kiểm tra phiên quản trị hoặc thử lại.'));
 assert.ok(!all.some(x=>String(x.textContent).includes('private matter')));
 assert.ok(!all.some(x=>x.textContent==='Tenant: t1'));
});
test('R279 invalid reason prevents PATCH; successful update uses approved fields',async()=>{
 let patches=0;
 const {root,view}=setup(async(path,init)=>{
   if(init.method==='PATCH'){patches++;assert.deepEqual(JSON.parse(init.body),{tenantId:'t1',status:'suspended',reasonCode:'ADMIN_REQUEST'});return json({changed:true,tenantId:'t1',status:'suspended'});}
   return json(path.endsWith('/plans')?plans:services);
 });
 await view.refresh(true);
 let all=walk(root),button=all.find(x=>x.textContent==='Cập nhật trạng thái');
 await button.listeners.click();assert.equal(patches,0);
 all=walk(root);all.find(x=>x.tag==='input').value='ADMIN_REQUEST';
 all.find(x=>x.tag==='select').value='suspended';
 await button.listeners.click();assert.equal(patches,1);
});
test('R279 revoked status requires confirmation before PATCH',async()=>{
 let patches=0;
 const {root,view}=setup(async(path,init)=>{
   if(init.method==='PATCH'){patches++;return json({changed:true,tenantId:'t1',status:'revoked'});}
   return json(path.endsWith('/plans')?plans:services);
 },()=>false);
 await view.refresh(true);
 const all=walk(root);all.find(x=>x.tag==='input').value='ADMIN_REQUEST';
 all.find(x=>x.tag==='select').value='revoked';
 await all.find(x=>x.textContent==='Cập nhật trạng thái').listeners.click();
 assert.equal(patches,0);
});

test('R280 empty reason input is rejected without network mutation',async()=>{
 let patches=0;
 const {root,view}=setup(async(path,init)=>{if(init?.method==='PATCH') patches++;return json(path.endsWith('/plans')?plans:services);});
 await view.refresh(true);
 const all=walk(root);
 assert.equal(all.find(x=>x.tag==='input').value,'');
 await all.find(x=>x.textContent==='Cập nhật trạng thái').listeners.click();
 assert.equal(patches,0);
 assert.ok(walk(root).some(x=>x.textContent==='Mã lý do không hợp lệ.'));
 view.dispose();
});

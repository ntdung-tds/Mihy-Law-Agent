import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const session=readFileSync('web/r0-preview/session.js','utf8');
const matters=readFileSync('web/r0-preview/matters.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function node(){
  return {textContent:'',value:'',hidden:false,disabled:false,offsetParent:{},
    style:{},classList:{add(){},remove(){}},children:[],events:{},
    addEventListener(name,cb){this.events[name]=cb;},
    setAttribute(){},focus(){},scrollIntoView(){},reset(){},
    querySelectorAll(){return [];},
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=items;}
  };
}
function elements(){
  const map=new Map();
  return {get(selector){
    if(!map.has(selector))map.set(selector,node());
    return map.get(selector);
  },createElement(){return node();}};
}
test('R60: active role label is accurate and unrecognized roles never appear as lawyer',async()=>{
  for(const [role,kind,expected] of [
    ['tenant_admin','organization','Tổ chức · Quản trị đơn vị · QA'],
    ['lawyer','personal','Cá nhân · Luật sư · QA'],
    ['unexpected','unexpected','Loại không gian chưa xác định · Vai trò chưa xác định · QA'],
    ['constructor','toString','Loại không gian chưa xác định · Vai trò chưa xác định · QA']
  ]){
    const dom=elements(),navigations=[];
    runInNewContext(session,{
      document:{querySelector:dom.get},
      location:{replace:path=>navigations.push(path)},
      fetch:async()=>({status:200,ok:true,json:async()=>({email:'synthetic@example.invalid',role,workspace_type:kind})})
    });
    await flush();
    assert.equal(dom.get('#profile-identity').textContent,'synthetic@example.invalid');
    assert.equal(dom.get('#profile-role').textContent,expected);
    assert.deepEqual(navigations,[]);
  }
});
test('R60: expired session redirects to public login, without showing authorized profile',async()=>{
  const dom=elements(),navigations=[];
  runInNewContext(session,{
    document:{querySelector:dom.get},
    location:{hash:'#documents',replace:path=>navigations.push(path)},
    fetch:async()=>({status:401,ok:false})
  });
  await flush();
  assert.deepEqual(navigations,['/login']);
  assert.equal(dom.get('#profile-identity').textContent,'');
});
function mountMatters(){
  const dom=elements(),events={},navigations=[],requests=[];
  // R117: emulate the HTMLFormElement and file input that are present in
  // Chromium, preserving R60 session-revocation tests with one unified form.
  dom.get('#matter-form').elements={namedItem:name=>dom.get('[name="'+name+'"]')};
  dom.get('#case-r2-file').files=[];
  let authenticated=true;
  const fetch=async(path,options={})=>{
    requests.push({path,method:options.method||'GET'});
    if(!authenticated)return {status:401,ok:false};
    if(options.method==='POST')return {status:201,ok:true,json:async()=>({id:'f0000000-0000-4000-8000-000000000001'})};
    return {status:200,ok:true,json:async()=>({matters:[{
      id:'f0000000-0000-4000-8000-000000000001',title:'Only synthetic matter',
      created_at:1800000000
    }]})};
  };
  runInNewContext(matters,{
    document:{querySelector:dom.get,querySelectorAll:()=>[],createElement:()=>node(),createElementNS:()=>node()},
    window:{addEventListener:(event,cb)=>{events[event]=cb;}},
    location:{replace:path=>navigations.push(path),hash:''},
    fetch
  });
  return {dom,events,navigations,requests,revoke(){authenticated=false}};
}
test('R60: revoked session clears already rendered matter titles, stats and recent items on refresh',async()=>{
  const app=mountMatters();
  await flush();
  assert.equal(app.dom.get('#matter-list').children.length,1);
  assert.equal(app.dom.get('#recent-documents').children.length,1);
  app.revoke();
  app.events['ai-law:documents-open']();
  await flush();
  assert.equal(app.dom.get('#matter-list').children.length,0);
  assert.equal(app.dom.get('#recent-documents').children.length,0);
  for(const key of ['#matter-total','#nav-matter-count','#dashboard-matter-count'])
    assert.equal(app.dom.get(key).textContent,'0',key);
  assert.deepEqual(app.navigations,['/login']);
});
test('R60: revoked session on POST also clears previous matter view',async()=>{
  const app=mountMatters();
  await flush();
  app.dom.get('#matter-title').value='New synthetic QA matter';
  app.revoke();
  await app.dom.get('#matter-form').events.submit({preventDefault(){}});
  assert.equal(app.dom.get('#matter-list').children.length,0);
  assert.equal(app.dom.get('#recent-documents').children.length,0);
  assert.deepEqual(app.navigations,['/login']);
  assert.equal(app.requests.at(-1).method,'POST');
});

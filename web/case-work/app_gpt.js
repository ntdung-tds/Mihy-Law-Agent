(()=>{'use strict';
const root=document.querySelector('#content'),feedback=document.querySelector('#feedback'),heading=document.querySelector('#heading'),back=document.querySelector('#back-case');
const cal=location.pathname==='/calendar',id=location.pathname.split('/').pop(),base='/api/qa/case-work/'+encodeURIComponent(id);
let generation=0,dead=false,busy=false,model=null;
const node=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;};
const say=t=>{feedback.textContent=t;};
const api=(path,opts={})=>fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',...opts});
const labels={client:'Khách hàng',counterparty:'Bên đối lập',other:'Bên liên quan',task:'Công việc',meeting:'Lịch hẹn',hearing:'Phiên tòa',deadline:'Thời hạn',interaction:'Trao đổi',case_deadline:'Hạn hồ sơ',open:'Đang mở',done:'Hoàn tất',cancelled:'Đã hủy',active:'Đang dùng',archived:'Đã lưu trữ',overdue:'Quá hạn',today:'Hôm nay',upcoming:'Sắp tới'};
const label=x=>labels[x]||x;
function scrub(){dead=true;generation++;model=null;root.replaceChildren();}
window.addEventListener('pagehide',scrub);window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
function control(form,key,title,value,opts={}){const l=node('label',title),i=node(opts.options?'select':'input');i.name=key;if(opts.options){for(const [v,t] of opts.options){const o=node('option',t);o.value=v;i.append(o);}}else{i.type=opts.type||'text';if(opts.max)i.maxLength=opts.max;}i.required=!!opts.required;i.value=value??'';l.append(i);form.append(l);return i;}
const choices=xs=>xs.map(x=>[x,label(x)]);
function addButton(text,fn){const b=node('button',text);b.type='button';b.addEventListener('click',fn);return b;}
function section(title){const s=node('section');s.append(node('h2',title));root.append(s);return s;}
function renderCalendar(m){heading.textContent='Lịch công việc';const s=section('Lịch theo thời hạn · '+m.today);for(const state of ['overdue','today','upcoming']){s.append(node('h3',label(state)));const rows=m.items.filter(x=>x.due_state===state);if(!rows.length)s.append(node('p','Không có mục.'));for(const x of rows){const d=node('div');d.className='event';const a=node('a',x.matter_title);a.href='/case-work/'+encodeURIComponent(x.matter_id);d.append(node('strong',label(x.kind)+' · '+x.title),node('p',x.due_date+(x.due_time?' '+x.due_time:'')),a);s.append(d);}}if(m.truncated)s.append(node('p','Đang hiển thị 100 mục đầu. Danh sách còn dữ liệu.'));s.append(addButton('Làm mới',()=>void load()));}
function renderCase(m){
 heading.textContent=m.matter_title;back.href='/case-detail/'+encodeURIComponent(id);back.hidden=false;
 for(const [kind,title] of [['contacts','Khách hàng và bên liên quan'],['activities','Lịch, công việc và trao đổi']]){
  const s=section(title);if(m.can_write)s.append(addButton(kind==='contacts'?'Thêm liên hệ':'Tạo công việc / lịch hẹn',()=>edit(s,kind,null)));
  const rows=m[kind];if(!rows.length)s.append(node('p','Chưa có dữ liệu.'));
  for(const x of rows){const row=node('div');row.className='event';row.append(node('strong',label(x.kind)+' · '+(x.name||x.title)));
   const info=kind==='contacts'?[x.email,x.phone,label(x.state)]:[x.due_date,x.due_time,label(x.state),x.contact_id?m.contacts.find(c=>c.id===x.contact_id)?.name||'Liên hệ đã lưu':''];
   row.append(node('p',info.filter(Boolean).join(' · ')));if(m.can_write)row.append(addButton('Sửa',()=>edit(s,kind,x)));s.append(row);
  }
 }
 const audit=section('Nhật ký hoạt động');for(const e of m.events){const d=node('div',new Date(e.occurred_at*1000).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · '+(e.entity_kind==='contact'?'Liên hệ':'Công việc')+' · '+(e.action==='created'?'Tạo':'Sửa')+' · '+e.actor_id+' · v'+e.version);d.className='event';audit.append(d);}if(!m.events.length)audit.append(node('p','Chưa có nhật ký.'));if(m.truncated)say('Danh sách đã đạt giới hạn hiển thị QA.');
}
function edit(s,kind,x){
 if(busy||dead||!model?.can_write)return;root.querySelectorAll('form').forEach(f=>f.remove());
 const form=node('form');s.insertBefore(form,s.children[2]||null);const fields={};
 if(kind==='contacts'){fields.kind=control(form,'kind','Loại liên hệ',x?.kind||'client',{options:choices(['client','counterparty','other'])});fields.name=control(form,'name','Tên',x?.name,{max:160,required:true});fields.email=control(form,'email','Email',x?.email,{type:'email',max:254});fields.phone=control(form,'phone','Điện thoại',x?.phone,{type:'tel',max:50});fields.state=control(form,'state','Trạng thái',x?.state||'active',{options:choices(x?['active','archived']:['active'])});}
 else{fields.kind=control(form,'kind','Loại',x?.kind||'task',{options:choices(['task','meeting','hearing','deadline','interaction'])});fields.title=control(form,'title','Nội dung ngắn',x?.title,{max:160,required:true});fields.due_date=control(form,'due_date','Ngày',x?.due_date||'',{type:'date',required:true});fields.due_time=control(form,'due_time','Giờ (không bắt buộc)',x?.due_time,{type:'time'});fields.contact_id=control(form,'contact_id','Liên hệ (khi ghi trao đổi)',x?.contact_id,{options:[['','Chọn liên hệ'],...model.contacts.filter(c=>c.state==='active'||c.id===x?.contact_id).map(c=>[c.id,c.name])]});fields.state=control(form,'state','Trạng thái',x?.state||'open',{options:choices(['open','done','cancelled'])});const change=()=>{const interaction=fields.kind.value==='interaction';fields.contact_id.parentElement.hidden=!interaction;fields.contact_id.required=interaction;if(interaction&&fields.state.value==='open')fields.state.value='done';};fields.kind.addEventListener('change',change);change();}
 const save=node('button','Lưu');save.type='submit';form.append(save,addButton('Hủy',()=>form.remove()));
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||dead)return;const record=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim().normalize('NFC')]));if(kind==='activities'){if(record.kind!=='interaction')record.contact_id=null;else if(record.state==='open'){say('Trao đổi đã thực hiện phải ở trạng thái hoàn tất.');return;}}busy=true;save.disabled=true;say('Đang lưu…');try{const r=await api(base+'/'+kind+(x?'/'+encodeURIComponent(x.id):''),{method:x?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x?{record,expected_version:x.version}:{record})});if(r.status===401){scrub();location.replace('/login');return;}if(!r.ok){say(r.status===409?'Quyền hoặc phiên bản đã thay đổi. Hãy làm mới.':'Không lưu được dữ liệu.');return;}await load();if(!dead)say('Đã lưu.');}catch{if(!dead)say('Chưa xác nhận được kết quả. Hãy làm mới trước khi thử lại.');}finally{busy=false;save.disabled=false;}});
}
async function load(){const g=++generation;try{const r=await api(cal?'/api/qa/calendar':base);if(r.status===401){scrub();location.replace('/login');return;}if(!r.ok)throw Error();const m=await r.json();if(dead||g!==generation)return;model=m;root.replaceChildren();say('Đã tải dữ liệu.');if(cal)renderCalendar(m);else renderCase(m);}catch{if(dead||g!==generation)return;model=null;root.replaceChildren();say('Không tải được dữ liệu hoặc không có quyền.');}}
void load();
})();
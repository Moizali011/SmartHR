/* SmartHR Pro 2.0 — local-first HR workflow app.
   Migration: reads legacy smarthr_employees / attendance / leaves / payroll keys.
   Important: localStorage is not secure storage and is not shared across computers. */
'use strict';
const $ = id => document.getElementById(id);
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const thisMonth = () => today().slice(0,7);
const uid = () => 'r_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const money = n => 'PKR '+Number(n||0).toLocaleString('en-PK',{maximumFractionDigits:2});
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = name => String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const readJSON = (key,fallback) => { try { const v=JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
function readLegacy(key, normalize) {
  const current=readJSON('smarthrpro_'+key,null);
  if (Array.isArray(current)) return current;
  const old=readJSON('smarthr_'+key,[]);
  return Array.isArray(old) ? old.map(normalize) : [];
}
const state = {
  employees:readLegacy('employees',x=>({...x,id:String(x.id||uid()),empId:String(x.empId||''),name:String(x.name||''),department:x.department||'Other',role:x.role||'',salary:Number(x.salary||0),status:x.status||'Active'})),
  attendance:readLegacy('attendance',x=>({...x,id:String(x.id||uid()),employeeId:String(x.employeeId||''),date:x.date||today(),status:x.status||'Present',inTime:x.inTime||'',outTime:x.outTime||'',notes:x.notes||''})),
  leaves:readLegacy('leaves',x=>({...x,id:String(x.id||uid()),employeeId:String(x.employeeId||''),type:x.type||'Casual',start:x.start||today(),end:x.end||x.start||today(),reason:x.reason||'',status:x.status||'Pending',created:x.created||new Date().toISOString()})),
  payroll:readLegacy('payroll',x=>({...x,id:String(x.id||uid()),employeeId:String(x.employeeId||''),month:x.month||thisMonth(),basic:Number(x.basic||0),allowance:Number(x.allowance||0),deduction:Number(x.deduction||0),net:Number(x.net??(Number(x.basic||0)+Number(x.allowance||0)-Number(x.deduction||0)))})),
  candidates:readJSON('smarthrpro_candidates',[]),
  onboarding:readJSON('smarthrpro_onboarding',[]),
  activity:readJSON('smarthrpro_activity',[])
};
let restoreFile=null;
function persist(){
  for(const key of ['employees','attendance','leaves','payroll','candidates','onboarding','activity']){
    localStorage.setItem('smarthrpro_'+key,JSON.stringify(state[key]));
  }
  // Preserve legacy keys so the earlier version remains usable as a fallback.
  // Current app writes only smarthrpro_* keys after migration.
}
function logActivity(title,detail){
  state.activity.unshift({id:uid(),title,detail,at:new Date().toISOString()});
  state.activity=state.activity.slice(0,30);
}
function notify(message,isError=false){
  const el=$('toast');el.textContent=message;el.classList.toggle('error',isError);el.style.display='block';
  clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.style.display='none',2800);
}
function pill(value){
  const cls=String(value||'').toLowerCase().replace(/[^a-z]/g,'');
  return `<span class="pill ${esc(cls)}">${esc(value||'—')}</span>`;
}
function table(headers,rows,empty='No records yet. Add a record to get started.'){
  if(!rows.length)return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function employee(id){return state.employees.find(e=>String(e.id)===String(id));}
function employeeLabel(id){const e=employee(id);return e?`${e.name} (${e.empId})`:'Unknown employee';}
function personCell(e){return `<div class="person-cell"><div class="person-avatar">${esc(initials(e.name))}</div><div><div class="person-name">${esc(e.name)}</div><div class="person-sub">${esc(e.empId)}${e.email?' · '+esc(e.email):''}</div></div></div>`;}
function download(filename,content,type='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function csv(filename,headers,rows){
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  download(filename,'\uFEFF'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function activeEmployees(){return state.employees.filter(e=>e.status==='Active');}
function populateSelect(id,includeInactive=false){
  const el=$(id);if(!el)return;
  const old=el.value,items=(includeInactive?state.employees:activeEmployees()).slice().sort((a,b)=>a.name.localeCompare(b.name));
  el.innerHTML='<option value="">Select employee</option>'+items.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} — ${esc(e.empId)}</option>`).join('');
  if(items.some(e=>String(e.id)===old))el.value=old;
}
function populateDepartmentFilter(){
  const el=$('employeeDeptFilter'),old=el.value,depts=[...new Set(state.employees.map(e=>e.department).filter(Boolean))].sort();
  el.innerHTML='<option value="">All departments</option>'+depts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
  if(depts.includes(old))el.value=old;
}
const pageTitles={dashboard:'Overview',employees:'Employees',attendance:'Attendance',leaves:'Leave management',payroll:'Payroll',recruitment:'Recruitment',onboarding:'Onboarding',letters:'HR letters',reports:'Reports & backup',settings:'Settings & help'};
function go(page){
  if(!pageTitles[page])return;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('breadcrumbTitle').textContent=pageTitles[page];
  $('sidebar').classList.remove('open');
  if(page==='employees')renderEmployees();
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
$('todayLabel').textContent=new Date().toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric'});
$('empJoin').value=today();$('attDate').value=today();$('attFilterDate').value=today();$('payMonth').value=thisMonth();$('letterDate').value=today();$('onboardDate').value=today();

function renderEmployees(){
  const q=$('employeeSearch').value.trim().toLowerCase(),dept=$('employeeDeptFilter').value,status=$('employeeStatusFilter').value;
  const list=state.employees.filter(e=>(!q||[e.empId,e.name,e.email,e.phone,e.department,e.role].join(' ').toLowerCase().includes(q))&&(!dept||e.department===dept)&&(!status||e.status===status)).sort((a,b)=>a.name.localeCompare(b.name));
  $('employeeTable').innerHTML=table(['Employee','Department','Designation','Joined','Monthly salary','Status','Actions'],list.map(e=>`<tr><td>${personCell(e)}</td><td>${esc(e.department)}</td><td>${esc(e.role)}</td><td>${esc(e.joinDate||'—')}</td><td>${money(e.salary)}</td><td>${pill(e.status)}</td><td><div class="table-actions"><button class="mini-btn" data-edit-emp="${esc(e.id)}">Edit</button><button class="mini-btn danger" data-delete-emp="${esc(e.id)}">Delete</button></div></td></tr>`),'No matching employees found.');
}
function clearEmployeeForm(){
  $('employeeForm').reset();$('empRecordId').value='';$('employeeFormHeading').textContent='Add employee';$('empJoin').value=today();
}
function startEditEmployee(id){
  const e=employee(id);if(!e)return;
  $('empRecordId').value=e.id;
  for(const [key,id2] of Object.entries({empId:'empId',name:'empName',email:'empEmail',phone:'empPhone',department:'empDept',role:'empRole',joinDate:'empJoin',salary:'empSalary',status:'empStatus'}))$(id2).value=e[key]??'';
  $('employeeFormHeading').textContent='Edit employee';$('employeeFormPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
$('newEmployeeBtn').addEventListener('click',()=>{clearEmployeeForm();$('employeeFormPanel').scrollIntoView({behavior:'smooth'});$('empName').focus();});
$('closeEmployeeForm').addEventListener('click',clearEmployeeForm);$('cancelEmployee').addEventListener('click',clearEmployeeForm);
$('employeeSearch').addEventListener('input',renderEmployees);$('employeeDeptFilter').addEventListener('change',renderEmployees);$('employeeStatusFilter').addEventListener('change',renderEmployees);
$('employeeForm').addEventListener('submit',e=>{
  e.preventDefault();
  const editId=$('empRecordId').value;
  const record={id:editId||uid(),empId:$('empId').value.trim(),name:$('empName').value.trim(),email:$('empEmail').value.trim(),phone:$('empPhone').value.trim(),department:$('empDept').value,role:$('empRole').value.trim(),joinDate:$('empJoin').value,salary:Number($('empSalary').value),status:$('empStatus').value};
  if(state.employees.some(x=>x.empId.toLowerCase()===record.empId.toLowerCase()&&String(x.id)!==String(editId))){notify('Employee ID already exists.',true);return;}
  if(editId){state.employees=state.employees.map(x=>String(x.id)===String(editId)?record:x);logActivity('Employee updated',record.name);}
  else{state.employees.push(record);logActivity('Employee added',record.name);}
  persist();renderAll();clearEmployeeForm();notify(editId?'Employee updated successfully.':'Employee added successfully.');
});
$('employeeTable').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-emp]'),del=e.target.closest('[data-delete-emp]');
  if(edit){startEditEmployee(edit.dataset.editEmp);return;}
  if(del){
    const emp=employee(del.dataset.deleteEmp);if(!emp)return;
    if(!confirm(`Delete employee ${emp.name}? Related historical records will remain and may show Unknown employee.`))return;
    state.employees=state.employees.filter(x=>String(x.id)!==String(emp.id));logActivity('Employee deleted',emp.name);persist();renderAll();notify('Employee deleted.');
  }
});
$('employeeExport').addEventListener('click',exportEmployees);
function exportEmployees(){csv('smarthr-employees.csv',['Employee ID','Name','Email','Phone','Department','Designation','Joining date','Salary','Status'],state.employees.map(e=>[e.empId,e.name,e.email,e.phone,e.department,e.role,e.joinDate,e.salary,e.status]));}

function renderAttendance(){
  const filterDate=$('attFilterDate').value,filterStatus=$('attFilterStatus').value;
  const list=state.attendance.filter(a=>(!filterDate||a.date===filterDate)&&(!filterStatus||a.status===filterStatus)).slice().sort((a,b)=>b.date.localeCompare(a.date));
  $('attendanceTable').innerHTML=table(['Date','Employee','Status','Check-in','Check-out','Notes','Actions'],list.map(a=>`<tr><td>${esc(a.date)}</td><td>${esc(employeeLabel(a.employeeId))}</td><td>${pill(a.status)}</td><td>${esc(a.inTime||'—')}</td><td>${esc(a.outTime||'—')}</td><td>${esc(a.notes||'—')}</td><td><button class="mini-btn danger" data-del-att="${esc(a.id)}">Delete</button></td></tr>`));
}
$('attFilterDate').addEventListener('change',renderAttendance);$('attFilterStatus').addEventListener('change',renderAttendance);
$('attendanceForm').addEventListener('submit',e=>{
  e.preventDefault();const employeeId=$('attEmployee').value,date=$('attDate').value;
  if(!employee(employeeId)){notify('Pehle active employee add karein.',true);return;}
  const old=state.attendance.find(a=>String(a.employeeId)===String(employeeId)&&a.date===date);
  const record={id:old?.id||uid(),employeeId,date,status:$('attStatus').value,inTime:$('attIn').value,outTime:$('attOut').value,notes:$('attNotes').value.trim()};
  if(old)state.attendance=state.attendance.map(a=>a.id===old.id?record:a);else state.attendance.push(record);
  logActivity('Attendance saved',`${employeeLabel(employeeId)} · ${date} · ${record.status}`);persist();renderAll();notify(old?'Attendance updated.':'Attendance saved.');
});
$('attendanceTable').addEventListener('click',e=>{const b=e.target.closest('[data-del-att]');if(!b)return;if(!confirm('Delete this attendance record?'))return;state.attendance=state.attendance.filter(a=>a.id!==b.dataset.delAtt);persist();renderAll();notify('Attendance deleted.');});
function exportAttendance(){csv('smarthr-attendance.csv',['Date','Employee ID','Name','Status','Check-in','Check-out','Notes'],state.attendance.map(a=>{const e=employee(a.employeeId);return[a.date,e?.empId,e?.name,a.status,a.inTime,a.outTime,a.notes]}));}
$('attendanceExport').addEventListener('click',exportAttendance);

function renderLeaves(){
  const filter=$('leaveFilter').value;
  const list=state.leaves.filter(l=>!filter||l.status===filter).slice().sort((a,b)=>String(b.created).localeCompare(String(a.created)));
  $('leaveTable').innerHTML=table(['Employee','Type','Dates','Reason','Status','Actions'],list.map(l=>`<tr><td>${esc(employeeLabel(l.employeeId))}</td><td>${esc(l.type)}</td><td>${esc(l.start)} → ${esc(l.end)}</td><td>${esc(l.reason)}</td><td>${pill(l.status)}</td><td><div class="table-actions">${l.status==='Pending'?`<button class="mini-btn" data-leave-action="${esc(l.id)}" data-leave-status="Approved">Approve</button><button class="mini-btn danger" data-leave-action="${esc(l.id)}" data-leave-status="Rejected">Reject</button>`:''}<button class="mini-btn danger" data-del-leave="${esc(l.id)}">Delete</button></div></td></tr>`));
}
$('leaveFilter').addEventListener('change',renderLeaves);
$('leaveForm').addEventListener('submit',e=>{
  e.preventDefault();const start=$('leaveStart').value,end=$('leaveEnd').value,employeeId=$('leaveEmployee').value;
  if(!employee(employeeId)){notify('Pehle active employee add karein.',true);return;}
  if(end<start){notify('End date start date se pehle nahi ho sakti.',true);return;}
  state.leaves.push({id:uid(),employeeId,type:$('leaveType').value,start,end,reason:$('leaveReason').value.trim(),status:'Pending',created:new Date().toISOString()});
  logActivity('Leave request submitted',employeeLabel(employeeId));persist();renderAll();$('leaveForm').reset();notify('Leave request submitted.');
});
$('leaveTable').addEventListener('click',e=>{
  const action=e.target.closest('[data-leave-action]'),del=e.target.closest('[data-del-leave]');
  if(action){const l=state.leaves.find(x=>String(x.id)===action.dataset.leaveAction);if(!l)return;l.status=action.dataset.leaveStatus;logActivity('Leave '+l.status.toLowerCase(),employeeLabel(l.employeeId));persist();renderAll();notify('Leave '+l.status.toLowerCase()+'.');}
  if(del&&confirm('Delete this leave request?')){state.leaves=state.leaves.filter(l=>String(l.id)!==del.dataset.delLeave);persist();renderAll();notify('Leave request deleted.');}
});
function exportLeaves(){csv('smarthr-leaves.csv',['Employee','Type','Start date','End date','Reason','Status'],state.leaves.map(l=>[employeeLabel(l.employeeId),l.type,l.start,l.end,l.reason,l.status]));}

function updateNetPreview(){const gross=Number($('payBasic').value||0)+Number($('payAllowance').value||0),ded=Number($('payDeduction').value||0);$('netPreview').textContent=money(gross-ded);}
['payBasic','payAllowance','payDeduction'].forEach(id=>$(id).addEventListener('input',updateNetPreview));
$('payEmployee').addEventListener('change',()=>{const e=employee($('payEmployee').value);if(e){$('payBasic').value=e.salary;updateNetPreview();}});
function renderPayroll(){
  const month=$('payFilterMonth').value;
  const list=state.payroll.filter(p=>!month||p.month===month).slice().sort((a,b)=>b.month.localeCompare(a.month));
  $('payrollTable').innerHTML=table(['Month','Employee','Basic','Allowances','Deductions','Net pay','Actions'],list.map(p=>`<tr><td>${esc(p.month)}</td><td>${esc(employeeLabel(p.employeeId))}</td><td>${money(p.basic)}</td><td>${money(p.allowance)}</td><td>${money(p.deduction)}</td><td><b>${money(p.net)}</b></td><td><div class="table-actions"><button class="mini-btn" data-slip="${esc(p.id)}">Payslip</button><button class="mini-btn danger" data-del-pay="${esc(p.id)}">Delete</button></div></td></tr>`));
}
$('payFilterMonth').addEventListener('change',renderPayroll);
$('payrollForm').addEventListener('submit',e=>{
  e.preventDefault();const employeeId=$('payEmployee').value,month=$('payMonth').value,basic=Number($('payBasic').value),allowance=Number($('payAllowance').value),deduction=Number($('payDeduction').value);
  if(!employee(employeeId)){notify('Employee select karein.',true);return;}
  if(!month||[basic,allowance,deduction].some(x=>!Number.isFinite(x)||x<0)){notify('Salary values valid aur non-negative honi chahiye.',true);return;}
  const existing=state.payroll.find(p=>String(p.employeeId)===String(employeeId)&&p.month===month);
  if(existing&&!confirm('Is employee ka payroll is month pehle se hai. Existing record replace karein?'))return;
  const record={id:existing?.id||uid(),employeeId,month,basic,allowance,deduction,net:basic+allowance-deduction,created:new Date().toISOString()};
  if(existing)state.payroll=state.payroll.map(p=>p.id===existing.id?record:p);else state.payroll.push(record);
  logActivity('Payroll saved',`${employeeLabel(employeeId)} · ${month} · ${money(record.net)}`);persist();renderAll();notify('Payroll saved successfully.');
});
$('payrollTable').addEventListener('click',e=>{
  const slip=e.target.closest('[data-slip]'),del=e.target.closest('[data-del-pay]');
  if(slip){const p=state.payroll.find(x=>String(x.id)===slip.dataset.slip);if(p)showPayslip(p);}
  if(del&&confirm('Delete this payroll record?')){state.payroll=state.payroll.filter(p=>String(p.id)!==del.dataset.delPay);persist();renderAll();notify('Payroll record deleted.');}
});
function exportPayroll(){csv('smarthr-payroll.csv',['Month','Employee','Basic','Allowances','Deductions','Net pay'],state.payroll.map(p=>[p.month,employeeLabel(p.employeeId),p.basic,p.allowance,p.deduction,p.net]));}
$('payrollExport').addEventListener('click',exportPayroll);$('payrollExport2').addEventListener('click',exportPayroll);
function showPayslip(p){
  const e=employee(p.employeeId);if(!e){notify('Employee record not found.',true);return;}
  const panel=$('payslipPanel');panel.hidden=false;
  panel.innerHTML=`<div class="panel-heading"><div><h2>Salary payslip</h2><p>${esc(p.month)} · ${esc(e.name)}</p></div><button class="btn btn-primary" id="printSlip">Print / Save PDF</button></div><div class="letter-preview" id="slipContent"><h2>SMART HR — SALARY STATEMENT</h2><p><b>Salary month:</b> ${esc(p.month)}</p><p><b>Employee:</b> ${esc(e.name)} (${esc(e.empId)})</p><p><b>Department:</b> ${esc(e.department)}</p><hr><p>Basic salary: ${money(p.basic)}</p><p>Allowances: ${money(p.allowance)}</p><p>Deductions: ${money(p.deduction)}</p><h2>Net pay: ${money(p.net)}</h2><p>Authorized signature: ____________________</p><small>Generated from SmartHR records. Verify before payment.</small></div>`;
  $('printSlip').addEventListener('click',()=>printHtml('Salary payslip', $('slipContent').innerHTML));
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function printHtml(title,content){
  const w=window.open('','_blank','width=850,height=800');
  if(!w){notify('Print popup blocked. Browser settings mein popups allow karein.',true);return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px Arial,sans-serif;color:#26334a;padding:35px;line-height:1.7}h2{text-align:center;margin:20px 0}p{padding:7px 0;border-bottom:1px solid #eee}small{color:#777}@media print{body{padding:10mm}}</style></head><body>${content}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function renderCandidates(){
  const q=$('candidateSearch').value.trim().toLowerCase();
  const list=state.candidates.filter(c=>[c.name,c.email,c.phone,c.position,c.stage].join(' ').toLowerCase().includes(q)).slice().sort((a,b)=>String(b.created).localeCompare(String(a.created)));
  $('candidateTable').innerHTML=table(['Candidate','Position','Interview date','Stage','Actions'],list.map(c=>`<tr><td>${personCell({name:c.name,empId:c.email||c.phone||'Candidate'})}</td><td>${esc(c.position)}</td><td>${esc(c.interview||'—')}</td><td><select class="control" data-candidate-stage="${esc(c.id)}">${['Applied','Shortlisted','Interview','Offered','Hired','Rejected'].map(s=>`<option ${s===c.stage?'selected':''}>${s}</option>`).join('')}</select></td><td><button class="mini-btn danger" data-del-candidate="${esc(c.id)}">Delete</button></td></tr>`));
}
$('candidateSearch').addEventListener('input',renderCandidates);
$('candidateForm').addEventListener('submit',e=>{
  e.preventDefault();state.candidates.push({id:uid(),name:$('candName').value.trim(),email:$('candEmail').value.trim(),phone:$('candPhone').value.trim(),position:$('candPosition').value.trim(),interview:$('candInterview').value,stage:$('candStage').value,created:new Date().toISOString()});
  logActivity('Candidate added',$('candName').value.trim());persist();renderAll();$('candidateForm').reset();notify('Candidate added to pipeline.');
});
$('candidateTable').addEventListener('change',e=>{
  const sel=e.target.closest('[data-candidate-stage]');if(!sel)return;
  const c=state.candidates.find(x=>String(x.id)===sel.dataset.candidateStage);if(c){c.stage=sel.value;logActivity('Candidate stage updated',`${c.name} · ${c.stage}`);persist();renderAll();notify('Candidate stage updated.');}
});
$('candidateTable').addEventListener('click',e=>{const b=e.target.closest('[data-del-candidate]');if(b&&confirm('Delete this candidate?')){state.candidates=state.candidates.filter(c=>String(c.id)!==b.dataset.delCandidate);persist();renderAll();notify('Candidate deleted.');}});
function exportCandidates(){csv('smarthr-candidates.csv',['Name','Email','Phone','Position','Interview date','Stage'],state.candidates.map(c=>[c.name,c.email,c.phone,c.position,c.interview,c.stage]));}
$('repCandidates').addEventListener('click',exportCandidates);

const onboardingTasks=['Collect required documents','Verify identity and contact details','Share company policies','Set up email and system access','Introduce team and reporting manager','Confirm role and responsibilities','Schedule probation check-in'];
function renderOnboarding(){
  $('onboardList').innerHTML=state.onboarding.length?state.onboarding.slice().reverse().map(o=>{
    const done=o.tasks.filter(t=>t.done).length,pct=Math.round(done/o.tasks.length*100);
    return `<article class="onboard-card"><div class="onboard-head"><div><h2>${esc(employeeLabel(o.employeeId))}</h2><p class="helper">${esc(o.date||'No joining date')} · HR contact: ${esc(o.owner||'Not assigned')}</p></div><div class="onboard-progress">${done}/${o.tasks.length} · ${pct}%</div><button class="mini-btn danger" data-del-onboard="${esc(o.id)}">Delete</button></div><div class="onboard-track"><div style="width:${pct}%"></div></div><div class="task-grid">${o.tasks.map(t=>`<label class="task-item"><input type="checkbox" data-task="${esc(o.id)}" data-task-id="${esc(t.id)}" ${t.done?'checked':''}><span>${esc(t.label)}</span></label>`).join('')}</div></article>`;
  }).join(''):'<div class="empty">No onboarding checklists yet. Create one for a new joiner.</div>';
}
$('onboardForm').addEventListener('submit',e=>{
  e.preventDefault();const id=$('onboardEmployee').value;if(!employee(id)){notify('Pehle active employee add karein.',true);return;}
  if(state.onboarding.some(o=>String(o.employeeId)===String(id))&&!confirm('Is employee ka checklist already hai. Ek aur create karein?'))return;
  state.onboarding.push({id:uid(),employeeId:id,date:$('onboardDate').value,owner:$('onboardOwner').value.trim(),tasks:onboardingTasks.map(label=>({id:uid(),label,done:false})),created:new Date().toISOString()});
  logActivity('Onboarding checklist created',employeeLabel(id));persist();renderAll();notify('Onboarding checklist created.');
});
$('onboardList').addEventListener('change',e=>{
  const cb=e.target.closest('[data-task]');if(!cb)return;const o=state.onboarding.find(x=>String(x.id)===cb.dataset.task),t=o?.tasks.find(x=>String(x.id)===cb.dataset.taskId);if(t){t.done=cb.checked;persist();renderOnboarding();}
});
$('onboardList').addEventListener('click',e=>{const b=e.target.closest('[data-del-onboard]');if(b&&confirm('Delete this onboarding checklist?')){state.onboarding=state.onboarding.filter(o=>String(o.id)!==b.dataset.delOnboard);persist();renderAll();notify('Checklist deleted.');}});

function generateLetter(){
  const type=$('letterType').value,e=employee($('letterEmployee').value);if(!e){notify('Employee select karein.',true);return;}
  const company=$('companyName').value.trim()||'[Company Name]',date=$('letterDate').value,extra=$('letterDetails').value.trim();
  const templates={
    'Employment offer':`We are pleased to offer you the position of <b>${esc(e.role)}</b> in the <b>${esc(e.department)}</b> department. Your proposed joining date is <b>${esc(e.joinDate||'[Joining Date]')}</b>. Please confirm acceptance with Human Resources.`,
    'Employment confirmation':`This letter confirms that <b>${esc(e.name)}</b> (Employee ID: <b>${esc(e.empId)}</b>) is recorded as an employee of ${esc(company)} in the role of <b>${esc(e.role)}</b>, department <b>${esc(e.department)}</b>, since <b>${esc(e.joinDate||'[Joining Date]')}</b>.`,
    'Experience certificate':`This is to certify that <b>${esc(e.name)}</b> (Employee ID: <b>${esc(e.empId)}</b>) has been employed with ${esc(company)} as <b>${esc(e.role)}</b> in the <b>${esc(e.department)}</b> department since <b>${esc(e.joinDate||'[Joining Date]')}</b>. This certificate is issued upon request.`,
    'Salary certificate':`This is to certify that <b>${esc(e.name)}</b> (Employee ID: <b>${esc(e.empId)}</b>) is recorded with a monthly basic salary of <b>${money(e.salary)}</b>. This statement should be verified against approved payroll records before official use.`,
    'Show-cause notice':`You are requested to provide a written explanation regarding the following matter: <b>${esc(extra||'[Describe the matter and relevant dates]')}</b>. Please submit your response to Human Resources within the period specified in the applicable company policy. This draft requires HR/legal review before issue.`
  };
  $('letterPreview').innerHTML=`<div style="text-align:right">${esc(date)}</div><h2>${esc(company)}</h2><h2>${esc(type.toUpperCase())}</h2><p><b>To:</b> ${esc(e.name)} · ${esc(e.empId)}</p><p><b>Designation:</b> ${esc(e.role)} · ${esc(e.department)}</p><p>Dear ${esc(e.name)},</p><p>${templates[type]}</p>${extra&&type!=='Show-cause notice'?`<p>${esc(extra)}</p>`:''}<p>Please contact Human Resources if you require further clarification.</p><div class="letter-sign"><p>Regards,</p><p><b>Human Resources</b><br>${esc(company)}</p><p>Signature: _______________________</p></div><p class="helper">DRAFT — review details and obtain authorized approval before issuing.</p>`;
  $('letterPreview').hidden=false;$('printLetter').disabled=false;$('letterPreview').scrollIntoView({behavior:'smooth',block:'start'});
}
$('letterForm').addEventListener('submit',e=>{e.preventDefault();generateLetter();});
$('printLetter').addEventListener('click',()=>{if(!$('letterPreview').hidden)printHtml('HR letter draft',$('letterPreview').innerHTML);});

function exportSummary(){
  $('reportSummary').innerHTML=[
    ['Active employees',activeEmployees().length],['Inactive employees',state.employees.length-activeEmployees().length],
    ["Today's attendance",state.attendance.filter(a=>a.date===today()).length],['Pending leaves',state.leaves.filter(l=>l.status==='Pending').length],
    ['Payroll records',state.payroll.length],['Candidates',state.candidates.length],['Onboarding checklists',state.onboarding.length],
    ['Current month payroll',money(state.payroll.filter(p=>p.month===thisMonth()).reduce((s,p)=>s+Number(p.net||0),0))]
  ].map(([k,v])=>`<div class="summary-tile"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
}
$('repEmployees').addEventListener('click',exportEmployees);$('repAttendance').addEventListener('click',exportAttendance);$('repLeaves').addEventListener('click',exportLeaves);$('repPayroll').addEventListener('click',exportPayroll);
function fullBackup(){
  const data={app:'SmartHR Pro',version:2,exportedAt:new Date().toISOString(),...state};
  download('smarthrpro-backup-'+today()+'.json',JSON.stringify(data,null,2),'application/json');
}
$('backupFull').addEventListener('click',fullBackup);$('backupQuick').addEventListener('click',fullBackup);
$('restoreFile').addEventListener('change',e=>{restoreFile=e.target.files?.[0]||null;$('restoreName').textContent=restoreFile?`Selected: ${restoreFile.name}`:'No backup file selected.';});
$('restoreBackup').addEventListener('click',()=>{
  if(!restoreFile){notify('Pehle backup JSON file choose karein.',true);return;}
  if(!confirm('Restore se current SmartHR Pro records replace ho jayenge. Pehle current backup download karna recommended hai. Continue?'))return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const d=JSON.parse(reader.result);
      const keys=['employees','attendance','leaves','payroll','candidates','onboarding','activity'];
      if(!d||!keys.every(k=>Array.isArray(d[k])))throw new Error('Invalid backup');
      for(const k of keys)state[k]=d[k];
      persist();renderAll();notify('Backup restored successfully.');restoreFile=null;$('restoreFile').value='';$('restoreName').textContent='No backup file selected.';
    }catch{notify('Invalid SmartHR Pro backup file.',true);}
  };
  reader.readAsText(restoreFile);
});
function renderDashboard(){
  const active=activeEmployees(),todayRows=state.attendance.filter(a=>a.date===today()),present=todayRows.filter(a=>a.status==='Present').length,late=todayRows.filter(a=>a.status==='Late').length,absent=todayRows.filter(a=>a.status==='Absent').length,leave=todayRows.filter(a=>a.status==='Leave').length;
  $('statEmployees').textContent=state.employees.length;$('statActive').textContent=`${active.length} active employees`;$('statPresent').textContent=present;$('statPending').textContent=state.leaves.filter(l=>l.status==='Pending').length;
  $('statPayroll').textContent=money(state.payroll.filter(p=>p.month===thisMonth()).reduce((s,p)=>s+Number(p.net||0),0));
  $('statAttendanceHint').textContent=todayRows.length?`${todayRows.length} records marked today`:'No attendance marked yet';
  const values=[['Present',present,'present'],['Late',late,'late'],['Absent',absent,'absent'],['Leave',leave,'leave']],max=Math.max(1,...values.map(x=>x[1]));
  $('attendanceOverview').innerHTML=`<div class="attendance-bars">${values.map(([label,n,cls])=>`<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${n/max*100}%"></div></div><span class="bar-number">${n}</span></div>`).join('')}</div>`;
  $('recentEmployees').innerHTML=table(['Employee','Department','Designation','Status'],state.employees.slice().sort((a,b)=>String(b.joinDate).localeCompare(String(a.joinDate))).slice(0,5).map(e=>`<tr><td>${personCell(e)}</td><td>${esc(e.department)}</td><td>${esc(e.role)}</td><td>${pill(e.status)}</td></tr>`),'No employees added yet.');
  $('activityList').innerHTML=state.activity.length?state.activity.slice(0,6).map(a=>`<div class="activity-item"><div class="activity-mark">↗</div><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div><time>${esc(new Date(a.at).toLocaleDateString())}</time></div>`).join(''):'<div class="empty">Activity will appear here as you use SmartHR Pro.</div>';
}
function renderAll(){
  populateDepartmentFilter();
  ['attEmployee','leaveEmployee','payEmployee','onboardEmployee','letterEmployee'].forEach(id=>populateSelect(id,id==='letterEmployee'));
  renderEmployees();renderAttendance();renderLeaves();renderPayroll();renderCandidates();renderOnboarding();renderDashboard();exportSummary();
  $('navEmployees').textContent=state.employees.length;$('navLeaves').textContent=state.leaves.filter(l=>l.status==='Pending').length;
  updateNetPreview();
}
// Existing v1 localStorage data is read on first launch and retained under the original keys.
// New writes use smarthrpro_* to avoid modifying the old app's records.
renderAll();

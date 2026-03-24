
// ---
// CONSTANTS AND STATE
// ---
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const RCOLS=['#2563eb','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488','#65a30d','#ea580c','#4f46e5','#0284c7','#16a34a','#ca8a04','#b91c1c'];
const TODAY=new Date(); TODAY.setHours(0,0,0,0);

let curYear=TODAY.getFullYear();
let DAYS=[];
// In-memory state (sincronizzato da Firebase)
let cars=[], rentals=[], clients=[], settings={agency:'',address:'',phone:'',email:'',piva:'',foro:'',clauses:''};
let ctrCounter=1;
let listSortKey='inizio', listSortDir=-1;
let drag=null, selColor=RCOLS[0];
let curRid=null, curCid=null, curSi=null, curEi=null;
let curClientId=null, curCarEditId=null, selCarColor=RCOLS[0];

// ---
// FIREBASE STORAGE (sostituisce localStorage)
// ---
function uid(){return window._fbUser?window._fbUser.uid:null}

async function fbSet(collection, id, data){
  if(!uid())return;
  try{
    const{db,doc,setDoc}=window._fb;
    await setDoc(doc(db,'users',uid(),collection,id),data);
  }catch(e){console.error('fbSet error',e);toast('Errore salvataggio cloud','err')}
}

async function fbGetAll(col){
  if(!uid())return[];
  try{
    const{db,collection:col_,getDocs}=window._fb;
    const snap=await getDocs(col_(db,'users',uid(),col));
    return snap.docs.map(d=>d.data());
  }catch(e){console.error('fbGetAll error',e);return[]}
}

async function fbDelete(col,id){
  if(!uid())return;
  try{
    const{db}=window._fb;
    const{deleteDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await deleteDoc(doc(db,'users',uid(),col,id));
  }catch(e){console.error('fbDelete error',e)}
}

// Salva singolo documento
function sv(key,val){
  // key: 'fp_cars','fp_rentals','fp_clients','fp_settings','fp_ctr'
  const col=key.replace('fp_','');
  if(col==='ctr'){
    fbSet('meta','ctr',{value:val});
    return;
  }
  if(col==='settings'){
    fbSet('meta','settings',val);
    return;
  }
  // Per array: salva ogni elemento come documento separato
  if(Array.isArray(val)){
    val.forEach(item=>fbSet(col,item.id,item));
  }
}

// Carica tutto da Firebase
async function fbLoadAll(){
  showSync('Caricamento...');
  try{
    const [carsData, rentalsData, clientsData] = await Promise.all([
      fbGetAll('cars'), fbGetAll('rentals'), fbGetAll('clients')
    ]);
    // Carica meta (settings + ctr)
    const{db,doc,getDoc}=window._fb;
    const settingsSnap = await getDoc(doc(db,'users',uid(),'meta','settings'));
    const ctrSnap      = await getDoc(doc(db,'users',uid(),'meta','ctr'));

    cars    = carsData.length ? carsData    : [{id:'c1',targa:'AA123BB',model:'Fiat Panda 1.2',color:'#2563eb',ass:'',bollo:'',rev:'',note:''},{id:'c2',targa:'BB456CC',model:'Ford Focus Diesel',color:'#0891b2',ass:'',bollo:'',rev:'',note:''}];
    rentals = rentalsData;
    clients = clientsData;
    settings= settingsSnap.exists()?settingsSnap.data():{agency:'',address:'',phone:'',email:'',piva:'',foro:'',clauses:''};
    ctrCounter = ctrSnap.exists()?ctrSnap.data().value:1;

    // Se cars era vuoto (primo avvio), salva le demo
    if(!carsData.length) cars.forEach(c=>fbSet('cars',c.id,c));

    showSync('Sincronizzato');
    DAYS=getDays(curYear);
    document.getElementById('yearVal').textContent=curYear;
    document.getElementById('agencyName').textContent=settings.agency||'Fleet Planner';
    document.getElementById('logoutBtn').style.display='flex';
    document.getElementById('syncIndicator').style.display='flex';
    buildTable();
  }catch(e){
    console.error('Load error',e);
    showSync('Errore caricamento','err');
  }
}
window._fbLoadAll=fbLoadAll;

function showSync(msg,type=''){
  const el=document.getElementById('syncLabel');
  const dot=document.querySelector('.sync-dot');
  if(el){el.textContent=msg;}
  if(dot){dot.style.background=type==='err'?'var(--red)':'var(--green)';}
}

// ---
// LOGIN / LOGOUT
// ---
function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pwd=document.getElementById('loginPwd').value;
  const btn=document.getElementById('loginBtn');
  const err=document.getElementById('loginErr');
  if(!email||!pwd){err.textContent='Inserisci email e password.';err.className='login-err show';return}
  btn.disabled=true; btn.textContent='Accesso...';
  err.className='login-err';
  const{auth,signInWithEmailAndPassword}=window._fb;
  signInWithEmailAndPassword(auth,email,pwd)
    .then(()=>{btn.textContent='Accedi';btn.disabled=false})
    .catch(e=>{
      btn.textContent='Accedi';btn.disabled=false;
      const msgs={'auth/user-not-found':'Utente non trovato.','auth/wrong-password':'Password errata.','auth/invalid-email':'Email non valida.','auth/invalid-credential':'Credenziali non valide.'};
      err.textContent=msgs[e.code]||'Errore: '+e.message;
      err.className='login-err show';
    });
}

function doLogout(){
  if(!confirm("Esci dall'app?"))return;
  const{auth,signOut}=window._fb;
  signOut(auth).then(()=>{
    cars=[];rentals=[];clients=[];
    document.getElementById('logoutBtn').style.display='none';
    document.getElementById('syncIndicator').style.display='none';
  });
}

// ---
// DATE UTILS
// ---
function dk(d){return`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`}
function p2(n){return String(n).padStart(2,'0')}
function fd(s){if(!s||s==='—')return'—';if(s.includes('-')){const[y,m,d]=s.split('-');return`${d}/${m}/${y}`}return s}
function getDays(yr){const a=[];const d=new Date(yr,0,1);while(d.getFullYear()===yr){a.push(new Date(d));d.setDate(d.getDate()+1)}return a}
function dIdx(key){return DAYS.findIndex(d=>dk(d)===key)}

// ---
// NAVIGATION
// ---
function changeYear(d){curYear+=d;document.getElementById('yearVal').textContent=curYear;DAYS=getDays(curYear);buildTable();populateListFilters()}
function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(btn)btn.classList.add('active');
  if(id==='list'){populateListFilters();renderList()}
  else if(id==='stats')renderStats();
  else if(id==='clients')renderClients();
  else if(id==='fleet')renderFleet();
  else if(id==='settings')loadSettings();
}

// ---
// PLANNING
// ---
function buildTable(){
  DAYS=getDays(curYear);
  const t=document.getElementById('ptable');
  t.innerHTML='';
  const trM=document.createElement('tr');
  const th0=document.createElement('th'); th0.className='car-hdr mhdr'; trM.appendChild(th0);
  let mi=-1;
  DAYS.forEach((day,i)=>{
    if(day.getMonth()!==mi){
      mi=day.getMonth();
      const dim=new Date(curYear,mi+1,0).getDate();
      const th=document.createElement('th');
      th.className='mhdr'+(mi<11?' mb':'');
      th.colSpan=dim; th.textContent=MONTHS[mi].toUpperCase();
      trM.appendChild(th);
    }
  });
  t.appendChild(trM);
  const trD=document.createElement('tr');
  const th1=document.createElement('th'); th1.className='car-hdr dhdr'; th1.style.top='22px'; trD.appendChild(th1);
  DAYS.forEach((day,i)=>{
    const th=document.createElement('th');
    const isWe=day.getDay()===0||day.getDay()===6;
    const isTd=dk(day)===dk(TODAY);
    const isMb=i<DAYS.length-1&&DAYS[i+1].getMonth()!==day.getMonth();
    th.className='dhdr'+(isWe?' we':'')+(isTd?' td':'')+(isMb?' mb':'');
    th.textContent=day.getDate(); trD.appendChild(th);
  });
  t.appendChild(trD);
  cars.forEach(car=>{
    const tr=document.createElement('tr'); tr.dataset.cid=car.id;
    const tdC=document.createElement('td'); tdC.className='car-cell';
    const expW=getCarExpiry(car);
    tdC.innerHTML=`<div class="car-targa" style="color:${car.color||'var(--accent)'}">${car.targa}</div><div class="car-model">${car.model}</div>${expW?`<div class="car-exp">${expW}</div>`:''}`;
    tr.appendChild(tdC);
    DAYS.forEach((day,i)=>{
      const td=document.createElement('td');
      const isWe=day.getDay()===0||day.getDay()===6;
      const isTd=dk(day)===dk(TODAY);
      const isMb=i<DAYS.length-1&&DAYS[i+1].getMonth()!==day.getMonth();
      td.className='dcell'+(isWe?' we':'')+(isTd?' td':'')+(isMb?' mb':'');
      td.dataset.cid=car.id; td.dataset.di=i; td.dataset.dk=dk(day);
      td.addEventListener('mousedown',onMD);
      td.addEventListener('mouseenter',onME);
      td.addEventListener('mouseup',onMU);
      tr.appendChild(td);
    });
    t.appendChild(tr);
  });
  renderBars(); checkAlerts(); setTimeout(scrollToToday,80);
}

function getCarExpiry(car){
  const today=dk(TODAY), in30=dk(new Date(TODAY.getTime()+30*86400000));
  const warns=[];
  if(car.ass){if(car.ass<=today)warns.push('🔴Ass.');else if(car.ass<=in30)warns.push('🟠Ass.');}
  if(car.bollo){if(car.bollo<=today)warns.push('🔴Bollo');else if(car.bollo<=in30)warns.push('🟠Bollo');}
  if(car.rev){if(car.rev<=today)warns.push('🔴Rev.');else if(car.rev<=in30)warns.push('🟠Rev.');}
  return warns.join(' ');
}
function checkAlerts(){
  const today=dk(TODAY), in30=dk(new Date(TODAY.getTime()+30*86400000));
  const warns=[];
  cars.forEach(car=>{
    [[car.ass,'Assicurazione'],[car.bollo,'Bollo'],[car.rev,'Revisione']].forEach(([d,lbl])=>{
      if(!d)return;
      if(d<=today)warns.push(`${car.targa}: ${lbl} SCADUTA`);
      else if(d<=in30)warns.push(`${car.targa}: ${lbl} in scadenza (${fd(d)})`);
    });
  });
  const banner=document.getElementById('alertBanner');
  if(warns.length){document.getElementById('alertText').textContent=warns.join(' · ');banner.classList.add('show');}
  else{banner.classList.remove('show');}
}
function scrollToToday(){
  const idx=DAYS.findIndex(d=>dk(d)===dk(TODAY)); if(idx<0)return;
  const w=document.getElementById('planWrap');
  w.scrollLeft=Math.max(0,(idx*28)+185-w.clientWidth/2);
}
function renderBars(){
  document.querySelectorAll('.rbar').forEach(b=>b.remove());
  rentals.forEach(r=>{
    if(!r.startKey||!r.endKey)return;
    const sy=+r.startKey.split('-')[0], ey=+r.endKey.split('-')[0];
    if(sy!==curYear&&ey!==curYear&&!(sy<curYear&&ey>curYear))return;
    renderBar(r);
  });
}
function renderBar(r){
  const si=DAYS.findIndex(d=>dk(d)===r.startKey);
  const ei=DAYS.findIndex(d=>dk(d)===r.endKey);
  const aSi=si<0?0:si, aEi=ei<0?DAYS.length-1:ei;
  if(aSi>DAYS.length-1||aEi<0)return;
  const row=document.querySelector(`tr[data-cid="${r.carId}"]`); if(!row)return;
  const cells=row.querySelectorAll('td.dcell');
  const stColors={manutenzione:'#f97316',opzione:'#8b5cf6'};
  const color=stColors[r.stato]||r.color||'#2563eb';
  let seg=aSi;
  while(seg<=aEi){
    const sm=DAYS[seg].getMonth(); let se=seg;
    while(se+1<=aEi&&DAYS[se+1].getMonth()===sm)se++;
    const c0=cells[seg]; if(!c0){seg=se+1;continue;}
    const bar=document.createElement('div');
    bar.className='rbar'; bar.dataset.rid=r.id;
    const sl=seg===aSi?2:0, er=se===aEi?2:0;
    bar.style.cssText=`left:${sl}px;width:calc(${(se-seg+1)*28}px - ${sl+er}px);background:${color}`;
    if(seg===aSi){
      const lbl=r.cognome?`${r.cognome}${r.nome?' '+r.nome.charAt(0)+'.':''}`:(r.stato==='manutenzione'?'Manutenzione':r.stato==='opzione'?'Opzione':'—');
      bar.innerHTML=`<span class="rbar-lbl">${lbl}</span>`;
    }
    bar.addEventListener('click',e=>{e.stopPropagation();openEditRental(r.id)});
    c0.appendChild(bar); seg=se+1;
  }
}
function onMD(e){if(e.button!==0)return;const td=e.currentTarget;drag={cid:td.dataset.cid,si:+td.dataset.di,ei:+td.dataset.di};hilite();e.preventDefault()}
function onME(e){if(!drag)return;const td=e.currentTarget;if(td.dataset.cid!==drag.cid)return;drag.ei=+td.dataset.di;hilite()}
function onMU(e){if(!drag)return;const td=e.currentTarget;drag.ei=+td.dataset.di;clearHilite();const si=Math.min(drag.si,drag.ei),ei=Math.max(drag.si,drag.ei);openNewRental(drag.cid,si,ei);drag=null}
document.addEventListener('mouseup',()=>{if(drag){clearHilite();drag=null}});
function hilite(){clearHilite();if(!drag)return;const si=Math.min(drag.si,drag.ei),ei=Math.max(drag.si,drag.ei);const row=document.querySelector(`tr[data-cid="${drag.cid}"]`);if(!row)return;row.querySelectorAll('td.dcell').forEach(td=>{const i=+td.dataset.di;if(i>=si&&i<=ei)td.classList.add('sel')})}
function clearHilite(){document.querySelectorAll('.dcell.sel').forEach(td=>td.classList.remove('sel'))}
function checkAvail(){
  const from=document.getElementById('availFrom').value;
  const to=document.getElementById('availTo').value;
  const res=document.getElementById('availResult');
  if(!from||!to){res.innerHTML='';return}
  const html=cars.map(car=>{
    const busy=rentals.some(r=>r.carId===car.id&&r.startKey&&r.endKey&&!(to<r.startKey||from>r.endKey));
    return`<span class="avail-chip ${busy?'avail-busy':'avail-free'}">${car.targa} ${busy?'🔴':'🟢'}</span>`;
  }).join('');
  res.innerHTML=html;
}

// ---
// RENTAL MODAL
// ---
function buildColorPick(pid,colors,current,onSel){
  const cp=document.getElementById(pid); cp.innerHTML='';
  colors.forEach(c=>{
    const el=document.createElement('div');
    el.className='cswatch'+(c===current?' on':''); el.style.background=c;
    el.onclick=()=>{cp.querySelectorAll('.cswatch').forEach(s=>s.classList.remove('on'));el.classList.add('on');onSel(c)};
    cp.appendChild(el);
  });
}
function openNewRental(cid,si,ei){
  const car=cars.find(c=>c.id===cid); if(!car)return;
  curRid=null; curCid=cid; curSi=si; curEi=ei;
  document.getElementById('mRentalTitle').textContent='Nuovo Noleggio';
  document.getElementById('mRentalSub').textContent=`${car.targa} — ${car.model}`;
  setRO(si,ei); checkConflict(cid,si,ei,null);
  const fields=['f_km','f_km_r','f_fuel','f_clean','f_tipo','f_cognome','f_nome','f_cf','f_indirizzo','f_tel','f_email','f_pat','f_pat_r','f_pat_s','f_a_cog','f_a_nom','f_a_pat','f_a_sca','f_prezzo','f_sp','f_se','f_cau','f_acconto','f_pag','f_d_carr','f_d_vetri','f_d_int','f_d_cer','f_d_note','f_r_carr','f_r_vetri','f_r_fuel','f_r_clean','f_r_note','f_pen','f_note'];
  fields.forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  document.getElementById('f_stato').value='noleggio';
  document.getElementById('f_pay_status').value='nonpagato';
  document.getElementById('pcalc').style.display='none';
  document.getElementById('saldoDisplay').textContent='—';
  document.getElementById('btnDel').style.display='none';
  document.getElementById('clientLookup').value='';
  document.getElementById('clientSuggest').innerHTML='';
  selColor=car.color||RCOLS[rentals.length%RCOLS.length];
  buildColorPick('colorPick',RCOLS,selColor,c=>selColor=c);
  document.getElementById('mRental').classList.add('open');
}
function openEditRental(rid){
  const r=rentals.find(x=>x.id===rid); if(!r)return;
  const car=cars.find(c=>c.id===r.carId);
  curRid=rid; curCid=r.carId;
  curSi=dIdx(r.startKey); curEi=dIdx(r.endKey);
  if(curSi<0)curSi=0; if(curEi<0)curEi=DAYS.length-1;
  document.getElementById('mRentalTitle').textContent='Modifica Noleggio';
  document.getElementById('mRentalSub').textContent=car?`${car.targa} — ${car.model}`:'';
  setRO(curSi,curEi); checkConflict(r.carId,curSi,curEi,rid);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  s('f_km',r.km);s('f_km_r',r.kmR);s('f_fuel',r.fuel);s('f_clean',r.clean);s('f_tipo',r.tipo);s('f_cognome',r.cognome);s('f_nome',r.nome);s('f_cf',r.cf);s('f_indirizzo',r.indirizzo);s('f_tel',r.tel);s('f_email',r.email);s('f_pat',r.pat);s('f_pat_r',r.patR);s('f_pat_s',r.patS);s('f_a_cog',r.aCog);s('f_a_nom',r.aNom);s('f_a_pat',r.aPat);s('f_a_sca',r.aSca);s('f_prezzo',r.prezzo);s('f_sp',r.sp);s('f_se',r.se);s('f_cau',r.cau);s('f_acconto',r.acconto);s('f_pag',r.pag);s('f_d_carr',r.dCarr);s('f_d_vetri',r.dVetri);s('f_d_int',r.dInt);s('f_d_cer',r.dCer);s('f_d_note',r.dNote);s('f_r_carr',r.rCarr);s('f_r_vetri',r.rVetri);s('f_r_fuel',r.rFuel);s('f_r_clean',r.rClean);s('f_r_note',r.rNote);s('f_pen',r.pen);s('f_stato',r.stato||'noleggio');s('f_note',r.note);
  document.getElementById('f_pay_status').value=r.payStatus||'nonpagato';
  selColor=r.color||RCOLS[0];
  buildColorPick('colorPick',RCOLS,selColor,c=>selColor=c);
  calcTot();
  document.getElementById('btnDel').style.display='flex';
  document.getElementById('clientLookup').value='';
  document.getElementById('clientSuggest').innerHTML='';
  document.getElementById('mRental').classList.add('open');
}
function setRO(si,ei){
  document.getElementById('dStart').textContent=fd(dk(DAYS[si]));
  document.getElementById('dEnd').textContent=fd(dk(DAYS[ei]));
  document.getElementById('dDays').textContent=(ei-si+1)+' gg';
  const car=cars.find(c=>c.id===curCid)||{targa:'—',model:'—'};
  document.getElementById('dTarga').textContent=car.targa;
  document.getElementById('dModello').textContent=car.model;
}
function checkConflict(cid,si,ei,xid){
  const c=rentals.some(r=>{
    if(r.id===xid||r.carId!==cid)return false;
    const rsi=dIdx(r.startKey), rei=dIdx(r.endKey);
    return!(ei<rsi||si>rei);
  });
  const w=document.getElementById('conflictWarn');
  w.className='conflict'+(c?' show':'');
}
function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}
function saveRental(){
  const days=curEi-curSi+1;
  const p=parseFloat(gv('f_prezzo'))||0;
  const sp=parseFloat(gv('f_sp'))||0, se2=parseFloat(gv('f_se'))||0;
  const base=days*p, sc=se2>0?se2:base*sp/100, net=base-sc, iva=net*.22, tot=net+iva;
  const acconto=parseFloat(gv('f_acconto'))||0;
  const pen=parseFloat(gv('f_pen'))||0;
  const saldo=tot+pen-acconto;
  const r={
    id:curRid||'r'+Date.now(),
    ctrNum:curRid?(rentals.find(x=>x.id===curRid)?.ctrNum||ctrCounter):ctrCounter,
    carId:curCid,
    startKey:dk(DAYS[curSi]), endKey:dk(DAYS[curEi]),
    color:selColor, stato:gv('f_stato'), payStatus:gv('f_pay_status'),
    km:gv('f_km'), kmR:gv('f_km_r'), fuel:gv('f_fuel'), clean:gv('f_clean'),
    tipo:gv('f_tipo'), cognome:gv('f_cognome'), nome:gv('f_nome'), cf:gv('f_cf'),
    indirizzo:gv('f_indirizzo'), tel:gv('f_tel'), email:gv('f_email'),
    pat:gv('f_pat'), patR:gv('f_pat_r'), patS:gv('f_pat_s'),
    aCog:gv('f_a_cog'), aNom:gv('f_a_nom'), aPat:gv('f_a_pat'), aSca:gv('f_a_sca'),
    prezzo:gv('f_prezzo'), sp:gv('f_sp'), se:gv('f_se'), cau:gv('f_cau'),
    acconto:gv('f_acconto'), pag:gv('f_pag'), pen:gv('f_pen'),
    totale:p?tot.toFixed(2):'', saldo:p?saldo.toFixed(2):'',
    dCarr:gv('f_d_carr'), dVetri:gv('f_d_vetri'), dInt:gv('f_d_int'), dCer:gv('f_d_cer'), dNote:gv('f_d_note'),
    rCarr:gv('f_r_carr'), rVetri:gv('f_r_vetri'), rFuel:gv('f_r_fuel'), rClean:gv('f_r_clean'), rNote:gv('f_r_note'),
    note:gv('f_note'),
  };
  if(!curRid){ctrCounter++; fbSet('meta','ctr',{value:ctrCounter});}
  if(curRid){const i=rentals.findIndex(x=>x.id===curRid);if(i>=0)rentals[i]=r;}
  else rentals.push(r);
  fbSet('rentals',r.id,r);
  showSync('Salvato ✓');
  closeM('mRental'); buildTable(); toast('Noleggio salvato ✓');
}
async function deleteRental(){
  if(!curRid||!confirm("Eliminare questo noleggio?"))return;
  rentals=rentals.filter(r=>r.id!==curRid);
  await fbDelete('rentals',curRid);
  showSync('Eliminato');
  closeM('mRental'); buildTable(); toast('Eliminato');
}
function calcTot(){
  const days=curEi!==null?(curEi-curSi+1):0;
  const p=parseFloat(gv('f_prezzo'))||0;
  const sp=parseFloat(gv('f_sp'))||0, se2=parseFloat(gv('f_se'))||0;
  if(!p){document.getElementById('pcalc').style.display='none';document.getElementById('saldoDisplay').textContent='—';return}
  const base=days*p, sc=se2>0?se2:base*sp/100, net=base-sc, iva=net*.22, tot=net+iva;
  const acconto=parseFloat(gv('f_acconto'))||0, pen=parseFloat(gv('f_pen'))||0, saldo=tot+pen-acconto;
  document.getElementById('pcalc').style.display='block';
  document.getElementById('pc_base').textContent=`€ ${base.toFixed(2)}`;
  document.getElementById('pc_sc').textContent=sc>0?`- € ${sc.toFixed(2)}`:'—';
  document.getElementById('pc_iva').textContent=`€ ${iva.toFixed(2)}`;
  document.getElementById('pc_tot').textContent=`€ ${tot.toFixed(2)}`;
  document.getElementById('saldoDisplay').textContent=`€ ${saldo.toFixed(2)}`;
}
function clientAutocomplete(){
  const q=document.getElementById('clientLookup').value.toLowerCase();
  const box=document.getElementById('clientSuggest');
  if(!q||q.length<2){box.innerHTML='';return}
  const matches=clients.filter(c=>(c.cognome||'').toLowerCase().includes(q)||(c.nome||'').toLowerCase().includes(q)).slice(0,6);
  if(!matches.length){box.innerHTML='';return}
  box.innerHTML=`<div class="suggest-box">${matches.map(c=>`<div class="suggest-item" onmousedown="fillClient('${c.id}')">${c.cognome||''} ${c.nome||''} <span style="color:var(--text3);font-size:10px">${c.cf||''}</span></div>`).join('')}</div>`;
}
function fillClient(cid){
  const c=clients.find(x=>x.id===cid); if(!c)return;
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  s('f_tipo',c.tipo);s('f_cognome',c.cognome);s('f_nome',c.nome);s('f_cf',c.cf);s('f_indirizzo',c.indirizzo);s('f_tel',c.tel);s('f_email',c.email);s('f_pat',c.pat);s('f_pat_s',c.patS);
  document.getElementById('clientLookup').value=`${c.cognome||''} ${c.nome||''}`.trim();
  document.getElementById('clientSuggest').innerHTML='';
}
function clearClientFields(){
  ['f_tipo','f_cognome','f_nome','f_cf','f_indirizzo','f_tel','f_email','f_pat','f_pat_r','f_pat_s'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  document.getElementById('clientLookup').value=''; document.getElementById('clientSuggest').innerHTML='';
}

// ---
// PRINT CONTRACT
// ---
function printContract(){
  const car=cars.find(c=>c.id===curCid);
  const si=DAYS[curSi], ei=DAYS[curEi], days=curEi-curSi+1;
  const p=parseFloat(gv('f_prezzo'))||0;
  const sp=parseFloat(gv('f_sp'))||0, se2=parseFloat(gv('f_se'))||0;
  const base=days*p, sc=se2>0?se2:base*sp/100, net=base-sc, iva=net*.22, tot=net+iva;
  const acconto=parseFloat(gv('f_acconto'))||0, pen=parseFloat(gv('f_pen'))||0, saldo=tot+pen-acconto;
  const r=rentals.find(x=>x.id===curRid);
  const ctrNum=r?.ctrNum||ctrCounter;
  const ctrStr=`CTR-${curYear}-${p2(ctrNum)}`;
  const ag=settings.agency||'AutoNoleggio';
  const hasAgg=gv('f_a_cog')||gv('f_a_nom');
  const kmPerc=(gv('f_km')&&gv('f_km_r'))?(parseInt(gv('f_km_r'))-parseInt(gv('f_km')))+' km':'—';
  function row(l,v,full=false){return`<div class="pf${full?' full':''}"><div class="pfl">${l}</div><div class="pfv">${v||'—'}</div></div>`}
  const html=`<div class="pdoc">
  <div class="p-hdr"><div><div class="p-agency">${ag}</div>${settings.address?`<div style="font-size:8pt;color:#555">${settings.address}</div>`:''}${settings.phone||settings.email?`<div style="font-size:8pt;color:#555">${[settings.phone,settings.email].filter(Boolean).join(' · ')}</div>`:''}${settings.piva?`<div style="font-size:8pt;color:#555">P.IVA: ${settings.piva}</div>`:''}</div><div style="text-align:right"><div style="font-size:11pt;font-weight:bold;color:#0f1f3d">${ctrStr}</div><div style="font-size:8.5pt;color:#555">Data: ${fd(dk(TODAY))}</div></div></div>
  <div class="p-title">Contratto di Noleggio Veicolo</div>
  <div class="p-sec"><div class="p-sec-t">1. Dati Conduttore</div><div class="pgrid">${row('Cognome',gv('f_cognome'))}${row('Nome',gv('f_nome'))}${row('C.F./P.IVA',gv('f_cf'))}${row('Tipo',gv('f_tipo'))}${row('Indirizzo',gv('f_indirizzo'),true)}${row('Telefono',gv('f_tel'))}${row('Email',gv('f_email'))}${row('N° Patente',gv('f_pat'))}${row('Rilascio',fd(gv('f_pat_r')))}${row('Scadenza pat.',fd(gv('f_pat_s')))}</div></div>
  ${hasAgg?`<div class="p-sec"><div class="p-sec-t">2. Conducente Aggiuntivo</div><div class="pgrid">${row('Cognome',gv('f_a_cog'))}${row('Nome',gv('f_a_nom'))}${row('N° Patente',gv('f_a_pat'))}${row('Scadenza',fd(gv('f_a_sca')))}</div></div>`:''}
  <div class="p-sec"><div class="p-sec-t">${hasAgg?'3':'2'}. Veicolo</div><div class="pgrid t3">${row('Targa',car?car.targa:'—')}${row('Modello',car?car.model:'—')}${row('KM cons.',gv('f_km')||'—')}${row('KM resa',gv('f_km_r')||'—')}${row('KM percorsi',kmPerc)}${row('Carburante',gv('f_fuel'))}${row('Pulizia cons.',gv('f_clean'))}${row('Carb. reso',gv('f_r_fuel'))}${row('Pulizia resa',gv('f_r_clean'))}</div>
  <div style="font-size:8pt;margin-top:4px"><strong>Danni consegna:</strong> Carr.=${gv('f_d_carr')||'—'} · Vetri=${gv('f_d_vetri')||'—'} · Int.=${gv('f_d_int')||'—'} · Cerchi=${gv('f_d_cer')||'—'}${gv('f_d_note')?' · '+gv('f_d_note'):''}</div>
  ${(gv('f_r_carr')||gv('f_r_note'))?`<div style="font-size:8pt;margin-top:2px"><strong>Restituzione:</strong> Carr.=${gv('f_r_carr')||'—'} · Vetri=${gv('f_r_vetri')||'—'}${gv('f_r_note')?' · '+gv('f_r_note'):''}</div>`:''}</div>
  <div class="p-sec"><div class="p-sec-t">${hasAgg?'4':'3'}. Periodo e Corrispettivo</div><div class="pgrid t3">${row('Data inizio',fd(dk(si)))}${row('Data fine',fd(dk(ei)))}${row('N° giorni',days)}${row('Prezzo/giorno',p?`€ ${p.toFixed(2)}`:'—')}${row('Sconto',sc>0?`€ ${sc.toFixed(2)}`:'—')}${row('IVA 22%',p?`€ ${iva.toFixed(2)}`:'—')}</div>${p?`<div class="p-tot"><strong>TOTALE IVA INCLUSA</strong><strong style="font-size:13pt;color:#0f1f3d">€ ${tot.toFixed(2)}</strong></div>`:''}</div>
  <div class="p-sec"><div class="p-sec-t">${hasAgg?'5':'4'}. Pagamento e Cauzione</div><div class="pgrid">${row('Metodo',gv('f_pag'))}${row('Cauzione',gv('f_cau')?`€ ${parseFloat(gv('f_cau')).toFixed(2)}`:'—')}${row('Acconto',acconto?`€ ${acconto.toFixed(2)}`:'—')}${row('Saldo residuo',p?`€ ${saldo.toFixed(2)}`:'—')}${row('Stato pagamento',gv('f_pay_status'))}</div></div>
  ${gv('f_note')?`<div class="p-sec"><div class="p-sec-t">Note</div><div style="border:1px solid #ccc;padding:6px;font-size:9pt">${gv('f_note')}</div></div>`:''}
  <div class="p-sec"><div class="p-sec-t">${hasAgg?'6':'5'}. Condizioni Generali</div><div class="p-clauses">
    <div class="p-ct">Art.1 — Consegna e restituzione</div><div>Il veicolo viene consegnato nelle condizioni descritte nel presente verbale. La restituzione deve avvenire entro la data stabilita, nelle medesime condizioni.</div>
    <div class="p-ct">Art.2 — Uso del veicolo</div><div>Il veicolo deve essere utilizzato esclusivamente dal conduttore autorizzato. È vietato l'uso per gare, competizioni, trasporto a pagamento o attività illecite.</div>
    <div class="p-ct">Art.3 — Carburante</div><div>La restituzione deve avvenire con lo stesso livello di carburante della consegna. Il carburante mancante sarà addebitato con maggiorazione di servizio.</div>
    <div class="p-ct">Art.4 — Responsabilità danni</div><div>Il conduttore è responsabile di tutti i danni al veicolo e a terzi durante il periodo di noleggio. La cauzione sarà trattenuta in caso di danni o inadempienze contrattuali.</div>
    <div class="p-ct">Art.5 — Penali per ritardo</div><div>In caso di restituzione tardiva verrà addebitata una penale pari al doppio del canone giornaliero per ogni giorno o frazione di giorno di ritardo.</div>
    <div class="p-ct">Art.6 — Sinistri</div><div>In caso di sinistro il conduttore è tenuto a: non abbandonare il veicolo, raccogliere i dati dei terzi, compilare il modulo CID e contattare immediatamente l'agenzia.</div>
    <div class="p-ct">Art.7 — Foro competente</div><div>Per qualsiasi controversia le parti eleggono come foro competente ${settings.foro?'il Tribunale di '+settings.foro:"quello del luogo in cui ha sede l'agenzia locatrice"}.</div>
    ${settings.clauses?`<div class="p-ct">Clausole aggiuntive</div><div>${settings.clauses}</div>`:''}
  </div></div>
  <div class="p-sigs"><div><div class="p-sig-line"></div><div class="p-sig-lbl"><strong>${ag}</strong><br>Firma e timbro</div></div><div><div class="p-sig-line"></div><div class="p-sig-lbl"><strong>IL CONDUTTORE</strong><br>${gv('f_cognome')||'___________'} ${gv('f_nome')||''}<br>Firma per accettazione</div></div></div>
  <div style="text-align:center;font-size:7.5pt;color:#777;margin-top:10px">Il conduttore dichiara di aver letto e accettato integralmente le condizioni generali di noleggio. | ${ctrStr} | ${fd(dk(TODAY))}</div>
  </div>`;
  document.getElementById('parea').innerHTML=html;
  document.getElementById('parea').style.display='block';
  window.print();
  document.getElementById('parea').style.display='none';
}

// ---
// LIST
// ---
function populateListFilters(){
  const ys=document.getElementById('listYear'); const cur=ys.value;
  ys.innerHTML='<option value="">Tutti gli anni</option>';
  const yrs=new Set(rentals.map(r=>r.startKey?r.startKey.split('-')[0]:null).filter(Boolean));
  [...yrs].sort().reverse().forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;ys.appendChild(o)});
  if(cur)ys.value=cur;
  const cs=document.getElementById('listCar'); const curC=cs.value;
  cs.innerHTML='<option value="">Tutte le auto</option>';
  cars.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.targa} — ${c.model}`;cs.appendChild(o)});
  if(curC)cs.value=curC;
}
function sortList(key){if(listSortKey===key)listSortDir*=-1;else{listSortKey=key;listSortDir=-1;}renderList()}
function renderList(){
  const q=(document.getElementById('listSearch').value||'').toLowerCase();
  const yr=document.getElementById('listYear').value;
  const st=document.getElementById('listStatus').value;
  const cc=document.getElementById('listCar').value;
  const pp=document.getElementById('listPay').value;
  let list=[...rentals];
  if(q)list=list.filter(r=>(r.cognome||'').toLowerCase().includes(q)||(r.nome||'').toLowerCase().includes(q)||(cars.find(c=>c.id===r.carId)?.targa||'').toLowerCase().includes(q));
  if(yr)list=list.filter(r=>r.startKey&&r.startKey.startsWith(yr));
  if(st)list=list.filter(r=>r.stato===st);
  if(cc)list=list.filter(r=>r.carId===cc);
  if(pp)list=list.filter(r=>(r.payStatus||'nonpagato')===pp);
  list.sort((a,b)=>{
    let va,vb;
    if(listSortKey==='cliente'){va=a.cognome||'';vb=b.cognome||''}
    else if(listSortKey==='auto'){va=cars.find(c=>c.id===a.carId)?.targa||'';vb=cars.find(c=>c.id===b.carId)?.targa||''}
    else if(listSortKey==='inizio'){va=a.startKey||'';vb=b.startKey||''}
    else if(listSortKey==='fine'){va=a.endKey||'';vb=b.endKey||''}
    else if(listSortKey==='giorni'){const siA=dIdx(a.startKey),eiA=dIdx(a.endKey),siB=dIdx(b.startKey),eiB=dIdx(b.endKey);va=siA>=0&&eiA>=0?eiA-siA:0;vb=siB>=0&&eiB>=0?eiB-siB:0}
    else if(listSortKey==='totale'){va=parseFloat(a.totale)||0;vb=parseFloat(b.totale)||0}
    else if(listSortKey==='ctr'){va=a.ctrNum||0;vb=b.ctrNum||0}
    else{va=a.startKey||'';vb=b.startKey||''}
    if(va<vb)return -1*listSortDir; if(va>vb)return 1*listSortDir; return 0;
  });
  let totalRev=0;
  const tbody=document.getElementById('listBody'); tbody.innerHTML='';
  list.forEach(r=>{
    const car=cars.find(c=>c.id===r.carId);
    const si=r.startKey?dIdx(r.startKey):-1, ei=r.endKey?dIdx(r.endKey):-1;
    const days=si>=0&&ei>=0?ei-si+1:'—';
    const tot=parseFloat(r.totale)||0; if(tot)totalRev+=tot;
    const payS=r.payStatus||'nonpagato';
    const ctrStr=r.ctrNum?`CTR-${(r.startKey||'').split('-')[0]||curYear}-${p2(r.ctrNum)}`:'—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${ctrStr}</td><td><strong>${r.cognome||'—'}</strong> ${r.nome||''}<br><span style="font-size:10px;color:var(--text3)">${r.cf||''}</span></td><td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--accent)">${car?car.targa:'—'}</td><td>${fd(r.startKey)}</td><td>${fd(r.endKey)}</td><td>${days}</td><td style="font-family:'DM Mono',monospace">${tot?`€ ${tot.toFixed(0)}`:'—'}</td><td><span class="badge ${payS}">${payS}</span></td><td><span class="badge ${r.stato||'noleggio'}">${r.stato||'noleggio'}</span></td><td style="color:var(--text3);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.note||''}</td>`;
    tr.onclick=()=>openEditRental(r.id);
    tbody.appendChild(tr);
  });
  document.getElementById('listCount').textContent=`${list.length} noleggi`;
  document.getElementById('listTotRev').textContent=totalRev?`Tot: € ${totalRev.toFixed(0)}`:'';
}

// ---
// STATS
// ---
function renderStats(){
  const wrap=document.getElementById('statsWrap');
  const totalDays=(new Date(curYear,11,31)-new Date(curYear,0,1))/86400000+1;
  const dArr=getDays(curYear);
  const yRentals=rentals.filter(r=>r.startKey&&(r.startKey.startsWith(curYear)||r.endKey?.startsWith(curYear)));
  let totalRev=0, totalRented=0, totalPending=0;
  yRentals.forEach(r=>{
    const si=dArr.findIndex(d=>dk(d)===r.startKey), ei=dArr.findIndex(d=>dk(d)===r.endKey);
    const d=si>=0&&ei>=0?ei-si+1:0; totalRented+=d;
    const tot=parseFloat(r.totale)||0; totalRev+=tot;
    if(r.payStatus!=='pagato')totalPending+=parseFloat(r.saldo)||0;
  });
  const avgDays=yRentals.length?Math.round(totalRented/yRentals.length):0;
  const monthly=Array(12).fill(0);
  yRentals.forEach(r=>{if(!r.startKey)return;const m=parseInt(r.startKey.split('-')[1])-1;if(m>=0&&m<12)monthly[m]+=parseFloat(r.totale)||0;});
  const maxMon=Math.max(...monthly,1);
  const carOcc=cars.map(car=>{
    let d=0;
    rentals.filter(r=>r.carId===car.id).forEach(r=>{const si=dArr.findIndex(x=>dk(x)===r.startKey),ei=dArr.findIndex(x=>dk(x)===r.endKey);if(si>=0&&ei>=0)d+=ei-si+1});
    return{car,days:d,pct:Math.min(100,Math.round(d/totalDays*100))};
  }).sort((a,b)=>b.pct-a.pct);
  wrap.innerHTML=`<div class="stats-grid"><div class="kpi"><div class="kpi-val">${yRentals.length}</div><div class="kpi-lbl">Noleggi ${curYear}</div></div><div class="kpi"><div class="kpi-val">€ ${Math.round(totalRev).toLocaleString('it')}</div><div class="kpi-lbl">Incasso totale (IVA incl.)</div></div><div class="kpi"><div class="kpi-val">${totalRented}</div><div class="kpi-lbl">Giorni noleggiati</div></div><div class="kpi"><div class="kpi-val">${avgDays}</div><div class="kpi-lbl">Durata media (gg)</div></div></div>
  <div class="chart-row"><div class="chart-box"><div class="chart-title">Incasso mensile (€)</div><div class="bar-chart">${MONTHS.map((m,i)=>`<div class="bc-row"><div class="bc-lbl">${m.slice(0,3)}</div><div class="bc-track"><div class="bc-fill" style="width:${(monthly[i]/maxMon*100).toFixed(1)}%"></div></div><div class="bc-val">€ ${Math.round(monthly[i]).toLocaleString('it')}</div></div>`).join('')}</div></div>
  <div class="chart-box"><div class="chart-title">Occupazione per auto</div><div class="occ-grid">${carOcc.map(o=>`<div class="occ-item"><div class="occ-targa" style="color:${o.car.color||'var(--accent)'}">${o.car.targa}</div><div class="occ-model">${o.car.model}</div><div class="occ-pct" style="color:${o.pct>70?'var(--green)':o.pct>40?'var(--accent)':'var(--text)'}">${o.pct}%<span style="font-size:9px;color:var(--text3);margin-left:4px">${o.days}gg</span></div><div class="occ-bar"><div class="occ-fill" style="width:${o.pct}%;background:${o.car.color||'var(--green)'}"></div></div></div>`).join('')}</div></div></div>
  ${totalPending>0?`<div class="chart-box" style="background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);max-width:300px"><div class="chart-title" style="color:#fca5a5">Saldo da incassare</div><div style="font-size:22px;font-weight:600;font-family:'DM Mono',monospace;color:#fca5a5">€ ${Math.round(totalPending).toLocaleString('it')}</div></div>`:''}`;
}

// ---
// CLIENTS
// ---
function renderClients(){
  const q=(document.getElementById('clientSearch').value||'').toLowerCase();
  const list=clients.filter(c=>!q||(c.cognome||'').toLowerCase().includes(q)||(c.nome||'').toLowerCase().includes(q)||(c.cf||'').toLowerCase().includes(q));
  const grid=document.getElementById('clientsGrid'); grid.innerHTML='';
  if(!list.length){grid.innerHTML='<div style="color:var(--text2);padding:20px;font-size:13px">Nessun cliente. Aggiungine uno con il tasto in alto a destra.</div>';return}
  list.forEach(c=>{
    const card=document.createElement('div'); card.className='client-card';
    card.innerHTML=`<div class="cc-name">${c.cognome||'—'} ${c.nome||''}</div><div class="cc-cf">${c.cf||''}</div><div class="cc-info">${c.tel?'📞 '+c.tel+'  ':''} ${c.email?'✉ '+c.email:''}</div><div style="margin-top:6px"><span class="cc-badge">${c.tipo||'—'}</span></div>`;
    card.onclick=()=>openClientModal(c.id); grid.appendChild(card);
  });
}
function openClientModal(id){
  curClientId=id; const c=id?clients.find(x=>x.id===id):null;
  document.getElementById('mClientTitle').textContent=c?'Modifica Cliente':'Nuovo Cliente';
  const s=(fid,v)=>{const el=document.getElementById(fid);if(el)el.value=v||''};
  s('cl_tipo',c?.tipo);s('cl_cog',c?.cognome);s('cl_nom',c?.nome);s('cl_cf',c?.cf);s('cl_ind',c?.indirizzo);s('cl_tel',c?.tel);s('cl_email',c?.email);s('cl_pat',c?.pat);s('cl_pats',c?.patS);s('cl_note',c?.note);
  document.getElementById('btnCliDel').style.display=c?'flex':'none';
  document.getElementById('mClient').classList.add('open');
}
function saveClient(){
  const c={id:curClientId||'cl'+Date.now(),tipo:gv('cl_tipo'),cognome:gv('cl_cog'),nome:gv('cl_nom'),cf:gv('cl_cf'),indirizzo:gv('cl_ind'),tel:gv('cl_tel'),email:gv('cl_email'),pat:gv('cl_pat'),patS:gv('cl_pats'),note:gv('cl_note')};
  if(curClientId){const i=clients.findIndex(x=>x.id===curClientId);if(i>=0)clients[i]=c}else clients.push(c);
  fbSet('clients',c.id,c); closeM('mClient'); renderClients(); toast('Cliente salvato ✓');
}
async function deleteClient(){
  if(!curClientId||!confirm('Eliminare cliente?'))return;
  clients=clients.filter(c=>c.id!==curClientId);
  await fbDelete('clients',curClientId); closeM('mClient'); renderClients(); toast('Eliminato');
}

// ---
// FLEET
// ---
function renderFleet(){
  const grid=document.getElementById('fleetGrid'); grid.innerHTML='';
  const today=dk(TODAY), in30=dk(new Date(TODAY.getTime()+30*86400000)), in60=dk(new Date(TODAY.getTime()+60*86400000));
  cars.forEach(car=>{
    function ec(d){if(!d)return'';if(d<=today)return'exp';if(d<=in30||d<=in60)return'warn';return'ok'}
    function el(d){if(!d)return'—';if(d<=today)return'🔴 '+fd(d);if(d<=in30)return'🟠 '+fd(d);if(d<=in60)return'🟡 '+fd(d);return'🟢 '+fd(d)}
    const isRented=rentals.some(r=>r.carId===car.id&&r.startKey<=today&&r.endKey>=today);
    const card=document.createElement('div'); card.className='fleet-card';
    card.innerHTML=`<div class="fc-header"><div class="fc-color" style="background:${car.color||'#2563eb'}"></div><div><div class="fc-targa" style="color:${car.color||'var(--accent)'}">${car.targa}</div><div class="fc-model">${car.model}</div></div><div class="fc-status ${isRented?'warn':'ok'}">${isRented?'Noleggiata':'Disponibile'}</div></div>
    <div class="exp-grid"><div class="exp-item"><div class="exp-lbl">Assicurazione</div><div class="exp-date ${ec(car.ass)}">${el(car.ass)}</div></div><div class="exp-item"><div class="exp-lbl">Bollo</div><div class="exp-date ${ec(car.bollo)}">${el(car.bollo)}</div></div><div class="exp-item"><div class="exp-lbl">Revisione</div><div class="exp-date ${ec(car.rev)}">${el(car.rev)}</div></div></div>
    ${car.note?`<div style="font-size:10px;color:var(--text2);margin-top:7px">📝 ${car.note}</div>`:''}
    <div style="display:flex;gap:6px;margin-top:8px"><div class="fc-btn" onclick="openCarEditModal('${car.id}')">✏ Modifica</div></div>`;
    grid.appendChild(card);
  });
}
function openCarEditModal(id){
  curCarEditId=id; const car=id?cars.find(c=>c.id===id):null;
  document.getElementById('mCarEditTitle').textContent=car?'Modifica Auto':'Nuova Auto';
  const s=(fid,v)=>{const el=document.getElementById(fid);if(el)el.value=v||''};
  s('ce_targa',car?.targa);s('ce_model',car?.model);s('ce_ass',car?.ass);s('ce_bollo',car?.bollo);s('ce_rev',car?.rev);s('ce_note',car?.note);
  selCarColor=car?.color||RCOLS[0];
  buildColorPick('carColorPick',RCOLS,selCarColor,c=>selCarColor=c);
  document.getElementById('btnCarDel').style.display=car?'flex':'none';
  document.getElementById('mCarEdit').classList.add('open');
}
function saveCarEdit(){
  const targa=gv('ce_targa').toUpperCase();
  if(!targa){toast('Inserisci la targa','err');return}
  const c={id:curCarEditId||'c'+Date.now(),targa,model:gv('ce_model')||'Veicolo',ass:gv('ce_ass'),bollo:gv('ce_bollo'),rev:gv('ce_rev'),note:gv('ce_note'),color:selCarColor};
  if(curCarEditId){const i=cars.findIndex(x=>x.id===curCarEditId);if(i>=0)cars[i]=c}else cars.push(c);
  fbSet('cars',c.id,c); closeM('mCarEdit'); buildTable(); renderFleet(); checkAlerts(); toast('Auto salvata ✓');
}
async function deleteCarEdit(){
  if(!curCarEditId||!confirm("Rimuovere questa auto? I noleggi associati non verranno eliminati."))return;
  cars=cars.filter(c=>c.id!==curCarEditId);
  await fbDelete('cars',curCarEditId); closeM('mCarEdit'); buildTable(); renderFleet(); toast('Auto rimossa');
}

// ---
// SETTINGS
// ---
function loadSettings(){
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  s('set_agency',settings.agency);s('set_address',settings.address);s('set_phone',settings.phone);s('set_email',settings.email);s('set_piva',settings.piva);s('set_foro',settings.foro);s('set_clauses',settings.clauses);
}
function saveSettings(){
  settings={agency:gv('set_agency'),address:gv('set_address'),phone:gv('set_phone'),email:gv('set_email'),piva:gv('set_piva'),foro:gv('set_foro'),clauses:gv('set_clauses')};
  fbSet('meta','settings',settings);
  document.getElementById('agencyName').textContent=settings.agency||'Fleet Planner';
  toast('Impostazioni salvate ✓');
}

// ---
// EXPORT (backup locale opzionale)
// ---
function exportData(){
  const d={cars,rentals,clients,settings,ctrCounter,exported:new Date().toISOString(),version:3};
  const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`fleet_backup_${new Date().toISOString().split('T')[0]}.json`;a.click();
  toast('Backup esportato ✓');
}
async function importData(e){
  const file=e.target.files[0]; if(!file)return;
  const r=new FileReader();
  r.onload=async ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.cars){cars=d.cars; for(const c of cars)await fbSet('cars',c.id,c)}
      if(d.rentals){rentals=d.rentals; for(const r of rentals)await fbSet('rentals',r.id,r)}
      if(d.clients){clients=d.clients; for(const c of clients)await fbSet('clients',c.id,c)}
      if(d.settings){settings=d.settings; await fbSet('meta','settings',settings)}
      if(d.ctrCounter){ctrCounter=d.ctrCounter; await fbSet('meta','ctr',{value:ctrCounter})}
      buildTable(); toast('Backup importato e sincronizzato ✓');
    }catch{toast('File non valido','err')}
  };
  r.readAsText(file); e.target.value='';
}
function exportCSV(){
  const dArr=getDays(curYear);
  const headers=['N° Contratto','Cliente','C.F./P.IVA','Auto','Data Inizio','Data Fine','Giorni','Prezzo/gg','Totale','Acconto','Saldo','Stato Pagamento','Stato Noleggio','Pagamento','Note'];
  const rows=rentals.map(r=>{
    const car=cars.find(c=>c.id===r.carId);
    const si=dArr.findIndex(d=>dk(d)===r.startKey), ei=dArr.findIndex(d=>dk(d)===r.endKey);
    const days=si>=0&&ei>=0?ei-si+1:'';
    const ctrStr=r.ctrNum?`CTR-${(r.startKey||'').split('-')[0]||curYear}-${p2(r.ctrNum)}`:'';
    return[ctrStr,`${r.cognome||''} ${r.nome||''}`.trim(),r.cf||'',car?car.targa:'',fd(r.startKey),fd(r.endKey),days,r.prezzo||'',r.totale||'',r.acconto||'',r.saldo||'',r.payStatus||'',r.stato||'',r.pag||'',r.note||''];
  });
  const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`noleggi_${curYear}.csv`;a.click();
  toast('CSV esportato ✓');
}
function confirmClear(){
  if(confirm('Attenzione: questo cancellerà i dati su Firebase per TUTTI i dispositivi. Sei sicuro?')){
    toast('Per sicurezza, elimina i dati direttamente dalla console Firebase > Firestore.','err');
  }
}

// ---
// UTILS
// ---
function closeM(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));
function toast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className='toast'+(type==='err'?' err':'')+' show';setTimeout(()=>el.className='toast'+(type==='err'?' err':''),2800)}

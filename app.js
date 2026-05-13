// ---
// CONSTANTS AND STATE
// ---
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const RCOLS=['#2563eb','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488','#65a30d','#ea580c','#4f46e5','#0284c7','#16a34a','#ca8a04','#b91c1c'];
const CATEGORIES=[['A','Economica'],['B','Compatta'],['C','Berlina/Familiare'],['D','SUV'],['E','Premium']];
const SEASONS=['alta','media','bassa'];
const SEASON_COLORS={alta:'#ef4444',media:'#f59e0b',bassa:'#10b981'};
const DEFAULT_SETTINGS={
  agency:'',address:'',phone:'',email:'',piva:'',foro:'',clauses:'',
  // Lista dinamica di periodi. Ogni voce: {stagione:'alta'|'media'|'bassa', from:'MM-DD', to:'MM-DD', attivo:true}
  // I giorni NON coperti da nessun periodo attivo ricadono in 'bassa'.
  // In caso di sovrapposizione, vince la stagione con priorità più alta (alta > media > bassa).
  stagioni:[
    {stagione:'alta', from:'07-01', to:'08-31', attivo:true},
    {stagione:'media',from:'06-01', to:'06-30', attivo:true}
  ],
  listino:{A:{alta:35,media:28,bassa:22},B:{alta:50,media:40,bassa:32},C:{alta:65,media:52,bassa:42},D:{alta:80,media:65,bassa:52},E:{alta:110,media:90,bassa:70}}
};
const TODAY=new Date(); TODAY.setHours(0,0,0,0);
let curYear=TODAY.getFullYear();
let DAYS=[];

// In-memory state (sincronizzato da Firebase)
let cars=[], rentals=[], clients=[];
let settings=JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let ctrCounter=1;

let listSortKey='inizio', listSortDir=-1;
let drag=null, selColor=RCOLS[0];
let curRid=null, curCid=null, curSi=null, curEi=null;
let curClientId=null, curCarEditId=null, selCarColor=RCOLS[0];

// ---
// FIREBASE STORAGE
// ---
function uid(){return window._fbUser?window._fbUser.uid:null}

async function fbSet(collection, id, data){
  if(!uid())return;
  try{
    const{db,doc,setDoc}=window._fb;
    await setDoc(doc(db,'users',uid(),collection,id),data);
  }catch(e){
    console.error('fbSet error',e);
    toast('Errore connessione','err');
  }
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

// Carica tutto da Firebase
async function fbLoadAll(){
  showSync('Caricamento...');
  try{
    const [carsData, rentalsData, clientsData] = await Promise.all([
      fbGetAll('cars'), fbGetAll('rentals'), fbGetAll('clients')
    ]);
    const{db,doc,getDoc}=window._fb;
    const settingsSnap = await getDoc(doc(db,'users',uid(),'meta','settings'));
    const ctrSnap = await getDoc(doc(db,'users',uid(),'meta','ctr'));

    // Firebase è l'unica fonte di verità (niente fallback su localStorage per evitare dati fantasma)
    cars = carsData;
    rentals = rentalsData;
    clients = clientsData;
    // Pulizia cache vecchia (compat: se esiste localStorage da versioni precedenti, lo svuoto)
    try{
      localStorage.removeItem('fp_cars_'+uid());
      localStorage.removeItem('fp_rentals_'+uid());
      localStorage.removeItem('fp_clients_'+uid());
    }catch(_){}

    // Merge settings con default per garantire stagioni/listino presenti
    const loaded = settingsSnap.exists()?settingsSnap.data():{};
    settings = mergeSettings(loaded);

    ctrCounter = ctrSnap.exists()?(ctrSnap.data().value||1):1;

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

function mergeSettings(s){
  const out=JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  ['agency','address','phone','email','piva','foro','clauses'].forEach(k=>{if(s[k]!==undefined)out[k]=s[k]});
  // Migrazione: il vecchio formato era {alta:{from,to}, media:{from,to}} -> converto in array
  if(s.stagioni){
    if(Array.isArray(s.stagioni)){
      // Nuovo formato: array di periodi. Filtro entry valide.
      out.stagioni = s.stagioni
        .filter(p => p && p.stagione && ['alta','media','bassa'].includes(p.stagione))
        .map(p => ({
          stagione: p.stagione,
          from: p.from || '',
          to:   p.to   || '',
          attivo: p.attivo !== false   // default true
        }));
    } else if(typeof s.stagioni === 'object'){
      // Vecchio formato: oggetto -> converto in array
      const arr=[];
      ['alta','media'].forEach(sg=>{
        if(s.stagioni[sg] && s.stagioni[sg].from && s.stagioni[sg].to){
          arr.push({stagione:sg, from:s.stagioni[sg].from, to:s.stagioni[sg].to, attivo:true});
        }
      });
      if(arr.length) out.stagioni = arr;
    }
  }
  if(s.listino){
    CATEGORIES.forEach(([cat])=>{
      if(s.listino[cat]){
        SEASONS.forEach(sg=>{
          if(s.listino[cat][sg]!==undefined)out.listino[cat][sg]=Number(s.listino[cat][sg])||0;
        });
      }
    });
  }
  return out;
}

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
function fd(s){if(!s||s==='—')return'—';if(typeof s==='string' && s.includes('-')){const[y,m,d]=s.split('-');return`${d}/${m}/${y}`}return s}
function getDays(yr){const a=[];const d=new Date(yr,0,1);while(d.getFullYear()===yr){a.push(new Date(d));d.setDate(d.getDate()+1)}return a}
function dIdx(key){return DAYS.findIndex(d=>dk(d)===key)}

// ---
// STAGIONE / PREZZO
// ---
function getStagione(dateKey){
  if(!dateKey)return 'bassa';
  const md=dateKey.substring(5); // MM-DD
  const periodi = Array.isArray(settings.stagioni) ? settings.stagioni : [];
  // Gestisce intervalli che attraversano l'anno (es. 12-15 -> 01-10)
  const inRange=(val,from,to)=>{
    if(!from||!to)return false;
    if(from<=to) return val>=from && val<=to;
    return val>=from || val<=to;
  };
  // Priorità: alta > media > bassa. Il primo match nell'ordine vince.
  for(const sg of ['alta','media','bassa']){
    const match = periodi.some(p => p.attivo!==false && p.stagione===sg && inRange(md,p.from,p.to));
    if(match) return sg;
  }
  // Default: i giorni non coperti sono bassa stagione
  return 'bassa';
}

function getPrezzoSuggerito(cat,dateKey){
  if(!cat)return 0;
  const st=getStagione(dateKey);
  const l=settings.listino||{};
  return (l[cat] && l[cat][st]) || 0;
}

function catLabel(c){
  const f=CATEGORIES.find(x=>x[0]===c);
  return f?`${f[0]} — ${f[1]}`:'—';
}

// ---
// NAVIGATION
// ---
function changeYear(d){
  curYear+=d;
  document.getElementById('yearVal').textContent=curYear;
  DAYS=getDays(curYear);
  buildTable();
  // Aggiorno filtri lista solo se la pagina è attiva
  if(document.getElementById('page-list').classList.contains('active')){
    populateListFilters();
    renderList();
  }
  if(document.getElementById('page-stats').classList.contains('active')) renderStats();
}

function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg)pg.classList.add('active');
  if(btn)btn.classList.add('active');
  else{
    const t=document.querySelector(`.tab[data-page="${id}"]`);
    if(t)t.classList.add('active');
  }
  if(id==='list'){populateListFilters();renderList()}
  else if(id==='stats')renderStats();
  else if(id==='clients')renderClients();
  else if(id==='fleet')renderFleet();
  else if(id==='settings')loadSettings();
}

function goToFleet(){
  const t=document.querySelector('.tab[data-page="fleet"]');
  showPage('fleet',t);
}

// ---
// PLANNING
// ---
function buildTable(){
  DAYS=getDays(curYear);
  const t=document.getElementById('ptable');
  if(!t)return;
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
    const catLine=car.cat?`<div class="car-cat">CAT ${car.cat}</div>`:'';
    tdC.innerHTML=`<div class="car-targa" style="color:${car.color||'var(--accent)'}">${car.targa}</div><div class="car-model">${car.model||''}</div>${catLine}${expW?`<div class="car-exp">${expW}</div>`:''}`;
    tdC.onclick=()=>openCarEditModal(car.id);
    tdC.style.cursor='pointer';
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
      td.addEventListener('touchstart',onTouchStart,{passive:true});
      td.addEventListener('touchmove',onTouchMove,{passive:false});
      td.addEventListener('touchend',onTouchEnd);
      tr.appendChild(td);
    });
    t.appendChild(tr);
  });
  renderBars(); checkAlerts(); setTimeout(()=>scrollToToday(false),80);
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
  if(!banner)return;
  if(warns.length){document.getElementById('alertText').textContent=warns.join(' · ');banner.classList.add('show');}
  else{banner.classList.remove('show');}
}

function scrollToToday(smooth){
  // Se non sono sulla pagina planning, ci vado
  const planActive=document.getElementById('page-planning').classList.contains('active');
  if(!planActive){
    const tab=document.querySelector('.tab[data-page="planning"]');
    showPage('planning',tab);
  }
  // Se sto guardando un altro anno, prima torno all'anno corrente
  if(curYear!==TODAY.getFullYear()){
    curYear=TODAY.getFullYear();
    document.getElementById('yearVal').textContent=curYear;
    DAYS=getDays(curYear);
    buildTable();
    // buildTable richiama scrollToToday(false) in coda → evito doppio scroll
    return;
  }
  const idx=DAYS.findIndex(d=>dk(d)===dk(TODAY)); if(idx<0)return;
  const w=document.getElementById('planWrap');
  if(!w)return;
  const target=Math.max(0,(idx*28)+185-w.clientWidth/2);
  if(smooth){
    w.scrollTo({left:target,behavior:'smooth'});
  } else {
    w.scrollLeft=target;
  }
}

// Scorrimento planning con i pulsanti di navigazione
function planScroll(dir){
  const w=document.getElementById('planWrap');
  if(!w)return;
  const cellW=28;
  let delta=0;
  if(dir==='left')       delta=-cellW*7;   // 1 settimana indietro
  else if(dir==='right') delta= cellW*7;   // 1 settimana avanti
  else if(dir==='month-prev') delta=-cellW*30;
  else if(dir==='month-next') delta= cellW*30;
  w.scrollBy({left:delta,behavior:'smooth'});
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
      const lbl=r.cognome?`${r.cognome}${r.nome?' '+r.nome.charAt(0)+'.':''}`:(r.stato==='manutenzione'?'Manutenzione':r.stato==='opzione'?'Prestito':'—');
      bar.innerHTML=`<span class="rbar-lbl">${lbl}</span>`;
    }
    bar.addEventListener('mousedown',e=>{e.stopPropagation();});
    bar.addEventListener('touchstart',e=>{e.stopPropagation();},{passive:true});
    bar.addEventListener('touchend',e=>{e.stopPropagation();e.preventDefault();openEditRental(r.id);});
    bar.addEventListener('click',e=>{e.stopPropagation();openEditRental(r.id)});
    bar.title=(r.cognome||'')+(r.nome?' '+r.nome:'')+' | '+fd(r.startKey)+' → '+fd(r.endKey);
    if(new Date(r.endKey)<TODAY){bar.style.opacity='0.4';bar.style.filter='grayscale(40%)';}
    c0.appendChild(bar); seg=se+1;
  }
}

function onMD(e){
  if(e.button!==0)return;
  // Se il click parte su una barra esistente, apri l'edit invece di creare
  const bar=e.target&&e.target.closest?e.target.closest('.rbar'):null;
  if(bar&&bar.dataset.rid){drag=null;openEditRental(bar.dataset.rid);return;}
  const td=e.currentTarget;
  drag={cid:td.dataset.cid,si:+td.dataset.di,ei:+td.dataset.di};
}
function onME(e){
  if(!drag)return;
  const td=e.currentTarget;
  if(td.dataset.cid!==drag.cid)return;
  drag.ei=+td.dataset.di;
  hilite();
}
function onMU(e){
  if(!drag)return;
  drag.ei=+e.currentTarget.dataset.di;
  clearHilite();
  const si=Math.min(drag.si,drag.ei),ei=Math.max(drag.si,drag.ei);
  const cid=drag.cid; drag=null;
  openNewRental(cid,si,ei);
}
document.addEventListener('mouseup',()=>{if(drag){clearHilite();drag=null;}});

function onTouchStart(e){
  // Se il dito parte sopra una barra esistente, apri l'edit invece di creare un nuovo noleggio
  const bar=e.target&&e.target.closest?e.target.closest('.rbar'):null;
  if(bar&&bar.dataset.rid){drag=null;openEditRental(bar.dataset.rid);return;}
  const td=e.currentTarget;drag={cid:td.dataset.cid,si:+td.dataset.di,ei:+td.dataset.di};hilite();
}
function onTouchMove(e){if(!drag)return;e.preventDefault();const t=e.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY);if(el&&el.dataset&&el.dataset.di&&el.dataset.cid===drag.cid){drag.ei=+el.dataset.di;hilite();}}
function onTouchEnd(e){
  if(!drag)return;
  clearHilite();
  // Se il touch finisce su una barra esistente, apri l'edit
  const t=e.changedTouches&&e.changedTouches[0];
  const elEnd=t?document.elementFromPoint(t.clientX,t.clientY):null;
  const bar=elEnd&&elEnd.closest?elEnd.closest('.rbar'):null;
  if(bar&&bar.dataset.rid){drag=null;openEditRental(bar.dataset.rid);return;}
  const si=Math.min(drag.si,drag.ei),ei=Math.max(drag.si,drag.ei);
  const cid=drag.cid;drag=null;
  openNewRental(cid,si,ei);
}
document.addEventListener('touchend',()=>{if(drag){clearHilite();drag=null;}});

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
  const cp=document.getElementById(pid); if(!cp)return;
  cp.innerHTML='';
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
  document.getElementById('mRentalSub').textContent=`${car.targa} — ${car.model||''}`;
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

  // Suggerimento prezzo automatico in base a categoria auto + stagione
  applyPrezzoSuggerito(car,dk(DAYS[si]));

  selColor=car.color||RCOLS[rentals.length%RCOLS.length];
  buildColorPick('colorPick',RCOLS,selColor,c=>selColor=c);
  document.getElementById('mRental').classList.add('open');
  calcTot();
}

function applyPrezzoSuggerito(car,dateKey){
  const sg=document.getElementById('suggestPrice');
  const inp=document.getElementById('f_prezzo');
  if(!car || !car.cat){
    if(sg)sg.textContent=car?'(nessuna categoria assegnata all\'auto)':'';
    return;
  }
  const price=getPrezzoSuggerito(car.cat,dateKey);
  const season=getStagione(dateKey);
  if(price>0){
    if(inp && !inp.value) inp.value=price;
    if(sg)sg.innerHTML=`Suggerito: <strong style="color:var(--accent)">€${price}/gg</strong> · Cat. ${car.cat} · Stagione ${season}`;
  } else {
    if(sg)sg.textContent=`(nessuna tariffa impostata per cat. ${car.cat} stagione ${season})`;
  }
}

function openEditRental(rid){
  const r=rentals.find(x=>x.id===rid); if(!r)return;
  const car=cars.find(c=>c.id===r.carId);
  curRid=rid; curCid=r.carId;
  curSi=dIdx(r.startKey); curEi=dIdx(r.endKey);
  if(curSi<0)curSi=0; if(curEi<0)curEi=DAYS.length-1;
  document.getElementById('mRentalTitle').textContent='Modifica Noleggio';
  document.getElementById('mRentalSub').textContent=car?`${car.targa} — ${car.model||''}`:'';
  setRO(curSi,curEi); checkConflict(r.carId,curSi,curEi,rid);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  s('f_km',r.km);s('f_km_r',r.kmR);s('f_fuel',r.fuel);s('f_clean',r.clean);s('f_tipo',r.tipo);s('f_cognome',r.cognome);s('f_nome',r.nome);s('f_cf',r.cf);s('f_indirizzo',r.indirizzo);s('f_tel',r.tel);s('f_email',r.email);s('f_pat',r.pat);s('f_pat_r',r.patR);s('f_pat_s',r.patS);s('f_a_cog',r.aCog);s('f_a_nom',r.aNom);s('f_a_pat',r.aPat);s('f_a_sca',r.aSca);s('f_prezzo',r.prezzo);s('f_sp',r.sp);s('f_se',r.se);s('f_cau',r.cau);s('f_acconto',r.acconto);s('f_pag',r.pag);s('f_d_carr',r.dCarr);s('f_d_vetri',r.dVetri);s('f_d_int',r.dInt);s('f_d_cer',r.dCer);s('f_d_note',r.dNote);s('f_r_carr',r.rCarr);s('f_r_vetri',r.rVetri);s('f_r_fuel',r.rFuel);s('f_r_clean',r.rClean);s('f_r_note',r.rNote);s('f_pen',r.pen);s('f_stato',r.stato||'noleggio');s('f_note',r.note);
  document.getElementById('f_pay_status').value=r.payStatus||'nonpagato';

  // Aggiorno suggerimento prezzo (solo info, non sovrascrivo)
  if(car){
    const sg=document.getElementById('suggestPrice');
    if(car.cat){
      const p=getPrezzoSuggerito(car.cat,r.startKey);
      const season=getStagione(r.startKey);
      if(p>0 && sg)sg.innerHTML=`Tariffario: €${p}/gg · Cat. ${car.cat} · Stagione ${season}`;
      else if(sg)sg.textContent='';
    } else if(sg) sg.textContent='';
  }

  selColor=r.color||RCOLS[0];
  buildColorPick('colorPick',RCOLS,selColor,c=>selColor=c);
  calcTot();
  document.getElementById('btnDel').style.display='flex';
  document.getElementById('clientLookup').value='';
  document.getElementById('clientSuggest').innerHTML='';
  document.getElementById('mRental').classList.add('open');
}

function setRO(si,ei){
  const sk=dk(DAYS[si]);const ek=dk(DAYS[ei]);
  const sIn=document.getElementById('dStart');const eIn=document.getElementById('dEnd');
  if(sIn)sIn.value=sk;if(eIn)eIn.value=ek;
  updateDaysCount();
  const car=cars.find(c=>c.id===curCid)||{targa:'—',model:'—',cat:''};
  document.getElementById('dTarga').textContent=car.targa;
  document.getElementById('dModello').textContent=car.model||'—';
  document.getElementById('dCategoria').textContent=car.cat?catLabel(car.cat):'—';
}

function updateDaysCount(){
  const sv=document.getElementById('dStart')?.value;
  const ev=document.getElementById('dEnd')?.value;
  if(!sv||!ev)return;
  const si=DAYS.findIndex(d=>dk(d)===sv);
  const ei=DAYS.findIndex(d=>dk(d)===ev);
  if(si>=0&&ei>=0&&ei>=si){
    curSi=si;curEi=ei;
    document.getElementById('dDays').textContent=(ei-si+1)+' gg';
    checkConflict(curCid,si,ei,curRid);
    const stag=getStagione(sv);
    const sEl=document.getElementById('dStagione');
    if(sEl){
      sEl.textContent='Stagione '+stag.toUpperCase();
      sEl.style.background=SEASON_COLORS[stag]+'33';
      sEl.style.color=SEASON_COLORS[stag];
    }
    // Aggiorna info suggerimento (senza sovrascrivere il prezzo già inserito)
    const car=cars.find(c=>c.id===curCid);
    if(car){
      const sg=document.getElementById('suggestPrice');
      if(car.cat){
        const p=getPrezzoSuggerito(car.cat,sv);
        if(sg && p>0) sg.innerHTML=`Suggerito: <strong style="color:var(--accent)">€${p}/gg</strong> · Cat. ${car.cat} · Stagione ${stag}`;
        else if(sg) sg.textContent=`(nessuna tariffa per cat. ${car.cat} stagione ${stag})`;
      }
    }
    calcTot();
  } else document.getElementById('dDays').textContent='—';
}

function checkConflict(cid,si,ei,xid){
  const c=rentals.some(r=>{
    if(r.id===xid||r.carId!==cid)return false;
    const rsi=dIdx(r.startKey), rei=dIdx(r.endKey);
    return!(ei<rsi||si>rei);
  });
  const w=document.getElementById('conflictWarn');
  if(w)w.className='conflict'+(c?' show':'');
}

function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}

function saveRental(){
  const _sk=document.getElementById('dStart')?.value||dk(DAYS[curSi]);
  const _ek=document.getElementById('dEnd')?.value||dk(DAYS[curEi]);
  const _siF=DAYS.findIndex(d=>dk(d)===_sk);
  const _eiF=DAYS.findIndex(d=>dk(d)===_ek);
  const _si=_siF>=0?_siF:curSi,_ei=_eiF>=0?_eiF:curEi;curSi=_si;curEi=_ei;
  const days=Math.max(1,_ei-_si+1);
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
    // Salvo come numeri per evitare bug nei toFixed
    totale: p? +tot.toFixed(2) : 0,
    saldo:  p? +saldo.toFixed(2) : 0,
    dCarr:gv('f_d_carr'), dVetri:gv('f_d_vetri'), dInt:gv('f_d_int'), dCer:gv('f_d_cer'), dNote:gv('f_d_note'),
    rCarr:gv('f_r_carr'), rVetri:gv('f_r_vetri'), rFuel:gv('f_r_fuel'), rClean:gv('f_r_clean'), rNote:gv('f_r_note'),
    note:gv('f_note'),
  };
  if(!curRid){ctrCounter++; fbSet('meta','ctr',{value:ctrCounter});}
  if(curRid){const i=rentals.findIndex(x=>x.id===curRid);if(i>=0)rentals[i]=r;}
  else rentals.push(r);
  fbSet('rentals',r.id,r);

  // Crea/aggiorna cliente automaticamente se ha almeno cognome
  if(r.cognome||r.nome){
    const existingClient = clients.find(c=>
      (c.cf && r.cf && c.cf.toUpperCase()===r.cf.toUpperCase()) ||
      (c.cognome===r.cognome && c.nome===r.nome && r.cognome)
    );
    if(!existingClient){
      const newClient={
        id:'cl'+Date.now(),
        tipo:r.tipo||'',
        cognome:r.cognome||'',
        nome:r.nome||'',
        cf:r.cf||'',
        pat:r.pat||'',
        patS:r.patS||'',
        indirizzo:r.indirizzo||'',
        tel:r.tel||'',
        email:r.email||'',
        note:''
      };
      clients.push(newClient);
      fbSet('clients',newClient.id,newClient);
    } else {
      let updated=false;
      ['cf','pat','patS','indirizzo','tel','email','tipo'].forEach(f=>{
        if(!existingClient[f]&&r[f]){existingClient[f]=r[f];updated=true;}
      });
      if(updated) fbSet('clients',existingClient.id,existingClient);
    }
  }
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
  const days=(curSi!==null && curEi!==null)?(curEi-curSi+1):0;
  const p=parseFloat(gv('f_prezzo'))||0;
  const sp=parseFloat(gv('f_sp'))||0, se2=parseFloat(gv('f_se'))||0;
  if(!p||!days){document.getElementById('pcalc').style.display='none';document.getElementById('saldoDisplay').textContent='—';return}
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
<div class="p-sec"><div class="p-sec-t">${hasAgg?'3':'2'}. Veicolo</div><div class="pgrid t3">${row('Targa',car?car.targa:'—')}${row('Modello',car?car.model:'—')}${row('Categoria',car&&car.cat?car.cat:'—')}${row('KM cons.',gv('f_km')||'—')}${row('KM resa',gv('f_km_r')||'—')}${row('KM percorsi',kmPerc)}${row('Carburante',gv('f_fuel'))}${row('Pulizia cons.',gv('f_clean'))}${row('Carb. reso',gv('f_r_fuel'))}${row('Pulizia resa',gv('f_r_clean'))}</div>
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
  const ys=document.getElementById('listYear'); if(!ys)return;
  const cur=ys.value;
  ys.innerHTML='<option value="">Tutti gli anni</option>';
  const yrs=new Set(rentals.map(r=>r.startKey?r.startKey.split('-')[0]:null).filter(Boolean));
  [...yrs].sort().reverse().forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;ys.appendChild(o)});
  if(cur)ys.value=cur;
  const cs=document.getElementById('listCar'); const curC=cs.value;
  cs.innerHTML='<option value="">Tutte le auto</option>';
  cars.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.targa} — ${c.model||''}`;cs.appendChild(o)});
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
    const statoVal=r.stato||'noleggio';
    const statoLbl=statoVal==='opzione'?'prestito':statoVal;
    tr.innerHTML=`<td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${ctrStr}</td><td><strong>${r.cognome||'—'}</strong> ${r.nome||''}<br><span style="font-size:10px;color:var(--text3)">${r.cf||''}</span></td><td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--accent)">${car?car.targa:'—'}</td><td>${fd(r.startKey)}</td><td>${fd(r.endKey)}</td><td>${days}</td><td style="font-family:'DM Mono',monospace">${tot?`€ ${tot.toFixed(0)}`:'—'}</td><td><span class="badge ${payS}">${payS}</span></td><td><span class="badge ${statoVal}">${statoLbl}</span></td><td style="color:var(--text3);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.note||''}</td>`;
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
  if(!wrap)return;
  const dArr=getDays(curYear);
  const totalDays=dArr.length;
  const yRentals=rentals.filter(r=>r.startKey&&r.startKey.startsWith(curYear));
  const totalRev=yRentals.reduce((s,r)=>s+(parseFloat(r.totale)||0),0);
  const totalRented=yRentals.reduce((s,r)=>{
    const si=dArr.findIndex(d=>dk(d)===r.startKey),ei=dArr.findIndex(d=>dk(d)===r.endKey);
    return s+(si>=0&&ei>=0?ei-si+1:0);
  },0);
  const avgDays=yRentals.length?Math.round(totalRented/yRentals.length):0;
  const totalPending=rentals.reduce((s,r)=>s+(parseFloat(r.saldo)||0),0);

  let h='<div class="kpi-grid">';
  h+='<div class="kpi"><div class="kpi-val">'+yRentals.length+'</div><div class="kpi-lbl">Noleggi '+curYear+'</div></div>';
  h+='<div class="kpi"><div class="kpi-val">&euro; '+Math.round(totalRev).toLocaleString('it')+'</div><div class="kpi-lbl">Incasso totale (IVA incl.)</div></div>';
  h+='<div class="kpi"><div class="kpi-val">'+totalRented+'</div><div class="kpi-lbl">Giorni noleggiati</div></div>';
  h+='<div class="kpi"><div class="kpi-val">'+avgDays+'</div><div class="kpi-lbl">Durata media (gg)</div></div>';
  h+='</div>';

  // Grafico mensile
  const monthly=Array(12).fill(0).map((_,mi)=>{
    const mrs=yRentals.filter(r=>{const d=new Date(r.startKey);return d.getMonth()===mi;});
    return{m:MONTHS[mi].substring(0,3),rev:mrs.reduce((s,r)=>s+(parseFloat(r.totale)||0),0),n:mrs.length};
  });
  const maxRev=Math.max(1,...monthly.map(m=>m.rev));
  h+='<div class="chart-box"><div class="chart-title">Incasso mensile (&euro;)</div><div class="monthly-chart">';
  monthly.forEach(m=>{
    const pct=Math.round(m.rev/maxRev*100);
    h+='<div class="month-bar"><div class="month-fill" style="height:'+pct+'%" title="'+m.m+': &euro;'+Math.round(m.rev).toLocaleString('it')+'"></div>';
    h+='<div class="month-label">'+m.m+'</div>';
    h+='<div class="month-val">&euro;&thinsp;'+(m.rev?(Math.round(m.rev/100)/10).toFixed(1)+'k':'0')+'</div></div>';
  });
  h+='</div></div>';

  if(totalPending>0){
    h+='<div class="chart-box" style="background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.2)">';
    h+='<div class="chart-title" style="color:var(--accent)">Saldo da incassare (tutti gli anni)</div>';
    h+='<div style="font-size:28px;font-weight:700;color:var(--accent);font-family:DM Mono,monospace">&euro; '+Math.round(totalPending).toLocaleString('it')+'</div>';
    h+='</div>';
  }

  // Tabella ricavo per auto
  const carOcc=cars.map(car=>{
    let d=0,rev=0,nole=0;
    yRentals.filter(r=>r.carId===car.id).forEach(r=>{
      const si=dArr.findIndex(x=>dk(x)===r.startKey),ei=dArr.findIndex(x=>dk(x)===r.endKey);
      if(si>=0&&ei>=0)d+=ei-si+1;
      rev+=parseFloat(r.totale)||0;
      nole++;
    });
    return{car,days:d,pct:Math.min(100,Math.round(d/totalDays*100)),rev,nole};
  }).sort((a,b)=>b.rev-a.rev);

  const totNole=carOcc.reduce((s,o)=>s+o.nole,0);
  const totD=carOcc.reduce((s,o)=>s+o.days,0);
  const totR=carOcc.reduce((s,o)=>s+o.rev,0);

  h+='<div class="chart-box" style="overflow-x:auto">';
  h+='<div class="chart-title">&#128200; Ricavo e occupazione per auto &mdash; '+curYear+'</div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px">';
  h+='<thead><tr style="border-bottom:1px solid rgba(255,255,255,.12)">';
  h+='<th style="text-align:left;padding:6px 8px;color:var(--text3);font-weight:500">Auto</th>';
  h+='<th style="text-align:center;padding:6px 8px;color:var(--text3);font-weight:500">Cat.</th>';
  h+='<th style="text-align:center;padding:6px 8px;color:var(--text3);font-weight:500">Noleggi</th>';
  h+='<th style="text-align:center;padding:6px 8px;color:var(--text3);font-weight:500">Giorni</th>';
  h+='<th style="padding:6px 8px;color:var(--text3);font-weight:500">Occupazione</th>';
  h+='<th style="text-align:right;padding:6px 8px;color:var(--text3);font-weight:500">Ricavo</th>';
  h+='</tr></thead><tbody>';
  carOcc.forEach(function(o){
    var col=o.car.color||'var(--accent)';
    var rv=o.rev>0?'&euro; '+Math.round(o.rev).toLocaleString('it'):'&mdash;';
    var rc=o.rev>0?'var(--green)':'var(--text3)';
    h+='<tr style="border-bottom:1px solid rgba(255,255,255,.04)">';
    h+='<td style="padding:6px 8px"><span style="color:'+col+';font-weight:700;font-family:DM Mono,monospace;font-size:12px">'+o.car.targa+'</span>';
    h+='<div style="font-size:10px;color:var(--text3);margin-top:1px">'+(o.car.model||'')+'</div></td>';
    h+='<td style="text-align:center;padding:6px 8px;color:var(--accent);font-weight:600">'+(o.car.cat||'—')+'</td>';
    h+='<td style="text-align:center;padding:6px 8px;color:var(--text2)">'+o.nole+'</td>';
    h+='<td style="text-align:center;padding:6px 8px;color:var(--text2)">'+o.days+'</td>';
    h+='<td style="padding:6px 8px"><div style="display:flex;align-items:center;gap:6px">';
    h+='<div style="flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px"><div style="width:'+o.pct+'%;height:100%;background:'+col+';border-radius:3px"></div></div>';
    h+='<span style="font-size:11px;color:var(--text3);width:32px;text-align:right">'+o.pct+'%</span></div></td>';
    h+='<td style="text-align:right;padding:6px 8px;font-weight:700;font-family:DM Mono,monospace;color:'+rc+'">'+rv+'</td>';
    h+='</tr>';
  });
  h+='<tr style="border-top:2px solid rgba(255,255,255,.15)">';
  h+='<td style="padding:7px 8px;font-weight:700">TOTALE '+curYear+'</td>';
  h+='<td></td>';
  h+='<td style="text-align:center;padding:7px 8px;font-weight:700">'+totNole+'</td>';
  h+='<td style="text-align:center;padding:7px 8px;font-weight:700">'+totD+'</td><td></td>';
  h+='<td style="text-align:right;padding:7px 8px;font-weight:700;font-family:DM Mono,monospace;color:var(--green)">&euro; '+Math.round(totR).toLocaleString('it')+'</td>';
  h+='</tr></tbody></table></div>';
  wrap.innerHTML=h;
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
    card.innerHTML=`<div class="cc-name">${c.cognome||'—'} ${c.nome||''}</div><div class="cc-cf">${c.cf||''}</div><div class="cc-info">${c.tel?'📞 '+c.tel+' ':''} ${c.email?'✉ '+c.email:''}</div><div style="margin-top:6px"><span class="cc-badge">${c.tipo||'—'}</span></div>`;
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
  if(!cars.length){
    grid.innerHTML='<div style="color:var(--text2);padding:20px;font-size:13px">Nessuna auto. Aggiungine una con il tasto in alto a destra.</div>';
    return;
  }
  cars.forEach(car=>{
    function ec(d){if(!d)return'';if(d<=today)return'exp';if(d<=in30||d<=in60)return'warn';return'ok'}
    function el(d){if(!d)return'—';if(d<=today)return'🔴 '+fd(d);if(d<=in30)return'🟠 '+fd(d);if(d<=in60)return'🟡 '+fd(d);return'🟢 '+fd(d)}
    const isRented=rentals.some(r=>r.carId===car.id&&r.startKey<=today&&r.endKey>=today);
    const card=document.createElement('div'); card.className='fleet-card';
    card.innerHTML=`<div class="fc-header"><div class="fc-color" style="background:${car.color||'#2563eb'}"></div><div style="flex:1;min-width:0"><div class="fc-targa" style="color:${car.color||'var(--accent)'}">${car.targa}</div><div class="fc-model">${car.model||''}</div>${car.cat?`<div class="fc-cat">Cat. ${car.cat} — ${catLabel(car.cat).split('—')[1]||''}</div>`:''}</div><div class="fc-status ${isRented?'warn':'ok'}">${isRented?'Noleggiata':'Disponibile'}</div></div>
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
  s('ce_targa',car?.targa);s('ce_model',car?.model);s('ce_cat',car?.cat);s('ce_ass',car?.ass);s('ce_bollo',car?.bollo);s('ce_rev',car?.rev);s('ce_note',car?.note);
  selCarColor=car?.color||RCOLS[0];
  buildColorPick('carColorPick',RCOLS,selCarColor,c=>selCarColor=c);
  document.getElementById('btnCarDel').style.display=car?'flex':'none';
  document.getElementById('mCarEdit').classList.add('open');
}

function saveCarEdit(){
  const targa=gv('ce_targa').toUpperCase();
  if(!targa){toast('Inserisci la targa','err');return}
  const c={
    id:curCarEditId||'c'+Date.now(),
    targa,
    model:gv('ce_model')||'Veicolo',
    cat:gv('ce_cat')||'',
    ass:gv('ce_ass'),
    bollo:gv('ce_bollo'),
    rev:gv('ce_rev'),
    note:gv('ce_note'),
    color:selCarColor
  };
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
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v==null?'':v;};
  s('set_agency',settings.agency);
  s('set_address',settings.address);
  s('set_phone',settings.phone);
  s('set_email',settings.email);
  s('set_piva',settings.piva);
  s('set_foro',settings.foro);
  s('set_clauses',settings.clauses);
  // Lista periodi stagionali
  renderStagioniList();
  // Tabella tariffe
  buildTariffTable();
}

function renderStagioniList(){
  const box=document.getElementById('stagioniList');
  if(!box)return;
  const periodi = Array.isArray(settings.stagioni) ? settings.stagioni : [];
  if(!periodi.length){
    box.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0">Nessun periodo definito. Tutto l\'anno sarà considerato bassa stagione.</div>';
    return;
  }
  let h='';
  periodi.forEach((p,i)=>{
    const color=SEASON_COLORS[p.stagione]||'#888';
    const checked=p.attivo!==false?'checked':'';
    const disabled=p.attivo===false?'opacity:.5;':'';
    h+=`<div class="stag-row" style="${disabled}">`
      +`<input type="checkbox" ${checked} onchange="toggleStagione(${i},this.checked)" title="Attiva/disattiva">`
      +`<select onchange="updateStagione(${i},'stagione',this.value)" style="border-left:4px solid ${color};padding-left:8px">`
        +['alta','media','bassa'].map(sg=>`<option value="${sg}" ${p.stagione===sg?'selected':''}>${sg.toUpperCase()}</option>`).join('')
      +`</select>`
      +`<input type="text" value="${p.from||''}" placeholder="MM-DD" maxlength="5" onchange="updateStagione(${i},'from',this.value)" style="width:75px;font-family:'DM Mono',monospace">`
      +`<span style="color:var(--text3)">→</span>`
      +`<input type="text" value="${p.to||''}" placeholder="MM-DD" maxlength="5" onchange="updateStagione(${i},'to',this.value)" style="width:75px;font-family:'DM Mono',monospace">`
      +`<button class="btn-sm" style="background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.3)" onclick="removeStagione(${i})" title="Rimuovi">✕</button>`
      +`</div>`;
  });
  box.innerHTML=h;
}

function addStagione(){
  if(!Array.isArray(settings.stagioni)) settings.stagioni=[];
  settings.stagioni.push({stagione:'bassa', from:'', to:'', attivo:true});
  renderStagioniList();
  saveSettings();
}

function removeStagione(i){
  if(!Array.isArray(settings.stagioni))return;
  settings.stagioni.splice(i,1);
  renderStagioniList();
  saveSettings();
}

function toggleStagione(i,val){
  if(!Array.isArray(settings.stagioni)||!settings.stagioni[i])return;
  settings.stagioni[i].attivo=!!val;
  renderStagioniList();
  saveSettings();
}

function updateStagione(i,field,val){
  if(!Array.isArray(settings.stagioni)||!settings.stagioni[i])return;
  settings.stagioni[i][field]=val;
  // Se cambio la stagione, ri-render per aggiornare il colore del bordo
  if(field==='stagione') renderStagioniList();
  saveSettings();
}

function buildTariffTable(){
  const body=document.getElementById('tariffBody');
  if(!body)return;
  const li=settings.listino||DEFAULT_SETTINGS.listino;
  let h='';
  CATEGORIES.forEach(([cat,name])=>{
    h+=`<tr><td><strong style="color:var(--accent)">${cat}</strong> — ${name}</td>`;
    SEASONS.forEach(sg=>{
      const v=(li[cat] && li[cat][sg]!=null)?li[cat][sg]:0;
      h+=`<td style="text-align:center"><input type="number" min="0" step="1" class="tariff-input" id="lp_${cat}_${sg}" value="${v}" oninput="saveSettings()"></td>`;
    });
    h+='</tr>';
  });
  body.innerHTML=h;
}

function saveSettings(){
  settings.agency=gv('set_agency');
  settings.address=gv('set_address');
  settings.phone=gv('set_phone');
  settings.email=gv('set_email');
  settings.piva=gv('set_piva');
  settings.foro=gv('set_foro');
  settings.clauses=gv('set_clauses');
  // settings.stagioni è già aggiornato direttamente dagli handler della lista (add/remove/update/toggle)
  // Mi assicuro solo che sia un array valido
  if(!Array.isArray(settings.stagioni)) settings.stagioni=[];
  const newL={};
  CATEGORIES.forEach(([cat])=>{
    newL[cat]={};
    SEASONS.forEach(sg=>{
      const el=document.getElementById('lp_'+cat+'_'+sg);
      newL[cat][sg]=el?(parseFloat(el.value)||0):0;
    });
  });
  settings.listino=newL;
  fbSet('meta','settings',settings);
  document.getElementById('agencyName').textContent=settings.agency||'Fleet Planner';
}

// ---
// EXPORT
// ---
function exportData(){
  const d={cars,rentals,clients,settings,ctrCounter,exported:new Date().toISOString(),version:4};
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
      if(d.settings){settings=mergeSettings(d.settings); await fbSet('meta','settings',settings)}
      if(d.ctrCounter){ctrCounter=d.ctrCounter; await fbSet('meta','ctr',{value:ctrCounter})}
      buildTable(); toast('Backup importato e sincronizzato ✓');
    }catch(err){console.error(err);toast('File non valido','err')}
  };
  r.readAsText(file); e.target.value='';
}

function exportCSV(){
  const dArr=getDays(curYear);
  const headers=['N° Contratto','Cliente','C.F./P.IVA','Auto','Categoria','Data Inizio','Data Fine','Giorni','Prezzo/gg','Totale','Acconto','Saldo','Stato Pagamento','Stato Noleggio','Pagamento','Note'];
  const rows=rentals.map(r=>{
    const car=cars.find(c=>c.id===r.carId);
    const si=dArr.findIndex(d=>dk(d)===r.startKey), ei=dArr.findIndex(d=>dk(d)===r.endKey);
    const days=si>=0&&ei>=0?ei-si+1:'';
    const ctrStr=r.ctrNum?`CTR-${(r.startKey||'').split('-')[0]||curYear}-${p2(r.ctrNum)}`:'';
    return[ctrStr,`${r.cognome||''} ${r.nome||''}`.trim(),r.cf||'',car?car.targa:'',car?.cat||'',fd(r.startKey),fd(r.endKey),days,r.prezzo||'',r.totale||'',r.acconto||'',r.saldo||'',r.payStatus||'',r.stato||'',r.pag||'',r.note||''];
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
// PDF MENSILE
// ---
function exportMonthPDF(){
  const month=new Date().getMonth();
  const mNames=MONTHS;
  const mrs=rentals.filter(r=>{
    if(!r.startKey)return false;
    const d=new Date(r.startKey);
    return d.getFullYear()===curYear && d.getMonth()===month;
  }).sort((a,b)=>(a.startKey||'').localeCompare(b.startKey||''));
  const rows=mrs.map(r=>{
    const car=cars.find(c=>c.id===r.carId)||{};
    const days=Math.round((new Date(r.endKey)-new Date(r.startKey))/86400000)+1;
    const tot=parseFloat(r.totale)||0;
    return `<tr><td>${(r.cognome||'')} ${(r.nome||'')}</td><td>${car.targa||'?'}</td><td>${car.cat||'—'}</td><td>${fd(r.startKey)}</td><td>${fd(r.endKey)}</td><td style="text-align:center">${days}</td><td style="text-align:right">€${tot.toFixed(2)}</td></tr>`;
  }).join('');
  const tot=mrs.reduce((s,r)=>s+(parseFloat(r.totale)||0),0);
  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Riepilogo '+mNames[month]+' '+curYear+'</title>'
    +'<style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}h2{margin:0 0 4px}p{margin:2px 0;color:#666}'
    +'table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#111;color:#fff;padding:6px 8px;text-align:left}'
    +'td{padding:5px 8px;border-bottom:1px solid #eee}tfoot td{font-weight:bold;border-top:2px solid #111}'
    +'@media print{button{display:none}}</style></head><body>'
    +'<h2>'+(settings.agency||'Fleet Planner')+' — Riepilogo '+mNames[month]+' '+curYear+'</h2>'
    +'<p>'+(settings.address||'')+(settings.piva?' | P.IVA '+settings.piva:'')+'</p>'
    +'<table><thead><tr><th>Cliente</th><th>Targa</th><th>Cat.</th><th>Inizio</th><th>Fine</th><th>GG</th><th>Totale</th></tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot><tr><td colspan="6">TOTALE ('+mrs.length+' noleggi)</td><td style="text-align:right">€'+tot.toFixed(2)+'</td></tr></tfoot>'
    +'</table></body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ---
// TEMA
// ---
function setTheme(t){
  if(!['light','medium','dark'].includes(t)) t='dark';
  document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('fp_theme',t)}catch(_){}
  document.querySelectorAll('[data-theme-btn]').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('data-theme-btn')===t);
  });
}
// Applica subito tema salvato e marca il bottone attivo (anche se l'app è in login)
(function initTheme(){
  let t='dark';
  try{t=localStorage.getItem('fp_theme')||'dark'}catch(_){}
  // Aspetto che il DOM sia pronto per marcare il bottone
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTheme(t));
  } else {
    setTheme(t);
  }
})();

// ---
// UTILS
// ---
function closeM(id){const el=document.getElementById(id);if(el)el.classList.remove('open')}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));

function toast(msg,type=''){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;
  el.className='toast'+(type==='err'?' err':'')+' show';
  setTimeout(()=>el.className='toast'+(type==='err'?' err':''),2800);
}

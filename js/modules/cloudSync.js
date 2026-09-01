
/**
 * cloudSync.js v4 - AUTO SYNC + fix PIN hilang + fix stack
 * Fitur baru: auto sync saat transaksi, tambah, edit, hapus barang
 */
const CLOUD_CONFIG_KEY='kasir_cloud_config';
const SYNC_QUEUE_KEY='kasir_sync_queue';
const LAST_SYNC_KEY='kasir_last_sync';
const CLOUD_STATUS_KEY='kasir_cloud_status';
const DEBUG_KEY='kasir_cloud_debug';

let _origSetItem=null;
let _origRemoveItem=null;
let autoSyncTimer=null;
let isSyncing=false;
let syncInterval=null;

export function loadCloudConfig(){ try{ return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||'{}'); }catch{ return {} } }
export function saveCloudConfig(cfg){ 
  const s=JSON.stringify(cfg);
  if(_origSetItem) _origSetItem.call(localStorage, CLOUD_CONFIG_KEY, s);
  else localStorage.setItem(CLOUD_CONFIG_KEY, s);
}
export function getCloudStatus(){ try{ return JSON.parse(localStorage.getItem(CLOUD_STATUS_KEY)||'{}'); }catch{ return {online:false, lastSync:null, pending:0} } }
export function setCloudStatus(st){
  try{
    const s=JSON.stringify(st);
    if(_origSetItem) _origSetItem.call(localStorage, CLOUD_STATUS_KEY, s);
    else localStorage.setItem(CLOUD_STATUS_KEY, s);
  }catch{}
}
function loadQueue(){ try{ return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)||'[]'); }catch{ return [] } }
function saveQueue(q){
  try{
    const s=JSON.stringify(q);
    if(_origSetItem) _origSetItem.call(localStorage, SYNC_QUEUE_KEY, s);
    else localStorage.setItem(SYNC_QUEUE_KEY, s);
  }catch(e){ console.error('saveQueue', e); }
}
function logDebug(msg){
  try{
    let logs=[]; try{ logs=JSON.parse(localStorage.getItem(DEBUG_KEY)||'[]'); }catch{}
    logs.unshift({t:new Date().toLocaleTimeString(), msg: String(msg).slice(0,220)});
    if(logs.length>80) logs=logs.slice(0,80);
    const s=JSON.stringify(logs);
    if(_origSetItem) _origSetItem.call(localStorage, DEBUG_KEY, s);
    else localStorage.setItem(DEBUG_KEY, s);
    console.log('☁️ '+msg);
  }catch{}
}
export function getDebugLogs(){ try{ return JSON.parse(localStorage.getItem(DEBUG_KEY)||'[]'); }catch{ return [] } }

export function queueChange(collection, id, data, op='upsert'){
  if(!id) return;
  if(op==='delete'){
    // delete tetap queue meski data null
  } else {
    if(!data) return;
  }
  try{
    const q=loadQueue();
    const idx=q.findIndex(j=> j.collection===collection && j.docId===String(id));
    if(idx>=0) q.splice(idx,1);
    let clean=null;
    if(op!=='delete'){
      try{ clean=JSON.parse(JSON.stringify(data)); }catch{ clean=data; }
    }
    q.push({id: Date.now()+Math.random(), collection, docId:String(id), data:clean, op, ts:Date.now(), retries:0});
    if(q.length>500) q.shift();
    saveQueue(q);
    updateStatus();
    scheduleAutoSync(); // auto sync 2 detik setelah perubahan
  }catch(e){ logDebug('queue err '+e.message); }
}

export function queueAllLocalData(){
  try{
    let total=0;
    const prodRaw=localStorage.getItem('kasir_products');
    if(prodRaw){
      try{
        const obj=JSON.parse(prodRaw);
        const arr=Array.isArray(obj)? obj : Object.values(obj);
        logDebug(`Found ${arr.length} products`);
        let c=0;
        for(const p of arr){
          if(p && p.barcode){ queueChange('products', p.barcode, p); c++; if(c>=300) break; }
        }
        total+=c;
      }catch(e){ logDebug('prod parse err '+e.message); }
    }
    const trxRaw=localStorage.getItem('kasir_transactions');
    if(trxRaw){
      try{
        const arr=JSON.parse(trxRaw);
        const list=Array.isArray(arr)? arr : Object.values(arr);
        for(let i=0;i<Math.min(list.length,100);i++){ const t=list[i]; if(t&&t.id) queueChange('transactions', t.id, t); }
        total+=Math.min(list.length,100);
      }catch{}
    }
    logDebug(`QueueAll total ${loadQueue().length}`);
    return loadQueue().length;
  }catch(e){ logDebug('queueAll err '+e.message); return 0; }
}

function scheduleAutoSync(){
  if(autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer=setTimeout(()=>{ 
    if(!isSyncing && navigator.onLine){
      logDebug('Auto-sync triggered (ada perubahan)');
      syncNow();
    }
  }, 2000); // sync 2 detik setelah perubahan terakhir
}

class FirebaseAdapter{
  constructor(config){ this.config=config; this.db=null; this.ready=false; }
  async init(){
    if(window.firebase && window.firebase.firestore){ this.db=window.firebase.firestore(); this.ready=true; return true; }
    try{
      await this.loadSDK();
      if(!window.firebase.apps.length){
        const clean={ apiKey:this.config.apiKey, authDomain:this.config.authDomain, projectId:this.config.projectId, appId:this.config.appId||undefined };
        Object.keys(clean).forEach(k=>{ if(!clean[k]) delete clean[k]; });
        window.firebase.initializeApp(clean);
      }
      this.db=window.firebase.firestore();
      try{ await this.db.enablePersistence({synchronizeTabs:true}); }catch{}
      this.ready=true;
      return true;
    }catch(e){ logDebug('Init fail '+e.message); return false; }
  }
  loadSDK(){
    return new Promise((resolve, reject)=>{
      if(window.firebase && window.firebase.firestore){ resolve(); return; }
      const load=(id, src)=> new Promise((res, rej)=>{
        if(document.getElementById(id)){ res(); return; }
        const s=document.createElement('script'); s.id=id; s.src=src; s.onload=res; s.onerror=()=>rej(new Error(src));
        document.head.appendChild(s);
      });
      load('firebase-app-compat','https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
        .then(()=> load('firebase-firestore-compat','https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'))
        .then(()=> load('firebase-auth-compat','https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'))
        .then(resolve).catch(reject);
    });
  }
  async upsert(col, docId, data){
    if(!this.ready) await this.init();
    const tokoId=this.config.tokoId||'default';
    const clean=JSON.parse(JSON.stringify(data));
    await this.db.collection('toko').doc(tokoId).collection(col).doc(String(docId)).set({...clean, _updatedAt: Date.now()}, {merge:true});
  }
  async deleteDoc(col, docId){
    if(!this.ready) await this.init();
    const tokoId=this.config.tokoId||'default';
    await this.db.collection('toko').doc(tokoId).collection(col).doc(String(docId)).delete();
  }
  async fetchAll(col){
    if(!this.ready) await this.init();
    const tokoId=this.config.tokoId||'default';
    const snap=await this.db.collection('toko').doc(tokoId).collection(col).get();
    const out={}; snap.forEach(d=>{ out[d.id]=d.data(); });
    return out;
  }
}

function getAdapter(){
  const cfg=loadCloudConfig();
  if(!cfg.provider||cfg.provider==='none') return null;
  if(cfg.provider==='firebase') return new FirebaseAdapter(cfg.firebase||{});
  return null;
}

export async function syncNow(){
  if(isSyncing) return {ok:false, reason:'already syncing'};
  const cfg=loadCloudConfig();
  if(!cfg.provider||cfg.provider==='none') return {ok:false, reason:'no provider'};
  if(!navigator.onLine){ logDebug('Offline'); return {ok:false, reason:'offline'}; }
  isSyncing=true;
  updateStatus({syncing:true});
  const adapter=getAdapter();
  if(!adapter){ isSyncing=false; return {ok:false, reason:'no adapter'}; }
  try{
    const ok=await adapter.init();
    if(!ok){ logDebug('Init fail'); return {ok:false, reason:'init fail'}; }
    const queue=loadQueue();
    if(queue.length===0){ logDebug('Queue kosong'); return {ok:true, pending:0, empty:true}; }
    logDebug(`Sync ${queue.length} jobs`);
    const remaining=[];
    let success=0;
    for(const job of queue){
      try{
        if(job.op==='delete') await adapter.deleteDoc(job.collection, job.docId);
        else await adapter.upsert(job.collection, job.docId, job.data);
        success++;
      }catch(e){
        job.retries=(job.retries||0)+1;
        if(job.retries<3) remaining.push(job);
        logDebug(`FAIL ${job.collection}/${job.docId} ${e.code||''} ${e.message?.slice(0,100)}`);
        if(e.code==='permission-denied') break;
      }
      await new Promise(r=>setTimeout(r,80));
    }
    saveQueue(remaining);
    const now=Date.now();
    if(_origSetItem) _origSetItem.call(localStorage, LAST_SYNC_KEY, String(now));
    else localStorage.setItem(LAST_SYNC_KEY, String(now));
    setCloudStatus({online:true, lastSync:now, pending:remaining.length, syncing:false, provider:cfg.provider, tokoId:cfg.tokoId||cfg.firebase?.tokoId, success});
    logDebug(`Done ${success} OK, ${remaining.length} pending`);
    return {ok:true, pending:remaining.length, success};
  }catch(e){
    logDebug('Sync err '+e.message);
    return {ok:false, error:e.message};
  }finally{
    isSyncing=false;
    updateStatus({syncing:false});
  }
}

export async function pullFromCloud(){
  const adapter=getAdapter();
  if(!adapter) return null;
  await adapter.init();
  try{
    const productsRaw=await adapter.fetchAll('products');
    const transactionsRaw=await adapter.fetchAll('transactions');
    const stockLogsRaw=await adapter.fetchAll('stock_logs');
    const products={};
    Object.entries(productsRaw||{}).forEach(([id, data])=>{
      const p=data.barcode ? data : (data.data||data);
      if(!p||!p.barcode) return;
      const { _updatedAt, _synced, ...clean }=p;
      products[p.barcode]={
        barcode: clean.barcode, name: clean.name, category: clean.category||'Umum',
        buyPrice: clean.buyPrice??0, sellPrice: clean.sellPrice??0,
        stock: clean.stock??0, minStock: clean.minStock??5, supplier: clean.supplier||'-',
        createdAt: clean.createdAt||Date.now(), expiredDate: clean.expiredDate||null
      };
    });
    const transactions=Object.values(transactionsRaw||{}).map(d=> d.id? d : (d.data||d)).filter(t=>t&&t.id).sort((a,b)=> new Date(b.date)-new Date(a.date));
    const stockLogs=Object.values(stockLogsRaw||{}).map(d=> d.id? d : (d.data||d)).filter(l=>l&&l.id).sort((a,b)=> new Date(b.date)-new Date(a.date));
    return {products, transactions, stockLogs};
  }catch(e){ logDebug('Pull fail '+e.message); return null; }
}

export function startAutoSync(ms=20000){
  if(syncInterval) clearInterval(syncInterval);
  syncInterval=setInterval(()=>{ if(!isSyncing && loadQueue().length>0) syncNow(); }, ms);
  window.addEventListener('online', ()=>{ logDebug('Online - sync'); syncNow(); });
  logDebug('Auto-sync '+ms+'ms + auto on change 2s');
}
export function stopAutoSync(){ if(syncInterval) clearInterval(syncInterval); syncInterval=null; }

function updateStatus(extra={}){
  const cfg=loadCloudConfig();
  let last=0; try{ last=parseInt(localStorage.getItem(LAST_SYNC_KEY)||'0'); }catch{}
  const pending=loadQueue().length;
  const base=getCloudStatus();
  setCloudStatus({...base, online:navigator.onLine, lastSync:last, pending, provider:cfg.provider, ...extra});
  const badge=document.getElementById('cloud-status-badge');
  if(badge){
    if(!cfg.provider||cfg.provider==='none') badge.textContent='☁️ Offline';
    else if(extra.syncing) badge.textContent='☁️ Syncing...';
    else badge.textContent=`☁️ ${cfg.provider} | ${cfg.tokoId||cfg.firebase?.tokoId||''} | ${last? new Date(last).toLocaleTimeString():'never'} | ${pending} pending | Auto ON`;
  }
  const dbg=document.getElementById('cloud-debug-log');
  if(dbg){
    const logs=getDebugLogs().slice(0,25);
    dbg.innerHTML=logs.map(l=> `<div style="font-size:10px;border-bottom:1px solid #1e293b;padding:3px 0;"><span style="color:#64748b;">${l.t}</span> ${l.msg}</div>`).join('');
  }
}

export function hookLocalStorage(){
  if(_origSetItem) return;
  _origSetItem=localStorage.setItem.bind(localStorage);
  _origRemoveItem=localStorage.removeItem.bind(localStorage);
  
  localStorage.setItem=function(k,v){
    _origSetItem(k,v);
    try{
      if(k===SYNC_QUEUE_KEY || k===CLOUD_STATUS_KEY || k===DEBUG_KEY || k===LAST_SYNC_KEY || k===CLOUD_CONFIG_KEY) return;
      
      // AUTO SYNC untuk semua perubahan penting
      if(k==='kasir_products'){
        try{
          const obj=JSON.parse(v);
          const prevRaw=localStorage.getItem('kasir_products_prev');
          let prev={};
          try{ prev=JSON.parse(prevRaw||'{}'); }catch{}
          
          // Deteksi tambah/edit/hapus
          const currKeys=Object.keys(obj);
          const prevKeys=Object.keys(prev);
          
          // Cek hapus
          prevKeys.forEach(bc=>{
            if(!obj[bc]){
              logDebug(`Auto delete product ${bc}`);
              queueChange('products', bc, null, 'delete');
            }
          });
          
          // Cek tambah/edit - hanya queue yang berubah
          currKeys.forEach(bc=>{
            const curr=obj[bc];
            const old=prev[bc];
            if(!old || JSON.stringify(old)!==JSON.stringify(curr)){
              if(curr && curr.barcode){
                logDebug(`Auto queue product ${curr.barcode} ${!old?'baru':'edit'}`);
                queueChange('products', curr.barcode, curr, 'upsert');
              }
            }
          });
          
          _origSetItem.call(localStorage, 'kasir_products_prev', v);
        }catch(e){ logDebug('hook prod err '+e.message); }
      }
      
      if(k==='kasir_transactions'){
        try{
          const arr=JSON.parse(v);
          if(Array.isArray(arr) && arr.length>0){
            const last=arr[0];
            if(last && last.id){
              // cek apakah transaksi baru (belum ada di prev)
              const prevRaw=localStorage.getItem('kasir_transactions_prev');
              let prevIds=[];
              try{ prevIds=JSON.parse(prevRaw||'[]').map(t=>t.id); }catch{}
              if(!prevIds.includes(last.id)){
                logDebug(`Auto transaksi baru ${last.id} total ${last.totalAfter}`);
                queueChange('transactions', last.id, last, 'upsert');
              }
              _origSetItem.call(localStorage, 'kasir_transactions_prev', v);
            }
          }
        }catch{}
      }
      
      if(k==='kasir_stock_logs'){
        try{
          const arr=JSON.parse(v);
          if(Array.isArray(arr) && arr.length>0){
            const last=arr[0];
            if(last && last.id){
              logDebug(`Auto stock log ${last.barcode} ${last.type}`);
              queueChange('stock_logs', last.id, last, 'upsert');
            }
          }
        }catch{}
      }
    }catch{}
    updateStatus();
  };
  
  // Hook remove untuk deteksi hapus
  localStorage.removeItem=function(k){
    if(k==='kasir_products'){
      logDebug('Products cleared - skip');
    }
    _origRemoveItem(k);
  };
  
  logDebug('hook auto-sync installed');
}

export function renderCloudSettings(container){
  if(!container) return;
  container.innerHTML='';
  const cfg=loadCloudConfig();
  const status=getCloudStatus();
  const queueLen=loadQueue().length;
  const logs=getDebugLogs().slice(0,5);
  container.innerHTML=`
    <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
      <h3 style="font-weight:800;margin-bottom:4px;">☁️ Cloud Database v4 - Auto Sync ON</h3>
      <p style="font-size:11px;color:#16a34a;margin-bottom:8px;">✅ Auto sinkron aktif: transaksi, tambah, edit, hapus barang otomatis ke cloud 2 detik setelah perubahan</p>
      <div id="cloud-status-badge" style="font-size:11px;background:#f0fdf4;border:1px solid #bbf7d0;padding:8px 10px;border-radius:8px;margin-bottom:12px;">${!cfg.provider||cfg.provider==='none'?'☁️ Offline':`☁️ ${cfg.provider} | ${cfg.tokoId||cfg.firebase?.tokoId||''} | ${status.lastSync? new Date(status.lastSync).toLocaleTimeString():'never'} | ${queueLen} pending | Auto ON`}</div>
      
      <label style="font-size:12px;font-weight:600;">Provider</label>
      <select id="cloud-provider" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;margin:6px 0 12px 0;">
        <option value="none" ${cfg.provider==='none'||!cfg.provider?'selected':''}>Local Only</option>
        <option value="firebase" ${cfg.provider==='firebase'?'selected':''}>Firebase Firestore (default DB) - Auto Sync</option>
      </select>
      
      <div id="cloud-config-firebase" style="display:${cfg.provider==='firebase'?'block':'none'};background:#f8fafc;padding:12px;border-radius:10px;margin-bottom:10px;">
        <textarea id="fb-json" placeholder='Paste JSON config Firebase' style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;height:60px;font-size:11px;"></textarea>
        <input id="fb-apiKey" placeholder="apiKey" value="${cfg.firebase?.apiKey||''}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;">
        <input id="fb-authDomain" placeholder="authDomain" value="${cfg.firebase?.authDomain||''}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;">
        <input id="fb-projectId" placeholder="projectId" value="${cfg.firebase?.projectId||''}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;">
        <input id="fb-appId" placeholder="appId" value="${cfg.firebase?.appId||''}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;">
        <input id="fb-tokoId" placeholder="ID Toko (samakan di semua HP)" value="${cfg.firebase?.tokoId||cfg.tokoId||''}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;">
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button id="btn-save-cloud" style="padding:10px;background:#0f172a;color:white;border-radius:8px;font-weight:700;">💾 Simpan</button>
        <button id="btn-sync-now" style="padding:10px;border:1px solid #e2e8f0;background:white;border-radius:8px;">🔄 Sync (${queueLen})</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <button id="btn-push-all" style="padding:12px;background:#2563eb;color:white;border-radius:8px;font-weight:700;">⬆️ Push Semua</button>
        <button id="btn-pull-cloud" style="padding:12px;border:1px solid #bbf7d0;background:#f0fdf4;color:#15803d;border-radius:8px;">⬇️ Tarik</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button id="btn-test-firebase" style="flex:1;padding:8px;border:1px solid #e2e8f0;background:white;border-radius:8px;font-size:11px;">🧪 Test</button>
        <button id="btn-clear-queue" style="flex:1;padding:8px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:8px;font-size:11px;">🗑️ Clear</button>
      </div>
      <div style="margin-top:12px;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:10px;">
        <div style="font-size:11px;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;"><span>📋 Auto Sync Log</span><span style="font-size:10px;color:#22c55e;">● AUTO ON</span></div>
        <div id="cloud-debug-log" style="max-height:140px;overflow-y:auto;">${logs.map(l=> `<div style="font-size:10px;border-bottom:1px solid #1e293b;padding:3px 0;"><span style="color:#64748b;">${l.t}</span> ${l.msg}</div>`).join('')||'<div style="font-size:10px;color:#64748b;">Belum ada - tambah produk atau transaksi untuk test auto</div>'}</div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#64748b;background:#f8fafc;padding:8px;border-radius:8px;">
        <b>Auto Sync aktif untuk:</b><br/>
        • Transaksi baru → otomatis ke cloud 2 detik<br/>
        • Tambah barang → otomatis<br/>
        • Edit barang → otomatis<br/>
        • Hapus barang → otomatis delete di cloud<br/>
        • Stok berubah (penjualan) → otomatis<br/>
        Tidak perlu klik Sync manual lagi!
      </div>
    </div>
  `;
  document.getElementById('cloud-provider').onchange=(e)=>{
    document.getElementById('cloud-config-firebase').style.display=e.target.value==='firebase'?'block':'none';
  };
  document.getElementById('fb-json').onchange=(e)=>{
    try{
      const j=JSON.parse(e.target.value.trim());
      if(j.apiKey) document.getElementById('fb-apiKey').value=j.apiKey;
      if(j.authDomain) document.getElementById('fb-authDomain').value=j.authDomain;
      if(j.projectId) document.getElementById('fb-projectId').value=j.projectId;
      if(j.appId) document.getElementById('fb-appId').value=j.appId;
    }catch{}
  };
  document.getElementById('btn-save-cloud').onclick=()=>{
    const provider=document.getElementById('cloud-provider').value;
    const cfg={provider, tokoId:''};
    if(provider==='firebase'){
      let j={}; try{ j=JSON.parse(document.getElementById('fb-json').value.trim()||'{}'); }catch{}
      cfg.firebase={
        apiKey: document.getElementById('fb-apiKey').value.trim()||j.apiKey||'',
        authDomain: document.getElementById('fb-authDomain').value.trim()||j.authDomain||'',
        projectId: document.getElementById('fb-projectId').value.trim()||j.projectId||'',
        appId: document.getElementById('fb-appId').value.trim()||j.appId||'',
        tokoId: document.getElementById('fb-tokoId').value.trim()||'toko-default'
      };
      cfg.tokoId=cfg.firebase.tokoId;
      if(!cfg.firebase.apiKey||!cfg.firebase.projectId){ alert('apiKey & projectId wajib'); return; }
    }
    saveCloudConfig(cfg);
    logDebug('Saved '+provider);
    alert('Disimpan! Auto sync ON - tambah/edit barang akan otomatis ke cloud');
    if(provider!=='none') startAutoSync();
    renderCloudSettings(container);
  };
  document.getElementById('btn-push-all').onclick=()=>{
    const len=queueAllLocalData();
    alert(`Queue ${len} - akan auto sync 2 detik`);
    renderCloudSettings(container);
  };
  document.getElementById('btn-sync-now').onclick=async()=>{
    const res=await syncNow();
    if(res.empty) alert('Queue kosong - auto sync sudah kirim semua');
    else if(res.ok) alert(`OK ${res.success} sukses`);
    else alert(`Gagal ${res.reason||res.error}`);
    renderCloudSettings(container);
  };
  document.getElementById('btn-test-firebase').onclick=async()=>{
    const adapter=getAdapter();
    if(!adapter){ alert('Set firebase'); return; }
    try{
      await adapter.init();
      await adapter.upsert('products','TEST-AUTO',{barcode:'TEST-AUTO',name:'Test Auto',stock:1});
      await adapter.db.collection('toko').doc(adapter.config.tokoId||'default').collection('products').doc('TEST-AUTO').delete();
      logDebug('Test OK');
      alert('✅ Test OK + Auto Sync ON');
    }catch(e){
      logDebug('Test FAIL '+e.code+' '+e.message);
      alert('❌ FAIL '+e.code+' '+e.message);
    }
    renderCloudSettings(container);
  };
  document.getElementById('btn-clear-queue').onclick=()=>{
    if(!confirm('Clear queue?')) return;
    saveQueue([]);
    logDebug('Cleared');
    renderCloudSettings(container);
  };
  document.getElementById('btn-pull-cloud').onclick=async()=>{
    if(!confirm('Overwrite local?')) return;
    const data=await pullFromCloud();
    if(!data){ alert('Gagal'); return; }
    if(data.products){
      if(_origSetItem) _origSetItem.call(localStorage, 'kasir_products', JSON.stringify(data.products));
      else localStorage.setItem('kasir_products', JSON.stringify(data.products));
    }
    if(Array.isArray(data.transactions)) localStorage.setItem('kasir_transactions', JSON.stringify(data.transactions));
    if(Array.isArray(data.stockLogs)) localStorage.setItem('kasir_stock_logs', JSON.stringify(data.stockLogs));
    alert(`Tarik OK ${Object.keys(data.products||{}).length} produk`);
    location.reload();
  };
}

export function initCloudModule(){
  const cfg=loadCloudConfig();
  if(cfg.provider&&cfg.provider!=='none'){
    hookLocalStorage();
    startAutoSync(20000);
    setTimeout(()=>{ if(!isSyncing) syncNow(); }, 3000);
    logDebug('v4 AUTO ON '+cfg.provider);
  }
}

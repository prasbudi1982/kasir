
(function(){
  function loadSet(){ try{ return JSON.parse(localStorage.getItem('kasir_app_settings')||'{}'); }catch(e){ return {}; } }
  function saveSet(s){ localStorage.setItem('kasir_app_settings', JSON.stringify(s)); applyTheme(s); }
  function applyTheme(s){
    const theme = s.theme||'light';
    const accent = s.accent||'blue';
    const accentColors = {blue:'#2563eb', green:'#16a34a', purple:'#7c3aed', orange:'#ea580c', red:'#dc2626'};
    const accentColor = accentColors[accent]||'#2563eb';

    // Apply dark
    document.body.classList.toggle('kasir-dark', theme==='dark');
    document.documentElement.style.setProperty('--kasir-accent', accentColor);
    
    // Update theme cards active state
    document.querySelectorAll('.theme-card').forEach(card=>{
      card.classList.toggle('active', card.getAttribute('data-theme')===theme);
      if(card.getAttribute('data-theme')===theme){
        card.style.borderColor = theme==='dark' ? '#ffffff' : '#0f172a';
        card.style.boxShadow = '0 0 0 2px ' + (theme==='dark' ? '#ffffff' : '#0f172a');
      } else {
        card.style.borderColor = '#e2e8f0';
        card.style.boxShadow = 'none';
      }
    });
    
    // Update accent active
    document.querySelectorAll('.accent-btn').forEach(btn=>{
      const isActive = btn.getAttribute('data-accent')===accent;
      btn.classList.toggle('active', isActive);
      if(isActive){
        btn.style.boxShadow = '0 0 0 3px white, 0 0 0 5px ' + accentColor;
        btn.style.border = '3px solid white';
      } else {
        btn.style.boxShadow = 'none';
        btn.style.border = 'none';
      }
    });

    // Apply accent to preview and to primary buttons in app
    const style = document.getElementById('kasir-accent-style');
    if(style) style.remove();
    const newStyle = document.createElement('style');
    newStyle.id='kasir-accent-style';
    newStyle.textContent = `
      .bg-slate-900 { background: ${accentColor} !important; }
      .bg-slate-900:hover { background: ${accentColor} !important; filter:brightness(0.9); }
      button.bg-slate-900, a.bg-slate-900 { background: ${accentColor} !important; }
      :root { --kasir-accent: ${accentColor}; }
    `;
    document.head.appendChild(newStyle);

    window._autoPrint = s.autoPrint!==false;
    window._autoPrintMode = s.autoPrintMode||'bluetooth';
    window._printerType = s.printerType||'bluetooth-thermal';
  }

  function getTrx(){
    if(window._lastTransaction) return window._lastTransaction;
    try{ const last=localStorage.getItem('kasir_last_trx'); if(last) return JSON.parse(last); }catch(e){}
    return {id:'TRX-'+Date.now(), total:0, items:[{name:'Test', qty:1, price:10000}], bayar:10000, kembalian:0};
  }
  function buildText(trx){
    const toko=JSON.parse(localStorage.getItem('kasir_toko_settings')||'{}');
    let l=[]; l.push((toko.nama||'TOKO KASIR PRO')); l.push((toko.alamat||'Jl. Usaha')); l.push('------------------------------');
    l.push('ID:'+(trx.id||'-')); l.push('Tgl:'+new Date().toLocaleString('id-ID')); l.push('------------------------------');
    (trx.items||[]).forEach(it=>{ l.push((it.name||'Item').slice(0,32)); l.push(' '+(it.qty||1)+'x'+(it.price||0)+'='+(it.qty*it.price)); });
    l.push('------------------------------'); l.push('Total:'+trx.total); if(trx.bayar) l.push('Bayar:'+trx.bayar); if(trx.kembalian) l.push('Kembali:'+trx.kembalian); l.push(toko.footer||'Terima kasih'); return l.join('\n');
  }
  function buildEscPos(trx){
    const toko=JSON.parse(localStorage.getItem('kasir_toko_settings')||'{}');
    const s=loadSet();
    const paper = s.paperSize||'58';
    const enc=new TextEncoder(); let b=[]; const add=a=>b.push(...a); const addT=t=>add(Array.from(enc.encode(t+'\n')));
    add([0x1B,0x40]); // init
    if(s.printDensity==='high'){ add([0x1D,0x7C,0x02]); } // density
    add([0x1B,0x61,0x01]); add([0x1B,0x45,0x01]); addT(toko.nama||'TOKO KASIR PRO'); add([0x1B,0x45,0x00]);
    addT(toko.alamat||''); add([0x1B,0x61,0x00]); addT('------------------------------');
    addT('ID:'+(trx.id||'-')); addT('Tgl:'+new Date().toLocaleString('id-ID')); addT('------------------------------');
    (trx.items||[]).forEach(it=>{ addT((it.name||'Item').slice(0, paper==='58'?32:48)); addT(' '+(it.qty||1)+'x'+(it.price||0)+'='+(it.qty*it.price)); });
    addT('------------------------------'); add([0x1B,0x45,0x01]); addT('Total:'+trx.total); add([0x1B,0x45,0x00]);
    if(trx.bayar) addT('Bayar:'+trx.bayar); if(trx.kembalian) addT('Kembali:'+trx.kembalian);
    addT('------------------------------'); add([0x1B,0x61,0x01]); addT(toko.footer||'Terima kasih'); add([0x1B,0x61,0x00]);
    add([0x0A,0x0A,0x0A,0x1D,0x56,0x00]); return new Uint8Array(b);
  }

  window._kasirBT=window._kasirBT||{dev:null,srv:null,chr:null,name:''};
  async function connectBT(){
    try{
      if(!navigator.bluetooth){ alert('Browser tidak support Bluetooth. Pakai Chrome Android HTTPS'); return; }
      const s=loadSet();
      const type=s.printerType||'bluetooth-thermal';
      let filters = [];
      if(type==='bluetooth-thermal'){
        // Try common thermal printer services
        const dev=await navigator.bluetooth.requestDevice({
          acceptAllDevices:true,
          optionalServices:['000018f0-0000-1000-8000-00805f9b34fb','00001101-0000-1000-8000-00805f9b34fb','battery_service', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
        });
        window._kasirBT.dev=dev; window._kasirBT.name=dev.name||''; localStorage.setItem('kasir_printer_name',dev.name||'');
        const srv=await dev.gatt.connect(); window._kasirBT.srv=srv;
        const svcs=await srv.getPrimaryServices();
        for(let svc of svcs){ try{ const chs=await svc.getCharacteristics(); for(let c of chs){ if(c.properties.write||c.properties.writeWithoutResponse){ window._kasirBT.chr=c; break; } } if(window._kasirBT.chr) break; }catch(e){} }
        alert('Printer Thermal terkoneksi: '+(dev.name||'')); updateStatus(true, dev.name);
      } else {
        const dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true, optionalServices:['000018f0-0000-1000-8000-00805f9b34fb','00001101-0000-1000-8000-00805f9b34fb']});
        window._kasirBT.dev=dev; window._kasirBT.name=dev.name||''; localStorage.setItem('kasir_printer_name',dev.name||'');
        const srv=await dev.gatt.connect(); window._kasirBT.srv=srv;
        const svcs=await srv.getPrimaryServices();
        for(let svc of svcs){ try{ const chs=await svc.getCharacteristics(); for(let c of chs){ if(c.properties.write||c.properties.writeWithoutResponse){ window._kasirBT.chr=c; break; } } if(window._kasirBT.chr) break; }catch(e){} }
        alert('Printer terkoneksi: '+(dev.name||'')); updateStatus(true, dev.name);
      }
    }catch(e){ if(e.name!=='NotFoundError') alert('Gagal konek:'+e.message); }
  }
  async function printBT(){
    try{
      const data=buildEscPos(getTrx());
      if(!window._kasirBT.chr){ alert('Belum konek printer. Konek dulu di pengaturan'); return; }
      for(let i=0;i<data.length;i+=512){ await window._kasirBT.chr.writeValue(data.slice(i,i+512)); await new Promise(r=>setTimeout(r,60)); }
      alert('Struk terkirim ke printer '+ (loadSet().printerType||''));
    }catch(e){ alert('Gagal cetak:'+e.message); }
  }
  function printBrowser(){
    let root=document.getElementById('kasir-print-root'); if(!root){ root=document.createElement('div'); root.id='kasir-print-root'; document.body.appendChild(root); }
    root.textContent=buildText(getTrx()); window.print();
  }
  async function shareStruk(){ const txt=buildText(getTrx()); if(navigator.share) await navigator.share({text:txt}); else { await navigator.clipboard.writeText(txt); alert('Disalin ke clipboard - paste di RawBT'); } }
  async function printNetwork(){
    const ip=document.getElementById('printer-ip').value; const port=document.getElementById('printer-port').value||'9100';
    alert('Untuk Network Printer IP '+ip+':'+port+'\nFitur ini butuh backend/bridge. Saat ini gunakan Share atau Bluetooth.\nIP disimpan: '+ip);
    localStorage.setItem('kasir_network_printer', JSON.stringify({ip, port}));
  }
  function updateStatus(on,name){
    const dot=document.getElementById('kasir-printer-dot'); const lab=document.getElementById('kasir-printer-label'); const badge=document.getElementById('printer-model-badge');
    if(dot) dot.className='printer-dot '+(on?'on':'off');
    if(lab) lab.textContent= on ? ('Terhubung: '+(name||'')) : (localStorage.getItem('kasir_printer_name') ? 'Terakhir: '+localStorage.getItem('kasir_printer_name') : 'Tidak terhubung');
    if(badge){
      const s=loadSet();
      badge.textContent = (s.paperSize||'58')+'mm | '+(s.printerType||'thermal');
    }
  }

  function showSettings(){ const o=document.getElementById('kasir-settings-overlay'); if(o){ o.classList.add('active'); o.style.display='block'; document.body.style.overflow='hidden'; } }
  function hideSettings(){ const o=document.getElementById('kasir-settings-overlay'); if(o){ o.classList.remove('active'); o.style.display='none'; document.body.style.overflow=''; } }
  window._showSettings=showSettings; window._hideSettings=hideSettings;

  function injectTabs(){
    let desktopBar=null; const promoBtn=document.getElementById('nav-promo'); if(promoBtn) desktopBar=promoBtn.parentElement;
    if(!desktopBar){ const divs=document.querySelectorAll('div.space-y-1'); for(let d of divs){ if(d.textContent.includes('Transaksi') && d.textContent.includes('Laporan')){ desktopBar=d; break; } } }
    if(desktopBar && !document.getElementById('tab-pengaturan')){
      const btn=document.createElement('button'); btn.id='tab-pengaturan'; btn.textContent='⚙️ Pengaturan'; btn.className='w-full h-11 rounded-xl flex items-center gap-3 px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50';
      btn.onclick=function(e){ e.preventDefault(); showSettings(); }; desktopBar.appendChild(btn);
    }
    let mobileBar=null; const promoMobile=document.getElementById('nav-promo-mobile'); if(promoMobile) mobileBar=promoMobile.parentElement;
    if(!mobileBar){ const fb=document.querySelector('div.fixed.bottom-0'); if(fb) mobileBar=fb.querySelector('div')||fb; }
    if(mobileBar && !document.getElementById('tab-pengaturan-mobile')){
      const btnM=document.createElement('button'); btnM.id='tab-pengaturan-mobile'; btnM.innerHTML='<span>⚙️</span><span>Atur</span>'; btnM.className='h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-500';
      btnM.onclick=function(e){ e.preventDefault(); showSettings(); }; mobileBar.appendChild(btnM);
    }
  }

  function init(){
    const s=loadSet();
    applyTheme(s);

    document.getElementById('kasir-settings-close').onclick=hideSettings;
    document.getElementById('kasir-settings-back').onclick=hideSettings;

    // Theme
    document.getElementById('theme-light').onclick=function(){ let cur=loadSet(); cur.theme='light'; saveSet(cur); };
    document.getElementById('theme-dark').onclick=function(){ let cur=loadSet(); cur.theme='dark'; saveSet(cur); };
    document.querySelectorAll('.accent-btn').forEach(btn=>{
      btn.onclick=function(){ let cur=loadSet(); cur.accent=btn.getAttribute('data-accent'); saveSet(cur); };
    });

    // Printer type
    const printerTypeSel=document.getElementById('printer-type');
    const paperSizeSel=document.getElementById('paper-size');
    const densitySel=document.getElementById('print-density');
    printerTypeSel.value=s.printerType||'bluetooth-thermal';
    if(paperSizeSel) paperSizeSel.value=s.paperSize||'58';
    if(densitySel) densitySel.value=s.printDensity||'normal';

    function updatePrinterUI(){
      const type=printerTypeSel.value;
      document.querySelectorAll('.printer-config').forEach(el=>el.style.display='none');
      if(type.includes('bluetooth')) document.getElementById('printer-config-bluetooth').style.display='block';
      else if(type==='network') document.getElementById('printer-config-network').style.display='block';
      else if(type==='usb' || type==='rawbt') document.getElementById('printer-config-usb').style.display='block';
      else document.getElementById('printer-config-bluetooth').style.display='block';
    }
    printerTypeSel.onchange=function(){ let cur=loadSet(); cur.printerType=printerTypeSel.value; saveSet(cur); updatePrinterUI(); };
    if(paperSizeSel) paperSizeSel.onchange=function(){ let cur=loadSet(); cur.paperSize=paperSizeSel.value; saveSet(cur); updateStatus(!!window._kasirBT.chr, window._kasirBT.name); };
    if(densitySel) densitySel.onchange=function(){ let cur=loadSet(); cur.printDensity=densitySel.value; saveSet(cur); };
    updatePrinterUI();

    // Load network saved
    const net=JSON.parse(localStorage.getItem('kasir_network_printer')||'{}');
    if(net.ip) document.getElementById('printer-ip').value=net.ip;
    if(net.port) document.getElementById('printer-port').value=net.port;

    // Buttons
    document.getElementById('btn-connect-bt').onclick=connectBT;
    document.getElementById('btn-test-print').onclick=function(){
      const trx={id:'TEST-'+Date.now(), total:15000, items:[{name:'Test Cetak '+printerTypeSel.value, qty:1, price:15000}], bayar:15000, kembalian:0};
      window._lastTransaction=trx;
      const type=printerTypeSel.value;
      if(type.includes('bluetooth')){ if(window._kasirBT.chr) printBT(); else alert('Konek dulu'); }
      else if(type==='usb') printBrowser();
      else if(type==='network') printNetwork();
      else if(type==='rawbt') shareStruk();
      else printBrowser();
    };
    document.getElementById('btn-disconnect').onclick=function(){ try{ if(window._kasirBT.srv) window._kasirBT.srv.disconnect(); }catch(e){} window._kasirBT={}; localStorage.removeItem('kasir_printer_name'); updateStatus(false,''); };
    document.getElementById('btn-test-network').onclick=printNetwork;
    document.getElementById('btn-test-usb').onclick=printBrowser;

    const autoT=document.getElementById('auto-print-toggle');
    autoT.checked=s.autoPrint!==false;
    autoT.onchange=function(){ let cur=loadSet(); cur.autoPrint=autoT.checked; saveSet(cur); };

    const nama=document.getElementById('toko-nama'); const alamat=document.getElementById('toko-alamat'); const footer=document.getElementById('toko-footer');
    let toko=JSON.parse(localStorage.getItem('kasir_toko_settings')||'{}'); nama.value=toko.nama||'TOKO KASIR PRO'; alamat.value=toko.alamat||''; footer.value=toko.footer||'Terima kasih';
    document.getElementById('save-toko').onclick=function(){ localStorage.setItem('kasir_toko_settings', JSON.stringify({nama:nama.value, alamat:alamat.value, footer:footer.value})); alert('Disimpan'); };

    // Auto print hook for Bayar
    setInterval(function(){
      const btns=Array.from(document.querySelectorAll('button')).filter(b=>{ const t=(b.textContent||'').trim().toLowerCase(); return t==='bayar' || t.includes('bayar sekarang'); });
      btns.forEach(btn=>{ if(btn._hooked) return; btn._hooked=true; btn.addEventListener('click', function(){ setTimeout(function(){ const cur=loadSet(); if(cur.autoPrint===false) return; let tries=0; const iv=setInterval(function(){ tries++; if(window._lastTransaction || document.body.textContent.includes('Kembalian')){ clearInterval(iv); setTimeout(function(){
        const type=cur.printerType||'bluetooth-thermal';
        if(type.includes('bluetooth')){ if(window._kasirBT.chr) printBT(); else printBrowser(); }
        else if(type==='usb') printBrowser();
        else if(type==='network') { alert('Network butuh bridge, pakai Share'); shareStruk(); }
        else if(type==='rawbt') shareStruk();
      }, 600); } if(tries>25) clearInterval(iv); }, 300); }, 400); }); });
    }, 1000);

    setInterval(injectTabs, 1000);
    setInterval(function(){ updateStatus(!!(window._kasirBT && window._kasirBT.chr), window._kasirBT.name||''); }, 2000);
  }

  document.addEventListener('DOMContentLoaded', init);
  setTimeout(init, 600);
  setTimeout(init, 2000);
})();

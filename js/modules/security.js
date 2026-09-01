
(function(){
  const PIN_KEY='kasir_stock_pin_hash_v1';
  const DEFAULT_PIN='1234';
  const APP_KEYS=['kasir_app_settings','kasir_last_trx','kasir_network_printer','kasir_perpage','kasir_printer_name','kasir_products','kasir_produk_v2','kasir_promo_bundles','kasir_stock_logs','kasir_toko_settings','kasir_transactions'];
  let stockUnlocked=false, authenticating=false, bypassNextStockClick=false;

  async function hashPin(pin){
    const data=new TextEncoder().encode(String(pin));
    const hash=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function ensurePin(){
    if(!localStorage.getItem(PIN_KEY)) localStorage.setItem(PIN_KEY,await hashPin(DEFAULT_PIN));
  }
  function modal(show){
    const m=document.getElementById('kasir-stock-pin-modal'); if(!m)return;
    m.style.display=show?'flex':'none';
    if(show){const i=document.getElementById('kasir-stock-pin-input'); const e=document.getElementById('kasir-stock-pin-error'); i.value='';e.style.display='none';setTimeout(()=>i.focus(),80);}
  }
  async function verifyPin(){
    if(authenticating)return; authenticating=true;
    const i=document.getElementById('kasir-stock-pin-input'),e=document.getElementById('kasir-stock-pin-error');
    const pin=(i.value||'').trim();
    if(!/^\d{4,12}$/.test(pin)){e.textContent='PIN harus berupa 4–12 digit angka';e.style.display='block';authenticating=false;return;}
    await ensurePin();
    const ok=(await hashPin(pin))===localStorage.getItem(PIN_KEY);
    if(!ok){e.textContent='PIN salah';e.style.display='block';i.select();authenticating=false;return;}
    stockUnlocked=true; modal(false); authenticating=false;
    bypassNextStockClick=true;
    const btn=findStockButton(); if(btn) btn.click();
  }
  function findStockButton(){
    return Array.from(document.querySelectorAll('button')).find(b=>/Manajemen Stok|\bStok\b/.test((b.textContent||'').trim()) && !b.closest('#kasir-settings-overlay') && !b.closest('#kasir-stock-pin-modal'));
  }

  document.addEventListener('click',function(ev){
    const b=ev.target.closest('button'); if(!b)return;
    const txt=(b.textContent||'').replace(/\s+/g,' ').trim();
    const isStock=/^.*Manajemen Stok.*$/.test(txt) || (txt==='Stok');
    if(isStock){
      if(bypassNextStockClick){bypassNextStockClick=false;return;}
      if(!stockUnlocked){ev.preventDefault();ev.stopImmediatePropagation();ensurePin();modal(true);return;}
      return;
    }
    if(stockUnlocked && (/Transaksi|Laporan|Saran Promo|Pengaturan|Atur/.test(txt))){stockUnlocked=false;}
  },true);

  function injectSecurityCards(){
    const settings=document.querySelector('#kasir-settings-overlay > div:nth-child(2)');
    if(!settings) return false;
    // PIN card
    if(!document.getElementById('kasir-security-card')){
      const card=document.createElement('div');
      card.id='kasir-security-card';
      card.setAttribute('data-keep','true'); // flag biar tidak dihapus cloud
      card.style.cssText='background:white;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px;';
      card.innerHTML=`
        <h3 style="font-weight:800;margin-bottom:4px;font-size:15px;">🔐 Keamanan Manajemen Stok</h3>
        <p style="font-size:11px;color:#64748b;margin-bottom:14px;">PIN diperlukan setiap kali membuka tab Manajemen Stok. Default: 1234</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <input id="kasir-old-pin" type="password" inputmode="numeric" maxlength="12" placeholder="Sandi lama" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;">
          <input id="kasir-new-pin" type="password" inputmode="numeric" maxlength="12" placeholder="Sandi baru" style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;">
        </div>
        <button id="kasir-change-pin" style="width:100%;padding:12px;background:#0f172a;color:white;border-radius:10px;font-weight:800;margin-top:10px;">🔑 Ubah Sandi / PIN</button>
        <div style="margin-top:12px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:10px;color:#64748b;">PIN hanya untuk akses Manajemen Stok, tidak terkait cloud.</div>
      `;
      settings.insertBefore(card,settings.firstChild);
      document.getElementById('kasir-change-pin').onclick=async function(){
        const oldp=document.getElementById('kasir-old-pin').value.trim(), newp=document.getElementById('kasir-new-pin').value.trim();
        if(!/^\d{4,12}$/.test(oldp))return alert('Sandi lama harus 4–12 digit angka.');
        if(!/^\d{4,12}$/.test(newp))return alert('Sandi baru harus 4–12 digit angka.');
        if(oldp===newp)return alert('Sandi baru harus berbeda.');
        await ensurePin();
        if(await hashPin(oldp)!==localStorage.getItem(PIN_KEY))return alert('Sandi lama salah.');
        localStorage.setItem(PIN_KEY,await hashPin(newp));
        document.getElementById('kasir-old-pin').value='';document.getElementById('kasir-new-pin').value='';
        stockUnlocked=false; alert('PIN berhasil diubah.');
      };
    }
    // Reset card
    if(!document.getElementById('kasir-reset-card')){
      const reset=document.createElement('div');
      reset.id='kasir-reset-card';
      reset.setAttribute('data-keep','true');
      reset.style.cssText='background:#fff;border:1px solid #fecaca;border-radius:16px;padding:18px;margin-bottom:16px;';
      reset.innerHTML=`<h3 style="font-weight:800;margin-bottom:4px;font-size:15px;color:#991b1b;">⚠️ Reset Semua Data</h3><p style="font-size:11px;color:#7f1d1d;margin-bottom:12px;">Menghapus semua data lokal dan kembalikan PIN ke <b>1234</b>.</p><button id="kasir-reset-all" style="width:100%;padding:12px;background:#dc2626;color:white;border-radius:10px;font-weight:800;">🗑️ Reset Semua Data & Kembalikan PIN</button>`;
      settings.appendChild(reset);
      document.getElementById('kasir-reset-all').onclick=function(){
        if(!confirm('Hapus semua data?'))return;
        if(!confirm('Konfirmasi terakhir: DATA TIDAK DAPAT DIKEMBALIKAN.'))return;
        APP_KEYS.forEach(k=>localStorage.removeItem(k));
        localStorage.removeItem(PIN_KEY);
        stockUnlocked=false;
        alert('Reset selesai. PIN kembali 1234.');
        location.reload();
      };
    }
    return true;
  }

  document.addEventListener('DOMContentLoaded',async function(){
    await ensurePin();
    document.getElementById('kasir-stock-pin-cancel').onclick=()=>modal(false);
    document.getElementById('kasir-stock-pin-submit').onclick=verifyPin;
    document.getElementById('kasir-stock-pin-input').addEventListener('keydown',e=>{if(e.key==='Enter')verifyPin();if(e.key==='Escape')modal(false);});
    // coba inject dengan interval karena settings overlay mungkin render belakangan
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      if(injectSecurityCards() || tries>30) clearInterval(iv);
    }, 500);
    // observer juga untuk jaga-jaga kalau cloud render hapus card
    const observer=new MutationObserver(()=>{
      if(!document.getElementById('kasir-security-card')){
        injectSecurityCards();
      }
    });
    const overlay=document.getElementById('kasir-settings-overlay');
    if(overlay) observer.observe(overlay, {childList:true, subtree:true});
  });
})();


/**
 * barcode-fix-global.js - Patch global untuk cegah looping di app.bundle.js asli
 * App.bundle.js asli punya bug: callback Cu() dipanggil setiap frame tanpa debounce
 * Kita patch Html5Qrcode start agar otomatis debounce jika modul lama dipakai
 */
(function(){
  const COOLDOWN = 1500;
  let lastCodes = {};
  
  function patchHtml5Qrcode(){
    if(!window.Html5Qrcode) { setTimeout(patchHtml5Qrcode, 500); return; }
    const Original = window.Html5Qrcode;
    const origStart = Original.prototype.start;
    
    Original.prototype.start = function(...args){
      const userCallback = args[2];
      if(typeof userCallback === 'function'){
        const scannerId = this._elementId || this.elementId || 'unknown';
        const debounced = (decoded)=>{
          const now = Date.now();
          const key = scannerId + '_' + decoded;
          if(lastCodes[key] && (now - lastCodes[key] < COOLDOWN)) return;
          lastCodes[key] = now;
          return userCallback(decoded);
        };
        args[2] = debounced;
      }
      return origStart.apply(this, args);
    };
    console.log('Html5Qrcode patched - anti looping aktif');
  }
  
  // Tunggu library load
  if(window.Html5Qrcode) patchHtml5Qrcode();
  else {
    const iv = setInterval(()=>{
      if(window.Html5Qrcode){ clearInterval(iv); patchHtml5Qrcode(); }
    }, 300);
    setTimeout(()=>clearInterval(iv), 10000);
  }
  
  // Juga patch untuk stop semua scanner ganda saat pindah tab
  window.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const txt = (btn.textContent||'').trim();
    // Jika pindah tab, stop scanner yang tidak terpakai
    if(/Transaksi|Laporan|Promo|Pengaturan/.test(txt)){
      // beri delay biar React sempat unmount
      setTimeout(()=>{
        document.querySelectorAll('#reader, #restock-reader, #stock-inline-reader').forEach(el=>{
          if(el.style.display === 'none' || !el.offsetParent){
            // scanner hidden, coba stop
            try{ 
              // tidak bisa stop langsung tanpa instance, tapi kita bisa clear video
              const v = el.querySelector('video');
              if(v && v.srcObject){
                v.srcObject.getTracks().forEach(t=>t.stop());
                v.srcObject = null;
              }
            }catch{}
          }
        });
      }, 300);
    }
  });
})();

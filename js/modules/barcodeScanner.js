
/**
 * barcodeScanner.js - FIX LOOPING
 * Penyebab looping sebelumnya:
 * 1. Html5Qrcode memanggil callback setiap frame (fps:10) selama barcode terlihat -> 10x/detik
 * 2. Tidak ada cooldown / debounce
 * 3. Modul baru + app.bundle.js jalan bersamaan -> 2x scanner di ID yang sama
 * 
 * Fix: debounce 1.5 detik, lock processing, pause scanner setelah sukses
 */

export const ScannerIds = {
  POS: 'reader',
  RESTOCK: 'restock-reader',
  INLINE: 'stock-inline-reader'
};

let lastScan = {}; // {scannerId: timestamp}
let isProcessing = {}; // {scannerId: boolean}
const COOLDOWN_MS = 1500; // jeda minimal antar scan barcode yang sama
const PROCESSING_LOCK_MS = 1000; // lock setelah sukses scan

function canScan(scannerId, decoded){
  const now = Date.now();
  const key = scannerId + '_' + decoded;
  const last = lastScan[key] || 0;
  if(now - last < COOLDOWN_MS) return false;
  if(isProcessing[scannerId]) return false;
  return true;
}

function markScanned(scannerId, decoded){
  const now = Date.now();
  const key = scannerId + '_' + decoded;
  lastScan[key] = now;
  isProcessing[scannerId] = true;
  setTimeout(()=>{ isProcessing[scannerId] = false; }, PROCESSING_LOCK_MS);
}

export function getVideoTrack(scannerId){
  try{
    const video = document.querySelector(`#${scannerId} video`);
    if(!video) return null;
    const stream = video.srcObject;
    if(!stream) return null;
    const tracks = stream.getVideoTracks();
    return tracks && tracks[0] ? tracks[0] : null;
  }catch{ return null }
}

export async function enableAutoFocus(track){
  try{
    if(!track || !track.applyConstraints) return false;
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
    if(modes.includes('continuous')){
      await track.applyConstraints({advanced:[{focusMode:'continuous'}]});
      return true;
    }
    if(modes.includes('single-shot')){
      await track.applyConstraints({advanced:[{focusMode:'single-shot'}]});
      return true;
    }
    return false;
  }catch{ return false }
}

export async function turnOffTorch(track){
  try{
    if(track?.getCapabilities?.()?.torch){
      await track.applyConstraints({advanced:[{torch:false}]});
    }
  }catch{}
}

export async function setupScannerCapabilities(scannerId){
  await new Promise(r=>setTimeout(r,600));
  try{
    let tries=0, track=null;
    while(tries<6 && !track){
      track = getVideoTrack(scannerId);
      if(!track){ await new Promise(r=>setTimeout(r,300)); tries++; }
    }
    if(!track) return null;
    await enableAutoFocus(track);
    return track;
  }catch{ return null }
}

export async function toggleTorch(scannerId, isCurrentlyOn){
  const btnId = `btn-torch-${scannerId==='reader'?'pos':scannerId==='restock-reader'?'restock':'inline'}`;
  try{
    const track = getVideoTrack(scannerId);
    if(!track){ alert('Kamera belum siap'); return isCurrentlyOn; }
    if(!track.getCapabilities?.()?.torch){ alert('Senter tidak didukung'); return isCurrentlyOn; }
    const next = !isCurrentlyOn;
    await track.applyConstraints({advanced:[{torch:next}]});
    const btn = document.getElementById(btnId);
    if(btn){ btn.classList.toggle('bg-yellow-500', !next); btn.classList.toggle('bg-yellow-600', next); }
    if(navigator.vibrate) navigator.vibrate(next?[30]:[20]);
    return next;
  }catch(e){
    alert('Gagal senter: '+(e?.message||e));
    return isCurrentlyOn;
  }
}

// FIX UTAMA: wrapper scanner dengan debounce
export function createScannerHandlers({ onPosScan, onInlineScan, onRestockScan }){
  let scanners = { pos:null, inline:null, restock:null };

  function createDebouncedHandler(scannerId, originalHandler){
    return (decoded)=>{
      const text = (decoded||'').trim();
      if(!text) return;
      if(!canScan(scannerId, text)){
        // console.log('Scan di-ignore (cooldown):', text);
        return;
      }
      markScanned(scannerId, text);
      // vibrate hanya sekali
      if(navigator.vibrate) navigator.vibrate(40);
      // panggil handler asli
      try{ originalHandler(text); }catch(e){ console.error(e); isProcessing[scannerId]=false; }
    };
  }

  async function startPos(){
    if(!window.Html5Qrcode) throw 'Html5Qrcode belum load';
    if(scanners.pos) await stopPos();
    const s = new window.Html5Qrcode(ScannerIds.POS);
    scanners.pos = s;
    const handler = createDebouncedHandler(ScannerIds.POS, onPosScan);
    await s.start({facingMode:'environment'}, {fps:10, qrbox:{width:250,height:250}, disableFlip:false},
      handler,
      ()=>{} // error callback diabaikan
    );
    setupScannerCapabilities(ScannerIds.POS);
    return s;
  }
  async function stopPos(){
    try{ if(scanners.pos){ await scanners.pos.stop(); scanners.pos.clear(); } }catch{}
    scanners.pos=null;
    isProcessing[ScannerIds.POS]=false;
  }
  async function startInline(){
    if(!window.Html5Qrcode) throw 'Html5Qrcode belum load';
    if(scanners.inline) await stopInline();
    const s = new window.Html5Qrcode(ScannerIds.INLINE);
    scanners.inline = s;
    const handler = createDebouncedHandler(ScannerIds.INLINE, onInlineScan);
    await s.start({facingMode:'environment'}, {fps:10, qrbox:{width:250,height:100}},
      handler,
      ()=>{}
    );
    setupScannerCapabilities(ScannerIds.INLINE);
    return s;
  }
  async function stopInline(){
    try{ if(scanners.inline){ await scanners.inline.stop(); scanners.inline.clear(); } }catch{}
    scanners.inline=null;
    isProcessing[ScannerIds.INLINE]=false;
  }
  async function startRestock(){
    if(!window.Html5Qrcode) throw 'Html5Qrcode belum load';
    if(scanners.restock) await stopRestock();
    const s = new window.Html5Qrcode(ScannerIds.RESTOCK);
    scanners.restock = s;
    const handler = createDebouncedHandler(ScannerIds.RESTOCK, onRestockScan);
    await s.start({facingMode:'environment'}, {fps:10, qrbox:{width:250,height:250}},
      handler,
      ()=>{}
    );
    setupScannerCapabilities(ScannerIds.RESTOCK);
    return s;
  }
  async function stopRestock(){
    try{ if(scanners.restock){ await scanners.restock.stop(); scanners.restock.clear(); } }catch{}
    scanners.restock=null;
    isProcessing[ScannerIds.RESTOCK]=false;
  }
  async function stopAll(){
    await Promise.all([stopPos(), stopInline(), stopRestock()]);
  }

  // Reset cooldown manual jika butuh
  function resetCooldown(scannerId, decoded){
    if(decoded){
      delete lastScan[scannerId + '_' + decoded];
    } else {
      Object.keys(lastScan).forEach(k=>{ if(k.startsWith(scannerId)) delete lastScan[k]; });
    }
    isProcessing[scannerId]=false;
  }

  return { startPos, stopPos, startInline, stopInline, startRestock, stopRestock, stopAll, resetCooldown, getScanners:()=>scanners };
}

// Expose untuk debug
if(typeof window !== 'undefined'){
  window._barcodeDebug = { lastScan, isProcessing, canScan };
}

export function loadAppSettings(){ try{ return JSON.parse(localStorage.getItem('kasir_app_settings')||'{}'); }catch(e){ return {}; } }
export function saveAppSettings(s){ localStorage.setItem('kasir_app_settings', JSON.stringify(s)); applyTheme(s); }
export function loadTokoSettings(){ try{ return JSON.parse(localStorage.getItem('kasir_toko_settings')||'{}'); }catch(e){ return {nama:'TOKO KASIR PRO', alamat:'Jl. Usaha', footer:'Terima kasih'} } }
export function saveTokoSettings(s){ localStorage.setItem('kasir_toko_settings', JSON.stringify(s)); }
export function applyTheme(s){
  const theme = s.theme||'light';
  const accent = s.accent||'blue';
  const accentColors = {blue:'#2563eb', green:'#16a34a', purple:'#7c3aed', orange:'#ea580c', red:'#dc2626'};
  const accentColor = accentColors[accent]||'#2563eb';
  document.body.classList.toggle('kasir-dark', theme==='dark');
  document.documentElement.style.setProperty('--kasir-accent', accentColor);
  document.querySelectorAll('.theme-card').forEach(card=>{
    const isActive = card.getAttribute('data-theme')===theme;
    if(isActive){
      card.style.borderColor = theme==='dark' ? '#ffffff' : '#0f172a';
      card.style.boxShadow = '0 0 0 2px ' + (theme==='dark' ? '#ffffff' : '#0f172a');
    } else {
      card.style.borderColor = '#e2e8f0';
      card.style.boxShadow = 'none';
    }
  });
  document.querySelectorAll('.accent-btn').forEach(btn=>{
    const isActive = btn.getAttribute('data-accent')===accent;
    if(isActive){
      btn.style.boxShadow = '0 0 0 3px white, 0 0 0 5px ' + accentColor;
      btn.style.border = '3px solid white';
    } else {
      btn.style.boxShadow = 'none';
      btn.style.border = 'none';
    }
  });
  const old = document.getElementById('kasir-accent-style');
  if(old) old.remove();
  const newStyle = document.createElement('style');
  newStyle.id='kasir-accent-style';
  newStyle.textContent = '.bg-slate-900 { background: ' + accentColor + ' !important; } .bg-slate-900:hover { background: ' + accentColor + ' !important; filter:brightness(0.9); } button.bg-slate-900, a.bg-slate-900 { background: ' + accentColor + ' !important; } :root { --kasir-accent: ' + accentColor + '; }';
  document.head.appendChild(newStyle);
  window._autoPrint = s.autoPrint!==false;
  window._autoPrintMode = s.autoPrintMode||'bluetooth';
  window._printerType = s.printerType||'bluetooth-thermal';
}

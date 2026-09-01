import { renderCloudSettings } from './cloudSync.js';
import { loadAppSettings, saveAppSettings, applyTheme } from './settings-legacy-wrapper.js';

let _cloudRendered=false;

export function initSettingsModule(){
  const s = loadAppSettings();
  applyTheme(s);
  
  const bindEvents = () => {
    const light = document.getElementById('theme-light');
    const dark = document.getElementById('theme-dark');
    if(!light || !dark){
      setTimeout(bindEvents, 500);
      return;
    }
    light.onclick = () => { let cur = loadAppSettings(); cur.theme='light'; saveAppSettings(cur); };
    dark.onclick = () => { let cur = loadAppSettings(); cur.theme='dark'; saveAppSettings(cur); };
    document.querySelectorAll('.accent-btn').forEach(btn=>{
      btn.onclick = () => { let cur = loadAppSettings(); cur.accent=btn.getAttribute('data-accent'); saveAppSettings(cur); };
    });
    
    try{
      const mount=document.getElementById('settings-extra-mount');
      if(mount && !document.getElementById('kasir-cloud-root')){
        const div=document.createElement('div');
        div.id='kasir-cloud-root';
        div.setAttribute('data-keep','true');
        mount.appendChild(div);
        renderCloudSettings(div);
        _cloudRendered=true;
      } else if(mount && document.getElementById('kasir-cloud-root') && !_cloudRendered){
        // re-render jika diperlukan
        renderCloudSettings(document.getElementById('kasir-cloud-root'));
        _cloudRendered=true;
      }
    }catch(e){ console.warn('cloud render fail', e); }
  };
  
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }
  setTimeout(bindEvents, 800);
  setTimeout(bindEvents, 2000);
}

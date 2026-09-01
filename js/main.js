// Entry point modular - v3 fix stack + pin
import './utils/linkHandler.js';
import './modules/settings-legacy.js';
import { initSettingsModule } from './modules/settings.js';
import './modules/pagination.js';
import './modules/barcode-fix-global.js';
import './modules/barcodeScanner.js';
import './modules/promo.js';
import { initCloudModule } from './modules/cloudSync.js';
import './modules/app.bundle.js';
import './modules/security.js';

// Recovery jika format rusak
try{
  const trxRaw=localStorage.getItem('kasir_transactions');
  if(trxRaw){
    const p=JSON.parse(trxRaw);
    if(!Array.isArray(p)){
      console.warn('Fix transactions object->array');
      localStorage.setItem('kasir_transactions', JSON.stringify(Object.values(p)));
    }
  }
  const logsRaw=localStorage.getItem('kasir_stock_logs');
  if(logsRaw){
    const p=JSON.parse(logsRaw);
    if(!Array.isArray(p)){
      localStorage.setItem('kasir_stock_logs', JSON.stringify(Object.values(p)));
    }
  }
}catch(e){ console.warn('Recovery fail', e); }

initSettingsModule();
initCloudModule();
console.log('Kasir Modular v3 - cloud fix stack + pin');

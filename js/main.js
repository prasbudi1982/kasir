// Entry point - Warung Kode Pak W v1.0 + header lock + auto sync
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

// Recovery format rusak
try{
  const trx=localStorage.getItem('kasir_transactions');
  if(trx){
    const p=JSON.parse(trx);
    if(!Array.isArray(p)) localStorage.setItem('kasir_transactions', JSON.stringify(Object.values(p)));
  }
  const logs=localStorage.getItem('kasir_stock_logs');
  if(logs){
    const p=JSON.parse(logs);
    if(!Array.isArray(p)) localStorage.setItem('kasir_stock_logs', JSON.stringify(Object.values(p)));
  }
}catch{}

initSettingsModule();
initCloudModule();
console.log('Kasir Warung Kode Pak W v1.0 - header lock + auto sync + splash');

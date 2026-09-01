
/**
 * promo.js - RETAIL MODERN PROMO ENGINE
 * 8 TIPE: BUNDLE, BOGO, TIER_QTY, COMBO, HAPPY_HOUR, MIN_SPEND, CLEARANCE_ED, LOYALTY
 */
const PROMO_KEY='kasir_promo_bundles';
const RULES_KEY='kasir_promo_rules';
export function loadPromoBundles(){try{return JSON.parse(localStorage.getItem(PROMO_KEY)||'[]')}catch{return[]}}
export function savePromoBundles(b){localStorage.setItem(PROMO_KEY,JSON.stringify(b))}
export function loadPromoRules(){try{return JSON.parse(localStorage.getItem(RULES_KEY)||'[]')}catch{return[]}}
export function savePromoRules(r){localStorage.setItem(RULES_KEY,JSON.stringify(r))}
export function generateId(pr='PRM-'){return pr+Date.now().toString(36)+Math.random().toString(36).slice(2,5).toUpperCase()}
export function formatRp(n){return 'Rp '+(n||0).toLocaleString('id-ID')}
export function daysUntilExpired(d){if(!d)return null;try{let a=new Date();a.setHours(0,0,0,0);let b=new Date(d);b.setHours(0,0,0,0);if(isNaN(b))return null;return Math.ceil((b-a)/86400000)}catch{return null}}

export function analyzePromo(products, transactions){
  const list=Object.values(products);
  const salesMap={};
  list.forEach(p=> salesMap[p.barcode]={totalSold:0,lastSold:null,omzet:0});
  transactions.forEach(trx=>{(trx.items||[]).forEach(it=>{if(!salesMap[it.barcode])salesMap[it.barcode]={totalSold:0,lastSold:null,omzet:0};salesMap[it.barcode].totalSold+=it.qty;salesMap[it.barcode].omzet+=it.subtotal||(it.sellPrice*it.qty);if(!salesMap[it.barcode].lastSold||trx.date>salesMap[it.barcode].lastSold)salesMap[it.barcode].lastSold=trx.date})});
  const totalAll=Object.values(salesMap).reduce((a,b)=>a+b.totalSold,0);
  const avg=list.length?totalAll/list.length:0;
  const now=new Date();
  const enriched=list.map(p=>{
    const s=salesMap[p.barcode]||{totalSold:0,lastSold:null,omzet:0};
    const last=s.lastSold?new Date(s.lastSold):null;
    const days=last?Math.floor((now-last)/86400000):9999;
    return {product:p,totalSold:s.totalSold,lastSold:s.lastSold,daysSinceLastSold:days,omzet:s.omzet,nilaiStok:p.stock*p.buyPrice,edDays:daysUntilExpired(p.expiredDate),margin:(p.sellPrice-p.buyPrice)/Math.max(1,p.sellPrice)}
  });
  const kurang=enriched.filter(e=> e.totalSold===0 || (e.daysSinceLastSold>30&&e.product.stock>e.product.minStock) || (avg>0&&e.totalSold<avg*0.3)).sort((a,b)=>a.totalSold-b.totalSold);
  const laku=enriched.filter(e=> avg===0?e.totalSold>0:(e.totalSold>=avg*1.5||(e.totalSold>=avg*0.8&&e.daysSinceLastSold<=7))).sort((a,b)=>b.totalSold-a.totalSold);
  const topLaku=laku.slice(0,5);
  const ed=enriched.filter(e=>e.edDays!==null&&e.edDays<=30).sort((a,b)=>a.edDays-b.edDays);
  const highM=enriched.filter(e=>e.margin>0.3).sort((a,b)=>b.margin-a.margin);
  const cats={}; enriched.forEach(e=>{const c=e.product.category||'Umum'; if(!cats[c])cats[c]=[]; cats[c].push(e)});
  const bundles=generateBundles({enriched,kurangLaku:kurang,laku,topLaku,nearlyED:ed,highMargin:highM,categories:cats,avgSold:avg});
  return {enriched,kurangLaku:kurang,laku,topLaku,nearlyED:ed,highMargin:highM,categories:cats,bundles,avgSold:avg,salesMap};
}

function generateBundles({enriched,kurangLaku,laku,topLaku,nearlyED,highMargin,categories,avgSold}){
  const bundles=[];
  kurangLaku.slice(0,4).forEach((k,i)=>{if(!topLaku.length)return;const l=topLaku[i%topLaku.length];const n=l.product.sellPrice+k.product.sellPrice;bundles.push({id:generateId('BND-'),type:'BUNDLE_LAKU_KURANG',bundleName:`Paket Hemat: ${l.product.name} + ${k.product.name}`,items:[{barcode:l.product.barcode,qty:1},{barcode:k.product.barcode,qty:1}],produkLakuBarcode:l.product.barcode,produkKurangLakuBarcode:k.product.barcode,produkLakuName:l.product.name,produkKurangLakuName:k.product.name,hargaNormal:n,hargaBundle:Math.round(n*0.85),diskonPersen:15,alasan:k.daysSinceLastSold>60?`Deadstock ${k.daysSinceLastSold} hari, stok ${k.product.stock}`:`Kurang laku + best seller`,profitNormal:0,validFrom:null,validTo:null,autoApply:true,priority:70})});
  topLaku.filter(t=>t.product.stock>20).slice(0,2).forEach(t=>{bundles.push({id:generateId('BOGO-'),type:'BOGO',bundleName:`Beli 2 Gratis 1: ${t.product.name}`,items:[{barcode:t.product.barcode,qty:3,payQty:2}],produkLakuBarcode:t.product.barcode,produkLakuName:t.product.name,hargaNormal:t.product.sellPrice*3,hargaBundle:t.product.sellPrice*2,diskonPersen:33,alasan:`Stok melimpah ${t.product.stock} pcs`,autoApply:true,priority:80})});
  topLaku.slice(0,2).forEach(t=>{const b=t.product.sellPrice;bundles.push({id:generateId('TIER-'),type:'TIER_QTY',bundleName:`Grosir ${t.product.name}`,items:[{barcode:t.product.barcode,tiers:[{minQty:3,price:Math.round(b*0.9)},{minQty:6,price:Math.round(b*0.82)}]}],produkLakuBarcode:t.product.barcode,hargaNormal:b,hargaBundle:Math.round(b*0.9),diskonPersen:10,alasan:'Incentive beli banyak',autoApply:true,priority:75})});
  const catKeys=Object.keys(categories); if(catKeys.length>=2){const topCats=catKeys.sort((a,b)=>categories[b].reduce((s,e)=>s+e.totalSold,0)-categories[a].reduce((s,e)=>s+e.totalSold,0)).slice(0,2); if(topCats.length===2){const a=categories[topCats[0]].sort((x,y)=>y.totalSold-x.totalSold)[0]; const b=categories[topCats[1]].sort((x,y)=>y.totalSold-x.totalSold)[0]; if(a&&b&&a.product.barcode!==b.product.barcode){const n=a.product.sellPrice+b.product.sellPrice; bundles.push({id:generateId('COMBO-'),type:'CATEGORY_COMBO',bundleName:`Combo ${topCats[0]} + ${topCats[1]}`,items:[{barcode:a.product.barcode,qty:1},{barcode:b.product.barcode,qty:1}],hargaNormal:n,hargaBundle:Math.round(n*0.88),diskonPersen:12,alasan:`Cross-sell ${topCats[0]} & ${topCats[1]}`,autoApply:false,priority:60})}}}
  if(topLaku.length){const s=topLaku[0]; if((s.product.category||'').toLowerCase().includes('minum')||/kopi|teh|susu/i.test(s.product.name)){bundles.push({id:generateId('HAPPY-'),type:'HAPPY_HOUR',bundleName:`Happy Hour 14-16: ${s.product.category||'Minuman'} -15%`,items:[{category:s.product.category}],hargaNormal:s.product.sellPrice,hargaBundle:Math.round(s.product.sellPrice*0.85),diskonPersen:15,alasan:'Tarik traffic jam sepi',validFrom:'14:00',validTo:'16:00',autoApply:true,priority:65,condition:{type:'TIME',from:'14:00',to:'16:00'}})}}
  bundles.push({id:generateId('MIN-'),type:'MIN_SPEND',bundleName:'Belanja 100rb Diskon 5rb',items:[],hargaNormal:100000,hargaBundle:95000,diskonPersen:5,alasan:'ATV booster',autoApply:true,priority:50,condition:{type:'MIN_SPEND',minAmount:100000,discount:5000}});
  bundles.push({id:generateId('MIN-'),type:'MIN_SPEND',bundleName:'Belanja 200rb Diskon 15rb',items:[],hargaNormal:200000,hargaBundle:185000,diskonPersen:7.5,alasan:'ATV booster',autoApply:true,priority:51,condition:{type:'MIN_SPEND',minAmount:200000,discount:15000}});
  nearlyED.slice(0,4).forEach(e=>{const disc=e.edDays<=3?50:e.edDays<=7?35:e.edDays<=14?25:15; bundles.push({id:generateId('ED-'),type:'CLEARANCE_ED',bundleName:`ED ${e.edDays} hari: ${e.product.name} -${disc}%`,items:[{barcode:e.product.barcode,qty:1}],produkKurangLakuBarcode:e.product.barcode,produkKurangLakuName:e.product.name,hargaNormal:e.product.sellPrice,hargaBundle:Math.round(e.product.sellPrice*(1-disc/100)),diskonPersen:disc,alasan:`ED ${e.edDays} hari, rugi ${formatRp(e.nilaiStok)}`,autoApply:true,priority:95})});
  highMargin.slice(0,2).forEach(h=>{bundles.push({id:generateId('LOY-'),type:'LOYALTY_MULTIPLIER',bundleName:`2x Poin: ${h.product.name}`,items:[{barcode:h.product.barcode}],hargaNormal:h.product.sellPrice,hargaBundle:h.product.sellPrice,diskonPersen:0,alasan:`Margin ${Math.round(h.margin*100)}%`,autoApply:false,priority:40,loyaltyMultiplier:2})});
  return bundles.sort((a,b)=>b.priority-a.priority);
}

export class PromoEngine{
  constructor(bundles){ this.bundles=bundles||loadPromoBundles(); }
  getActivePromos(now=new Date()){
    const t=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return this.bundles.filter(p=>{ if(p.type==='HAPPY_HOUR'&&p.condition){return t>=p.condition.from&&t<=p.condition.to} return true });
  }
  applyToCart(cart, productsMap){
    const active=this.getActivePromos();
    let totalDisc=0; let applied=[]; let cartMap={}; cart.forEach(it=> cartMap[it.barcode]=(cartMap[it.barcode]||0)+it.qty);
    active.filter(p=>p.type==='BOGO'||p.type==='TIER_QTY').forEach(promo=>{
      const it=promo.items[0]; const qty=cartMap[it.barcode]||0;
      if(promo.type==='BOGO'&&qty>=it.qty){ const sets=Math.floor(qty/it.qty); const disc=sets*(it.qty-it.payQty)*(productsMap[it.barcode]?.sellPrice||0); totalDisc+=disc; applied.push({...promo,discount:disc,desc:`BOGO bayar ${it.payQty} dpt ${it.qty}`}); }
      if(promo.type==='TIER_QTY'){ const prod=productsMap[it.barcode]; if(!prod)return; const tier=[...it.tiers].reverse().find(t=>qty>=t.minQty); if(tier){ const disc=(prod.sellPrice-tier.price)*qty; totalDisc+=disc; applied.push({...promo,discount:disc,desc:`Grosir ${qty} @${formatRp(tier.price)}`}); } }
    });
    active.filter(p=>['BUNDLE_LAKU_KURANG','CATEGORY_COMBO','CLEARANCE_ED'].includes(p.type)).forEach(promo=>{
      if(promo.type==='CLEARANCE_ED'){ const bc=promo.produkKurangLakuBarcode||promo.items[0].barcode; const q=cartMap[bc]||0; if(q>0){ const prod=productsMap[bc]; if(prod){ const d=(prod.sellPrice-promo.hargaBundle)*q; totalDisc+=d; applied.push({...promo,discount:d,desc:`ED -${promo.diskonPersen}%`}); } } }
      else { let has=true; let min=Infinity; promo.items.forEach(it=>{const q=cartMap[it.barcode]||0; if(q<(it.qty||1))has=false; else min=Math.min(min,Math.floor(q/(it.qty||1)))}); if(has&&min>0){ const d=(promo.hargaNormal-promo.hargaBundle)*min; totalDisc+=d; applied.push({...promo,discount:d,qty:min,desc:`Bundle x${min}`}); } }
    });
    const subtotal=cart.reduce((s,it)=>s+it.sellPrice*it.qty,0);
    const after=subtotal-totalDisc;
    active.filter(p=>p.type==='MIN_SPEND').sort((a,b)=>b.condition.minAmount-a.condition.minAmount).forEach(p=>{ if(after>=p.condition.minAmount&&!applied.find(x=>x.type==='MIN_SPEND')){ totalDisc+=p.condition.discount; applied.push({...p,discount:p.condition.discount,desc:`Min ${formatRp(p.condition.minAmount)}`}); } });
    active.filter(p=>p.type==='HAPPY_HOUR').forEach(p=>{ let d=0; cart.forEach(it=>{const pr=productsMap[it.barcode]; if(pr&&pr.category===p.items[0].category){ d+=Math.round(pr.sellPrice*p.diskonPersen/100)*it.qty } }); if(d>0){ totalDisc+=d; applied.push({...p,discount:d,desc:`Happy ${p.validFrom}-${p.validTo}`}); } });
    return {subtotal,totalDiscount:totalDisc,totalAfterDiscount:subtotal-totalDisc,appliedPromos:applied,savings:totalDisc};
  }
}

export function renderPromoSuggestions(container, analysis){
  const {bundles,kurangLaku,topLaku,nearlyED}=analysis;
  if(!bundles.length){ container.innerHTML='<div style="padding:24px;text-align:center;color:#64748b;">Belum ada data</div>'; return; }
  const grouped={}; bundles.forEach(b=>{if(!grouped[b.type])grouped[b.type]=[]; grouped[b.type].push(b)});
  const labels={'CLEARANCE_ED':'🔥 ED','BOGO':'🎁 BOGO','BUNDLE_LAKU_KURANG':'📦 Hemat','TIER_QTY':'📊 Grosir','CATEGORY_COMBO':'🔗 Combo','HAPPY_HOUR':'⏰ Happy','MIN_SPEND':'💰 Min Belanja','LOYALTY_MULTIPLIER':'⭐ Poin'};
  const colors={'CLEARANCE_ED':'#dc2626','BOGO':'#16a34a','BUNDLE_LAKU_KURANG':'#2563eb','TIER_QTY':'#7c3aed','CATEGORY_COMBO':'#ea580c','HAPPY_HOUR':'#0891b2','MIN_SPEND':'#059669','LOYALTY_MULTIPLIER':'#eab308'};
  let html=`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:14px;margin-bottom:16px;"><div style="font-weight:800;color:#15803d;font-size:13px;">💡 Insight</div><div style="font-size:12px;color:#166534;margin-top:4px;">Best: ${topLaku[0]?.product.name||'-'} • Dead: ${kurangLaku.length} • ED: ${nearlyED.length}</div></div>`;
  Object.keys(grouped).sort((a,b)=>(grouped[b][0].priority||0)-(grouped[a][0].priority||0)).forEach(type=>{
    html+=`<div style="margin-bottom:18px;"><div style="font-weight:800;font-size:13px;margin-bottom:8px;color:${colors[type]||'#0f172a'}">${labels[type]||type} • ${grouped[type].length}</div>`;
    grouped[type].slice(0,5).forEach(b=>{const hi=b.priority>=90; html+=`<div style="background:white;border:${hi?'2px solid #dc2626':'1px solid #e2e8f0'};border-radius:14px;padding:12px;margin-bottom:8px;${hi?'background:#fff1f2':''}"><div style="display:flex;justify-content:space-between;gap:8px;"><div style="font-weight:700;font-size:13px;flex:1;">${b.bundleName}</div><span style="background:${colors[type]};color:white;font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;">-${b.diskonPersen}%</span></div><div style="font-size:11px;color:#64748b;margin:4px 0;">${b.alasan}</div><div style="display:flex;gap:6px;margin-top:6px;align-items:center;"><span style="text-decoration:line-through;color:#94a3b8;font-size:11px;">${formatRp(b.hargaNormal)}</span><span style="font-weight:800;color:${hi?'#dc2626':'#16a34a'}">${formatRp(b.hargaBundle)}</span><span style="margin-left:auto;font-size:10px;background:#f0fdf4;color:#15803d;padding:3px 7px;border-radius:999px;">Hemat ${formatRp(b.hargaNormal-b.hargaBundle)}</span></div></div>`;});
    html+=`</div>`;
  });
  container.innerHTML=html;
}
export function findBundleForProduct(barcode,bundles){return (bundles||[]).filter(b=> b.produkLakuBarcode===barcode||b.produkKurangLakuBarcode===barcode||b.items?.some(i=>i.barcode===barcode));}
export function demoCartCalculation(cart,products){const eng=new PromoEngine(loadPromoBundles());const r=eng.applyToCart(cart,products);console.table(r.appliedPromos.map(p=>({type:p.type,name:p.bundleName,discount:formatRp(p.discount)})));console.log('Subtotal',formatRp(r.subtotal),'Diskon',formatRp(r.totalDiscount),'Bayar',formatRp(r.totalAfterDiscount));return r;}

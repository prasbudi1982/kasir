
(function(){
  let currentPage = 1;
  let itemsPerPage = 12;
  let totalItems = 0;

  function getProductGrid(){
    // Try to find product grid in transaksi tab
    // Look for grid that contains product cards (buttons with price)
    const allGrids = document.querySelectorAll('div.grid');
    for(let grid of allGrids){
      // Product grid usually has many children (product cards) and is in main
      const children = Array.from(grid.children);
      if(children.length>=4){
        // Check if children look like product cards (have price, name)
        const hasProduct = children.some(ch=>{
          const txt = ch.textContent||'';
          return txt.includes('Rp') || txt.toLowerCase().includes('stok');
        });
        if(hasProduct && grid.closest('main')){
          // Ensure it's product list, not summary
          if(grid.className.includes('grid-cols-2') || grid.className.includes('grid-cols-3') || grid.className.includes('grid-cols-4') || children.length>6){
            return grid;
          }
        }
      }
    }
    // Fallback: find by product cards container
    const mains = document.querySelectorAll('main');
    for(let main of mains){
      const grids = main.querySelectorAll('div.grid');
      for(let g of grids){
        if(g.children.length>5) return g;
      }
    }
    return null;
  }

  function getProductCards(grid){
    if(!grid) return [];
    // Product cards are usually buttons or divs with product info
    const cards = Array.from(grid.children).filter(el=>{
      // Skip pagination element itself
      if(el.classList.contains('kasir-pagination') || el.id==='kasir-pagination') return false;
      const txt = el.textContent||'';
      // Must have some product characteristics
      return txt.length>5;
    });
    return cards;
  }

  function applyPagination(){
    const grid = getProductGrid();
    if(!grid) return;
    const cards = getProductCards(grid);
    if(cards.length===0) return;
    
    // Don't paginate if less than itemsPerPage and no pagination exists yet
    if(cards.length <= itemsPerPage && !document.getElementById('kasir-pagination')){
      // Remove pagination if exists
      const existing = document.getElementById('kasir-pagination');
      if(existing) existing.remove();
      // Show all
      cards.forEach(c=> c.style.display='');
      return;
    }

    totalItems = cards.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Ensure currentPage is valid
    if(currentPage > totalPages) currentPage = totalPages;
    if(currentPage < 1) currentPage = 1;

    // Hide all, show only current page
    cards.forEach((card, idx)=>{
      const pageIdx = Math.floor(idx / itemsPerPage) + 1;
      card.style.display = (pageIdx===currentPage) ? '' : 'none';
    });

    // Create or update pagination controls
    let pagination = document.getElementById('kasir-pagination');
    if(!pagination){
      pagination = document.createElement('div');
      pagination.id='kasir-pagination';
      pagination.className='kasir-pagination col-span-full';
      // Insert after grid or as sibling
      if(grid.parentElement){
        // If grid is inside a container, insert pagination after grid
        grid.parentElement.insertBefore(pagination, grid.nextSibling);
      } else {
        grid.appendChild(pagination);
      }
    }

    // Build pagination HTML
    const start = (currentPage-1)*itemsPerPage + 1;
    const end = Math.min(currentPage*itemsPerPage, totalItems);
    
    let html = `<span class="kasir-pagination-info">Menampilkan ${start}-${end} dari ${totalItems} produk • Hal ${currentPage}/${totalPages}</span>`;
    html += `<button id="pag-first" ${currentPage===1?'disabled':''}>«</button>`;
    html += `<button id="pag-prev" ${currentPage===1?'disabled':''}>‹</button>`;
    
    // Show page numbers (max 5)
    let startPage = Math.max(1, currentPage-2);
    let endPage = Math.min(totalPages, startPage+4);
    if(endPage-startPage<4) startPage = Math.max(1, endPage-4);
    
    for(let p=startPage; p<=endPage; p++){
      html += `<button class="pag-num ${p===currentPage?'active':''}" data-page="${p}">${p}</button>`;
    }
    
    html += `<button id="pag-next" ${currentPage===totalPages?'disabled':''}>›</button>`;
    html += `<button id="pag-last" ${currentPage===totalPages?'disabled':''}>»</button>`;
    html += `<select id="pag-perpage" style="margin-left:8px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:11px;"><option value="8" ${itemsPerPage===8?'selected':''}>8 / hal</option><option value="12" ${itemsPerPage===12?'selected':''}>12 / hal</option><option value="24" ${itemsPerPage===24?'selected':''}>24 / hal</option><option value="48" ${itemsPerPage===48?'selected':''}>48 / hal</option></select>`;
    
    pagination.innerHTML = html;

    // Bind events
    document.getElementById('pag-first').onclick = function(){ currentPage=1; applyPagination(); window.scrollTo({top:0, behavior:'smooth'}); };
    document.getElementById('pag-prev').onclick = function(){ if(currentPage>1){ currentPage--; applyPagination(); } };
    document.getElementById('pag-next').onclick = function(){ if(currentPage<totalPages){ currentPage++; applyPagination(); } };
    document.getElementById('pag-last').onclick = function(){ currentPage=totalPages; applyPagination(); };
    pagination.querySelectorAll('.pag-num').forEach(btn=>{
      btn.onclick = function(){ currentPage=parseInt(btn.getAttribute('data-page')); applyPagination(); window.scrollTo({top:0, behavior:'smooth'}); };
    });
    document.getElementById('pag-perpage').onchange = function(){ itemsPerPage=parseInt(this.value); currentPage=1; applyPagination(); localStorage.setItem('kasir_perpage', itemsPerPage); };
  }

  // Reset pagination when search changes or tab changes
  function resetPagination(){
    currentPage = 1;
    setTimeout(applyPagination, 300);
  }

  // Watch for search input changes
  function watchSearch(){
    const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="Cari"], input[placeholder*="cari"], input[placeholder*="Search"]');
    searchInputs.forEach(inp=>{
      if(inp._pagWatched) return; inp._pagWatched=true;
      inp.addEventListener('input', resetPagination);
      inp.addEventListener('change', resetPagination);
    });
  }

  // Also watch for category filter changes
  function watchFilters(){
    const filterBtns = document.querySelectorAll('button');
    filterBtns.forEach(btn=>{
      const txt = (btn.textContent||'').toLowerCase();
      if(txt.includes('kategori') || txt.includes('semua') || txt.includes('makanan') || txt.includes('minuman')){
        if(btn._pagFilterWatched) return; btn._pagFilterWatched=true;
        btn.addEventListener('click', resetPagination);
      }
    });
  }

  // Load saved perpage
  try{
    const saved = localStorage.getItem('kasir_perpage');
    if(saved) itemsPerPage = parseInt(saved);
  }catch(e){}

  // Init with intervals
  setInterval(function(){
    applyPagination();
    watchSearch();
    watchFilters();
  }, 800);

  setTimeout(applyPagination, 1000);
  setTimeout(applyPagination, 2500);

  // Reset when tab changes
  document.addEventListener('click', function(e){
    const target = e.target.closest('button');
    if(target){
      const txt = (target.textContent||'').toLowerCase();
      if(txt.includes('transaksi') || txt.includes('stok') || txt.includes('laporan')){
        setTimeout(resetPagination, 500);
      }
    }
  });

  window._kasirPagination = { apply: applyPagination, reset: resetPagination, getPage: ()=>currentPage, setPage: (p)=>{ currentPage=p; applyPagination(); } };
})();

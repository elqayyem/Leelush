/**
 * site-loader.js — Leelush
 * Fetches products from Supabase and overrides the storefront grids.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://tigusdkstanturuhtsrw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZ3VzZGtzdGFudHVydWh0c3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Nzg3NjEsImV4cCI6MjA5NjI1NDc2MX0.eo3e_Y3K6kdqZ4MKqdnfnyhQhjDWrVGLaqE2wOk3s1Y';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* Map Supabase category name → index.html category slug */
  function mapCat(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('skin')) return 'skincare';
    if (n.includes('make') || n.includes('makeup')) return 'makeup';
    if (n.includes('hair')) return 'hair';
    if (n.includes('bath') || n.includes('body')) return 'bath';
    return n.replace(/\s+/g, '');
  }

  /* Convert Supabase product row → format expected by index.html prodCard() */
  function convertProduct(p) {
    return {
      id: p.id,
      name: p.name || '',
      brand: (p.brands && p.brands.name) || p.brand_name || '',
      category: mapCat((p.categories && p.categories.name) || p.category_name || ''),
      price: parseFloat(p.price) || 0,
      discount_price: p.discount_price ? parseFloat(p.discount_price) : null,
      image: p.image_url || 'https://placehold.co/380x380/FFE4EC/E8547A?text=Leelush',
      is_featured: !!p.is_featured,
      is_bestseller: !!p.is_bestseller,
      is_new_arrival: !!p.is_new_arrival,
      stock: p.stock_quantity !== null && p.stock_quantity !== undefined ? p.stock_quantity : 99,
    };
  }

  /* Simple cache */
  function cacheSet(key, data) {
    try { localStorage.setItem('ll_' + key, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
  }
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem('ll_' + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CACHE_TTL) { localStorage.removeItem('ll_' + key); return null; }
      return obj.data;
    } catch(e) { return null; }
  }

  async function loadSite() {
    try {
      /* --- always fetch fresh products (no cache) so admin changes show instantly --- */
      const { data, error } = await _sb
        .from('products')
        .select('*, categories(name), brands(name)')
        .eq('is_active', true);
      if (error) throw error;
      const rows = data || [];

      if (!rows.length) return; // nothing in Supabase yet — keep sample data

      const products = rows.map(convertProduct);

      /* replace the global product list so cart/search/QV all work */
      if (window.SAMPLE_PRODUCTS) {
        window.SAMPLE_PRODUCTS.length = 0;
        products.forEach(function(p) { window.SAMPLE_PRODUCTS.push(p); });
      }
      window._allProducts = products;

      /* re-render all grids using index.html's own functions */
      if (typeof window.renderAll === 'function') {
        window.renderAll();
      } else {
        /* fallback: call renderGrid directly with correct IDs */
        if (typeof window.renderGrid === 'function') {
          window.renderGrid('featured-grid',    products.filter(function(p){ return p.is_featured; }));
          window.renderGrid('skincare-grid',    products.filter(function(p){ return p.category === 'skincare'; }));
          window.renderGrid('makeup-grid',      products.filter(function(p){ return p.category === 'makeup'; }));
          window.renderGrid('hair-grid',        products.filter(function(p){ return p.category === 'hair'; }));
          window.renderGrid('bath-grid',        products.filter(function(p){ return p.category === 'bath'; }));
          window.renderGrid('bestsellers-grid', products.filter(function(p){ return p.is_bestseller; }));
          window.renderGrid('newarrivals-grid', products.filter(function(p){ return p.is_new_arrival; }));
        }
      }

      /* sync cart quantities after re-render */
      if (typeof window.syncQtys === 'function') window.syncQtys();

      /* --- fetch settings --- */
      const { data: settingsRows } = await _sb.from('site_data').select('*').eq('key', 'settings');
      const settings = (settingsRows && settingsRows[0] && settingsRows[0].value) || {};
      applySettings(settings);

    } catch (err) {
      console.warn('[Leelush] site-loader error:', err);
    }
  }

  function applySettings(s) {
    if (!s) return;
    /* WhatsApp */
    const wa = (s.whatsapp || '').replace(/\D/g, '');
    if (wa) {
      document.querySelectorAll('a[href*="wa.me"]').forEach(function(el) {
        el.href = 'https://wa.me/' + wa;
      });
    }
    /* Instagram */
    if (s.instagram) {
      var igEl = document.getElementById('ci-ig');
      if (igEl) igEl.textContent = s.instagram;
    }
    /* Working hours */
    if (s.working_hours) {
      var hEl = document.getElementById('ci-hrs');
      if (hEl) hEl.textContent = s.working_hours;
    }
    /* About text */
    if (s.about_text) {
      var aEl = document.getElementById('about-text');
      if (aEl) aEl.textContent = s.about_text;
    }
    /* Logo */
    if (s.logo_url) {
      var logoEl = document.getElementById('nav-logo-img');
      if (logoEl) logoEl.src = s.logo_url;
    }
  }

  /* Boot after DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSite);
  } else {
    loadSite();
  }

  /* Expose cache-clear so admin can trigger a refresh after importing */
  window.leelushClearCache = function() {
    ['ll_products_v2'].forEach(function(k) { localStorage.removeItem(k); });
  };

})();

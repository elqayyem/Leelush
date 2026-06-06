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
  window._sb = _sb; // expose for stock updates from index.html

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

  function set(id, val) {
    if (!val) return;
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function setHref(id, val) {
    if (!val) return;
    var el = document.getElementById(id);
    if (el) el.href = val;
  }

  function applySettings(s) {
    if (!s) return;

    /* Store name */
    set('nav-store-name', s.store_name);
    set('footer-store-name', s.store_name ? s.store_name + ' 💄' : null);

    /* Logo */
    if (s.logo_url) {
      var logoEl = document.getElementById('nav-logo-img');
      if (logoEl) logoEl.src = s.logo_url;
    }

    /* Promo bar */
    set('promo-text', s.promo_text);

    /* Hero */
    set('hero-tag-text', s.hero_tag);
    set('hero-title', s.hero_title);
    set('hero-desc', s.hero_desc);
    set('hero-stat-products', s.stat_products);
    set('hero-stat-brands', s.stat_brands);
    set('hero-stat-customers', s.stat_customers);
    if (s.hero_image) {
      var hImg = document.getElementById('hero-img');
      if (hImg) hImg.src = s.hero_image;
    }

    /* Offer banner */
    set('offer-title', s.offer_title);
    set('offer-sub', s.offer_sub);
    set('offer-code', s.offer_code);

    /* Countdown timer — use admin end date if set */
    if(s.offer_end_date && typeof window.startCountdown === 'function'){
      window.startCountdown(new Date(s.offer_end_date));
    }

    /* About */
    set('about-text', s.about_text);

    /* Contact */
    var wa = (s.whatsapp || '').replace(/\D/g, '');
    set('ci-wa', s.whatsapp);
    set('ci-ig', s.instagram);
    set('ci-hrs', s.working_hours);

    /* Footer desc */
    set('footer-desc', s.footer_desc || s.about_text);

    /* WhatsApp links */
    if (wa) {
      document.querySelectorAll('a[href*="wa.me"]').forEach(function(el) {
        el.href = 'https://wa.me/' + wa;
      });
    }

    /* Instagram link */
    if (s.instagram) {
      var igLink = document.getElementById('f-ig');
      if (igLink) igLink.href = 'https://instagram.com/' + s.instagram.replace('@','');
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

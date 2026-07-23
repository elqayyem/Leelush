/**
 * site-loader.js — Leelush
 * Reads products & settings from the local data file (data.js → window.LEELUSH_DATA)
 * and overrides the storefront grids. No Supabase / no network database.
 */
(function () {
  'use strict';

  /* Local dataset injected by data.js (loaded before this script) */
  var DATA = window.LEELUSH_DATA || { products: [], categories: [], brands: [], site_data: [] };

  /* Map category name → index.html category slug */
  function mapCat(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('skin')) return 'skincare';
    if (n.includes('make') || n.includes('makeup')) return 'makeup';
    if (n.includes('hair')) return 'hair';
    if (n.includes('bath') || n.includes('body')) return 'bath';
    return n.replace(/\s+/g, '');
  }

  /* Build id → name lookups for categories and brands */
  function buildLookup(rows) {
    var m = {};
    (rows || []).forEach(function (r) { m[r.id] = r.name; });
    return m;
  }
  var CAT_BY_ID = buildLookup(DATA.categories);
  var BRAND_BY_ID = buildLookup(DATA.brands);

  /* Convert a product row → format expected by index.html prodCard() */
  function convertProduct(p) {
    return {
      id: p.id,
      name: p.name || '',
      brand: (p.brands && p.brands.name) || BRAND_BY_ID[p.brand_id] || p.brand_name || '',
      category: mapCat((p.categories && p.categories.name) || CAT_BY_ID[p.category_id] || p.category_name || ''),
      price: parseFloat(p.price) || 0,
      discount_price: p.discount_price ? parseFloat(p.discount_price) : null,
      image: p.image_url || 'https://placehold.co/380x380/FFE4EC/E8547A?text=Leelush',
      is_featured: !!p.is_featured,
      is_bestseller: !!p.is_bestseller,
      is_new_arrival: !!p.is_new_arrival,
      stock: p.stock_quantity !== null && p.stock_quantity !== undefined ? p.stock_quantity : 99,
    };
  }

  function getSettings() {
    var rows = DATA.site_data || [];
    var row = rows.filter(function (r) { return r.key === 'settings'; })[0];
    return (row && row.value) || {};
  }

  function loadSite() {
    try {
      var rows = (DATA.products || []).filter(function (p) { return p.is_active !== false; });

      if (rows.length) {
        const products = rows.map(convertProduct);

        /* replace the global product list so cart/search/QV all work */
        if (window.SAMPLE_PRODUCTS) {
          window.SAMPLE_PRODUCTS.length = 0;
          products.forEach(function (p) { window.SAMPLE_PRODUCTS.push(p); });
        }
        window._allProducts = products;

        /* re-render all grids using index.html's own functions */
        if (typeof window.renderAll === 'function') {
          window.renderAll();
        } else if (typeof window.renderGrid === 'function') {
          window.renderGrid('featured-grid',    products.filter(function (p) { return p.is_featured; }));
          window.renderGrid('skincare-grid',    products.filter(function (p) { return p.category === 'skincare'; }));
          window.renderGrid('makeup-grid',      products.filter(function (p) { return p.category === 'makeup'; }));
          window.renderGrid('hair-grid',        products.filter(function (p) { return p.category === 'hair'; }));
          window.renderGrid('bath-grid',        products.filter(function (p) { return p.category === 'bath'; }));
          window.renderGrid('bestsellers-grid', products.filter(function (p) { return p.is_bestseller; }));
          window.renderGrid('newarrivals-grid', products.filter(function (p) { return p.is_new_arrival; }));
        }

        /* sync cart quantities after re-render */
        if (typeof window.syncQtys === 'function') window.syncQtys();
      }

      /* --- apply settings --- */
      applySettings(getSettings());

    } catch (err) {
      console.warn('[Leelush] site-loader error:', err);
    }
  }

  function set(id, val) {
    if (!val) return;
    var el = document.getElementById(id);
    if (el) el.textContent = val;
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
    var noOfferWrap = document.getElementById('no-offer-wrap');
    var offerActiveWrap = document.getElementById('offer-active-wrap');
    if (s.offer_active === false) {
      if (noOfferWrap) noOfferWrap.style.display = 'block';
      if (offerActiveWrap) offerActiveWrap.style.display = 'none';
      if (window._cdInterval) clearInterval(window._cdInterval);
    } else {
      if (noOfferWrap) noOfferWrap.style.display = 'none';
      if (offerActiveWrap) offerActiveWrap.style.display = '';
      set('offer-title', s.offer_title);
      set('offer-sub', s.offer_sub);
      set('offer-code', s.offer_code);
      if (s.offer_end_date && typeof window.startCountdown === 'function') {
        window.startCountdown(new Date(s.offer_end_date));
      }
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
      window._whatsapp = wa; // expose for waCheckout()
      document.querySelectorAll('a[href*="wa.me"]').forEach(function (el) {
        el.href = 'https://wa.me/' + wa;
      });
    }

    /* Instagram link */
    if (s.instagram) {
      var igLink = document.getElementById('f-ig');
      if (igLink) igLink.href = 'https://instagram.com/' + s.instagram.replace('@', '');
    }
  }

  /* Boot after DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSite);
  } else {
    loadSite();
  }

  /* No-op kept for compatibility with any callers */
  window.leelushClearCache = function () {};

})();

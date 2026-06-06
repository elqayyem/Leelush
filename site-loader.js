/**
 * site-loader.js — Leelush Beauty Store
 * Dynamically loads all content from Supabase and renders the site.
 */
(function () {
  'use strict';

  // ===== CONFIG =====
  const SUPABASE_URL = 'https://tigusdkstanturuhtsrw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZ3VzZGtzdGFudHVydWh0c3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Nzg3NjEsImV4cCI6MjA5NjI1NDc2MX0.eo3e_Y3K6kdqZ4MKqdnfnyhQhjDWrVGLaqE2wOk3s1Y';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  // ===== INIT SUPABASE =====
  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ===== SECURITY HELPERS =====
  function escapeHTML(str) {
    if (typeof str !== 'string') return String(str || '');
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
  function sanitizeURL(url) {
    if (!url) return 'https://placehold.co/400x400/1C2333/D4AF37?text=Leelush';
    try {
      const u = new URL(url, location.origin);
      if (['http:', 'https:', 'data:', 'blob:'].includes(u.protocol)) return url;
    } catch (e) { /* ignore */ }
    return 'https://placehold.co/400x400/1C2333/D4AF37?text=Leelush';
  }

  // ===== CACHE =====
  function cacheSet(key, data) {
    try { localStorage.setItem('ll_' + key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* storage full */ }
  }
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem('ll_' + key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem('ll_' + key); return null; }
      return data;
    } catch (e) { return null; }
  }

  // ===== FETCH WITH CACHE =====
  async function fetchCached(key, fetcher) {
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
      const data = await fetcher();
      cacheSet(key, data);
      return data;
    } catch (e) {
      console.warn('[Leelush] Fetch error for', key, e);
      return null;
    }
  }

  // ===== DB HELPERS =====
  async function fetchTable(table, opts = {}) {
    let q = _sb.from(table).select(opts.select || '*');
    if (opts.eq) Object.entries(opts.eq).forEach(([k, v]) => { q = q.eq(k, v); });
    if (opts.order) q = q.order(opts.order, { ascending: opts.asc ?? false });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  // ===== PRICE FORMATTER =====
  function fmtPrice(val, currency) {
    const v = parseFloat(val || 0);
    switch (currency) {
      case 'LBP': return v.toLocaleString('ar-LB') + ' ل.ل';
      case 'SAR': return v.toFixed(2) + ' ر.س';
      case 'AED': return v.toFixed(2) + ' د.إ';
      default: return '$' + v.toFixed(2);
    }
  }

  // ===== PLACEHOLDER =====
  function placeholder(w = 400, h = 400, text = 'Leelush') {
    return `https://placehold.co/${w}x${h}/1C2333/D4AF37?text=${encodeURIComponent(text)}`;
  }

  // ===== PRODUCT CARD BUILDER =====
  function buildProductCard(p, currency) {
    const price = p.discount_price && p.discount_price < p.price ? p.discount_price : p.price;
    const hasDiscount = p.discount_price && p.discount_price < p.price;
    const discPct = hasDiscount ? Math.round((1 - p.discount_price / p.price) * 100) : 0;
    const inWishlist = (JSON.parse(localStorage.getItem('leelush_wishlist') || '[]')).some(w => w.id === p.id);
    const stock = p.stock_quantity;
    const stockHTML = stock !== null && stock !== undefined
      ? `<div class="stock-indicator ${stock > 10 ? 'in-stock' : stock > 0 ? 'low-stock' : 'out-stock'}"><i class="fas fa-circle" style="font-size:0.45rem"></i> ${stock > 10 ? 'متوفر' : stock > 0 ? 'كميات محدودة (' + stock + ')' : 'غير متوفر'}</div>`
      : '';
    return `
      <div class="product-card" data-card-id="${p.id}">
        <div class="product-img-wrap">
          <img src="${sanitizeURL(p.image_url || placeholder(400, 220, p.name || 'L'))}"
               alt="${escapeHTML(p.name || '')}"
               loading="lazy"
               onerror="this.src='${placeholder(400, 220, p.name || 'L')}'" />
          <div class="product-badges">
            ${p.is_new_arrival ? '<span class="badge-new">جديد</span>' : ''}
            ${hasDiscount ? `<span class="badge-sale">-${discPct}%</span>` : ''}
            ${p.is_bestseller ? '<span class="badge-bestseller">الأكثر مبيعاً</span>' : ''}
          </div>
          <div class="product-actions">
            <button class="action-btn" onclick="openQuickView(${p.id})"><i class="fas fa-eye"></i> عرض سريع</button>
            <button class="action-btn wishlist-btn ${inWishlist ? 'active' : ''}" data-pid="${p.id}"
              onclick="toggleWishlist(${p.id},'${escapeHTML(p.name || '')}','${fmtPrice(price, currency)}','${sanitizeURL(p.image_url || '')}')">
              <i class="fas fa-heart"></i>
            </button>
          </div>
        </div>
        <div class="product-info">
          <div class="product-brand">${escapeHTML(p.brand_name || p.brands?.name || '')}</div>
          <div class="product-name">${escapeHTML(p.name || '')}</div>
          <div class="product-rating">
            <span class="stars">${'★'.repeat(5)}</span>
            <span class="rating-count">(${Math.floor(Math.random() * 200) + 10})</span>
          </div>
          <div class="product-price">
            <span class="price-current">${fmtPrice(price, currency)}</span>
            ${hasDiscount ? `<span class="price-old">${fmtPrice(p.price, currency)}</span><span class="price-discount">-${discPct}%</span>` : ''}
          </div>
          ${stockHTML}
          <div class="product-qty" style="margin-top:10px">
            <button class="qty-btn" onclick="changeProductQty(${p.id},-1,'${fmtPrice(price, currency)}','${escapeHTML(p.name || '')}')">−</button>
            <span class="qty-display" data-pid="${p.id}">0</span>
            <button class="qty-btn" onclick="changeProductQty(${p.id},1,'${fmtPrice(price, currency)}','${escapeHTML(p.name || '')}')">+</button>
            <button class="add-cart-btn" onclick="addToCart(${p.id},'${escapeHTML(p.name || '')}','${fmtPrice(price, currency)}','${sanitizeURL(p.image_url || '')}')">
              <i class="fas fa-cart-plus"></i> أضيفي
            </button>
          </div>
        </div>
      </div>`;
  }

  // ===== RENDER GRID =====
  window.renderProductGrid = function (gridId, products, currency) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const cur = currency || window._currency || 'USD';
    if (!products || !products.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px;grid-column:1/-1">لا توجد منتجات في هذه الفئة حالياً</p>';
      return;
    }
    grid.innerHTML = products.map(p => buildProductCard(p, cur)).join('');
    reattachAnimations(grid);
  };

  // ===== REATTACH ANIMATIONS =====
  function reattachAnimations(container) {
    if (!window.IntersectionObserver) return;
    container.querySelectorAll('.product-card').forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.1 });
      observer.observe(card);
    });
  }

  // ===== APPLY SETTINGS TO DOM =====
  function applySettings(settings) {
    if (!settings) return;
    window._currency = settings.currency || 'USD';
    window._whatsapp = settings.whatsapp || '';

    // Store name
    const nameEl = document.getElementById('nav-store-name');
    if (nameEl && settings.store_name) nameEl.textContent = settings.store_name;

    const footerLogo = document.getElementById('footer-logo');
    if (footerLogo && settings.store_name) footerLogo.textContent = settings.store_name;

    const footerCopy = document.getElementById('footer-copy');
    if (footerCopy && settings.store_name) footerCopy.textContent = `© ${new Date().getFullYear()} ${settings.store_name}. جميع الحقوق محفوظة.`;

    // Hero content
    const heroTitle = document.getElementById('hero-title');
    if (heroTitle && settings.hero_title) {
      heroTitle.innerHTML = settings.hero_title.replace(/(جمالك|Beauty|beauty)/g, '<span class="highlight">$1</span>');
    }
    const heroDesc = document.getElementById('hero-desc');
    if (heroDesc && settings.hero_desc) heroDesc.textContent = settings.hero_desc;

    const heroImg = document.getElementById('hero-main-img');
    if (heroImg && settings.hero_image) {
      heroImg.src = sanitizeURL(settings.hero_image);
      heroImg.alt = settings.store_name || 'Leelush';
    }

    // Stats
    if (settings.stat_products) { const el = document.getElementById('stat-products'); if (el) el.textContent = settings.stat_products; }
    if (settings.stat_brands) { const el = document.getElementById('stat-brands'); if (el) el.textContent = settings.stat_brands; }
    if (settings.stat_customers) { const el = document.getElementById('stat-customers'); if (el) el.textContent = settings.stat_customers; }

    // About
    const aboutText = document.getElementById('about-text');
    if (aboutText && settings.about_text) aboutText.textContent = settings.about_text;

    // Contact info
    const wa = settings.whatsapp || '';
    const waNum = wa.replace(/\D/g, '');

    const ciWa = document.getElementById('ci-wa-val');
    if (ciWa) ciWa.textContent = wa || '+961 XX XXX XXX';

    const ciIg = document.getElementById('ci-ig-val');
    if (ciIg && settings.instagram) ciIg.textContent = settings.instagram;

    const ciTt = document.getElementById('ci-tt-val');
    if (ciTt && settings.tiktok) ciTt.textContent = settings.tiktok;

    const ciEmailVal = document.getElementById('ci-email-val');
    if (ciEmailVal && settings.email) ciEmailVal.textContent = settings.email;

    const ciAddr = document.getElementById('ci-addr-val');
    if (ciAddr && settings.address) ciAddr.textContent = settings.address;

    const ciHours = document.getElementById('ci-hours-val');
    if (ciHours && settings.working_hours) ciHours.textContent = settings.working_hours;

    // Footer desc
    const footerDesc = document.getElementById('footer-desc');
    if (footerDesc && settings.about_text) footerDesc.textContent = settings.about_text.slice(0, 120) + '...';

    // Social links
    const waLink = 'https://wa.me/' + waNum;
    const igLink = settings.instagram ? 'https://instagram.com/' + settings.instagram.replace('@', '') : '#';
    const ttLink = settings.tiktok ? 'https://tiktok.com/@' + settings.tiktok.replace('@', '') : '#';
    const fbLink = settings.facebook || '#';
    const phoneLink = 'tel:' + (settings.phone || '');

    ['footer-wa', 'nav-whatsapp-btn', 'wa-float-link'].forEach(id => {
      const el = document.getElementById(id);
      if (el && waNum) el.href = waLink;
    });
    const fwBtn = document.getElementById('footer-wa');
    if (fwBtn) fwBtn.href = waLink;

    const figEl = document.getElementById('footer-ig');
    if (figEl) figEl.href = igLink;

    const fttEl = document.getElementById('footer-tt');
    if (fttEl) fttEl.href = ttLink;

    const ffbEl = document.getElementById('footer-fb');
    if (ffbEl) ffbEl.href = fbLink;

    const fphEl = document.getElementById('footer-phone');
    if (fphEl) fphEl.href = phoneLink;
  }

  // ===== APPLY DESIGN =====
  function applyDesign(design) {
    if (!design) return;
    const root = document.documentElement;
    if (design.primary) root.style.setProperty('--primary', design.primary);
    if (design.accent) root.style.setProperty('--accent', design.accent);
    if (design.dark) root.style.setProperty('--dark', design.dark);
    if (design.gold) root.style.setProperty('--gold', design.gold);

    if (design.logo_url) {
      const logoImg = document.getElementById('nav-logo-img');
      if (logoImg) { logoImg.src = sanitizeURL(design.logo_url); logoImg.style.display = 'block'; }
    }
    if (design.font) {
      document.body.style.fontFamily = `'${design.font}', sans-serif`;
    }
    if (design.favicon_url) {
      let fav = document.querySelector('link[rel="icon"]');
      if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; document.head.appendChild(fav); }
      fav.href = sanitizeURL(design.favicon_url);
    }
  }

  // ===== RENDER CATEGORIES =====
  function renderCategories(categories) {
    const grid = document.getElementById('categories-grid');
    if (!grid || !categories) return;
    const catDefs = [
      { slug: 'skincare', icon: '🧴', label: 'العناية بالبشرة', href: '#skincare' },
      { slug: 'makeup', icon: '💄', label: 'المكياج', href: '#makeup' },
      { slug: 'hair', icon: '💇', label: 'العناية بالشعر', href: '#haircare' },
      { slug: 'bath', icon: '🛁', label: 'الحمام والجسم', href: '#bath' },
    ];
    const items = categories.length ? categories.map(c => ({
      slug: c.name?.toLowerCase().replace(/\s+/g, '-'),
      icon: c.icon || '📦',
      label: c.name,
      href: '#' + (c.name?.toLowerCase().includes('skin') ? 'skincare' : c.name?.toLowerCase().includes('make') ? 'makeup' : c.name?.toLowerCase().includes('hair') ? 'haircare' : c.name?.toLowerCase().includes('bath') ? 'bath' : 'featured'),
      count: c._count || 0
    })) : catDefs;
    grid.innerHTML = items.map(c => `
      <div class="category-card" onclick="window.location='${escapeHTML(c.href)}'">
        <div class="category-icon">${escapeHTML(c.icon)}</div>
        <div class="category-name">${escapeHTML(c.label)}</div>
        ${c.count ? `<div class="category-count">${c.count} منتج</div>` : ''}
      </div>
    `).join('');
    reattachReveal(grid);
  }

  // ===== RENDER BRANDS =====
  function renderBrands(brands) {
    const grid = document.getElementById('brands-grid');
    if (!grid) return;
    if (!brands?.length) {
      grid.innerHTML = '<p style="color:var(--gray);text-align:center;padding:20px;width:100%">لا توجد ماركات</p>';
      return;
    }
    grid.innerHTML = brands.map(b => `
      <div class="brand-card" ${b.website ? `onclick="window.open('${sanitizeURL(b.website)}','_blank','noopener')"` : ''}>
        ${b.logo_url
          ? `<img src="${sanitizeURL(b.logo_url)}" alt="${escapeHTML(b.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" /><span style="display:none">${escapeHTML(b.name)}</span>`
          : `<span>${escapeHTML(b.name)}</span>`}
      </div>
    `).join('');
  }

  // ===== RENDER TESTIMONIALS =====
  function renderTestimonials(testimonials) {
    const grid = document.getElementById('testimonials-grid');
    if (!grid || !testimonials?.length) return;
    grid.innerHTML = testimonials.map(t => `
      <div class="testimonial-card reveal">
        <div class="testimonial-header">
          <img class="testimonial-avatar"
            src="${sanitizeURL(t.avatar_url || placeholder(50, 50, t.name?.[0] || 'U'))}"
            alt="${escapeHTML(t.name || '')}"
            onerror="this.src='${placeholder(50, 50, (t.name || 'U')[0])}'" />
          <div>
            <div class="testimonial-name">${escapeHTML(t.name || '')}</div>
            <div class="testimonial-date">${formatDate(t.created_at)}</div>
          </div>
        </div>
        <div class="testimonial-rating">${'★'.repeat(t.rating || 5)}${'☆'.repeat(5 - (t.rating || 5))}</div>
        <div class="testimonial-text">${escapeHTML(t.text || '')}</div>
      </div>
    `).join('');
    reattachReveal(grid);
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ===== RENDER OFFERS =====
  function renderOffers(offers) {
    const grid = document.getElementById('offers-grid');
    const currency = window._currency || 'USD';
    if (grid) {
      // offers grid is product-based — products with discount
      const discounted = (window._allProducts || []).filter(p => p.discount_price && p.discount_price < p.price);
      window.renderProductGrid('offers-grid', discounted.slice(0, 8), currency);
    }
    if (!offers?.length) return;
    const active = offers.find(o => o.is_active);
    if (!active) return;
    const titleEl = document.getElementById('offer-title');
    if (titleEl) titleEl.textContent = active.title || 'عرض خاص';
    const subEl = document.getElementById('offer-sub');
    if (subEl && active.description) subEl.textContent = active.description;
    const codeEl = document.getElementById('offer-code');
    if (codeEl && active.code) codeEl.textContent = active.code;
    if (active.expires_at && typeof startCountdown === 'function') {
      startCountdown(new Date(active.expires_at));
    }
  }

  // ===== RENDER BEFORE/AFTER =====
  function renderBeforeAfter() {
    const grid = document.getElementById('ba-grid');
    if (!grid) return;
    const samples = [
      { before: placeholder(300, 280, 'قبل'), after: placeholder(300, 280, 'بعد') },
      { before: placeholder(300, 280, 'قبل'), after: placeholder(300, 280, 'بعد') },
      { before: placeholder(300, 280, 'قبل'), after: placeholder(300, 280, 'بعد') },
    ];
    grid.innerHTML = samples.map((s, i) => `
      <div class="ba-card" style="display:flex">
        <div style="flex:1;position:relative;overflow:hidden">
          <img src="${sanitizeURL(s.before)}" style="width:100%;height:100%;object-fit:cover" alt="قبل" />
          <span class="ba-label before">قبل</span>
        </div>
        <div style="flex:1;position:relative;overflow:hidden">
          <img src="${sanitizeURL(s.after)}" style="width:100%;height:100%;object-fit:cover" alt="بعد" />
          <span class="ba-label after">بعد</span>
        </div>
      </div>
    `).join('');
  }

  // ===== RENDER BLOG =====
  function renderBlog() {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;
    const tips = [
      { tag: 'بشرة', title: 'روتين العناية بالبشرة المثالي في 5 خطوات', excerpt: 'تعرفي على أسرار البشرة المضيئة والناعمة مع أفضل روتين عناية يومي...' },
      { tag: 'مكياج', title: 'أحدث صيحات المكياج لصيف 2025', excerpt: 'إطلالات جريئة ومميزة مع أحدث ألوان أحمر الشفاه والظلال لهذا الصيف...' },
      { tag: 'شعر', title: 'كيف تحافظين على شعرك صحياً ولامعاً؟', excerpt: 'نصائح ذهبية لصحة الشعر وحمايته من التلف والتساقط...' },
    ];
    grid.innerHTML = tips.map(t => `
      <div class="blog-card reveal">
        <div class="blog-card-img"><img src="${placeholder(300, 200, t.title.slice(0, 15))}" alt="${escapeHTML(t.title)}" loading="lazy" /></div>
        <div class="blog-card-body">
          <span class="blog-tag">${escapeHTML(t.tag)}</span>
          <div class="blog-title">${escapeHTML(t.title)}</div>
          <div class="blog-excerpt">${escapeHTML(t.excerpt)}</div>
        </div>
      </div>
    `).join('');
    reattachReveal(grid);
  }

  // ===== AI RECOMMENDATIONS =====
  function renderAIRecommendations(allProducts) {
    const grid = document.getElementById('ai-recs-grid');
    if (!grid || !allProducts?.length) { if (grid) grid.closest('section').style.display = 'none'; return; }
    // Simple: pick products from recently viewed categories, else random featured
    const rv = JSON.parse(localStorage.getItem('leelush_rv') || '[]');
    let recs = [];
    if (rv.length) {
      const ids = rv.map(p => p.id);
      recs = allProducts.filter(p => !ids.includes(p.id) && p.is_active).slice(0, 4);
    }
    if (recs.length < 4) {
      const extras = allProducts.filter(p => p.is_featured && p.is_active && !recs.includes(p)).slice(0, 4 - recs.length);
      recs = [...recs, ...extras];
    }
    if (!recs.length) { grid.closest('section').style.display = 'none'; return; }
    grid.closest('section').style.display = 'block';
    window.renderProductGrid('ai-recs-grid', recs.slice(0, 4));
  }

  // ===== FILTER DROPDOWNS =====
  function populateFilters(categories, brands) {
    ['featured-cat'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    });
    ['featured-brand'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      brands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        sel.appendChild(opt);
      });
    });
  }

  // ===== REVEAL HELPER =====
  function reattachReveal(container) {
    if (!window.IntersectionObserver) return;
    container.querySelectorAll('.reveal:not(.visible)').forEach(el => {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
      }, { threshold: 0.1 });
      obs.observe(el);
    });
  }

  // ===== MAIN LOAD =====
  async function loadSite() {
    try {
      // Load settings & design in parallel
      const [settingsRows, designRows, categories, brands, allProducts, offers, testimonials] = await Promise.all([
        fetchCached('settings', () => fetchTable('site_data', { eq: { key: 'settings' } })),
        fetchCached('design', () => fetchTable('site_data', { eq: { key: 'design' } })),
        fetchCached('categories', () => fetchTable('categories', { order: 'name', asc: true })),
        fetchCached('brands', () => fetchTable('brands', { order: 'name', asc: true })),
        fetchCached('products', () => fetchTable('products', { select: '*, categories(name), brands(name)', order: 'created_at' })),
        fetchCached('offers', () => fetchTable('offers', { eq: { is_active: true }, order: 'created_at' })),
        fetchCached('testimonials', () => fetchTable('testimonials', { eq: { is_active: true }, order: 'created_at' })),
      ]);

      const settings = settingsRows?.[0]?.value || {};
      const design = designRows?.[0]?.value || {};

      applySettings(settings);
      applyDesign(design);

      const currency = window._currency || 'USD';

      // Normalize product data (flatten join columns)
      const products = (allProducts || []).filter(p => p.is_active !== false).map(p => ({
        ...p,
        brand_name: p.brands?.name || '',
        category_name: p.categories?.name || '',
      }));

      window._allProducts = products;

      // Populate filter dropdowns
      populateFilters(categories || [], brands || []);

      // FEATURED
      const featured = products.filter(p => p.is_featured);
      window.renderProductGrid('featured-grid', featured.length ? featured : products.slice(0, 8), currency);

      // SKINCARE
      const skincare = products.filter(p => {
        const cn = (p.category_name || p.categories?.name || '').toLowerCase();
        return cn.includes('skin') || cn.includes('بشرة') || cn.includes('وجه') || cn.includes('serum') || cn.includes('moistur');
      });
      window.renderProductGrid('skincare-grid', skincare.slice(0, 8), currency);

      // MAKEUP
      const makeup = products.filter(p => {
        const cn = (p.category_name || p.categories?.name || '').toLowerCase();
        return cn.includes('makeup') || cn.includes('مكياج') || cn.includes('lipstick') || cn.includes('foundation') || cn.includes('eyeshadow');
      });
      window.renderProductGrid('makeup-grid', makeup.slice(0, 8), currency);

      // HAIR
      const hair = products.filter(p => {
        const cn = (p.category_name || p.categories?.name || '').toLowerCase();
        return cn.includes('hair') || cn.includes('شعر') || cn.includes('shampoo') || cn.includes('conditioner');
      });
      window.renderProductGrid('haircare-grid', hair.slice(0, 8), currency);

      // BATH & BODY
      const bath = products.filter(p => {
        const cn = (p.category_name || p.categories?.name || '').toLowerCase();
        return cn.includes('bath') || cn.includes('body') || cn.includes('جسم') || cn.includes('حمام');
      });
      window.renderProductGrid('bath-grid', bath.slice(0, 8), currency);

      // NEW ARRIVALS
      const newArrivals = products.filter(p => p.is_new_arrival);
      window.renderProductGrid('new-arrivals-grid', newArrivals.length ? newArrivals : products.slice(-8).reverse(), currency);

      // BEST SELLERS
      const bestSellers = products.filter(p => p.is_bestseller);
      window.renderProductGrid('best-sellers-grid', bestSellers.length ? bestSellers : products.slice(0, 8), currency);

      // OFFERS
      renderOffers(offers || []);

      // CATEGORIES
      renderCategories(categories || []);

      // BRANDS
      renderBrands(brands || []);

      // TESTIMONIALS
      renderTestimonials(testimonials || []);

      // BEFORE/AFTER
      renderBeforeAfter();

      // BLOG
      renderBlog();

      // AI RECS
      renderAIRecommendations(products);

      // SYNC CART QTYS
      syncCartQtys();

      // REATTACH SCROLL REVEALS
      reattachReveal(document.body);

    } catch (err) {
      console.error('[Leelush] Load error:', err);
      loadFromFallback();
    }
  }

  // ===== SYNC CART QTYS TO CARDS =====
  function syncCartQtys() {
    const cart = JSON.parse(localStorage.getItem('leelush_cart') || '[]');
    cart.forEach(item => {
      document.querySelectorAll(`.qty-display[data-pid="${item.id}"]`).forEach(el => {
        el.textContent = item.qty;
      });
      if (window._productQtys) window._productQtys[item.id] = item.qty;
    });
  }

  // ===== FALLBACK (offline / error) =====
  function loadFromFallback() {
    console.warn('[Leelush] Using fallback mode');
    // Show placeholder grids for each section
    const grids = ['featured-grid', 'skincare-grid', 'makeup-grid', 'haircare-grid', 'bath-grid', 'new-arrivals-grid', 'best-sellers-grid', 'offers-grid'];
    grids.forEach(id => {
      const grid = document.getElementById(id);
      if (grid) grid.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px;grid-column:1/-1">سيتم تحميل المنتجات قريباً</p>';
    });
    const catGrid = document.getElementById('categories-grid');
    if (catGrid) renderCategories([]);
    const brandGrid = document.getElementById('brands-grid');
    if (brandGrid) brandGrid.innerHTML = '<p style="color:var(--gray);text-align:center;padding:20px;width:100%">سيتم تحميل الماركات قريباً</p>';
    renderBlog();
    renderBeforeAfter();
  }

  // ===== AUTO-RELOAD ON CACHE MISS =====
  function scheduleRefresh() {
    // Refresh content every hour in background
    setInterval(() => {
      // Invalidate product/settings cache
      ['ll_products', 'll_settings', 'll_design', 'll_offers', 'll_testimonials'].forEach(k => localStorage.removeItem(k));
      loadSite();
    }, 60 * 60 * 1000);
  }

  // ===== BOOT =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadSite(); scheduleRefresh(); });
  } else {
    loadSite();
    scheduleRefresh();
  }

})();

/* نقشه: لایه‌ها، جست‌وجو، ترسیم و ویرایش مرز، نمایش زمین‌های ثبت‌شده */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const M = App.map = { map: null, tileOk: 0, tileErr: 0 };
  const D = { precise: !!(window.matchMedia && matchMedia('(pointer:coarse)').matches), pts: [], mode: 'idle', sel: -1, markers: [], mids: [], shape: null, source: 'draw', meta: null };
  M.D = D;
  let drawLayer, savedLayer, previewLayer, searchMarker, savedById = {};

  const ll = (p) => [p[1], p[0]];

  App.on('init', function () {
    const map = M.map = L.map('map', { zoomControl: true, worldCopyJump: false, doubleClickZoom: false }).setView([32.5, 54], 6);
    // دو نشانی رسمی Esri: بعضی شبکه‌ها یکی از hostها را می‌بندند. تشخیص خودکار
    // نیز هر دو را امتحان می‌کند؛ بنابراین شکست یک host نباید ابزار را از کار بیندازد.
    M.SAT_URLS = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ];
    M.SAT_URL = M.SAT_URLS[0]; M.satFallbackUsed = false;
    const sat = L.tileLayer(M.SAT_URL, { maxZoom: 19, attribution: 'تصاویر ماهواره‌ای © Esri, Maxar, Earthstar Geographics' });
    sat.on('tileerror', () => {
      if (!M.satFallbackUsed && M.SAT_URLS[1]) { M.satFallbackUsed = true; M.SAT_URL = M.SAT_URLS[1]; sat.setUrl(M.SAT_URL); }
    });
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
    const blank = L.layerGroup();
    [sat, street].forEach(t => {
      t.on('tileload', () => { M.tileOk++; if (M.tileOk === 1) document.getElementById('map-banner').hidden = true; });
      t.on('tileerror', () => {
        M.tileErr++;
        if (M.tileOk === 0 && M.tileErr >= 4) {
          const b = document.getElementById('map-banner');
          b.hidden = false;
          b.innerHTML = '⚠️ تصاویر نقشه بارگذاری نشد (اینترنت یا دسترسی به سرویس نقشه موجود نیست). ترسیم، ویرایش مرز و محاسبه‌ی مساحت همچنان بدون نقشه‌ی پایه کار می‌کنند و «ورود مختصات آماده» (متن، CSV، Excel، GeoJSON، KML، KMZ) کاملاً آفلاین است. نقشه‌ی ماهواره‌ای از سرویس رایگان Esri World Imagery و جست‌وجوی نام از Nominatim (OpenStreetMap) استفاده می‌کند؛ هر دو بدون کلید API‌اند ولی نیاز به اینترنت دارند.';
        }
      });
    });
    sat.addTo(map);
    L.control.layers({ 'ماهواره (Esri)': sat, 'نقشه خیابانی (OSM)': street, 'بدون نقشه‌ی پایه': blank }, null, { position: 'topleft' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
    savedLayer = L.featureGroup().addTo(map);
    previewLayer = L.featureGroup().addTo(map);
    drawLayer = L.featureGroup().addTo(map);
    M.layers = { sat, street, blank };

    map.on('click', (e) => {
      if (D.mode !== 'draw' || D.precise) return;
      D.pts.push([e.latlng.lng, e.latlng.lat]); D.sel = D.pts.length - 1; redraw(); changed();
    });
    map.on('mousemove', (e) => { if (D.mode === 'draw' && D.pts.length && !D.precise) rubber(e.latlng); });
    map.on('move', () => { if (D.mode === 'draw' && D.precise && D.pts.length) rubber(map.getCenter()); });

    document.getElementById('search-form').addEventListener('submit', (e) => { e.preventDefault(); M.search(document.getElementById('search-q').value); });
    document.addEventListener('keydown', (e) => {
      if (App.curTab !== 'map') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Delete' && D.sel >= 0) removePoint(D.sel);
      if (e.key === 'Enter' && D.mode === 'draw') M.finishDraw();
      if (e.key === 'Escape' && D.mode === 'draw') M.finishDraw(true);
      else if (e.key === 'Escape' && M.focused && !(App.detect && App.detect.active)) M.focus(false);
    });
    renderSaved();
  });
  App.on('state', () => renderSaved());
  App.on('tab', (t) => { if (t === 'map') renderSaved(); });

  /* ---------------- جست‌وجو ---------------- */
  function parseCoordQuery(q) {
    const t = C.normDigits(q).replace(/[٫]/g, '.').replace(/،/g, ',');
    const nums = t.match(/[-+]?\d+(?:\.\d+)?/g);
    if (!nums || nums.length !== 2 || /[^\d\s,.\-+°NSEWnsew;]/.test(t)) return null;
    return nums.map(Number);
  }
  M.search = async function (q) {
    const box = document.getElementById('search-results'); box.innerHTML = '';
    q = (q || '').trim(); if (!q) return;
    const nums = parseCoordQuery(q);
    if (nums) {
      const [a, b] = nums;
      let lat, lon;
      const latR = (v) => v >= 24 && v <= 40, lonR = (v) => v >= 43 && v <= 64.5;
      if (latR(a) && lonR(b)) { lat = a; lon = b; }
      else if (lonR(a) && latR(b)) { lon = a; lat = b; }
      else if (Math.abs(a) <= 90 && Math.abs(b) <= 180) { lat = a; lon = b; box.appendChild(el('div', { class: 'msg', text: 'ترتیب «عرض، طول» فرض شد (خارج از محدوده‌ی ایران).' })); }
      else { box.appendChild(el('div', { class: 'msg', text: 'مختصات متری (UTM/Mercator) را از دکمه‌ی «ورود مختصات آماده» وارد کنید تا سیستم مختصات درست تبدیل شود.' })); return; }
      M.goTo(lat, lon, 17, 'مختصات: ' + lat + '، ' + lon); setTimeout(() => { if (box.firstChild && !box.firstChild.dataset.keep) box.innerHTML = ''; }, 5000);
      return;
    }
    box.appendChild(el('div', { class: 'msg', text: 'در حال جست‌وجو…' }));
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&accept-language=fa&q=' + encodeURIComponent(q), { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const arr = await r.json();
      box.innerHTML = '';
      if (!arr.length) { box.appendChild(el('div', { class: 'msg', text: 'نتیجه‌ای پیدا نشد. نام را دقیق‌تر بنویسید (مثلاً «روستا، شهرستان، استان») یا مختصات را وارد کنید.' })); return; }
      arr.forEach(x => box.appendChild(el('div', { text: x.display_name, onclick: () => { M.goTo(+x.lat, +x.lon, 15, x.display_name); box.innerHTML = ''; } })));
    } catch (e) {
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'msg', text: 'جست‌وجوی نام نیازمند اینترنت و سرویس Nominatim (OpenStreetMap) است و الان در دسترس نیست (' + e.message + '). می‌توانید مختصات را بنویسید (مثل ۳۲٫۶۵، ۵۱٫۶۷) یا فایل مختصات وارد کنید.' }));
    }
  };
  M.goTo = function (lat, lon, z, label) {
    M.map.setView([lat, lon], z || 16);
    if (searchMarker) searchMarker.remove();
    searchMarker = L.marker([lat, lon]).addTo(M.map).bindTooltip(label || '', { className: 'fa' });
  };

  /* ---------------- ترسیم و ویرایش مرز ---------------- */
  function vIcon(i) {
    return L.divIcon({ className: '', html: '<div class="vtx-hit"><div class="vtx' + (i === D.sel ? ' sel' : '') + (i === 0 ? ' first' : '') + '"></div></div>', iconSize: [44, 44], iconAnchor: [22, 22] });
  }
  const midIcon = L.divIcon({ className: '', html: '<div class="mid"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  let rubberLine = null;
  function rubber(latlng) {
    if (!D.pts.length) return;
    const last = ll(D.pts[D.pts.length - 1]);
    if (!rubberLine) rubberLine = L.polyline([last, latlng], { color: '#1565c0', dashArray: '4 6', weight: 2, interactive: false }).addTo(drawLayer);
    else rubberLine.setLatLngs([last, latlng]);
  }
  function updateShape() {
    const latlngs = D.pts.map(ll);
    const v = C.validateRing(D.pts);
    const col = D.pts.length >= 3 && !v.valid ? '#d32f2f' : '#1565c0';
    if (D.shape) { D.shape.remove(); D.shape = null; }
    if (D.pts.length >= 3) D.shape = L.polygon(latlngs, { color: col, weight: 3, fillColor: col, fillOpacity: 0.12, interactive: false });
    else if (D.pts.length >= 1) D.shape = L.polyline(latlngs, { color: col, weight: 3, interactive: false });
    if (D.shape) D.shape.addTo(drawLayer);
  }
  function clearMarkers() { D.markers.forEach(m => m.remove()); D.mids.forEach(m => m.remove()); D.markers = []; D.mids = []; }
  function redraw() {
    clearMarkers();
    if (rubberLine) { rubberLine.remove(); rubberLine = null; }
    D.pts.forEach((p, i) => {
      const m = L.marker(ll(p), { draggable: false, icon: vIcon(i), keyboard: false, zIndexOffset: 500 });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (Date.now() - lastDragEnd < 400) return;
        if (D.mode === 'draw' && i === 0 && D.pts.length >= 3) { M.finishDraw(); return; }
        D.sel = i; redraw();
      });
      m.on('contextmenu', () => removePoint(i));
      m.on('dblclick', (e) => { L.DomEvent.stopPropagation(e); removePoint(i); });
      m.addTo(drawLayer); D.markers.push(m);
      attachDrag(m, i);
    });
    if (D.mode === 'edit' && D.pts.length >= 3) {
      D.pts.forEach((p, i) => {
        const q = D.pts[(i + 1) % D.pts.length];
        const mid = L.marker([(p[1] + q[1]) / 2, (p[0] + q[0]) / 2], { icon: midIcon, keyboard: false, zIndexOffset: 100 });
        mid.on('click', (e) => { L.DomEvent.stopPropagation(e); D.pts.splice(i + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); D.sel = i + 1; redraw(); changed(); });
        mid.addTo(drawLayer); D.mids.push(mid);
      });
    }
    updateShape(); info(); drawBar();
  }

  /* ---------- کشیدن نقطه (با ذره‌بین برای لمس) ---------- */
  let lastDragEnd = 0, loupeMap = null, loupePoly = null, loupeTiles = null;
  function loupeShow(latlng, clientX, clientY) {
    const box = document.getElementById('loupe'); if (!box) return;
    if (!loupeMap) {
      loupeMap = L.map('loupe-map', { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
      loupeTiles = L.tileLayer(M.SAT_URL, { maxZoom: 21, maxNativeZoom: 19 }).addTo(loupeMap);
      loupePoly = L.polygon([[0, 0]], { color: '#1565c0', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(loupeMap);
    }
    // اگر انگشت در گوشه‌ی بالا-راست است، ذره‌بین به گوشه‌ی دیگر برود
    const r = M.map.getContainer().getBoundingClientRect();
    box.classList.toggle('left', clientX > r.right - 190 && clientY < r.top + 190);
    if (box.hidden) { box.hidden = false; loupeMap.invalidateSize(); }
    loupeMap.setView(latlng, Math.min(21, M.map.getZoom() + 2), { animate: false });
    loupePoly.setLatLngs(D.pts.map(ll));
  }
  function loupeHide() { const box = document.getElementById('loupe'); if (box) box.hidden = true; }
  function attachDrag(m, i) {
    const node = m.getElement(); if (!node) return;
    node.style.touchAction = 'none';
    node.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || (D.mode !== 'draw' && D.mode !== 'edit')) return;
      e.preventDefault(); e.stopPropagation();
      const touch = e.pointerType !== 'mouse';
      const p0 = M.map.latLngToContainerPoint(ll(D.pts[i])), f0 = [e.clientX, e.clientY];
      let moved = false;
      try { node.setPointerCapture(e.pointerId); } catch (x) { /* بعضی مرورگرها */ }
      M.map.dragging.disable();
      const move = (ev) => {
        const dx = ev.clientX - f0[0], dy = ev.clientY - f0[1];
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        const q = M.map.containerPointToLatLng(L.point(p0.x + dx, p0.y + dy));
        D.pts[i] = [q.lng, q.lat]; m.setLatLng(q); updateShape(); info();
        if (touch) loupeShow(q, ev.clientX, ev.clientY);
      };
      const up = () => {
        node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
        M.map.dragging.enable(); loupeHide();
        if (moved) { lastDragEnd = Date.now(); D.sel = i; redraw(); changed(); }
      };
      node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
      if (touch) loupeShow(M.map.containerPointToLatLng(p0), e.clientX, e.clientY); // ذره‌بین از لحظه‌ی لمس
    });
  }
  M.loupeShow = loupeShow; M.loupeHide = loupeHide;

  /** افزودن نقطه در مرکز نقشه (حالت دقیق: ضربدر وسط، بدون پوشاندن با انگشت) */
  M.addCenterPoint = function () {
    if (D.mode !== 'draw') return;
    const c = M.map.getCenter();
    D.pts.push([c.lng, c.lat]); D.sel = D.pts.length - 1; redraw(); changed();
  };

  function removePoint(i) {
    if (i < 0 || i >= D.pts.length) return;
    D.pts.splice(i, 1); D.sel = Math.min(D.sel, D.pts.length - 1);
    if (D.pts.length < 3 && D.mode === 'edit') D.mode = 'draw';
    redraw(); changed();
  }
  function changed() { App.emit('boundary', M.getBoundary()); }

  function info() {
    M.info = M.getBoundary();
    const e = document.getElementById('draw-live'); if (e) e.innerHTML = liveHtml(M.info);
    App.emit('boundary-live', M.info);
  }
  function liveHtml(b) {
    if (!b || !b.count) return '<span class="mut">هنوز نقطه‌ای ثبت نشده</span>';
    if (b.count < 3) return 'نقطه‌ها: ' + App.n(b.count, 0) + ' — حداقل ۳ نقطه لازم است';
    return 'نقطه‌ها: <b>' + App.n(b.count, 0) + '</b> — مساحت: <b>' + App.area(b.area) + '</b> — ' + (b.valid ? '<span class="pos">هندسه معتبر</span>' : '<span class="neg">نامعتبر: ' + App.esc(b.errors[0]) + '</span>');
  }
  M.liveHtml = liveHtml;
  function syncCross() { const c = document.getElementById('map-cross'); if (c) c.hidden = !(D.mode === 'draw' && D.precise); }
  function drawBar() {
    syncCross();
    const bar = document.getElementById('draw-bar');
    if (D.mode === 'idle') { bar.hidden = true; return; }
    bar.hidden = false; bar.innerHTML = '';
    bar.appendChild(el('span', { id: 'draw-live', html: liveHtml(M.info) }));
    if (D.mode === 'draw') {
      bar.appendChild(el('span', { class: 'note', text: D.precise ? 'نقشه را بکشید تا ضربدر وسط روی گوشه‌ی زمین بنشیند، سپس «افزودن نقطه» را بزنید.' : 'روی نقشه کلیک کنید تا نقطه اضافه شود؛ برای پایان روی نقطه‌ی اول بزنید.' }));
      if (D.precise) bar.appendChild(el('button', { class: 'btn sm', id: 'add-center', text: '＋ افزودن نقطه (وسط ضربدر)', onclick: () => M.addCenterPoint() }));
      bar.appendChild(el('button', { class: 'btn sm sec2', id: 'precise-toggle', text: D.precise ? 'لمس مستقیم' : '🎯 حالت دقیق (ضربدر)', onclick: () => { D.precise = !D.precise; syncCross(); redraw(); } }));
      bar.appendChild(el('button', { class: 'btn sm', text: 'پایان ترسیم', onclick: () => M.finishDraw() }));
      bar.appendChild(el('button', { class: 'btn sm sec2', text: 'حذف آخرین نقطه', onclick: () => removePoint(D.pts.length - 1) }));
    } else {
      bar.appendChild(el('span', { class: 'note', text: 'نقاط را بکشید؛ مربع‌های کوچک وسط ضلع‌ها نقطه‌ی تازه می‌افزایند؛ کلیک راست روی نقطه آن را حذف می‌کند.' }));
      bar.appendChild(el('button', { class: 'btn sm sec2', text: 'حذف نقطه‌ی انتخابی', onclick: () => removePoint(D.sel) }));
      bar.appendChild(el('button', { class: 'btn sm sec2', text: 'ویرایش دقیق نقاط', onclick: () => M.pointsEditor() }));
      if (D.pts.length >= 3 && App.split) bar.appendChild(el('button', { class: 'btn sm sec2', text: '✂️ تقسیم با متراژ مشخص', title: 'تقسیم این زمین به دو قسمت با متراژ مشخص', onclick: () => App.split.openCurrent() }));
      if (D.source === 'auto' && App.detect) App.detect.bar(bar);
      bar.appendChild(el('button', { class: 'btn sm', id: 'focus-toggle', text: M.focused ? '✔ تأیید و بازگشت به فرم' : '⛶ نقشه‌ی تمام‌صفحه', onclick: () => M.focus(!M.focused) }));
    }
    bar.appendChild(el('button', { class: 'btn sm dng', text: 'پاک‌کردن مرز', onclick: () => M.clearBoundary() }));
  }

  M.startDraw = function () {
    if (D.pts.length && D.mode !== 'draw') { if (!window.confirm('مرز فعلی پاک شود و ترسیم تازه آغاز شود؟')) return; }
    if (App.detect) App.detect.cancel(true);
    D.pts = []; D.sel = -1; D.mode = 'draw'; D.source = 'draw'; D.meta = null;
    M.focus(true);
    clearPreview(); redraw(); changed();
    M.map.getContainer().style.cursor = 'crosshair';
  };
  M.finishDraw = function (cancel) {
    M.map.getContainer().style.cursor = '';
    if (D.pts.length < 3) { if (!cancel) App.toast('برای مرز حداقل ۳ نقطه لازم است.', 'warn'); D.mode = D.pts.length ? 'draw' : 'idle'; if (cancel) { D.mode = 'idle'; } if (D.mode === 'idle') M.focus(false); redraw(); return; }
    D.mode = 'edit'; redraw(); changed();
    const v = M.getBoundary(); if (!v.valid) App.toast('مرز نامعتبر است: ' + v.errors[0], 'err');
  };
  M.clearBoundary = function () {
    if (App.detect) App.detect.cancel(true);
    D.pts = []; D.sel = -1; D.mode = 'idle'; D.meta = null; M.map.getContainer().style.cursor = '';
    M.focus(false);
    redraw(); changed();
  };
  /** حالت تمام‌صفحه: منوها و پنل کناری پنهان می‌شوند تا نقشه بزرگ‌تر شود */
  M.focused = false;
  M.focus = function (on) {
    M.focused = !!on;
    document.body.classList.toggle('map-focus', M.focused);
    const b = document.getElementById('focus-toggle'); if (b) b.textContent = M.focused ? '✔ تأیید و بازگشت به فرم' : '⛶ نقشه‌ی تمام‌صفحه';
    if (M.map) M.map.invalidateSize({ animate: false }); // همگام: کلیک‌های بعدی با اندازه‌ی درست حساب شوند
    setTimeout(() => { if (M.map) M.map.invalidateSize(); }, 80);
    setTimeout(() => { if (M.map) M.map.invalidateSize(); }, 400);
  };
  /** مرز موجود را (برای ویرایش) روی نقشه بگذار */
  M.setBoundary = function (ring, o) {
    o = o || {};
    D.pts = ring ? C.openRing(ring).map(p => [p[0], p[1]]) : [];
    D.sel = -1; D.mode = D.pts.length ? 'edit' : 'idle'; D.source = o.source || 'draw'; D.meta = o.meta || null;
    if (!D.pts.length && M.focused && !(App.detect && App.detect.active)) M.focus(false);
    redraw();
    if (D.pts.length && o.fit !== false) M.map.fitBounds(L.latLngBounds(D.pts.map(ll)), { maxZoom: 18, padding: [40, 40] });
    changed();
  };
  M.getBoundary = function () {
    if (!D.pts.length) return { count: 0, valid: false, errors: [], ring: [], area: 0, source: D.source, meta: D.meta };
    const v = C.validateRing(D.pts);
    // در حالتی که هنوز ترسیم ادامه دارد و <۳ نقطه است، validateRing خطای «حداقل ۳ نقطه» می‌دهد
    return Object.assign({}, v, { count: D.pts.length, ring: D.pts.map(p => [p[0], p[1]]), source: D.source, meta: D.meta });
  };

  /* ویرایش دقیق نقاط */
  M.pointsEditor = function () {
    if (!D.pts.length) return;
    const rows = D.pts.map(p => [String(p[0]), String(p[1])]);
    const tbody = el('tbody');
    const draw = () => {
      tbody.innerHTML = '';
      rows.forEach((r, i) => tbody.appendChild(el('tr', null, [
        el('td', { text: App.n(i + 1, 0) }),
        el('td', null, el('input', { type: 'text', dir: 'ltr', value: r[0], oninput: (e) => { r[0] = e.target.value; } })),
        el('td', null, el('input', { type: 'text', dir: 'ltr', value: r[1], oninput: (e) => { r[1] = e.target.value; } })),
        el('td', null, el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => { rows.splice(i, 1); draw(); } })),
      ])));
    };
    draw();
    const m = App.modal({
      title: 'ویرایش دقیق نقاط مرز (WGS84، درجه‌ی اعشاری)',
      body: el('div', null, [
        el('div', { class: 'note', text: 'هر ردیف یک نقطه است: طول جغرافیایی (lon) و عرض جغرافیایی (lat). فقط عدد معتبر پذیرفته می‌شود.' }),
        el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'طول (lon)', 'عرض (lat)', ''].map(h => el('th', { text: h })))), tbody]),
        el('button', { class: 'btn sm sec2', style: 'margin-top:8px', text: 'افزودن نقطه', onclick: () => { const l = rows[rows.length - 1] || ['0', '0']; rows.push([l[0], l[1]]); draw(); } }),
      ]),
      buttons: [{
        label: 'اعمال', onClick: () => {
          const pts = rows.map(r => [App.num(r[0]), App.num(r[1])]);
          const bad = pts.findIndex(p => !isFinite(p[0]) || !isFinite(p[1]) || p[0] == null || p[1] == null);
          if (bad >= 0) { App.toast('نقطه‌ی ' + App.n(bad + 1, 0) + ' عدد معتبر نیست.', 'err'); return false; }
          D.pts = pts; D.sel = -1; D.mode = pts.length >= 3 ? 'edit' : 'draw'; redraw(); changed();
        }
      }, { label: 'انصراف', cls: 'sec2' }], wide: false
    });
  };

  /* ---------------- پیش‌نمایش ورود مختصات ---------------- */
  function clearPreview() { previewLayer.clearLayers(); }
  M.showPreview = function (ring, valid, fit) {
    clearPreview();
    if (!ring || !ring.length) return;
    const col = valid ? '#e65100' : '#d32f2f';
    const poly = (ring.length >= 3 ? L.polygon : L.polyline)(ring.map(ll), { color: col, weight: 4, fillOpacity: 0.15, dashArray: valid ? null : '6 6' }).addTo(previewLayer);
    ring.forEach((p, i) => L.circleMarker(ll(p), { radius: 4, color: col, fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(previewLayer));
    if (fit) M.map.fitBounds(poly.getBounds(), { maxZoom: 18, padding: [50, 50] });
  };
  M.clearPreview = clearPreview;

  /* ---------------- زمین‌های ثبت‌شده ---------------- */
  function renderSaved() {
    if (!savedLayer) return;
    savedLayer.clearLayers(); savedById = {};
    App.S.parcels.forEach(p => {
      if (!p.geometry || !p.geometry.ring || p.geometry.ring.length < 3) return;
      if (M.editingId === p.id) return; // در حال ویرایش: از لایه‌ی ترسیم نمایش داده می‌شود
      const v = C.currentValuation ? C.currentValuation(p, App.S.settings) : (p.valuation || {});
      const st = v.status;
      const col = st === 'قطعی' ? '#2e7d32' : st === 'موقت' ? '#f9a825' : '#c62828';
      const poly = L.polygon(p.geometry.ring.map(ll), { color: col, weight: 3, fillOpacity: 0.18 }).addTo(savedLayer);
      poly.bindTooltip('<div dir="rtl"><b>' + App.esc(p.name || 'بدون نام') + '</b><br>' + App.area(v.area) + '<br>' + App.toman(v.total) + '</div>', { className: 'fa', sticky: true });
      poly.on('click', () => { App.tab('map'); App.form.open(p.id, true); });
      savedById[p.id] = poly;
    });
  }
  M.renderSaved = renderSaved;
  M.flyToParcel = function (id) {
    const p = App.S.parcels.find(x => x.id === id);
    if (p && p.geometry && p.geometry.ring && p.geometry.ring.length) M.map.fitBounds(L.latLngBounds(p.geometry.ring.map(ll)), { maxZoom: 18, padding: [50, 50] });
  };
})();

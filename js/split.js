/* ابزار «تقسیم یک زمین به دو قسمت با متراژ مشخص»
   مرز کل زمین را دارید و متراژ یک قسمت را می‌دهید؛ خط جداکننده دقیقاً جایی کشیده می‌شود که
   مساحت آن قسمت برابر متراژ خواسته‌شده شود و جهت خط را می‌توانید بچرخانید یا با ماوس بکشید.
   همه‌ی محاسبه‌ها داخل خود برنامه (core.js) انجام می‌شود: مساحت واقعی روی بیضوی WGS84 و
   جست‌وجوی دوتایی برای جای خط. هیچ سرویس بیرونی یا هوش مصنوعی در کار نیست. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const SP = App.split = {
    visible: false, pre: null, res: null, layer: null,
    src: null,                 // { name, parcel } منبع برش (برای کپی‌کردن صفت‌ها)
    unit: 'percent', text: '1/2', azimuth: 0, side: 'a',
    name1: '', name2: '', dropSource: false,
    ratio: '', ratioParts: null, mres: null,
  };
  const ll = (p) => [p[1], p[0]];
  const panel = () => document.getElementById('split-panel');

  /* ---------------- باز و بسته کردن ---------------- */
  function ensureLayer() {
    if (!SP.layer && App.map && App.map.map) SP.layer = L.featureGroup().addTo(App.map.map);
    return SP.layer;
  }
  SP.openRing = function (ring, src) {
    const M = App.map;
    if (!M || !M.map) { App.toast('نقشه آماده نیست.', 'err'); return; }
    const v = C.validateRing(ring);
    if (!v.valid) { App.toast('مرز زمین معتبر نیست: ' + v.errors[0], 'err'); return; }
    SP.pre = C.splitPrepare(v.ring);
    if (!SP.pre.ok) { App.toast((SP.pre.errors || ['برش ممکن نیست'])[0], 'err'); return; }
    SP.src = src || null;
    SP.res = null; SP.visible = true; SP.ratio = ''; SP.ratioParts = null; SP.mres = null;
    SP.side = 'a'; SP.unit = 'percent'; SP.text = '1/2';
    const az = C.principalAzimuth(v.ring);
    SP.azimuth = az == null ? 0 : Math.round(az * 10) / 10;
    const nm = (src && src.name) || '';
    SP.name1 = (nm ? nm + ' — ' : '') + 'قسمت ۱';
    SP.name2 = (nm ? nm + ' — ' : '') + 'قسمت ۲';
    SP.dropSource = !!(src && src.parcel);
    App.tab('map');
    // پنل‌های دیگر روی نقشه بسته شوند تا جا برای پیش‌نمایش برش باز بماند
    const ip = document.getElementById('import-panel');
    if (App.importer && App.importer.close && ip && !ip.hidden) App.importer.close();
    const gp = document.getElementById('gps-panel');
    if (App.gps && App.gps.close && gp && !gp.hidden) App.gps.close();
    M.map.fitBounds(L.latLngBounds(v.ring.map(ll)), { maxZoom: 19, padding: [70, 70] });
    build();
    recompute(true);
  };
  /** از روی مرزی که همین حالا در فرم/نقشه است */
  SP.openCurrent = function () {
    const b = App.map.getBoundary();
    if (!b || b.count < 3) { App.toast('ابتدا مرز کل زمین را ترسیم کنید یا یک زمین ثبت‌شده را باز کنید؛ این ابزار به مرز کامل زمین نیاز دارد.', 'warn'); return; }
    const cur = App.form && App.form.cur;
    SP.openRing(b.ring, { name: (cur && cur.name) || '', parcel: (!App.form.isNew && cur) ? cur : null });
  };
  /** از روی یک زمین ثبت‌شده */
  SP.openParcel = function (id) {
    const p = App.S.parcels.find(x => x.id === id);
    if (!p || !p.geometry || !p.geometry.ring || p.geometry.ring.length < 3) { App.toast('این زمین مرز ثبت‌شده ندارد؛ ابتدا مرز را ترسیم یا وارد کنید.', 'warn'); return; }
    App.tab('map');
    SP.openRing(p.geometry.ring, { name: p.name || '', parcel: p });
  };
  SP.close = function () {
    SP.visible = false; SP.pre = null; SP.res = null; SP.mres = null; SP.ratioParts = null;
    const p = panel(); if (p) { p.hidden = true; p.innerHTML = ''; }
    if (SP.layer) SP.layer.clearLayers();
  };

  /* ---------------- محاسبه ---------------- */
  function targetM2() {
    if (!SP.pre) return null;
    const txt = String(SP.text == null ? '' : SP.text).trim();
    if (txt === '') return { error: 'متراژ را بنویسید' };
    if (SP.unit === 'percent') {
      const s = C.parseShare(txt);
      if (!s) return { error: 'عدد معتبر نیست' };
      if (s.error) return { error: s.error };
      const f = s.frac;
      if (C.fSign(f) <= 0) return { error: 'متراژ باید بیشتر از صفر باشد' };
      if (C.fCmp(f, C.frac(1)) >= 0) return { error: 'سهم خواسته‌شده از کل زمین کمتر نیست' };
      return { m2: SP.pre.total * C.fToNumber(f), shareText: s.kind === 'ratio' ? s.text : s.pct + '٪', frac: f };
    }
    const f = C.toFrac(txt);
    if (!f) return { error: 'عدد معتبر نیست (مثلاً ۲۵۰۰ یا 0.5)' };
    let m2 = C.fToNumber(f);
    if (SP.unit === 'ha') m2 *= 10000;
    if (!(m2 > 0)) return { error: 'متراژ باید بیشتر از صفر باشد' };
    return { m2, shareText: C.fPct(C.frac(Math.round(m2 * 1e6), Math.round(SP.pre.total * 1e6) || 1), 4) + '٪' };
  }
  function recompute(keepView) {
    if (!SP.pre) return;
    if (SP.ratioParts && SP.ratioParts.length >= 3) return recomputeMulti(keepView);
    const box = document.getElementById('split-out');
    const t = targetM2();
    if (t.error) { SP.res = null; drawPreview(null); if (box) box.innerHTML = '<div class="box warn">' + App.esc(t.error) + '</div>'; return; }
    const r = C.splitByArea(SP.pre, t.m2, { azimuth: SP.azimuth, side: SP.side });
    if (!r.ok) { SP.res = null; drawPreview(null); if (box) box.innerHTML = '<div class="box err">' + App.esc((r.errors || ['برش ممکن نیست'])[0]) + '</div>'; return; }
    SP.res = r; r.shareText = t.shareText; r.targetText = t.m2;
    drawPreview(r);
    if (box) box.innerHTML = readoutHtml(r);
    if (!keepView && r.line && r.line.length === 2 && App.map.map.getZoom() < 15) App.map.map.fitBounds(L.latLngBounds(r.line.map(ll)), { maxZoom: 18, padding: [80, 80] });
  }
  function readoutHtml(r) {
    const total = SP.pre.totalArea;
    const rows = [
      ['مساحت کل زمین', App.area(total)],
      ['متراژ خواسته‌شده‌ی قسمت ۱', App.area(r.targetM2) + (r.shareText ? ' (' + App.esc(App.fa(r.shareText)) + ')' : '')],
      ['مساحت قسمت ۱ (محاسبه‌شده)', '<b>' + App.area(r.areaA) + '</b>'],
      ['مساحت قسمت ۲ (باقی‌مانده)', '<b>' + App.area(r.areaB) + '</b>'],
      ['اختلاف با متراژ خواسته‌شده', '<b class="' + (Math.abs(r.errorM2) < 0.05 ? 'pos' : 'neg') + '">' + App.n(r.errorM2, 3) + ' مترمربع</b>'],
      ['طول خط جداکننده', App.n(r.cutLengthM, 1) + ' متر'],
      ['جهت خط جداکننده', App.n(r.azimuth, 1) + ' درجه از شمال (ساعتگرد)'],
      ['کنترل جمع مساحت‌ها', Math.abs(r.areaA + r.areaB - total) < Math.max(0.05, total * 1e-6)
        ? '<span class="pos">✔ قسمت ۱ + قسمت ۲ = مساحت کل</span>'
        : '<span class="neg">✘ جمع دو قسمت با مساحت کل یکی نیست</span>'],
    ];
    let h = '<table class="t kv">' + rows.map(x => '<tr><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>').join('') + '</table>';
    (r.warnings || []).forEach(w => { h += '<div class="box warn">' + App.esc(w) + '</div>'; });
    h += '<div class="note">خط جداکننده با جست‌وجوی دوتایی روی مساحت واقعی (بیضوی WGS84) پیدا شده است؛ دقت آن در حد کسری از سانتی‌مترمربع است.</div>';
    return h;
  }

  /* ---------------- پیش‌نمایش روی نقشه ---------------- */
  function drawPreview(r) {
    const layer = ensureLayer(); if (!layer) return;
    layer.clearLayers();
    if (!r || !r.ok) return;
    const A = L.polygon(r.partA.map(ll), { color: '#2e7d32', weight: 2, fillColor: '#2e7d32', fillOpacity: 0.28 })
      .bindTooltip('<div dir="rtl"><b>' + App.esc(SP.name1 || 'قسمت ۱') + '</b><br>' + App.area(r.areaA) + '</div>', { className: 'fa', sticky: true });
    const B = L.polygon(r.partB.map(ll), { color: '#e65100', weight: 2, fillColor: '#e65100', fillOpacity: 0.25 })
      .bindTooltip('<div dir="rtl"><b>' + App.esc(SP.name2 || 'قسمت ۲') + '</b><br>' + App.area(r.areaB) + '</div>', { className: 'fa', sticky: true });
    A.addTo(layer); B.addTo(layer);
    if (r.line && r.line.length === 2) {
      L.polyline(r.line.map(ll), { color: '#d32f2f', weight: 4, dashArray: '9 7' }).addTo(layer);
      r.line.forEach(p => L.circleMarker(ll(p), { radius: 5, color: '#d32f2f', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(layer));
      const mid = [(r.line[0][1] + r.line[1][1]) / 2, (r.line[0][0] + r.line[1][0]) / 2];
      const h = L.marker(mid, {
        draggable: true, zIndexOffset: 800,
        icon: L.divIcon({ className: '', html: '<div class="split-handle">⇕</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).addTo(layer);
      h.bindTooltip('خط را بکشید تا متراژ عوض شود (جهت ثابت می‌ماند)', { className: 'fa', direction: 'top' });
      h.on('drag', () => {
        const p = h.getLatLng(), xy = SP.pre.plane.toXY([p.lng, p.lat]);
        const u = r.u, c = SP.pre.c;
        const off = (xy[0] - c[0]) * u[0] + (xy[1] - c[1]) * u[1];
        const rr = C.splitByOffset(SP.pre, off, { azimuth: SP.azimuth, side: SP.side });
        if (!rr.ok) return;
        SP.unit = 'm2'; SP.text = String(Math.round(rr.areaA * 100) / 100);
        const inp = document.getElementById('split-target'); if (inp) inp.value = SP.text;
        const sel = document.getElementById('split-unit'); if (sel) sel.value = 'm2';
        SP.res = rr; rr.shareText = ''; rr.targetM2 = rr.areaA;
        drawPreviewLight(rr);
        const box = document.getElementById('split-out'); if (box) box.innerHTML = readoutHtml(rr);
      });
      h.on('dragend', () => recompute());
    }
  }
  /** هنگام کشیدن: فقط لایه‌ها و برچسب‌ها به‌روز شوند (دستگیره پاک نشود) */
  function drawPreviewLight(r) {
    const layer = ensureLayer(); if (!layer) return;
    layer.eachLayer(l => { if (!(l instanceof L.Marker)) layer.removeLayer(l); });
    const A = L.polygon(r.partA.map(ll), { color: '#2e7d32', weight: 2, fillColor: '#2e7d32', fillOpacity: 0.28 }).addTo(layer);
    const B = L.polygon(r.partB.map(ll), { color: '#e65100', weight: 2, fillColor: '#e65100', fillOpacity: 0.25 }).addTo(layer);
    A.bringToBack && A.bringToBack(); B.bringToBack && B.bringToBack();
    if (r.line && r.line.length === 2) L.polyline(r.line.map(ll), { color: '#d32f2f', weight: 4, dashArray: '9 7' }).addTo(layer);
  }


  /* ---------------- تقسیم به چند قسمت با نسبت (۱:۱:۱ ، ۸:۸:۱:۴ …) ---------------- */
  const PALETTE = ['#2e7d32', '#e65100', '#1565c0', '#6a1b9a', '#00838f', '#ad1457', '#558b2f', '#4e342e'];
  function parseRatio(txt) {
    const toks = String(txt || '').split(/[:،,\s]+/).filter(Boolean);
    if (toks.length < 2) return null;
    const out = toks.map(t => { const f = C.toFrac(t); return f && C.fSign(f) > 0 ? t : null; });
    return out.some(x => x == null) ? null : out;
  }
  function setRatio(txt) {
    SP.ratio = txt;
    const i = document.getElementById('split-ratio'); if (i && i.value !== txt) i.value = txt;
    const parts = parseRatio(txt);
    SP.ratioParts = parts; SP.mres = null;
    if (parts && parts.length === 2) {        // دو قسمت: همان مسیر دقیق قبلی (با دستگیره‌ی کشیدنی)
      const a = C.toFrac(parts[0]), b = C.toFrac(parts[1]), f = C.fDiv(a, C.fAdd(a, b));
      SP.unit = 'percent'; SP.text = C.fText(f);
      const ti = document.getElementById('split-target'); if (ti) ti.value = SP.text;
      const us = document.getElementById('split-unit'); if (us) us.value = 'percent';
    }
    build(); recompute();
  }
  function recomputeMulti() {
    const box = document.getElementById('split-out');
    const r = C.splitMulti(SP.pre.ring, SP.ratioParts, { azimuth: SP.azimuth });
    const layer = ensureLayer(); if (layer) layer.clearLayers();
    if (!r.ok) { SP.mres = null; if (box) box.innerHTML = '<div class="box err">' + App.esc((r.errors || ['برش ممکن نیست'])[0]) + '</div>'; return; }
    SP.mres = r;
    r.parts.forEach((p, i) => {
      const col = PALETTE[i % PALETTE.length];
      L.polygon(p.ring.map(ll), { color: col, weight: 2, fillColor: col, fillOpacity: 0.28 })
        .bindTooltip('<div dir="rtl"><b>' + App.esc(partName(i)) + '</b><br>' + App.area(p.area) + '</div>', { className: 'fa', sticky: true }).addTo(layer);
    });
    const ok = Math.abs(r.sumAreas - r.totalArea) < Math.max(0.05, r.totalArea * 1e-6);
    let h = '<table class="t"><thead><tr><th>قسمت</th><th>سهم</th><th>متراژ خواسته‌شده</th><th>مساحت محاسبه‌شده</th><th>اختلاف (م²)</th></tr></thead><tbody>' +
      r.parts.map((p, i) => '<tr><td style="color:' + PALETTE[i % PALETTE.length] + '"><b>' + App.esc(partName(i)) + '</b></td><td>' + App.esc(App.fa(C.fText(p.share))) + '</td><td>' + App.n(p.target, 2) + '</td><td><b>' + App.n(p.area, 2) + '</b></td><td class="' + (Math.abs(p.errorM2) < 0.05 ? 'pos' : 'neg') + '">' + App.n(p.errorM2, 3) + '</td></tr>').join('') +
      '</tbody></table><div class="' + (ok ? 'pos' : 'neg') + '">' + (ok ? '✔ جمع قسمت‌ها = مساحت کل (' + App.area(r.totalArea) + ')' : '✘ جمع قسمت‌ها با مساحت کل یکی نیست') + '</div>';
    (r.warnings || []).slice(0, 3).forEach(w => { h += '<div class="box warn">' + App.esc(w) + '</div>'; });
    if (box) box.innerHTML = h;
  }
  const partName = (i) => ((SP.src && SP.src.name) ? SP.src.name + ' — ' : '') + 'قسمت ' + App.n(i + 1, 0);
  function saveMulti() {
    const r = SP.mres; if (!r) { App.toast('نسبت‌ها را درست بنویسید.', 'warn'); return; }
    const S = App.S, src = (SP.src && SP.src.parcel) || (App.form ? App.form.cur : null);
    const made = r.parts.map((p, i) => {
      const np = C.newParcel({ grade: 'manual' });
      if (src) ['scope', 'attrs', 'grade', 'gradeSource', 'gradeReason', 'special', 'specialReason', 'features', 'featuresReviewed', 'notes', 'pricing', 'priceMode', 'estateId'].forEach(k => { if (src[k] !== undefined) np[k] = C.clone(src[k]); });
      np.id = C.uid('land'); np.name = partName(i);
      np.geometry = { ring: p.ring.map(q => [q[0], q[1]]), source: 'split', meta: { method: 'تقسیم به نسبت ' + SP.ratioParts.join(':'), part: i + 1, targetM2: p.target, azimuth: r.azimuth, at: C.nowIso() } };
      np.areaComputed = C.areaM2(p.ring);
      np.history = [{ at: C.nowIso(), type: 'split', reason: 'تقسیم به نسبت ' + SP.ratioParts.join(':') + ' — قسمت ' + (i + 1) + '، جهت ' + App.n(r.azimuth, 1) + '°' }];
      return np;
    });
    const drop = SP.dropSource && SP.src && SP.src.parcel;
    App.confirm('ثبت ' + App.n(made.length, 0) + ' زمین', made.map(m => App.esc(App.area(m.areaComputed))).join('، ') + ' ثبت شود؟' + (drop ? '<br>زمین اصلی حذف می‌شود.' : ''), () => {
      made.forEach(m => C.addParcel(S, m));
      if (drop) { const id = SP.src.parcel.id; S.parcels = S.parcels.filter(x => x.id !== id); }
      S.log.push({ at: C.nowIso(), msg: 'تقسیم زمین به ' + made.length + ' قسمت با نسبت ' + SP.ratioParts.join(':') });
      App.save(); App.emit('state'); App.toast(App.n(made.length, 0) + ' زمین ثبت شد', 'ok'); SP.close();
      if (App.form) App.form.newParcel(true);
    }, 'ثبت شود');
  }

  /* ---------------- رابط پنل ---------------- */
  function build() {
    const p = panel(); if (!p) return;
    p.hidden = false; p.innerHTML = '';
    p.appendChild(el('div', { class: 'row' }, [
      el('b', { class: 'grow', text: '✂️ تقسیم یک زمین به دو قسمت با متراژ مشخص' }),
      el('button', { class: 'btn sm dng', text: 'بستن', onclick: () => SP.close() }),
    ]));
    p.appendChild(el('div', { class: 'note', text: 'همه‌چیز همین‌جا پیداست: نسبت یا متراژ را بنویسید، جهت خط را تنظیم کنید و ثبت بزنید. خط‌ها دقیقاً روی مساحت واقعی می‌نشینند.' }));
    p.appendChild(el('div', { class: 'box info', html: 'مساحت کل زمین: <b>' + App.area(SP.pre.totalArea) + '</b>' + (SP.src && SP.src.name ? ' — «' + App.esc(SP.src.name) + '»' : '') }));


    /* نسبت قسمت‌ها: ۲ قسمت یا بیشتر */
    const rin = el('input', { id: 'split-ratio', type: 'text', dir: 'ltr', value: SP.ratio, style: 'width:150px', placeholder: 'مثلاً 1:1:1 یا 8:8:1:4', oninput: (e) => { SP.ratio = e.target.value; const parts = parseRatio(e.target.value); if (parts && (parts.length >= 3) !== !!(SP.ratioParts && SP.ratioParts.length >= 3)) { setRatio(e.target.value); const n = document.getElementById('split-ratio'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } else { SP.ratioParts = parts; recompute(); } } });
    p.appendChild(el('div', { class: 'f' }, [el('span', { text: 'تقسیم به چند قسمت — نسبت‌ها' }), el('div', { class: 'row' }, [rin,
      el('button', { class: 'btn sm sec2', text: '۱:۱', onclick: () => setRatio('1:1') }),
      el('button', { class: 'btn sm sec2', text: '۱:۱:۱', onclick: () => setRatio('1:1:1') }),
      el('button', { class: 'btn sm sec2', text: '۱:۱:۱:۱', onclick: () => setRatio('1:1:1:1') })])]));

    /* متراژ قسمت ۱ */
    const unit = el('select', { id: 'split-unit', style: 'width:auto', onchange: (e) => { SP.unit = e.target.value; if (SP.unit === 'percent' && !/[\/٪%]/.test(SP.text)) { const f = C.toFrac(SP.text); if (f && SP.res) SP.text = C.fPct(C.frac(Math.round(C.fToNumber(f) * 1e6), Math.round(SP.pre.total * 1e6) || 1), 4); } recompute(); } },
      [el('option', { value: 'percent', text: '٪ از کل' }), el('option', { value: 'm2', text: 'مترمربع' }), el('option', { value: 'ha', text: 'هکتار' })]);
    unit.value = SP.unit;
    const target = el('input', {
      id: 'split-target', type: 'text', dir: 'ltr', inputmode: 'decimal', value: SP.text, style: 'width:130px',
      placeholder: 'مثلاً 2500 یا 1/2', oninput: (e) => { SP.text = e.target.value; recompute(); },
    });
    p.appendChild(el('label', { class: 'f' }, [el('span', { text: 'متراژ قسمت ۱' }), el('div', { class: 'row' }, [target, unit]),
      el('div', { class: 'note', text: 'در حالت «٪ از کل» می‌توانید کسر دقیق بنویسید: 1/2، 1/3، 1/8 (بدون خطای گردکردن).' })]));
    p.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn sm sec2', text: 'نصف دقیق (۱/۲)', onclick: () => setTarget('percent', '1/2') }),
      el('button', { class: 'btn sm sec2', text: 'یک‌سوم (۱/۳)', onclick: () => setTarget('percent', '1/3') }),
      el('button', { class: 'btn sm sec2', text: 'یک‌چهارم (۱/۴)', onclick: () => setTarget('percent', '1/4') }),
      el('button', { class: 'btn sm sec2', text: '⇄ تعویض دو قسمت', onclick: swapParts }),
    ]));

    /* جهت خط */
    const azInp = el('input', { id: 'split-az', type: 'text', dir: 'ltr', inputmode: 'decimal', style: 'width:90px', value: SP.azimuth, oninput: (e) => { const v = App.num(e.target.value); if (v != null && isFinite(v)) { SP.azimuth = v; const s = document.getElementById('split-az-range'); if (s) s.value = String(((v % 360) + 360) % 360); recompute(); } } });
    const azRange = el('input', { id: 'split-az-range', type: 'range', min: '0', max: '359.5', step: '0.5', value: String(((SP.azimuth % 360) + 360) % 360), style: 'flex:1;min-width:120px', oninput: (e) => { SP.azimuth = +e.target.value; azInp.value = e.target.value; recompute(); } });
    p.appendChild(el('div', { class: 'f' }, [el('span', { text: 'جهت خط جداکننده (درجه از شمال، ساعتگرد)' }), el('div', { class: 'row' }, [azInp, azRange])]));
    p.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn sm sec2', text: '−۴۵°', onclick: () => rot(-45) }), el('button', { class: 'btn sm sec2', text: '−۱۵°', onclick: () => rot(-15) }),
      el('button', { class: 'btn sm sec2', text: '−۱°', onclick: () => rot(-1) }), el('button', { class: 'btn sm sec2', text: '+۱°', onclick: () => rot(1) }),
      el('button', { class: 'btn sm sec2', text: '+۱۵°', onclick: () => rot(15) }), el('button', { class: 'btn sm sec2', text: '+۴۵°', onclick: () => rot(45) }),
    ]));
    p.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn sm sec2', text: 'شمالی–جنوبی (۰°)', onclick: () => setAz(0) }),
      el('button', { class: 'btn sm sec2', text: 'شرقی–غربی (۹۰°)', onclick: () => setAz(90) }),
      el('button', { class: 'btn sm sec2', text: 'جهت پیشنهادی (عمود بر کشیدگی زمین)', onclick: () => { const az = C.principalAzimuth(SP.pre.ring); if (az == null) { App.toast('جهت پیشنهادی محاسبه نشد.', 'warn'); return; } setAz(Math.round(az * 10) / 10); } }),
      el('button', { class: 'btn sm sec2', text: '⇆ سمت دیگر = قسمت ۱', onclick: () => { SP.side = SP.side === 'a' ? 'b' : 'a'; recompute(); } }),
    ]));

    /* نتیجه */
    p.appendChild(el('div', { id: 'split-out' }));

    /* نام‌ها و ثبت */
    p.appendChild(el('div', { class: 'f' }, [el('span', { text: 'نام قسمت ۱ (سبز)' }), el('input', { type: 'text', value: SP.name1, oninput: (e) => { SP.name1 = e.target.value; } })]));
    p.appendChild(el('div', { class: 'f' }, [el('span', { text: 'نام قسمت ۲ (نارنجی)' }), el('input', { type: 'text', value: SP.name2, oninput: (e) => { SP.name2 = e.target.value; } })]));
    if (SP.src && SP.src.parcel) {
      const cb = el('input', { type: 'checkbox' }); cb.checked = !!SP.dropSource;
      cb.addEventListener('change', () => { SP.dropSource = cb.checked; });
      p.appendChild(el('label', { class: 'note', style: 'display:flex;gap:6px;align-items:center' }, [cb, 'زمین اصلی («' + (SP.src.parcel.name || '—') + '») پس از ثبت دو قسمت حذف شود']));
    }
    p.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
      el('button', { class: 'btn', id: 'split-save', text: (SP.ratioParts && SP.ratioParts.length >= 3) ? '💾 ثبت ' + App.n(SP.ratioParts.length, 0) + ' زمین جدید' : '💾 ثبت دو زمین جدید', onclick: () => (SP.ratioParts && SP.ratioParts.length >= 3) ? saveMulti() : saveParts() }),
      el('button', { class: 'btn sec2', text: 'قسمت ۱ → فرم ثبت', onclick: () => usePart(1) }),
      el('button', { class: 'btn sec2', text: 'قسمت ۲ → فرم ثبت', onclick: () => usePart(2) }),
      el('button', { class: 'btn sec2', text: 'خروجی GeoJSON', onclick: exportGeo }),
    ]));
    p.appendChild(el('div', { class: 'note', text: 'صفت‌ها (محدوده، نوع، درجه، ویژه، ویژگی‌ها و قیمت دستی) از زمین مبدأ کپی می‌شود؛ مساحت هر قسمت از هندسه‌ی همان قسمت محاسبه می‌شود و قیمت/ارزش دوباره در خود برنامه حساب می‌شود.' }));
  }
  function setTarget(unit, text) { SP.unit = unit; SP.text = text; const i = document.getElementById('split-target'); if (i) i.value = text; const s = document.getElementById('split-unit'); if (s) s.value = unit; recompute(); }
  function setAz(a) { SP.azimuth = a; const i = document.getElementById('split-az'); if (i) i.value = String(a); const r = document.getElementById('split-az-range'); if (r) r.value = String(((a % 360) + 360) % 360); recompute(); }
  function rot(d) { setAz(Math.round((((SP.azimuth + d) % 360) + 360) % 360 * 10) / 10); }
  function swapParts() {
    if (!SP.res) return;
    SP.unit = 'm2'; SP.text = String(Math.round(SP.res.areaB * 100) / 100);
    const i = document.getElementById('split-target'); if (i) i.value = SP.text;
    const s = document.getElementById('split-unit'); if (s) s.value = 'm2';
    const n = SP.name1; SP.name1 = SP.name2; SP.name2 = n;
    build(); recompute();
  }

  /* ---------------- خروجی‌ها ---------------- */
  function partMeta(r, which) {
    return {
      method: 'برش با متراژ مشخص (تقسیم زمین به دو قسمت)',
      from: (SP.src && SP.src.name) || 'مرز فعلی',
      part: which, targetM2: r.targetM2, areaA: r.areaA, areaB: r.areaB,
      azimuth: r.azimuth, side: r.side, cutLengthM: r.cutLengthM, at: C.nowIso(),
      note: 'خط جداکننده با جست‌وجوی دوتایی روی مساحت واقعی محاسبه شده است',
    };
  }
  function usePart(which) {
    const r = SP.res; if (!r) { App.toast('ابتدا متراژ را معتبر وارد کنید.', 'warn'); return; }
    const ring = which === 1 ? r.partA : r.partB;
    App.map.setBoundary(ring, { source: 'split', meta: partMeta(r, which), fit: true });
    if (App.form && App.form.cur) { App.form.cur.areaComputed = C.areaM2(ring); App.form.dirty = true; }
    App.toast('قسمت ' + App.n(which, 0) + ' (' + App.area(C.areaM2(ring)) + ') به‌عنوان مرز در فرم قرار گرفت؛ می‌توانید ویرایش و ذخیره کنید.', 'ok');
    SP.close();
  }
  function saveParts() {
    const r = SP.res; if (!r) { App.toast('ابتدا متراژ را معتبر وارد کنید.', 'warn'); return; }
    const S = App.S;
    const src = (SP.src && SP.src.parcel) || (App.form && !App.form.isNew ? App.form.cur : null) || (App.form ? App.form.cur : null);
    const mk = (ring, name, which) => {
      const p = C.newParcel({ grade: 'manual' });
      if (src) ['scope', 'attrs', 'grade', 'gradeSource', 'gradeReason', 'special', 'specialReason', 'features', 'featuresReviewed', 'notes', 'pricing', 'priceMode'].forEach(k => { if (src[k] !== undefined) p[k] = C.clone(src[k]); });
      p.id = C.uid('land');
      p.name = name || ((src && src.name ? src.name + ' — ' : 'زمین ') + 'قسمت ' + App.n(which, 0));
      p.geometry = { ring: ring.map(q => [q[0], q[1]]), source: 'split', meta: partMeta(r, which) };
      p.areaComputed = C.areaM2(ring);
      p.history = [{ at: C.nowIso(), type: 'split', reason: 'برش از «' + ((src && src.name) || 'مرز فعلی') + '» — قسمت ' + which + '، متراژ خواسته‌شده ' + App.n(r.targetM2, 2) + ' م²، جهت ' + App.n(r.azimuth, 1) + '°' }];
      return p;
    };
    const p1 = mk(r.partA, SP.name1, 1), p2 = mk(r.partB, SP.name2, 2);
    const doSave = () => {
      C.addParcel(S, p1); C.addParcel(S, p2);
      if (SP.dropSource && SP.src && SP.src.parcel) {
        const id = SP.src.parcel.id;
        S.parcels = S.parcels.filter(x => x.id !== id);
        S.log.push({ at: C.nowIso(), msg: 'حذف زمین مبدأ پس از برش («' + (SP.src.parcel.name || id) + '»)' });
      }
      S.log.push({ at: C.nowIso(), msg: 'برش زمین به دو قسمت: «' + p1.name + '» (' + App.n(p1.areaComputed, 1) + ' م²) و «' + p2.name + '» (' + App.n(p2.areaComputed, 1) + ' م²) با خط ' + App.n(r.azimuth, 1) + '°' });
      App.save(); App.emit('state');
      App.toast('دو زمین ثبت شد: ' + App.area(p1.areaComputed) + ' و ' + App.area(p2.areaComputed), 'ok');
      SP.close();
      if (App.form) App.form.newParcel(true);
    };
    App.confirm('ثبت دو زمین', 'دو زمین جدید با مساحت‌های <b>' + App.esc(App.area(p1.areaComputed)) + '</b> و <b>' + App.esc(App.area(p2.areaComputed)) + '</b> ثبت شود؟' + (SP.dropSource && SP.src && SP.src.parcel ? '<br>زمین اصلی («' + App.esc(SP.src.parcel.name || '') + '») حذف می‌شود.' : ''), doSave, 'ثبت شود');
  }
  function exportGeo() {
    const r = SP.res; if (!r) { App.toast('ابتدا متراژ را معتبر وارد کنید.', 'warn'); return; }
    const f = (ring, name, which, area) => ({
      type: 'Feature',
      properties: { name: name, part: which, area_m2: Math.round(area * 1000) / 1000, target_m2: r.targetM2 == null ? null : Math.round(r.targetM2 * 1000) / 1000, azimuth_deg: r.azimuth, cut_length_m: Math.round(r.cutLengthM * 100) / 100, source: (SP.src && SP.src.name) || '' },
      geometry: { type: 'Polygon', coordinates: [ring.concat([ring[0]])] },
    });
    const fc = {
      type: 'FeatureCollection',
      features: [f(r.partA, SP.name1, 1, r.areaA), f(r.partB, SP.name2, 2, r.areaB),
        { type: 'Feature', properties: { name: 'خط جداکننده', azimuth_deg: r.azimuth, length_m: r.cutLengthM }, geometry: { type: 'LineString', coordinates: r.line } }],
    };
    App.download('zamin-yar-split-' + new Date().toISOString().slice(0, 10) + '.geojson', JSON.stringify(fc, null, 1), 'application/geo+json');
  }

  App.on('init', () => {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && SP.visible) SP.close(); });
    ensureLayer();
  });
  /* اگر مرز زمین عوض شود (ترسیم تازه، تشخیص خودکار، ورود مختصات یا GPS)، ابزار برش
     دیگر روی مرز قبلی معنا ندارد و بسته می‌شود تا کاربر با مرز جدید از اول شروع کند. */
  App.on('boundary', (b) => {
    if (!SP.visible || !SP.pre) return;
    const r = (b && b.ring) || [], src = SP.pre.ring;
    const same = r.length === src.length && r.every((p, i) => p[0] === src[i][0] && p[1] === src[i][1]);
    if (!same) SP.close();
  });
  App.on('state', () => { if (SP.visible && SP.src && SP.src.parcel && !App.S.parcels.some(p => p.id === SP.src.parcel.id)) SP.close(); });
})();

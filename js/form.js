/* فرم ثبت زمین (پنل کناری) + کارت خلاصه‌ی امتیاز و ارزش */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, M = App.map;
  const F = App.form = { cur: null, isNew: true, dirty: false, recalcChosen: false };
  let R = {};
  const root = () => document.getElementById('form-root');
  const S = () => App.S;

  App.on('init', () => { F.newParcel(true); });
  App.on('state', () => { if (F.cur && !F.isNew && !S().parcels.some(p => p.id === F.cur.id)) F.newParcel(true); else if (F.cur) refresh(); });
  App.on('boundary', (b) => {
    if (!F.cur || F.loading) return;
    F.cur.areaComputed = b && b.count >= 3 && b.valid ? b.area : null;
    F.dirty = true; refresh();
  });
  App.on('imported', (x) => { if (F.cur && !F.cur.name && x && x.name && !/^(مرز واردشده|عارضه|چندضلعی)/.test(x.name)) { F.cur.name = x.name; const i = document.getElementById('f-name'); if (i) i.value = x.name; } });

  F.newParcel = function (force) {
    if (!force && F.dirty && !window.confirm('تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟')) return;
    F.loading = true;
    F.cur = C.newParcel({ grade: 'manual' }); F.isNew = true; F.dirty = false; F.recalcChosen = false;
    M.editingId = null; M.setBoundary(null); M.clearPreview && M.clearPreview();
    F.loading = false;
    render(); M.renderSaved();
  };
  F.open = function (id, fly) {
    const p = S().parcels.find(x => x.id === id); if (!p) return;
    if (F.cur && F.dirty && F.cur.id !== id && !window.confirm('تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟')) return;
    F.loading = true;
    F.cur = C.clone(p); F.isNew = false; F.dirty = false; F.recalcChosen = false;
    M.editingId = id;
    M.setBoundary(p.geometry && p.geometry.ring, { source: p.geometry && p.geometry.source, meta: p.geometry && p.geometry.meta, fit: fly !== false });
    F.loading = false;
    render(); M.renderSaved();
  };

  /* ---------- ابزارهای فرم ---------- */
  const grp = () => S().settings.groups[F.cur.scope];
  function touch() { F.dirty = true; }
  function sel(map, value, onchange, extra) {
    const s = el('select', null, (extra || []).concat(App.opts(map, value)));
    s.value = value; s.addEventListener('change', () => { onchange(s.value); });
    return s;
  }
  function choices(map, value, onpick, cls) {
    const wrap = el('div', { class: 'choices ' + (cls || 'c3') });
    Object.keys(map).forEach(k => wrap.appendChild(el('div', { class: 'choice' + (k === value ? ' on' : ''), text: map[k], onclick: () => onpick(k) })));
    return wrap;
  }
  function field(label, node, hint) { return el('label', { class: 'f' }, [el('span', { text: label }), node, hint ? el('div', { class: 'note', text: hint }) : null]); }
  function section(n, title, sub, kids) { return el('div', { class: 'sec' }, [el('h4', null, [el('span', { class: 'n', text: App.n(n, 0) }), title, sub ? el('small', { text: sub }) : null]), ...kids]); }
  const GR_PICK = { manual: '— انتخاب کنید —', grade1: 'درجه یک', grade2: 'درجه دو', grade3: 'درجه سه' };

  function syncGrade() {
    const p = F.cur;
    if (p.scope === 'rural_inside') {
      const sug = C.suggestRuralGrade(S().settings, p.attrs);
      R.sug = sug;
      if (p.gradeSource === 'auto') { p.grade = sug.grade || 'manual'; p.gradeReason = sug.reason; }
      else p.gradeReason = 'تعیین دستی توسط کاربر (' + (C.GRADES[p.grade] || '—') + ')؛ پیشنهاد سیستم: ' + sug.reason;
    } else if (p.scope === 'rural_outside') {
      p.gradeSource = 'manual';
      p.gradeReason = 'انتخاب کاربر: ' + (C.FARM[p.attrs.farmType] || '—') + '، ' + (C.GRADES[p.grade] || 'درجه نامشخص') + (p.special ? '، ویژه' : '، معمولی');
    } else {
      p.gradeSource = 'manual';
      p.gradeReason = 'کاربری شهری انتخاب کاربر: ' + (C.URBAN_USES[p.attrs.urbanUse] || '—');
    }
  }

  /* پارسل برای ارزش‌گذاری زنده */
  function liveParcel() { const p = C.clone(F.cur); return p; }
  function liveV() { syncGrade(); return C.valuate(liveParcel(), S().settings); }

  /* دیدِ خلاصه: اگر ذخیره‌شده و بدون تغییر ⇒ همان قیمت ثبت‌شده */
  function view() {
    const p = F.cur;
    const lv = liveV();
    const sv = p.valuation;
    if (!F.isNew && sv && !F.dirty) {
      return { fromStored: true, price: sv.pricePerM2, priceKind: sv.priceKind, total: sv.total, area: sv.area, score: sv.score, scoreMax: sv.scoreMax, status: sv.status, provisional: sv.provisional, explain: sv.explain || [], scoreLines: sv.scoreLines || [], warnings: sv.warnings || [], needs: sv.needs || [], version: sv.settingsVersion, live: lv };
    }
    return Object.assign({ fromStored: false, version: S().settings.version, live: lv }, lv, { price: lv.price });
  }

  /* ---------- رسم فرم ---------- */
  function render() {
    const p = F.cur; R = {};
    syncGrade();
    const r = root(); r.innerHTML = '';
    r.appendChild(el('div', { class: 'sec', style: 'background:#f1f6ee' }, [
      el('div', { class: 'row' }, [
        el('b', { class: 'grow', text: F.isNew ? 'ثبت زمین جدید' : 'ویرایش زمین ثبت‌شده' }),
        el('button', { class: 'btn sm sec2', text: '＋ زمین جدید', onclick: () => F.newParcel() }),
      ]),
      field('نام یا شناسه‌ی زمین (اختیاری)', el('input', { type: 'text', id: 'f-name', value: p.name, placeholder: 'مثلاً «باغ شرقی»', oninput: (e) => { p.name = e.target.value; touch(); refreshLight(); } })),
      el('div', { id: 'f-top', class: 'note' }),
    ]));

    /* ۱ موقعیت و مرز */
    R.bnd = el('div', { class: 'box info', id: 'f-bnd' });
    r.appendChild(section(1, 'موقعیت و مرز زمین', 'از روی نقشه', [
      el('div', { class: 'note', text: 'محل را با جست‌وجوی نام یا مختصات (کادر بالای نقشه) پیدا کنید؛ سپس مرز را ترسیم کنید یا مختصات آماده را وارد کنید.' }),
      el('div', { class: 'note', text: 'زمین بدون مرز مشخص روی عکس: اگر متراژ را می‌دانید، در «تشخیص خودکار» کادر «متراژ تخمینی» را پر کنید تا مرز با همان مساحت ساخته شود؛ اگر نمی‌دانید، کادر را خالی بگذارید و با GPS (دور زدن) یا ترسیم دستی اندازه بگیرید. برای جداکردن یک قسمت با متراژ مشخص از یک زمین بزرگ‌تر، «✂️ تقسیم به دو قسمت با متراژ مشخص» خط جداکننده را دقیقاً جایی می‌کشد که مساحت درست شود و جهتش قابل چرخاندن است.' }),
      el('div', { class: 'row', style: 'margin:6px 0' }, [
        el('button', { class: 'btn', text: '🎯 تشخیص خودکار مرز (لمس مرکز زمین)', onclick: () => App.detect.start() }),
        el('button', { class: 'btn', text: '✏️ ترسیم مرز روی نقشه', onclick: () => M.startDraw() }),
        el('button', { class: 'btn', text: '📥 ورود مختصات آماده', onclick: () => App.importer.open() }),
        el('button', { class: 'btn', text: '📍 اندازه‌گیری با GPS (پیاده‌روی)', onclick: () => App.gps.open() }),
        el('button', { class: 'btn', text: '✂️ تقسیم به دو قسمت با متراژ مشخص', onclick: () => App.split.openCurrent() }),
        el('button', { class: 'btn sm sec2', text: 'ویرایش دقیق نقاط', onclick: () => M.pointsEditor() }),
        el('button', { class: 'btn sm sec2', text: 'نمایش روی نقشه', onclick: () => { const b = M.getBoundary(); if (b.count) M.map.fitBounds(b.ring.map(q => [q[1], q[0]]), { maxZoom: 18, padding: [40, 40] }); } }),
      ]),
      R.bnd,
    ]));

    /* ۲ محدوده */
    r.appendChild(section(2, 'محدوده‌ی زمین', null, [
      choices(C.SCOPES, p.scope, (k) => {
        if (k === p.scope) return;
        p.scope = k; touch();
        p.special = false; p.specialReason = '';
        if (k === 'rural_inside') { p.gradeSource = 'auto'; p.attrs.residential = 'unknown'; p.attrs.agri = 'none'; p.grade = 'manual'; }
        else if (k === 'rural_outside') { p.grade = 'manual'; p.attrs.farmType = p.attrs.farmType || 'irrigated'; }
        else { p.grade = 'manual'; p.attrs.urbanUse = p.attrs.urbanUse || 'residential'; }
        render();
      }),
      el('div', { class: 'note', text: 'قابلیت ساخت‌وساز یا تغییر کاربری از روی موقعیت حدس زده نمی‌شود؛ خودتان ثبت کنید یا از منبع معتبر وارد کنید.' }),
    ]));

    /* ۳ نوع و کاربری */
    const s3 = [];
    if (p.scope === 'rural_inside') {
      s3.push(field('قابلیت مسکونی / ساخت‌وساز', sel(C.RES, p.attrs.residential || 'unknown', (v) => { p.attrs.residential = v; touch(); refresh(); })));
      s3.push(field('وضعیت کشاورزی (آبی / دیم)', sel(C.AGRI, p.attrs.agri || 'none', (v) => { p.attrs.agri = v; touch(); refresh(); })));
      R.sugg = el('div', { id: 'f-sugg' });
      s3.push(R.sugg);
      const gsel = el('select', null, [el('option', { value: 'auto', text: 'طبق پیشنهاد سیستم' })].concat(['grade1', 'grade2', 'grade3'].map(k => el('option', { value: k, text: 'تعیین دستی: ' + C.GRADES[k] }))));
      gsel.value = p.gradeSource === 'auto' ? 'auto' : p.grade;
      gsel.addEventListener('change', () => { if (gsel.value === 'auto') { p.gradeSource = 'auto'; } else { p.gradeSource = 'manual'; p.grade = gsel.value; } touch(); refresh(); });
      s3.push(field('درجه', gsel));
    } else if (p.scope === 'rural_outside') {
      s3.push(field('نوع زمین', sel(C.FARM, p.attrs.farmType || 'irrigated', (v) => { p.attrs.farmType = v; touch(); refresh(); })));
      s3.push(field('درجه', sel(GR_PICK, p.grade || 'manual', (v) => { p.grade = v; touch(); refresh(); })));
    } else {
      s3.push(field('کاربری شهری', sel(C.URBAN_USES, p.attrs.urbanUse || 'residential', (v) => {
        p.attrs.urbanUse = v; touch();
        if (v === 'agri' && !['irrigated', 'dry', 'other'].includes(p.attrs.agri)) p.attrs.agri = 'other';
        render();
      })));
      if (p.attrs.urbanUse === 'agri') s3.push(field('نوع کشاورزی', sel(C.FARM, ['irrigated', 'dry', 'other'].includes(p.attrs.agri) ? p.attrs.agri : 'other', (v) => { p.attrs.agri = v; touch(); refresh(); })));
    }
    r.appendChild(section(3, p.scope === 'rural_inside' ? 'مشخصات زمین داخل روستا' : p.scope === 'rural_outside' ? 'زمین کشاورزی اطراف روستا' : 'کاربری شهری', null, s3));

    /* ۴ ویژه */
    const g = grp();
    const s4 = [];
    if (g.specialEnabled) {
      s4.push(choices({ normal: 'معمولی', special: 'ویژه' }, p.special ? 'special' : 'normal', (k) => { p.special = k === 'special'; touch(); render(); }, 'c2'));
      if (p.special) {
        s4.push(field('علت ویژه‌بودن (ذخیره می‌شود)', el('textarea', { id: 'f-sreason', placeholder: 'مثلاً: کنار جاده‌ی آسفالت و دارای چاه آب', oninput: (e) => { p.specialReason = e.target.value; touch(); }, value: p.specialReason || '' })));
      }
    } else s4.push(el('div', { class: 'note', text: 'وضعیت ویژه برای این گروه در تنظیمات غیرفعال است.' }));
    R.hint = el('div', { id: 'f-shint' });
    const fl = el('div');
    S().settings.scoring.features.forEach(f => {
      const cur = p.features[f.key] || { on: false, note: '' };
      const cb = el('input', { type: 'checkbox', checked: cur.on ? true : null });
      const note = el('input', { type: 'text', placeholder: 'توضیح اختیاری', value: cur.note || '', style: cur.on ? '' : 'display:none' });
      cb.addEventListener('change', () => { p.features[f.key] = { on: cb.checked, note: note.value }; note.style.display = cb.checked ? '' : 'none'; touch(); refresh(); });
      note.addEventListener('input', () => { p.features[f.key] = { on: cb.checked, note: note.value }; touch(); });
      fl.appendChild(el('div', { class: 'feat' }, [cb, el('span', { text: f.label + ' ' }), el('span'), note]));
    });
    s4.push(el('details', { open: Object.values(p.features).some(x => x && x.on) ? true : null }, [el('summary', { text: 'امکانات و ویژگی‌ها (اختیاری)' }), fl,
      grp().method === 'score' ? el('label', { style: 'display:flex;gap:6px;align-items:center' }, [el('input', { type: 'checkbox', checked: p.featuresReviewed ? true : null, onchange: (e) => { p.featuresReviewed = e.target.checked; touch(); refresh(); } }), 'ویژگی‌ها را بررسی کرده‌ام (برای پایان «امتیاز موقت»)']) : null,
      R.hint]));
    r.appendChild(section(4, 'درجه ویژه و امکانات', null, s4));

    /* ۵ قیمت */
    R.price = el('div', { id: 'f-price' });
    r.appendChild(section(5, 'قیمت هر مترمربع', 'تومان', [R.price]));

    /* اختیاری */
    r.appendChild(el('div', { class: 'sec' }, [el('details', null, [el('summary', { text: 'اطلاعات تکمیلی (اختیاری)' }),
      field('مساحت مبنای دستی (مترمربع) — جایگزین مساحت محاسبه‌شده از مرز', el('input', { type: 'text', dir: 'ltr', value: p.areaOverride == null ? '' : p.areaOverride, placeholder: 'خالی = مساحت نقشه', oninput: (e) => { const v = App.num(e.target.value); p.areaOverride = v == null || !isFinite(v) ? null : v; touch(); refresh(); } })),
      field('یادداشت', el('textarea', { value: p.notes || '', oninput: (e) => { p.notes = e.target.value; touch(); } })),
    ])]));

    /* خلاصه */
    R.sum = el('div', { id: 'f-sum' });
    r.appendChild(el('div', { class: 'sec' }, [el('h4', { text: 'کارت خلاصه' }), R.sum]));
    r.appendChild(el('div', { class: 'sec row' }, [
      el('button', { class: 'btn grow', text: F.isNew ? '💾 ثبت زمین' : '💾 ذخیره‌ی تغییرات', onclick: () => F.save() }),
      F.isNew ? null : el('button', { class: 'btn dng', text: 'حذف', onclick: () => F.remove() }),
    ]));
    refresh();
  }

  /* ---------- به‌روزرسانی بخش‌های پویا ---------- */
  function refreshLight() { const t = document.getElementById('f-top'); if (t) t.innerHTML = topHtml(); }
  function topHtml() {
    const v = view();
    return 'ارزش کل: <b>' + App.toman(v.total) + '</b> — ' + statusTag(v.status) + (F.dirty ? ' <span class="mut">(ذخیره‌نشده)</span>' : '');
  }
  const statusTag = (s) => '<span class="tag ' + (s === 'قطعی' ? 'final' : s === 'موقت' ? 'prov' : 'inc') + '">' + (s === 'موقت' ? 'امتیاز/ارزش موقت' : s || 'ناقص') + '</span>';

  function refresh() {
    if (!F.cur || !R.sum) return;
    const p = F.cur;
    syncGrade();
    const b = M.getBoundary();
    R.bnd.innerHTML = M.liveHtml(b) + (b.meta && b.meta.file ? '<div class="note">منبع: ' + App.esc(b.meta.file) + ' — ' + App.esc(b.meta.crs || '') + '</div>' : '') +
      (b.meta && b.meta.method ? '<div class="note">منبع: اندازه‌گیری GPS (' + (b.meta.method === 'gps-corner' ? 'گوشه به گوشه' : 'مسیر خودکار') + ') — میانگین دقت ±' + App.n(b.meta.meanAccuracy, 1) + ' متر</div>' : '') +
      (!b.count ? '<div class="note">یا می‌توانید مساحت را دستی در «اطلاعات تکمیلی» بنویسید.</div>' : '');
    if (R.sugg) {
      const sg = R.sug || C.suggestRuralGrade(S().settings, p.attrs);
      R.sugg.innerHTML = p.gradeSource === 'auto'
        ? (sg.manual ? '<div class="box warn"><b>نیازمند تعیین دستی:</b> ' + App.esc(sg.reason) + '<br>درجه را از فهرست پایین خودتان انتخاب کنید.</div>'
          : '<div class="box ok"><b>رده‌ی پیشنهادی: ' + C.GRADES[sg.grade] + '</b><br>' + App.esc(sg.reason) + '</div>')
        : '<div class="box info">درجه را شما دستی تعیین کرده‌اید: <b>' + C.GRADES[p.grade] + '</b><br><span class="note">پیشنهاد سیستم: ' + App.esc(sg.reason) + '</span></div>';
    }
    // پیشنهاد ویژه
    const fs = C.featureScore(S().settings, p), thr = S().settings.scoring.specialSuggestThreshold;
    R.hint.innerHTML = '';
    R.hint.appendChild(el('div', { class: 'note', text: 'امتیاز ویژگی‌ها: ' + App.n(fs.total, 0) + ' از ' + App.n(fs.max, 0) + (p.special ? ' — ویژگی‌هایی که در «ویژه» لحاظ شده‌اند دوباره امتیاز نمی‌گیرند' : '') }));
    if (!p.special && grp().specialEnabled && fs.total >= thr) R.hint.appendChild(el('div', { class: 'box info' }, ['امتیاز ویژگی‌ها از آستانه‌ی پیشنهاد (' + App.n(thr, 0) + ') بیشتر است؛ در صورت صلاح‌دید می‌توانید زمین را «ویژه» کنید. ', el('button', { class: 'btn sm', text: 'ویژه شود', onclick: () => { p.special = true; touch(); render(); } })]));
    renderPrice(); renderSummary(); refreshLight();
  }

  function renderPrice() {
    const p = F.cur, v = liveV(), g = grp();
    const box = R.price; box.innerHTML = '';
    box.appendChild(el('div', { class: 'note', html: 'روش محاسبه‌ی این گروه: <b>' + C.METHODS[g.method] + '</b> (قابل تغییر در «تنظیمات ارزش‌گذاری»)' }));
    const info = [];
    if (v.cellKey) {
      const c = v.cell || {};
      info.push('ردیف قیمت: <b>' + cellLabel(v.cellKey) + '</b>');
      if (c.fixed != null) info.push('قیمت پایه: <b>' + App.toman(c.fixed) + '</b> (' + App.esc(v.priceSource || '') + ')');
      if (c.min != null || c.max != null) info.push('بازه: ' + App.toman(c.min) + ' تا ' + App.toman(c.max));
    } else info.push('<span class="neg">با انتخاب‌های فعلی، ردیف قیمت مشخص نیست (درجه یا کاربری را تعیین کنید).</span>');
    box.appendChild(el('div', { class: 'box info', html: info.join('<br>') }));
    if (g.method === 'range') {
      box.appendChild(field('قیمت انتخابی شما در بازه (تومان)', el('input', { type: 'text', dir: 'ltr', value: p.pricing.userPrice == null ? '' : p.pricing.userPrice, placeholder: 'بین حداقل و حداکثر', oninput: (e) => { const x = App.num(e.target.value); p.pricing.userPrice = x == null || !isFinite(x) ? null : x; touch(); refreshAfterPrice(); } })));
    }
    if (g.method === 'score' && v.suggested != null) box.appendChild(el('div', { class: 'box ok', html: 'قیمت پیشنهادی بر اساس امتیاز: <b>' + App.toman(v.suggested) + '</b>' }));
    const inp = el('input', { type: 'text', dir: 'ltr', id: 'f-override', value: p.pricing.override == null ? '' : p.pricing.override, placeholder: v.suggested != null ? 'پیشنهاد: ' + Math.round(v.suggested) : 'قیمت را وارد کنید', oninput: (e) => { const x = App.num(e.target.value); p.pricing.override = x == null || !isFinite(x) || x < 0 ? null : x; touch(); refreshAfterPrice(); } });
    box.appendChild(field('قیمت نهایی هر مترمربع (تومان) — قابل ویرایش؛ خالی = قیمت محاسبه‌شده', inp));
    box.appendChild(el('div', { class: 'row' }, [el('span', { id: 'f-eff', html: effHtml(v) }), p.pricing.override != null ? el('button', { class: 'btn sm sec2', text: 'حذف قیمت دستی', onclick: () => { p.pricing.override = null; touch(); render(); } }) : null]));
  }
  function effHtml(v) { return 'قیمت اعمال‌شده: <b>' + App.toman(v.price) + '</b> ' + (v.priceKind ? '(' + v.priceKind + ')' : ''); }
  function refreshAfterPrice() { const v = liveV(); const e = document.getElementById('f-eff'); if (e) e.innerHTML = effHtml(v); renderSummary(); refreshLight(); }
  function cellLabel(key) { const [a, b] = key.split('_'); return (C.GRADES[a] || C.URBAN_USES[a] || a) + ' ' + (b === 'special' ? 'ویژه' : 'معمولی'); }

  function centroid(ring) { if (!ring || !ring.length) return null; const r = C.openRing(ring); return [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length]; }

  function renderSummary() {
    const p = F.cur, v = view(), box = R.sum; if (!box) return;
    const b = M.getBoundary();
    const c = centroid(b.count ? b.ring : null);
    const typ = p.scope === 'rural_inside' ? C.AGRI[p.attrs.agri] : p.scope === 'rural_outside' ? C.FARM[p.attrs.farmType] : (p.attrs.urbanUse === 'agri' ? 'کشاورزی' : '—');
    const abi = p.scope === 'urban' ? (p.attrs.urbanUse === 'agri' ? C.FARM[p.attrs.agri] : '—') : (p.scope === 'rural_inside' ? ({ irrigated: 'آبی', dry: 'دیم' }[p.attrs.agri] || '—') : ({ irrigated: 'آبی', dry: 'دیم' }[p.attrs.farmType] || '—'));
    const use = p.scope === 'rural_inside' ? C.RES[p.attrs.residential] : p.scope === 'rural_outside' ? 'کشاورزی' : C.URBAN_USES[p.attrs.urbanUse];
    const gradeTxt = p.scope === 'urban' ? '— (شهری)' : (C.GRADES[p.grade] || '<span class="neg">نیازمند تعیین دستی</span>');
    const g = grp();
    const rows = [
      ['موقعیت', c ? App.n(c[1], 5) + '، ' + App.n(c[0], 5) : (p.areaOverride ? 'بدون مرز' : '—')],
      ['محدوده', C.SCOPES[p.scope]], ['نوع زمین', typ || '—'], ['آبی یا دیم', abi], ['کاربری', use || '—'],
      ['درجه', gradeTxt], ['وضعیت ویژه', g.specialEnabled ? (p.special ? 'ویژه' : 'معمولی') : 'غیرفعال'],
      ['امتیاز کل', App.n(v.score, 0) + ' از ' + App.n(v.scoreMax, 0) + (v.provisional ? ' (امتیاز موقت)' : '')],
      ['قیمت هر مترمربع', App.toman(v.price)], ['مساحت', App.area(v.area)],
    ];
    let h = '<div class="sum"><div class="grid">' + rows.map(r => '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
      '<div class="tot"><span>ارزش کل = مساحت × قیمت</span><b>' + App.toman(v.total) + '</b></div></div>';
    h += '<div style="margin-top:6px">' + statusTag(v.status) + (v.fromStored ? ' <span class="note">قیمت ثبت‌شده با تنظیمات نسخه‌ی ' + App.n(v.version, 0) + '</span>' : '') + '</div>';
    // قیمت ثبت‌شده با تنظیمات جدید فرق دارد؟
    if (v.fromStored && v.version !== S().settings.version && v.live && v.live.price !== v.price) {
      h += '<div class="box warn">تنظیمات تغییر کرده است. قیمت این زمین با تنظیمات فعلی می‌شود <b>' + App.toman(v.live.price) + '</b> (ارزش کل ' + App.toman(v.live.total) + ')؛ تا اجازه ندهید، قیمت ثبت‌شده تغییر نمی‌کند. <button class="btn sm" id="f-recalc">محاسبه‌ی مجدد با قیمت‌های جدید</button></div>';
    }
    h += '<div class="note" style="margin-top:6px"><b>چرا این درجه؟</b> ' + App.esc(p.gradeReason || '—') + '</div>';
    if (p.special) h += '<div class="note"><b>علت ویژه:</b> ' + App.esc(p.specialReason || autoSpecialReason() + ' (هنگام ذخیره ثبت می‌شود)') + '</div>';
    if (v.explain && v.explain.length) h += '<ul class="hist note">' + v.explain.map(x => '<li>' + App.esc(x) + '</li>').join('') + '</ul>';
    if (v.scoreLines && v.scoreLines.length) h += '<details><summary>جزئیات امتیاز</summary><ul class="hist note">' + v.scoreLines.map(x => '<li>' + App.esc(x.label) + ': ' + App.n(x.points, 0) + (x.note ? ' — ' + App.esc(x.note) : '') + '</li>').join('') + '</ul></details>';
    (v.needs || []).forEach(x => { h += '<div class="box err">' + App.esc(x) + '</div>'; });
    (v.warnings || []).forEach(x => { h += '<div class="box warn">' + App.esc(x) + '</div>'; });
    if (!F.isNew && p.createdAt) h += '<div class="note">ثبت: ' + App.fmtDate(p.createdAt) + ' — آخرین ویرایش: ' + App.fmtDate(p.updatedAt) + '</div>';
    h += '</div>';
    box.innerHTML = h;
    const rb = document.getElementById('f-recalc');
    if (rb) rb.addEventListener('click', () => { F.dirty = true; F.recalcChosen = true; p.priceMode = 'live'; refresh(); App.toast('قیمت جدید اعمال شد؛ برای ثبت نهایی «ذخیره» را بزنید.'); });
  }
  function autoSpecialReason() {
    const on = S().settings.scoring.features.filter(f => F.cur.features[f.key] && F.cur.features[f.key].on).map(f => f.label);
    return 'ویژه به انتخاب کاربر' + (on.length ? '؛ امکانات ثبت‌شده: ' + on.join('، ') : '');
  }

  /* ---------- ذخیره و حذف ---------- */
  F.save = function () {
    const b = M.getBoundary();
    if (b.count && b.count < 3) { App.toast('مرز ناقص است (کمتر از ۳ نقطه). ترسیم را کامل یا مرز را پاک کنید.', 'err'); return; }
    if (b.count >= 3 && !b.valid) { App.toast('هندسه‌ی نامعتبر ثبت نمی‌شود: ' + b.errors[0], 'err'); return; }
    syncGrade();
    const p = C.clone(F.cur);
    if (!p.name) p.name = 'زمین ' + App.n(S().parcels.length + (F.isNew ? 1 : 0), 0);
    p.geometry = b.count ? { ring: b.ring, source: b.source || 'draw', meta: b.meta || null } : null;
    p.areaComputed = b.count ? b.area : null;
    if (!grp().specialEnabled) p.special = false;
    if (p.special && !(p.specialReason || '').trim()) { F.cur.specialReason = p.specialReason = autoSpecialReason(); }
    if (!p.special) p.specialReason = '';
    if (p.scope === 'rural_outside' && p.grade === 'manual') p.grade = 'manual';
    const noArea = !p.geometry && !(p.areaOverride > 0);
    const finish = () => {
      App.save(); F.dirty = false; F.recalcChosen = false;
      App.emit('state');
      F.open(p.id, false);
      App.toast('زمین «' + p.name + '» ذخیره شد' + (noArea ? ' — توجه: بدون مرز یا مساحت، ارزش کل محاسبه نمی‌شود.' : '.'), noArea ? 'warn' : '');
    };
    if (F.isNew) {
      p.id = p.id || C.uid('land'); p.priceMode = 'frozen';
      C.addParcel(S(), p); finish(); return;
    }
    const stored = S().parcels.find(x => x.id === p.id);
    const ver = stored && stored.valuation && stored.valuation.settingsVersion;
    const doKeep = () => {
      const old = S().settingsHistory.find(h => h.version === ver);
      p.priceMode = 'frozen';
      C.applyValuation(p, old ? old.settings : S().settings, 'ویرایش با حفظ قیمت‌های نسخه‌ی ' + ver);
      const i = S().parcels.findIndex(x => x.id === p.id); S().parcels[i] = p; finish();
    };
    const doRecalc = () => { p.priceMode = 'live'; C.saveParcel(S(), p, 'ویرایش و محاسبه‌ی مجدد با نسخه‌ی ' + S().settings.version); finish(); };
    if (ver != null && ver !== S().settings.version && !F.recalcChosen) {
      App.modal({
        title: 'قیمت‌های تنظیمات تغییر کرده است',
        body: el('div', { html: 'این زمین با نسخه‌ی <b>' + App.n(ver, 0) + '</b> تنظیمات قیمت‌گذاری شده و نسخه‌ی فعلی <b>' + App.n(S().settings.version, 0) + '</b> است. با ذخیره‌ی ویرایش‌ها، قیمت چگونه تعیین شود؟' }),
        buttons: [{ label: 'حفظ قیمت‌های ثبت‌شده (پیشنهادی)', onClick: doKeep }, { label: 'محاسبه‌ی مجدد با قیمت‌های جدید', cls: 'sec2', onClick: doRecalc }, { label: 'انصراف', cls: 'sec2' }]
      });
    } else if (F.recalcChosen) doRecalc();
    else { p.priceMode = p.priceMode || 'frozen'; C.saveParcel(S(), p, 'ویرایش'); finish(); }
  };
  F.remove = function () {
    const p = F.cur; if (!p) return;
    App.confirm('حذف زمین', 'زمین «' + App.esc(p.name) + '» حذف شود؟ (سناریوهای قبلی نسخه‌ی ذخیره‌شده‌ی خود را نگه می‌دارند.)', () => {
      S().parcels = S().parcels.filter(x => x.id !== p.id);
      S().log.push({ at: C.nowIso(), msg: 'حذف زمین «' + p.name + '»' });
      App.save(); F.newParcel(true); App.emit('state');
    }, 'حذف');
  };
})();

/* هسته‌ی رابط: وضعیت برنامه، ذخیره‌ی خودکار، ابزارهای نمایش، پنجره‌ی گفتگو، تب‌ها */
(function () {
  'use strict';
  const C = window.LandCore;
  C.setProj4(window.proj4);
  const KEY = 'zamin-yar-state-v1';
  const App = window.App = { C, S: null, ev: {}, storageOk: true };

  App.on = (e, f) => { (App.ev[e] = App.ev[e] || []).push(f); };
  App.emit = (e, a) => { (App.ev[e] || []).forEach(f => { try { f(a); } catch (x) { console.error(e, x); } }); };

  /** سازگاری با پروژه‌های قدیمی‌تر: کلیدهای تازه‌ی وضعیت را می‌سازد (بدون دست‌زدن به داده‌ها) */
  App.normalize = function (s) {
    if (!s) return s;
    if (!Array.isArray(s.estates)) s.estates = [];
    if (!Array.isArray(s.persons)) s.persons = [];
    if (!s.house) s.house = { amount: '', receivers: [], payer: '' };
    if (!s.house.receivers) s.house.receivers = [];
    if (!s.adjust) s.adjust = {};
    if (!s.familySplits || typeof s.familySplits !== 'object') s.familySplits = {};
    if (!s.divisionSelection || typeof s.divisionSelection !== 'object') s.divisionSelection = { mode: 'all', scopes: [], grades: [], types: [], estates: [], ids: null, excludedIds: [], includeUnclassified: true };
    if (!Array.isArray(s.divisionSelection.scopes)) s.divisionSelection.scopes = [];
    if (!Array.isArray(s.divisionSelection.grades)) s.divisionSelection.grades = [];
    if (!Array.isArray(s.divisionSelection.types)) s.divisionSelection.types = [];
    if (!Array.isArray(s.divisionSelection.estates)) s.divisionSelection.estates = [];
    if (!Array.isArray(s.divisionSelection.excludedIds)) s.divisionSelection.excludedIds = [];
    if (s.divisionSelection.includeUnclassified == null) s.divisionSelection.includeUnclassified = true;
    if (!('randomDivision' in s)) s.randomDivision = null;
    (s.scenarios || []).forEach(sc => { if (sc && !sc.priceBasis) sc.priceBasis = { mode: 'snapshot', level: 'base', version: sc.settingsVersion, factor: 1, ignoreOverride: false }; });
    return s;
  };
  App.load = function () {
    try {
      const t = localStorage.getItem(KEY);
      if (t) {
        const s = JSON.parse(t);
        if (s && s.schema === 1 && s.settings && Array.isArray(s.parcels)) {
          if (!s.parcels.length && !(s.persons || []).length && !(s.scenarios || []).length) { const d = App.seedOnce(); if (d) return App.normalize(d); }
          return App.normalize(s);
        }
      }
    } catch (e) { App.storageOk = false; }
    return App.normalize(App.seedOnce()) || C.newState();
  };
  /** فهرست پیش‌فرض زمین‌ها (js/seed.js): فقط یک بار، وقتی برنامه خالی باز می‌شود */
  App.seedState = function () { return window.ZY_SEED ? JSON.parse(JSON.stringify(window.ZY_SEED)) : null; };
  App.seedOnce = function () {
    if (window.ZY_NOSEED || !window.ZY_SEED) return null;
    try { if (localStorage.getItem(KEY + '-seeded')) return null; localStorage.setItem(KEY + '-seeded', '1'); } catch (e) { /* بدون حافظه هم بارگذاری می‌شود */ }
    return App.seedState();
  };
  App.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(App.S)); App.storageOk = true; }
    catch (e) {
      if (App.storageOk) App.toast('ذخیره‌ی خودکار در مرورگر ممکن نیست؛ حتماً از «پروژه ← ذخیره‌ی فایل پروژه» استفاده کنید.', 'warn');
      App.storageOk = false;
    }
    const c = document.getElementById('cnt-parcels'); if (c) c.textContent = App.n(App.S.parcels.length);
  };
  App.setState = function (s) { App.S = App.normalize(s); App.save(); App.emit('state'); };

  /* ---------- نمایش اعداد ---------- */
  App.n = (x, d) => (x == null || !isFinite(x)) ? '—' : Number(x).toLocaleString('fa-IR', { maximumFractionDigits: d == null ? 2 : d });
  App.toman = (x) => x == null ? '—' : App.n(Math.round(x), 0) + ' تومان';
  App.area = (m2) => (m2 == null || !isFinite(m2)) ? '—' : App.n(m2, 1) + ' مترمربع' + (m2 >= 1000 ? ' (' + App.n(m2 / 10000, 3) + ' هکتار)' : '');
  App.num = (s) => { const t = String(s == null ? '' : s).trim(); if (t === '') return null; return C.toNum(t); };
  /** فارسی‌کردن رقم‌ها و جداکننده‌ی اعشار یک رشته (برای کسرها و درصدهای دقیقی که هسته می‌سازد) */
  App.fa = (s) => String(s == null ? '' : s).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/\./g, '٫');
  App.fmtDate = (iso) => { try { return new Date(iso).toLocaleString('fa-IR'); } catch (e) { return iso || ''; } };
  App.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- ساخت DOM ---------- */
  App.el = function (tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  App.opts = (map, sel) => Object.keys(map).map(k => App.el('option', { value: k, selected: k === sel ? true : null }, map[k]));

  /* ---------- اعلان و پنجره ---------- */
  App.toast = function (msg, kind) {
    const t = App.el('div', { class: 'toast ' + (kind || ''), text: msg });
    document.getElementById('toast-root').appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' || kind === 'warn' ? 9000 : 4500);
  };
  App.modal = function (o) {
    const bg = App.el('div', { class: 'modal-bg' });
    const close = () => bg.remove();
    const body = App.el('div', { class: 'mb' }, o.body);
    const foot = App.el('div', { class: 'mf' }, (o.buttons || [{ label: 'بستن' }]).map(b => App.el('button', {
      class: 'btn ' + (b.cls || ''), text: b.label,
      onclick: () => { const r = b.onClick ? b.onClick(close) : undefined; if (r !== false) close(); }
    })));
    bg.appendChild(App.el('div', { class: 'modal ' + (o.wide ? 'wide' : '') }, [App.el('h3', { text: o.title || '' }), body, foot]));
    bg.addEventListener('mousedown', e => { if (e.target === bg && !o.sticky) close(); });
    document.getElementById('modal-root').appendChild(bg);
    return { close, root: bg, body };
  };
  App.confirm = (title, msg, onYes, yesLabel) => App.modal({
    title, body: App.el('div', { html: msg }),
    buttons: [{ label: yesLabel || 'تأیید', onClick: () => { onYes(); } }, { label: 'انصراف', cls: 'sec2' }]
  });

  /* ---------- تب‌ها ---------- */
  App.tab = function (name) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + name));
    App.curTab = name;
    if (name === 'map' && App.map && App.map.map) setTimeout(() => App.map.map.invalidateSize(), 50);
    App.emit('tab', name);
  };

  App.start = function () {
    App.S = App.load();
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => App.tab(b.dataset.tab)));
    App.emit('init');
    App.save();
    App.tab('map');
  };

  /* دانلود فایل باینری (اکسل) */
  App.downloadBlob = function (name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  /* ---------- برگه‌ی چاپی (برگه‌ی نهایی تقسیم) ---------- */
  /** یک سند HTML کامل و مستقل (راست‌چین، قابل چاپ و ذخیره) از محتوای برگه می‌سازد */
  App.sheetDoc = function (title, innerHtml) {
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>' + App.esc(title) + '</title><style>'
      + 'body{font-family:Tahoma,"Segoe UI",system-ui,sans-serif;color:#23301f;margin:16px;font-size:13px;line-height:1.8}'
      + 'h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:16px 0 6px}h3{font-size:14px;margin:10px 0 4px}'
      + 'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #bbb;padding:4px 6px;text-align:center}'
      + 'th{background:#eef0e6}td.l,th.l{text-align:right}tfoot th{background:#f6f6f0}'
      + '.note{color:#6b7566;font-size:11px}.pos{color:#1c7a3e}.neg{color:#b3261e}'
      + '.person{border:1px solid #bbb;border-radius:8px;padding:8px;margin:10px 0;page-break-inside:avoid}'
      + '.sign{margin-top:10px;display:flex;gap:24px;font-size:12px;color:#444}'
      + '@page{size:A4;margin:12mm}</style></head><body>' + innerHtml + '</body></html>';
  };
  /** چاپ یک برگه بدون بازکردن پنجره‌ی تازه (در وب و اندروید یکسان کار می‌کند) */
  App.printHtml = function (html) {
    const root = document.getElementById('print-root');
    if (!root) { App.toast('بخش چاپ آماده نیست؛ از «ذخیره‌ی برگه» استفاده کنید.', 'warn'); return false; }
    root.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => {
      try { window.print(); } catch (e) { App.toast('چاپ در این دستگاه ممکن نیست؛ «ذخیره‌ی برگه (HTML)» را بزنید.', 'warn'); }
      setTimeout(done, 2000);
    }, 50);
    return true;
  };

  /* دانلود فایل متنی */
  App.download = function (name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();

/* هسته‌ی رابط: وضعیت برنامه، ذخیره‌ی خودکار، ابزارهای نمایش، پنجره‌ی گفتگو، تب‌ها */
(function () {
  'use strict';
  const C = window.LandCore;
  C.setProj4(window.proj4);
  const KEY = 'zamin-yar-state-v1';
  const App = window.App = { C, S: null, ev: {}, storageOk: true };

  App.on = (e, f) => { (App.ev[e] = App.ev[e] || []).push(f); };
  App.emit = (e, a) => { (App.ev[e] || []).forEach(f => { try { f(a); } catch (x) { console.error(e, x); } }); };

  App.load = function () {
    try {
      const t = localStorage.getItem(KEY);
      if (t) { const s = JSON.parse(t); if (s && s.schema === 1 && s.settings && Array.isArray(s.parcels)) return s; }
    } catch (e) { App.storageOk = false; }
    return C.newState();
  };
  App.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(App.S)); App.storageOk = true; }
    catch (e) {
      if (App.storageOk) App.toast('ذخیره‌ی خودکار در مرورگر ممکن نیست؛ حتماً از «پروژه ← ذخیره‌ی فایل پروژه» استفاده کنید.', 'warn');
      App.storageOk = false;
    }
    const c = document.getElementById('cnt-parcels'); if (c) c.textContent = App.n(App.S.parcels.length);
  };
  App.setState = function (s) { App.S = s; App.save(); App.emit('state'); };

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

  /* دانلود فایل متنی */
  App.download = function (name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();

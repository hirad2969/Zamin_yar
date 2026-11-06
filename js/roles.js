/* نقش‌ها: «مدیر» همه‌چیز را تغییر می‌دهد؛ «شریک» فقط صفحه‌ی تقسیم را می‌بیند و فقط می‌تواند
   زمین‌های خریدار خانه و سهم خودش را (انتخاب زمین، اعضای خانواده‌اش) اصلاح کند.
   توجه: برنامه روی میزبانی ایستا (GitHub Pages) است و سروری ندارد، پس رمز مدیر «قفل نرم» است (جلوگیری از اشتباه)، نه امنیت واقعی.
   انتشار آنلاین: مدیر فایل data/published.json را به‌روز می‌کند؛ پیوند شریک (?role=partner&me=…) همان را بارگذاری می‌کند
   و انتخاب‌های شریک با «کد انتخاب» (ZY2) برای مدیر فرستاده می‌شود. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const qs = new URLSearchParams(location.search);
  App.role = qs.get('role') === 'partner' ? 'partner' : 'admin';
  App.me = qs.get('me') || null;
  App.isAdmin = () => App.role === 'admin';
  /** درهم‌ریز ساده (FNV-1a دوبار) برای قفل نرم؛ امنیت واقعی نیست */
  App.pinHash = (pin) => { let h1 = 0x811c9dc5, h2 = 0x01000193; const t = 'zy|' + String(pin); for (let i = 0; i < t.length; i++) { h1 = Math.imul(h1 ^ t.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + t.charCodeAt(i), 2246822519) >>> 0; } return h1.toString(36) + h2.toString(36); };
  const rootsOf = () => C.personTree(App.S).roots;
  const meRoot = () => { const rs = rootsOf(); return rs.find(p => p.id === App.me) || rs.find(p => p.name === App.me) || null; };
  App.meRoot = meRoot;
  App.partnerLink = (id) => location.origin + location.pathname + '?role=partner&me=' + encodeURIComponent(id);

  function applyRole() {
    document.body.classList.toggle('role-partner', !App.isAdmin());
    const tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(b => { b.style.display = (App.isAdmin() || b.dataset.tab === 'people') ? '' : 'none'; });
    if (!App.isAdmin()) App.tab('people');
    drawChip();
  }
  function drawChip() {
    const box = document.getElementById('role-chip'); if (!box) return;
    box.innerHTML = '';
    const me = meRoot();
    if (App.isAdmin()) box.appendChild(el('button', { class: 'btn sm sec2', id: 'role-btn', text: '🔑 مدیر — دسترسی شرکا', onclick: adminDialog }));
    else box.appendChild(el('button', { class: 'btn sm sec2', id: 'role-btn', text: '👤 شریک: ' + (me ? me.name : 'نامشخص') + ' — ورود مدیر', onclick: toAdmin }));
  }
  function toAdmin() {
    const pin = App.S.access && App.S.access.pin;
    if (!pin && qs.get('role') !== 'partner') { App.role = 'admin'; applyRole(); App.emit('state'); return; }
    const inp = el('input', { type: 'password', id: 'pin-in', placeholder: 'رمز مدیر', dir: 'ltr' });
    App.modal({ title: 'ورود مدیر', body: el('div', null, [inp, !pin ? el('div', { class: 'note', text: 'برای این پروژه رمزی ثبت نشده است؛ مدیر باید رمز را روی دستگاه خودش بگذارد.' }) : null]),
      buttons: [{ label: 'ورود', onClick: () => { if (pin && App.pinHash(inp.value) === pin) { App.role = 'admin'; applyRole(); App.emit('state'); } else App.toast('رمز نادرست است', 'err'); } }, { label: 'انصراف', cls: 'sec2' }] });
  }
  function adminDialog() {
    const st = App.S; st.access = st.access || {};
    const pin = el('input', { type: 'password', id: 'pin-set', placeholder: st.access.pin ? 'رمز تازه (خالی = بدون تغییر)' : 'رمز مدیر (حداقل ۴ حرف)', dir: 'ltr' });
    const body = el('div', null, [
      el('div', { class: 'note', text: 'حالت شریک فقط صفحه‌ی «تقسیم» را نشان می‌دهد و شریک فقط می‌تواند زمین‌های خریدار خانه و سهم خودش را اصلاح کند. رمز، قفل نرم است (جلوی اشتباه را می‌گیرد، امنیت واقعی نیست).' }),
      el('label', { class: 'f' }, [el('span', { text: 'رمز مدیر برای برگشت از حالت شریک' }), pin]),
      el('b', { text: 'پیوند و پیش‌نمایش برای هر شریک' }),
    ].concat(rootsOf().map(p => el('div', { class: 'row partner-row', 'data-pid': p.id, style: 'align-items:center;gap:6px;margin:4px 0' }, [
      el('span', { text: p.name, style: 'min-width:70px' }),
      el('button', { class: 'btn sm sec2 pl-copy', text: '📋 کپی پیوند', onclick: () => { const u = App.partnerLink(p.id); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => App.toast('پیوند کپی شد', 'ok'), () => App.modal({ title: 'پیوند ' + p.name, body: el('textarea', { readonly: true, value: u, style: 'min-height:80px', dir: 'ltr' }) })); } }),
      el('button', { class: 'btn sm sec2 pl-view', text: '👁 دیدن به‌جای او', onclick: () => { if (!savePin()) return; App.role = 'partner'; App.me = p.id; ui.close(); applyRole(); App.emit('state'); } })]))).concat([
      el('div', { class: 'row', style: 'margin-top:8px' }, [el('button', { class: 'btn sm', id: 'pub-dl', text: '☁ فایل انتشار (published.json)', onclick: () => {
        st.publishedAt = C.nowIso(); App.save(); const c = JSON.parse(JSON.stringify(st)); c.access = { pin: null }; c.log = [];
        App.download('published.json', JSON.stringify(c), 'application/json');
      } })]),
      el('div', { class: 'note', text: 'برای آنلاین کردن: این فایل را با نام data/published.json در مخزن گیت‌هاب جایگزین کنید (یا از من بخواهید منتشر کنم). شرکا با پیوند خودشان همان نسخه را باز می‌کنند و کد انتخابشان را برای شما می‌فرستند.' }),
    ]));
    function savePin() { const v = pin.value.trim(); if (!v) return true; if (v.length < 4) { App.toast('رمز دست‌کم ۴ حرف باشد', 'warn'); return false; } st.access.pin = App.pinHash(v); App.save(); App.toast('رمز ثبت شد', 'ok'); return true; }
    const ui = App.modal({ title: 'دسترسی شرکا', body, buttons: [{ label: 'ثبت رمز', onClick: () => { savePin(); } }, { label: 'بستن', cls: 'sec2' }] });
  }

  async function loadPublished() {
    if (App.isAdmin() || !window.fetch) return;
    try {
      const r = await fetch('data/published.json', { cache: 'no-store' }); if (!r.ok) return;
      const s = await r.json(); if (!s || !Array.isArray(s.parcels)) return;
      if (App.S.publishedAt === s.publishedAt && s.publishedAt) return;
      if (s.publishedAt || !App.S.parcels.length) { const keep = App.S.access; App.setState(s); App.S.access = keep || { pin: null }; App.save(); }
    } catch (e) { /* آفلاین: نسخه‌ی ذخیره‌شده‌ی روی دستگاه */ }
  }
  App.on('init', () => { applyRole(); loadPublished(); });
  App.on('state', drawChip);
})();

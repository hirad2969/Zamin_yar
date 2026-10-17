/* فهرست زمین‌ها، تاریخچه‌ی قیمت، خروجی GeoJSON */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('parcels-root');
  let filter = 'all';

  function render() {
    const r = root(); r.innerHTML = '';
    const list = App.S.parcels.filter(p => filter === 'all' || p.scope === filter);
    r.appendChild(el('div', { class: 'row' }, [
      el('h2', { class: 'grow', text: 'زمین‌های ثبت‌شده' }),
      el('select', { style: 'width:auto', onchange: (e) => { filter = e.target.value; render(); } }, [el('option', { value: 'all', text: 'همه‌ی محدوده‌ها' })].concat(App.opts(C.SCOPES, filter)).map(o => { if (o.value === filter) o.selected = true; return o; })),
      el('button', { class: 'btn sec2', text: 'خروجی GeoJSON', onclick: exportGeo }),
      el('button', { class: 'btn sec2', text: 'محاسبه‌ی مجدد همه با قیمت‌های فعلی', onclick: recalcAll }),
    ]));
    if (!list.length) { r.appendChild(el('div', { class: 'box info', text: 'هنوز زمینی ثبت نشده است. از تب «نقشه و ثبت زمین» شروع کنید.' })); return; }
    const v = App.S.settings.version;
    const sum = list.reduce((s, p) => s + ((p.valuation && p.valuation.total) || 0), 0);
    const sumArea = list.reduce((s, p) => s + ((p.valuation && p.valuation.area) || 0), 0);
    const th = ['نام', 'محدوده', 'نوع/کاربری', 'درجه', 'ویژه', 'مساحت (م²)', 'قیمت هر م²', 'ارزش کل', 'وضعیت', 'نسخه‌ی قیمت', ''];
    r.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
      el('thead', null, el('tr', null, th.map(h => el('th', { text: h })))),
      el('tbody', null, list.map(p => {
        const va = p.valuation || {};
        const typ = p.scope === 'rural_inside' ? (C.RES[p.attrs.residential] || '') + ' / ' + (C.AGRI[p.attrs.agri] || '') : p.scope === 'rural_outside' ? C.FARM[p.attrs.farmType] : C.URBAN_USES[p.attrs.urbanUse];
        const old = va.settingsVersion != null && va.settingsVersion !== v;
        return el('tr', null, [
          el('td', { class: 'l', text: p.name || '—' }), el('td', { text: C.SCOPES[p.scope] }), el('td', { class: 'l', text: typ }),
          el('td', { text: p.scope === 'urban' ? '—' : (C.GRADES[p.grade] || 'دستی؟') }), el('td', { text: p.special ? 'ویژه' : 'معمولی' }),
          el('td', { text: App.n(va.area, 1) }), el('td', { text: App.n(va.pricePerM2, 0) }), el('td', { text: App.n(va.total, 0) }),
          el('td', { html: '<span class="tag ' + (va.status === 'قطعی' ? 'final' : va.status === 'موقت' ? 'prov' : 'inc') + '">' + (va.status || 'ناقص') + '</span>' }),
          el('td', { html: App.n(va.settingsVersion, 0) + (old ? ' <span class="tag prov">قدیمی</span>' : '') }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { App.tab('map'); App.form.open(p.id, true); } }),
            el('button', { class: 'btn sm sec2', text: 'تاریخچه', onclick: () => history(p) }),
            old ? el('button', { class: 'btn sm sec2', text: 'قیمت جدید', onclick: () => recalcOne(p) }) : null,
          ])),
        ]);
      })),
      el('tfoot', null, el('tr', null, [el('th', { class: 'l', colspan: 5, text: 'جمع (' + App.n(list.length, 0) + ' زمین)' }), el('th', { text: App.n(sumArea, 1) }), el('th'), el('th', { text: App.n(sum, 0) }), el('th', { colspan: 3 })])),
    ])));
    r.appendChild(el('div', { class: 'note', text: 'قیمت زمین‌ها مادامی که اجازه ندهید با تغییر تنظیمات عوض نمی‌شود. «قدیمی» یعنی با نسخه‌ی قبلی تنظیمات قیمت‌گذاری شده است. ارزش‌ها بر اساس تنظیمات خودتان‌اند و منبع بازار یا قانونی ندارند.' }));
  }
  function recalcOne(p) {
    const s = App.S.settings;
    const before = p.valuation.pricePerM2;
    const tmp = C.clone(p);
    const v = C.valuate(tmp, s);
    App.confirm('محاسبه‌ی مجدد', 'قیمت «' + App.esc(p.name) + '» از <b>' + App.toman(before) + '</b> به <b>' + App.toman(v.price) + '</b> تغییر می‌کند. انجام شود؟', () => {
      C.applyValuation(p, s, 'محاسبه‌ی مجدد با اجازه‌ی کاربر (نسخه‌ی ' + s.version + ')'); p.priceMode = 'live';
      App.save(); App.emit('state'); render();
    });
  }
  function recalcAll() {
    const s = App.S.settings;
    const old = App.S.parcels.filter(p => p.valuation && p.valuation.settingsVersion !== s.version);
    App.confirm('محاسبه‌ی مجدد همه', 'قیمت همه‌ی زمین‌ها (' + App.n(App.S.parcels.length, 0) + ') با تنظیمات نسخه‌ی ' + App.n(s.version, 0) + ' دوباره محاسبه می‌شود (' + App.n(old.length, 0) + ' زمین با نسخه‌ی قدیمی). سناریوهای ساخته‌شده تغییر نمی‌کنند. ادامه؟', () => {
      App.S.parcels.forEach(p => { C.applyValuation(p, s, 'محاسبه‌ی مجدد همگانی با اجازه‌ی کاربر (نسخه‌ی ' + s.version + ')'); p.priceMode = 'live'; });
      App.S.log.push({ at: C.nowIso(), msg: 'محاسبه‌ی مجدد همگانی' });
      App.save(); App.emit('state'); render();
    });
  }
  function history(p) {
    const items = (p.history || []).slice().reverse();
    App.modal({
      title: 'تاریخچه‌ی «' + (p.name || '') + '»', wide: true,
      body: el('div', null, [
        el('div', { class: 'note', text: 'ثبت: ' + App.fmtDate(p.createdAt) + ' — آخرین ویرایش: ' + App.fmtDate(p.updatedAt) }),
        el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمان', 'رویداد', 'قیمت قبلی', 'قیمت جدید', 'نسخه‌ی تنظیمات'].map(h => el('th', { text: h })))),
          el('tbody', null, items.map(h => el('tr', null, [el('td', { text: App.fmtDate(h.at) }), el('td', { class: 'l', text: h.reason || h.type }), el('td', { text: App.n(h.from, 0) }), el('td', { text: App.n(h.to, 0) }), el('td', { text: App.n(h.settingsVersion, 0) })])))]),
      ])
    });
  }
  function exportGeo() {
    const fc = { type: 'FeatureCollection', features: App.S.parcels.filter(p => p.geometry && p.geometry.ring).map(p => ({ type: 'Feature', properties: { name: p.name, scope: C.SCOPES[p.scope], grade: p.grade, special: !!p.special, area_m2: p.valuation && p.valuation.area, price_per_m2_toman: p.valuation && p.valuation.pricePerM2, total_toman: p.valuation && p.valuation.total }, geometry: { type: 'Polygon', coordinates: [p.geometry.ring.concat([p.geometry.ring[0]])] } })) };
    App.download('zamin-yar-parcels.geojson', JSON.stringify(fc, null, 1), 'application/geo+json');
  }
  App.on('state', () => { if (App.curTab === 'parcels') render(); const c = document.getElementById('cnt-parcels'); if (c) c.textContent = App.n(App.S.parcels.length, 0); });
  App.on('tab', (t) => { if (t === 'parcels') render(); });
})();

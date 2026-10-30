/* فهرست زمین‌ها، تاریخچه‌ی قیمت، اصلاح زنده‌ی متراژ و خروجی GeoJSON */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('parcels-root');
  let filter = 'all';

  function estateSelect(value, onchange) {
    const list = App.S.estates || [];
    const s = el('select', { style: 'min-width:120px' }, [el('option', { value: '', text: C.NO_ESTATE_NAME })].concat(list.map(e => el('option', { value: e.id, text: e.name }))));
    s.value = value || '';
    s.addEventListener('change', () => onchange(s.value || null));
    return s;
  }
  const live = (p) => C.currentValuation ? C.currentValuation(p, App.S.settings) : (p.valuation || {});
  function fresh(p, reason) {
    const v = live(p);
    // snapshot برای فایل‌های قدیمی می‌ماند، ولی بعد از هر اصلاح نیز همگام می‌شود.
    if (C.applyValuation) C.applyValuation(p, App.S.settings, reason || 'همگام‌سازی محاسبه');
    return v;
  }
  function setArea(p, raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) { p.areaOverride = null; fresh(p, 'بازگشت متراژ به هندسه'); return true; }
    const n = App.num(text);
    if (!(n > 0) || !isFinite(n)) { App.toast('متراژ باید عددی بزرگ‌تر از صفر باشد.', 'warn'); return false; }
    p.areaOverride = n;
    fresh(p, 'اصلاح متراژ از فهرست زمین‌ها');
    return true;
  }
  function remove(p) {
    App.confirm('حذف زمین', 'زمین «' + App.esc(p.name || p.id) + '» از فهرست فعال حذف شود؟ این کار قابل بازگشت نیست؛ قبل از آن فایل پروژه بگیرید.', () => {
      if (C.removeParcel) C.removeParcel(App.S, p.id); else App.S.parcels = App.S.parcels.filter(x => x.id !== p.id);
      App.save(); App.emit('state'); render(); App.toast('زمین حذف شد', 'ok');
    }, 'حذف قطعی');
  }

  function render() {
    const r = root(); r.innerHTML = '';
    const list = App.S.parcels.filter(p => filter === 'all' || p.scope === filter);
    r.appendChild(el('div', { class: 'row' }, [
      el('h2', { class: 'grow', text: 'زمین‌های ثبت‌شده' }),
      el('select', { style: 'width:auto', onchange: (e) => { filter = e.target.value; render(); } }, [el('option', { value: 'all', text: 'همه‌ی محدوده‌ها' })].concat(App.opts(C.SCOPES, filter)).map(o => { if (o.value === filter) o.selected = true; return o; })),
      el('button', { class: 'btn sec2', text: 'خروجی GeoJSON', onclick: exportGeo }),
      el('button', { class: 'btn sec2', text: 'محاسبه‌ی مجدد همه با قیمت‌های فعلی', onclick: recalcAll }),
    ]));
    r.appendChild(el('div', { class: 'box info', html: '<b>محاسبه‌ی زنده:</b> مساحت، قیمت و ارزش هر ردیف از اطلاعات فعلی زمین و تنظیمات محاسبه می‌شود. برای اصلاح متراژ، مقدار را در ستون «مساحت مبنا» عوض کنید؛ خالی‌کردن آن، مساحت واقعی مرز را برمی‌گرداند. تغییر در اینجا در فرم، نقشه، تقسیم و خروجی‌ها هم اعمال می‌شود.' }));
    if (!list.length) { r.appendChild(el('div', { class: 'box info', text: 'هنوز زمینی ثبت نشده است. از تب «نقشه و ثبت زمین» شروع کنید.' })); return; }
    const vno = App.S.settings.version;
    const vals = new Map(list.map(p => [p.id, live(p)]));
    const sum = list.reduce((s, p) => s + ((vals.get(p.id).total) || 0), 0);
    const sumArea = list.reduce((s, p) => s + ((vals.get(p.id).area) || 0), 0);
    const th = ['نام', 'دسته‌ی اموال', 'محدوده', 'نوع/کاربری', 'درجه', 'ویژه', 'مساحت مبنا (م²)', 'قیمت هر م²', 'ارزش کل', 'وضعیت', 'نسخه‌ی محاسبه', 'عملیات'];
    r.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
      el('thead', null, el('tr', null, th.map(h => el('th', { text: h })))),
      el('tbody', null, list.map(p => {
        const va = vals.get(p.id) || {};
        const typ = p.scope === 'rural_inside' ? (C.RES[p.attrs && p.attrs.residential] || '') + ' / ' + (C.AGRI[p.attrs && p.attrs.agri] || '') : p.scope === 'rural_outside' ? C.FARM[p.attrs && p.attrs.farmType] : C.URBAN_USES[p.attrs && p.attrs.urbanUse];
        const old = va.settingsVersion != null && va.settingsVersion !== vno;
        const area = el('input', { class: 'parcel-area', type: 'text', dir: 'ltr', inputmode: 'decimal', value: va.area == null ? '' : va.area, title: 'متراژ مبنای محاسبه؛ خالی = متراژ مرز', onchange: (e) => { if (setArea(p, e.target.value)) { App.save(); App.emit('state'); render(); } else e.target.value = va.area == null ? '' : va.area; } });
        const areaCell = el('td', null, [area, p.areaOverride != null ? el('button', { class: 'btn sm sec2', title: 'استفاده از مساحت هندسه', text: '↩ مرز', onclick: () => { p.areaOverride = null; fresh(p, 'بازگشت متراژ به هندسه'); App.save(); App.emit('state'); render(); } }) : null]);
        return el('tr', { 'data-pid': p.id }, [
          el('td', { class: 'l', text: p.name || '—' }),
          el('td', null, estateSelect(p.estateId, (v) => { C.setParcelEstate(App.S, p.id, v, false); App.save(); App.emit('state'); render(); })),
          el('td', { text: C.SCOPES[p.scope] || '—' }), el('td', { class: 'l', text: typ || '—' }),
          el('td', { text: p.scope === 'urban' ? '—' : (C.GRADES[p.grade] || 'دستی؟') }), el('td', { text: p.special ? 'ویژه' : 'معمولی' }),
          areaCell, el('td', { text: App.n(va.price != null ? va.price : va.pricePerM2, 0) }), el('td', { text: App.n(va.total, 0) }),
          el('td', { html: '<span class="tag ' + (va.status === 'قطعی' ? 'final' : va.status === 'موقت' ? 'prov' : 'inc') + '">' + (va.status || 'ناقص') + '</span>' }),
          el('td', { html: App.n(va.settingsVersion, 0) + (old ? ' <span class="tag prov">قدیمی</span>' : '') }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { App.tab('map'); App.form.open(p.id, true); } }),
            (p.geometry && p.geometry.ring && p.geometry.ring.length >= 3) ? el('button', { class: 'btn sm sec2', text: '✂️ تقسیم', title: 'تقسیم این زمین به دو قسمت با متراژ مشخص', onclick: () => App.split.openParcel(p.id) }) : null,
            el('button', { class: 'btn sm sec2', text: 'تاریخچه', onclick: () => history(p) }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => remove(p) }),
          ])),
        ]);
      })),
      el('tfoot', null, el('tr', null, [el('th', { class: 'l', colspan: 6, text: 'جمع (' + App.n(list.length, 0) + ' زمین)' }), el('th', { text: App.n(sumArea, 1) }), el('th'), el('th', { text: App.n(sum, 0) }), el('th', { colspan: 3 })])),
    ])));
    if ((App.S.estates || []).length) {
      let bulk = '';
      const bs = estateSelect('', (v) => { bulk = v; });
      r.appendChild(el('div', { class: 'row', style: 'margin:8px 0' }, [
        el('span', { class: 'note', text: 'انتساب گروهی دسته‌ی اموال به ' + App.n(list.length, 0) + ' زمین نمایش‌داده‌شده:' }), bs,
        el('button', { class: 'btn sm sec2', text: 'اعمال روی همه‌ی زمین‌های این فهرست', onclick: () => App.confirm('انتساب دسته', 'دسته‌ی «' + App.esc(bulk ? ((App.S.estates.find(e => e.id === bulk) || {}).name || '') : C.NO_ESTATE_NAME) + '» به ' + App.n(list.length, 0) + ' زمین نمایش‌داده‌شده داده شود؟', () => {
          list.forEach(p => C.setParcelEstate(App.S, p.id, bulk || null, false));
          App.save(); App.emit('state'); render();
        }, 'اعمال') }),
      ]));
    }
    r.appendChild(el('div', { class: 'note', text: 'ترتیب و قیمت‌های این فهرست از داده‌ی جاری است؛ هیچ مبلغی از روی عددهای قدیمی برای تقسیم استفاده نمی‌شود. قیمت دستیِ ثبت‌شده فقط وقتی اعمال می‌شود که خودتان آن را نگه داشته باشید.' }));
  }
  function recalcOne(p) { fresh(p, 'محاسبه‌ی مجدد با قیمت‌های فعلی'); App.save(); App.emit('state'); render(); }
  function recalcAll() {
    const s = App.S.settings;
    App.confirm('محاسبه‌ی مجدد همه', 'مساحت جاری و نرخ فعلی همه‌ی زمین‌ها دوباره خوانده می‌شود؛ ارزش‌های همه‌ی صفحه‌ها نیز از همین لحظه تازه می‌شوند. ادامه؟', () => {
      App.S.parcels.forEach(p => fresh(p, 'محاسبه‌ی مجدد همگانی با قیمت‌های فعلی'));
      App.S.log.push({ at: C.nowIso(), msg: 'محاسبه‌ی مجدد همگانی' }); App.save(); App.emit('state'); render();
    }, 'محاسبه شود');
  }
  function history(p) {
    const items = (p.history || []).slice().reverse();
    App.modal({ title: 'تاریخچه‌ی «' + (p.name || '') + '»', wide: true, body: el('div', null, [
      el('div', { class: 'note', text: 'ثبت: ' + App.fmtDate(p.createdAt) + ' — آخرین ویرایش: ' + App.fmtDate(p.updatedAt) }),
      el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمان', 'رویداد', 'قیمت قبلی', 'قیمت جدید', 'نسخه‌ی تنظیمات'].map(h => el('th', { text: h })))), el('tbody', null, items.map(h => el('tr', null, [el('td', { text: App.fmtDate(h.at) }), el('td', { class: 'l', text: h.reason || h.type }), el('td', { text: App.n(h.from, 0) }), el('td', { text: App.n(h.to, 0) }), el('td', { text: App.n(h.settingsVersion, 0) })])))]),
    ]) });
  }
  function exportGeo() {
    const fc = { type: 'FeatureCollection', features: App.S.parcels.filter(p => p.geometry && p.geometry.ring).map(p => { const v = live(p); return { type: 'Feature', properties: { name: p.name, scope: C.SCOPES[p.scope], grade: p.grade, special: !!p.special, area_m2: v.area, price_per_m2_toman: v.price != null ? v.price : v.pricePerM2, total_toman: v.total }, geometry: { type: 'Polygon', coordinates: [p.geometry.ring.concat([p.geometry.ring[0]])] } }; }) };
    App.download('zamin-yar-parcels.geojson', JSON.stringify(fc, null, 1), 'application/geo+json');
  }
  App.on('state', () => { if (App.curTab === 'parcels') render(); const c = document.getElementById('cnt-parcels'); if (c) c.textContent = App.n(App.S.parcels.length, 0); });
  App.on('tab', (t) => { if (t === 'parcels') render(); });
})();

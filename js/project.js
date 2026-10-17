/* پروژه: ذخیره/بازکردن فایل، خروجی، بازنشانی، راهنمای محدودیت‌ها */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('project-root');

  function render() {
    const r = root(); r.innerHTML = '';
    r.appendChild(el('h2', { text: 'پروژه' }));
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'ذخیره و بازکردن' }),
      el('div', { class: 'note', text: 'اطلاعات به‌طور خودکار در همین مرورگر ذخیره می‌شود و پس از بستن و بازکردن دوباره‌ی برنامه برمی‌گردد. برای پشتیبان‌گیری یا انتقال به رایانه‌ی دیگر، فایل پروژه بگیرید.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: '💾 ذخیره‌ی فایل پروژه (JSON)', onclick: () => App.download('zamin-yar-project-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(App.S, null, 1)) }),
        el('label', { class: 'btn sec2', style: 'cursor:pointer' }, ['📂 بازکردن فایل پروژه', el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => open(e.target.files[0]) })]),
        el('button', { class: 'btn dng', text: 'پاک‌کردن همه‌چیز', onclick: () => App.confirm('پاک‌کردن پروژه', 'همه‌ی زمین‌ها، اشخاص، سناریوها و تنظیمات پاک می‌شود. ابتدا فایل پشتیبان بگیرید. ادامه؟', () => { App.setState(C.newState()); App.form.newParcel(true); App.toast('پروژه‌ی تازه ساخته شد'); render(); }, 'پاک شود') }),
      ]),
      el('div', { class: 'note', text: App.storageOk ? 'ذخیره‌ی خودکار در مرورگر: فعال' : '⚠️ ذخیره‌ی خودکار در این مرورگر ممکن نیست؛ حتماً فایل پروژه بگیرید.' }),
    ]));
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'خلاصه' }),
      el('div', { html: 'زمین‌ها: <b>' + App.n(App.S.parcels.length, 0) + '</b> — اشخاص: <b>' + App.n(App.S.persons.length, 0) + '</b> — سناریوها: <b>' + App.n(App.S.scenarios.length, 0) + '</b> — نسخه‌ی تنظیمات: <b>' + App.n(App.S.settings.version, 0) + '</b>' }),
    ]));
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'نکته‌های مهم' }),
      el('ul', { class: 'note' }, [
        'نقشه‌ی ماهواره‌ای از سرویس رایگان Esri World Imagery و جست‌وجوی نام از Nominatim (OpenStreetMap) می‌آید؛ هر دو بدون کلید API‌اند ولی نیاز به اینترنت دارند و شرایط استفاده و ذکر منبع دارند. برای استفاده‌ی تجاری/حجم بالا باید مجوز یا سرویس پولی (مثلاً Mapbox، Google، Neshan) تهیه شود.',
        'اگر نقشه بارگذاری نشود، ترسیم مرز و ورود فایل مختصات همچنان بدون نقشه‌ی پایه کار می‌کنند.',
        'مساحت، مساحت واقعی روی بیضوی WGS84 است (نه مساحت شبکه‌ی UTM)؛ ممکن است با عددی که ابزار نقشه‌برداری شما روی شبکه می‌دهد کمی (حدود ۰٫۰۸٪) فرق کند.',
        'قیمت‌ها و ضرایب پیش‌فرض نمونه‌ی اولیه‌اند و منبع بازار یا قانونی ندارند؛ مرجع تصمیم‌گیری، تنظیمات خود شماست.',
        'این برنامه پروانه‌ی ساخت، کاربری قانونی یا سند را تأیید نمی‌کند؛ این موارد را خودتان از منبع معتبر ثبت کنید.',
      ].map(t => el('li', { text: t }))),
    ]));
  }
  function open(f) {
    if (!f) return;
    f.text().then(t => {
      let s; try { s = JSON.parse(t); } catch (e) { App.toast('فایل JSON معتبر نیست: ' + e.message, 'err'); return; }
      if (!s || s.schema !== 1 || !s.settings || !Array.isArray(s.parcels) || !Array.isArray(s.persons)) { App.toast('این فایل، فایل پروژه‌ی زمین‌یار نیست.', 'err'); return; }
      App.confirm('بازکردن پروژه', 'پروژه‌ی فعلی با محتوای فایل «' + App.esc(f.name) + '» (' + App.n(s.parcels.length, 0) + ' زمین) جایگزین شود؟', () => { App.setState(s); App.form.newParcel(true); render(); App.toast('پروژه باز شد'); }, 'جایگزین شود');
    });
  }
  App.on('tab', (t) => { if (t === 'project') render(); });
})();

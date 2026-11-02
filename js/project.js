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
        el('label', { class: 'btn sec2', style: 'cursor:pointer' }, ['📥 افزودن فایل پروفایل به همین پرونده', el('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => mergeProfile(e.target.files[0]) })]),
        window.ZY_SEED ? el('button', { class: 'btn sec2', id: 'seed-load', text: '📋 بارگذاری فهرست پیش‌فرض زمین‌ها و ارزش‌ها', onclick: () => App.confirm('بارگذاری فهرست پیش‌فرض', 'همه‌ی اطلاعات فعلی با فهرست آماده‌ی ' + App.n(window.ZY_SEED.parcels.length, 0) + ' زمین (با ارزش‌ها، اشخاص و تقسیم آماده) جایگزین شود؟ اگر کار مهمی دارید ابتدا «ذخیره‌ی فایل پروژه» را بزنید.', () => App.setState(App.normalize(App.seedState())), 'جایگزین شود') }) : null,
        el('button', { class: 'btn dng', text: 'پاک‌کردن همه‌چیز', onclick: () => App.confirm('پاک‌کردن پروژه', 'همه‌ی زمین‌ها، اشخاص، سناریوها و تنظیمات پاک می‌شود. ابتدا فایل پشتیبان بگیرید. ادامه؟', () => { App.setState(C.newState()); App.form.newParcel(true); App.toast('پروژه‌ی تازه ساخته شد'); render(); }, 'پاک شود') }),
      ]),
      el('div', { class: 'note', text: App.storageOk ? 'ذخیره‌ی خودکار در مرورگر: فعال' : '⚠️ ذخیره‌ی خودکار در این مرورگر ممکن نیست؛ حتماً فایل پروژه بگیرید.' }),
    ]));
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'خلاصه' }),
      el('div', { html: 'زمین‌ها: <b>' + App.n(App.S.parcels.length, 0) + '</b> — اشخاص: <b>' + App.n(App.S.persons.length, 0) + '</b> — سناریوها: <b>' + App.n(App.S.scenarios.length, 0) + '</b> — نسخه‌ی تنظیمات: <b>' + App.n(App.S.settings.version, 0) + '</b>' }),
    ]));
    const profile = App.S.profile || { name: 'پرونده‌ی اصلی' };
    const pname = el('input', { type: 'text', value: profile.name || '', style: 'min-width:220px' });
    const pnote = el('input', { type: 'text', placeholder: 'یادداشت منشأ/خانواده/پرونده', style: 'min-width:260px' });
    const makeProfile = () => {
      const ids = C.divisionParcelIds(App.S, App.S.divisionSelection);
      if (!ids.length) { App.toast('برای ساخت پروفایل جدید حداقل یک زمین انتخاب کنید.', 'warn'); return; }
      const out = C.createProfilePackage(App.S, { parcelIds: ids, name: pname.value.trim() || 'پروفایل جدید', note: pnote.value.trim() });
      App.download('zamin-yar-profile-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(out, null, 1), 'application/json;charset=utf-8');
      App.toast('فایل پروفایل مستقل ساخته شد؛ می‌توانید آن را جداگانه باز کنید یا به تیم/پرونده‌ی دیگر بدهید.', 'ok');
    };
    r.appendChild(el('div', { class: 'card profile-card' }, [
      el('h3', { text: 'پروفایل‌ها و پرونده‌های مستقل' }),
      el('div', { class: 'note', text: 'دسته‌ی اموال فقط یک طبقه‌بندی اختیاری است؛ برای انتقال بخشی از تقسیمات کلان، ابتدا زمین‌های تب «تقسیم» را انتخاب کنید و یک فایل پروفایل مستقل بسازید. پروفایل جدید اشخاص، اموال، نسبت‌ها و تاریخچه‌ی عددیِ انتخاب‌شده را جدا می‌کند و ارزش‌ها در مقصد دوباره محاسبه می‌شوند.' }),
      el('div', { class: 'row' }, [el('label', { class: 'f' }, [el('span', { text: 'نام پروفایل مقصد' }), pname]), el('label', { class: 'f' }, [el('span', { text: 'یادداشت' }), pnote]), el('button', { class: 'btn', text: 'ساخت فایل پروفایل از انتخاب فعلی', onclick: makeProfile })]),
      el('div', { class: 'note' }, ['پروفایل فعلی: ', el('b', { text: profile.name || '—' }), profile.parentId ? ' — زیرپروفایل پرونده‌ی مادر' : ' — پرونده‌ی مستقل']),
    ]));
    const trash = C && App.S.trash ? App.S.trash : { parcels: [], persons: [], estates: [] };
    const trashRows = [];
    [['parcels', 'زمین'], ['persons', 'شخص'], ['estates', 'دسته']].forEach(([kind, label]) => (trash[kind] || []).slice().reverse().forEach(entry => {
      const item = entry.item || {}, btn = el('button', { class: 'btn sm sec2', text: 'بازگردانی', onclick: () => { if (!C.restoreFromTrash(App.S, kind.slice(0, -1), item.id)) { App.toast('بازگردانی انجام نشد.', 'warn'); return; } App.save(); App.emit('state'); render(); App.toast(label + ' بازگردانی شد.', 'ok'); } });
      trashRows.push(el('tr', null, [el('td', { text: label }), el('td', { class: 'l', text: item.name || item.id || '—' }), el('td', { text: App.fmtDate(entry.deletedAt) }), el('td', null, btn)]));
    }));
    r.appendChild(el('div', { class: 'card' }, [el('h3', { text: 'سطل بازگشت اشتباهات' }), el('div', { class: 'note', text: 'حذف زمین، شخص یا دسته اکنون نرم است و تا زمان پاک‌سازی فایل پروژه قابل بازگردانی است.' }), trashRows.length ? el('table', { class: 't' }, [el('thead', null, el('tr', null, ['نوع', 'عنوان', 'زمان حذف', ''].map(h => el('th', { text: h })))), el('tbody', null, trashRows)]) : el('div', { class: 'note', text: 'مورد حذف‌شده‌ای وجود ندارد.' })]));
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'نکته‌های مهم' }),
      el('ul', { class: 'note' }, [
        'نقشه‌ی ماهواره‌ای از سرویس رایگان Esri World Imagery و جست‌وجوی نام از Nominatim (OpenStreetMap) می‌آید؛ هر دو بدون کلید API‌اند ولی نیاز به اینترنت دارند و شرایط استفاده و ذکر منبع دارند. برای استفاده‌ی تجاری/حجم بالا باید مجوز یا سرویس پولی (مثلاً Mapbox، Google، Neshan) تهیه شود.',
        'اگر نقشه بارگذاری نشود، ترسیم مرز و ورود فایل مختصات همچنان بدون نقشه‌ی پایه کار می‌کنند.',
        'مساحت، مساحت واقعی روی بیضوی WGS84 است (نه مساحت شبکه‌ی UTM)؛ ممکن است با عددی که ابزار نقشه‌برداری شما روی شبکه می‌دهد کمی (حدود ۰٫۰۸٪) فرق کند.',
        'همه‌ی محاسبه‌ها (مساحت، ارزش هر زمین، جمع کل، سهم هر نفر، دریافتی و اختلاف با حق هرکس) داخل خود برنامه و با کسر دقیق انجام می‌شود؛ هیچ عددی از اینترنت یا هوش مصنوعی نمی‌آید. تشخیص خودکار مرز از عکس ماهواره فقط یک «پیشنهاد» است و همیشه قابل ویرایش است.',
        'می‌توانید اموال را به چند «دسته» (منبع) تقسیم کنید و برای هر دسته سهم‌بندی جداگانه بنویسید — مثلاً در «اموال پدری» سهم هر پسر ۱ و در «اموال دره‌گرمی» سهم دو پسرِ شریک ۴/۳. وقتی چند دسته با هم حساب می‌شوند، حق هر شخص جمع سهم او در همه‌ی دسته‌هاست و در «برگه‌ی نهایی تقسیم» فهرست زمین‌هایی که به هرکس رسیده، جمع کل و بستانکاری/بدهکاری او نوشته می‌شود (قابل چاپ و ذخیره).',
        'در هر سناریو «سطح قیمت‌های مرجع» را خودتان انتخاب می‌کنید (قیمت‌های ثبت‌شده، قیمت فعلی، نسخه‌ی قدیمی تنظیمات، حداقل/حداکثر بازه و ضریب تعدیل) و همه‌ی محاسبه‌ها بلافاصله با همان نرخ‌ها دوباره انجام می‌شود.',
        'جمع سهم‌های هر زمین در تب «اشخاص و تقسیم» همیشه کنترل می‌شود و نتیجه‌ی کنترل‌ها (سبز/قرمز) زیر جدول می‌آید؛ سهم را می‌توانید به درصد (۱۲٫۵) یا کسر دقیق (۱/۸) بنویسید.',
        'برای زمین‌هایی که مرز داخلی‌شان روی عکس پیدا نیست، از ابزار «✂️ تقسیم به دو قسمت با متراژ مشخص» استفاده کنید: مرز کل زمین را دارید، متراژ یک قسمت را می‌دهید و خط جداکننده دقیقاً سر جای درست کشیده می‌شود و جهتش قابل چرخاندن است.',
        'قیمت‌ها و ضرایب پیش‌فرض نمونه‌ی اولیه‌اند و منبع بازار یا قانونی ندارند؛ مرجع تصمیم‌گیری، تنظیمات خود شماست.',
        'این برنامه پروانه‌ی ساخت، کاربری قانونی یا سند را تأیید نمی‌کند؛ این موارد را خودتان از منبع معتبر ثبت کنید.',
      ].map(t => el('li', { text: t }))),
    ]));
  }
  function mergeProfile(f) {
    if (!f) return;
    f.text().then(t => {
      let s; try { s = JSON.parse(t); } catch (e) { App.toast('فایل JSON معتبر نیست: ' + e.message, 'err'); return; }
      if (!s || s.schema !== 1 || !Array.isArray(s.parcels) || !Array.isArray(s.persons)) { App.toast('این فایل، پروفایل قابل افزودنِ زمین‌یار نیست.', 'err'); return; }
      App.confirm('افزودن پروفایل', 'از فایل «' + App.esc(f.name) + '» ' + App.n(s.parcels.length, 0) + ' زمین و ' + App.n(s.persons.length, 0) + ' شخص به پرونده‌ی فعلی اضافه شود؟ شناسه‌ها برای جلوگیری از برخورد تازه‌سازی می‌شوند.', () => {
        const personMap = {}, estateMap = {}, parcelMap = {};
        (s.persons || []).forEach(x => { personMap[x.id] = C.uid('person'); });
        (s.estates || []).forEach(x => { estateMap[x.id] = C.uid('estate'); });
        (s.parcels || []).forEach(x => { parcelMap[x.id] = C.uid('parcel'); });
        const persons = (s.persons || []).map(x => { const y = C.clone(x); y.id = personMap[x.id]; return y; });
        const estates = (s.estates || []).map(x => { const y = C.clone(x); y.id = estateMap[x.id] || C.uid('estate'); if (y.weights) { const w = {}; Object.keys(y.weights).forEach(id => { if (personMap[id]) w[personMap[id]] = y.weights[id]; }); y.weights = w; } return y; });
        const parcels = (s.parcels || []).map(x => { const y = C.clone(x); y.id = parcelMap[x.id]; if (y.holderId) y.holderId = personMap[y.holderId] || null; if (y.estateId) y.estateId = estateMap[y.estateId] || null; if (Array.isArray(y.coOwners)) y.coOwners = y.coOwners.map(o => Object.assign({}, o, { personId: personMap[o.personId] || null })).filter(o => o.personId); return y; });
        App.S.persons = (App.S.persons || []).concat(persons); App.S.estates = (App.S.estates || []).concat(estates); App.S.parcels = (App.S.parcels || []).concat(parcels);
        App.S.log = App.S.log || []; App.S.log.push({ at: C.nowIso(), msg: 'افزودن پروفایل «' + ((s.profile && s.profile.name) || f.name) + '» با شناسه‌های تازه' });
        App.setState(App.S); render(); App.toast('پروفایل به‌صورت مستقل به پرونده‌ی فعلی افزوده شد.', 'ok');
      }, 'افزودن');
    });
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

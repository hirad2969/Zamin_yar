/* آزمون رابط در DOM (jsdom): بدون مرورگر و بدون اینترنت بررسی می‌کند که
   صفحه‌ی وب، پنل «تقسیم زمین به دو قسمت با متراژ مشخص» و تب «اشخاص و تقسیم»
   بدون خطا بالا می‌آیند و عددهای درست را نشان می‌دهند.
   اجرا: npm run test:dom  (نیاز به npm ci) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const out = [];
function t(name, fn) {
  try { fn(); pass++; out.push('✔ ' + name); }
  catch (e) { fail++; out.push('✘ ' + name + ' — ' + (e && e.message)); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const near = (a, b, tol, m) => { if (!isFinite(a) || Math.abs(a - b) > tol) throw new Error((m || '') + ` انتظار ${b}±${tol} ولی ${a}`); };
const has = (txt, sub, m) => { if (String(txt).indexOf(sub) < 0) throw new Error((m || 'زیررشته پیدا نشد') + ': «' + sub + '» در «' + String(txt).slice(0, 400) + '»'); };

/* ---------- بالا آوردن برنامه در DOM ---------- */
const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'http://localhost:8765/', pretendToBeVisual: true });
const w = dom.window;
const loadErrors = [];
w.addEventListener('error', (e) => loadErrors.push('window.error: ' + ((e.error && e.error.stack) || e.message)));
const FILES = ['vendor/leaflet.js', 'vendor/proj4.js', 'vendor/xlsx.full.min.js', 'vendor/jszip.min.js',
  'core.js', 'detect.js', 'js/app.js', 'js/map.js', 'js/autodetect.js', 'js/split.js', 'js/importer.js',
  'js/gps.js', 'js/form.js', 'js/parcels.js', 'js/settings.js', 'js/people.js', 'js/project.js'];
FILES.forEach(f => { try { w.eval(read(f)); } catch (e) { loadErrors.push('بارگذاری ' + f + ': ' + e.message); } });
let started = null;
try { w.eval('App.start()'); } catch (e) { started = e.message; }
const C = w.LandCore;

/* مربع ۱۰۰×۱۰۰ متر در UTM39 (نزدیک اصفهان) به مختصات جغرافیایی */
const proj4 = require('proj4');
proj4.defs('EPSG:32639', '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs');
const sqLL = [[500000, 3600000], [500100, 3600000], [500100, 3600100], [500000, 3600100]].map(p => proj4('EPSG:32639', 'EPSG:4326', p));
const doc = w.document;
const $ = (s) => doc.querySelector(s);
const txt = (s) => ($(s) ? $(s).textContent : '');

t('همه‌ی اسکریپت‌های صفحه بدون خطا بارگذاری می‌شوند', () => {
  ok(loadErrors.length === 0, loadErrors.join('\n'));
  ok(started === null, 'App.start: ' + started);
});
t('نسخه‌ی وب: نقشه، فرم، تشخیص، برش و تقسیم آماده‌اند', () => {
  ok(w.App && w.App.map && w.App.map.map, 'نقشه ساخته نشد');
  ok(typeof w.App.split === 'object' && typeof w.App.split.openRing === 'function', 'ابزار برش بارگذاری نشد');
  ok(typeof w.App.detect === 'object' && typeof w.App.detect.start === 'function', 'تشخیص خودکار بارگذاری نشد');
  ok(w.document.getElementById('form-root').children.length > 0, 'فرم ثبت زمین خالی است');
  ok(doc.getElementById('split-panel'), 'پنل برش در index.html نیست');
  has(doc.body.innerHTML, 'تقسیم به دو قسمت با متراژ مشخص', 'دکمه‌ی ابزار برش در فرم نیست');
});

/* ---------- ابزار برش (تقسیم زمین به دو قسمت با متراژ مشخص) ---------- */
t('برش: بازکردن ابزار با مرز ترسیم‌شده و نمایش مساحت کل', () => {
  w.eval('App.tab("map")');
  // صفت‌های فرم (که به قسمت‌های برش‌خورده کپی می‌شود) طوری تنظیم شود که ارزش‌گذاری کامل باشد
  w.App.form.cur.scope = 'rural_outside';
  w.App.form.cur.grade = 'grade1';
  w.App.form.cur.attrs.farmType = 'irrigated';
  w.App.form.cur.name = 'زمین مادر';
  w.App.map.setBoundary(sqLL, { source: 'draw' });
  w.App.split.openCurrent();
  ok(w.App.split.visible, 'پنل باز نشد');
  ok(!doc.getElementById('split-panel').hidden, 'پنل پنهان است');
  const total = C.areaM2(sqLL);
  near(w.App.split.pre.totalArea, total, 1e-6);
  has($('#split-out').innerHTML, 'مساحت کل زمین');
});
t('برش: نصف دقیق زمین ⇒ دو قسمت برابر و اختلاف صفر با متراژ خواسته‌شده', () => {
  const r = w.App.split.res;
  ok(r && r.ok, 'نتیجه‌ی برش ساخته نشد');
  const total = C.areaM2(sqLL);
  near(r.areaA, total / 2, 0.05); near(r.areaB, total / 2, 0.05);
  near(r.errorM2, 0, 0.02);
  has($('#split-out').innerHTML, 'اختلاف با متراژ خواسته‌شده');
  has($('#split-out').textContent, '✔', 'کنترل جمع مساحت‌ها سبز نیست');
  ok(w.App.split.layer && w.App.split.layer.getLayers().length >= 3, 'پیش‌نمایش دو قسمت و خط برش روی نقشه نیست');
});
t('برش: تغییر متراژ به ۲۵۰۰ مترمربع ⇒ قسمت ۱ دقیقاً ۲۵۰۰', () => {
  const inp = doc.getElementById('split-target'), sel = doc.getElementById('split-unit');
  sel.value = 'm2'; sel.dispatchEvent(new w.Event('change'));
  inp.value = '۲۵۰۰'; inp.dispatchEvent(new w.Event('input'));
  const r = w.App.split.res;
  ok(r && r.ok, 'برش با متراژ فارسی ناموفق');
  near(r.areaA, 2500, 0.02); near(r.areaB, C.areaM2(sqLL) - 2500, 0.05);
});
t('برش: چرخش جهت خط با لغزنده ⇒ مساحت قسمت ۱ تغییر نمی‌کند', () => {
  const rg = doc.getElementById('split-az-range');
  [0, 37, 90, 180, 305].forEach(a => {
    rg.value = String(a); rg.dispatchEvent(new w.Event('input'));
    const r = w.App.split.res;
    ok(r && r.ok, 'در جهت ' + a + ' برش ناموفق بود');
    near(r.areaA, 2500, 0.02, 'در جهت ' + a);
    near(r.azimuth, a, 1e-9);
  });
});
t('برش: کسر دقیق در حالت درصد (۱/۸ از کل) ⇒ مساحت دقیق', () => {
  const inp = doc.getElementById('split-target'), sel = doc.getElementById('split-unit');
  sel.value = 'percent'; sel.dispatchEvent(new w.Event('change'));
  inp.value = '1/8'; inp.dispatchEvent(new w.Event('input'));
  const r = w.App.split.res, total = C.areaM2(sqLL);
  ok(r && r.ok, 'برش با کسر ۱/۸ ناموفق');
  near(r.areaA, total / 8, 0.02);
});
t('برش: متراژ بزرگ‌تر از کل زمین ⇒ پیام خطا و بدون نتیجه', () => {
  const inp = doc.getElementById('split-target'), sel = doc.getElementById('split-unit');
  sel.value = 'm2'; sel.dispatchEvent(new w.Event('change'));
  inp.value = '999999'; inp.dispatchEvent(new w.Event('input'));
  ok(!w.App.split.res, 'باید نتیجه‌ای ساخته نشود');
  has($('#split-out').textContent, 'کمتر نیست', 'پیام خطای متراژ بزرگ نمایش داده نشد');
  // برگرداندن به حالت درست
  inp.value = '3000'; inp.dispatchEvent(new w.Event('input'));
  ok(w.App.split.res && w.App.split.res.ok, 'بازگشت به حالت معتبر ناموفق');
});
t('برش: ثبت دو زمین جدید ⇒ دو زمین با مساحت و ارزش محاسبه‌شده در خود برنامه', () => {
  const before = w.App.S.parcels.length;
  w.App.split.name1 = 'قسمت شمالی'; w.App.split.name2 = 'قسمت جنوبی';
  const saveBtn = Array.from(doc.querySelectorAll('#split-panel .btn')).find(b => /ثبت دو زمین جدید/.test(b.textContent));
  ok(saveBtn, 'دکمه‌ی «ثبت دو زمین جدید» در پنل نیست');
  saveBtn.dispatchEvent(new w.Event('click'));
  // پنجره‌ی تأیید
  const yes = Array.from(doc.querySelectorAll('#modal-root .mf .btn')).find(b => /ثبت شود/.test(b.textContent));
  ok(yes, 'دکمه‌ی تأیید ثبت پیدا نشد');
  yes.dispatchEvent(new w.Event('click'));
  const news = w.App.S.parcels.slice(before);
  ok(news.length === 2, 'دو زمین ثبت نشد (' + news.length + ')');
  near(news[0].areaComputed, 3000, 0.05); near(news[1].areaComputed, C.areaM2(sqLL) - 3000, 0.05);
  ok(news.every(p => p.valuation && p.valuation.total != null), 'ارزش قسمت‌ها محاسبه نشد');
  ok(news.every(p => p.geometry && p.geometry.source === 'split'), 'منبع هندسه «split» نیست');
  near(news[0].valuation.total + news[1].valuation.total, 10008.0048 * (w.App.S.settings.groups.rural_outside.cells.grade1_normal.fixed), 2);
  ok(!w.App.split.visible, 'پنل پس از ثبت بسته نشد');
});

/* ---------- صفحه‌ی تقسیم (ساده) ---------- */
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' انتظار ' + b + ' ولی ' + a); };
function setup() {
  const S = w.App.S;
  S.parcels.length = 0; S.persons.length = 0; S.scenarios.length = 0; S.estates = []; S.house = { amount: '', receivers: [], payer: '' }; S.adjust = {};
  const mk = (name, total, area, est) => { const id = 'SP' + S.parcels.length; S.parcels.push({ id, name, notes: '', estateId: est, holderId: null, scope: 'rural_inside', attrs: {}, grade: 'grade1', special: false, valuation: { area, pricePerM2: Math.round(total / area), total, status: 'قطعی' } }); return id; };
  const E1 = C.addEstate(S, 'دره گرمی'), E2 = C.addEstate(S, 'پدری');
  const a = mk('دره الف', 2100000000, 1000, E1.id), b = mk('پدری ب', 7000000000, 3000, E2.id), c2 = mk('پدری ج', 1000000000, 500, E2.id);
  const M = C.addPerson(S, 'مصطفی', 1), E = C.addPerson(S, 'اسفندیار', 1), A = C.addPerson(S, 'امیر', 1), H = C.addPerson(S, 'مهدی', 1);
  [[8, 8, 1, 4], [1, 1, 1, 4]].forEach((ws, i) => [M, E, A, H].forEach((p, j) => C.setEstateWeight(S, i === 0 ? E1.id : E2.id, p.id, String(ws[j]))));
  S.house = { amount: '3000000000', receivers: [M.id, E.id, A.id], payer: H.id };
  S.parcels.find(p => p.id === b).holderId = H.id;        // «پدری ب» دست مهدی
  S.parcels.find(p => p.id === c2).holderId = M.id;       // «پدری ج» دست مصطفی
  w.App.save(); w.eval('App.tab("map")'); w.eval('App.tab("people")');
  return { S, E1, E2, a, b, c2, M, E, A, H };
}
const click = (e) => e.dispatchEvent(new w.Event('click', { bubbles: true }));
const change = (e, v) => { if (v !== undefined) e.value = v; e.dispatchEvent(new w.Event('change', { bubbles: true })); };
const N = (f) => Number(f.n) / Number(f.d);

t('صفحه‌ی تقسیم: دسته‌ها با ارزش و ضریب، حساب هر نفر با خانه‌ی شهر، بدون هیچ سناریو', () => {
  const x = setup();
  ok(!/سناریو|اشخاص و تقسیم/.test(doc.getElementById('people-root').textContent), 'اثری از سناریو مانده است');
  const root = doc.getElementById('people-root').textContent;
  ok(doc.getElementById('cat-table'), 'جدول دسته‌ها نیست');
  ok(doc.getElementById('auto-box') && doc.getElementById('auto-allocate'), 'موتور تخصیص خودکار در رابط نیست');
  const facets = Array.from(doc.querySelectorAll('#division-selection .facet input[type=checkbox]'));
  ok(facets.length > 0 && facets.every(x => x.checked), 'همه‌ی فیلترهای محدوده/درجه/دسته باید پیش‌فرض فعال باشند');
  has(root, 'دره گرمی'); has(root, 'پدری'); has(root, '۲٬۱۰۰٬۰۰۰٬۰۰۰'); has(root, '۸٬۰۰۰٬۰۰۰٬۰۰۰', 'ارزش دسته‌ی پدری');
  const card = doc.querySelector('#sum-table .pcard[data-pid="' + x.M.id + '"]');
  ok(card, 'کارت مصطفی نیست');
  has(card.textContent, 'خانه‌ی شهر'); has(card.textContent, '+۳٬۰۰۰٬۰۰۰٬۰۰۰');
  const d = C.divisionLive(x.S), m = d.people[0];
  near(N(m.credit), 2100000000 * 8 / 21 + 8000000000 / 7 + 3e9, 1e-6);
  // مانده‌ی مصطفی = اعتبار − «پدری ج» (۱ میلیارد) که دستش است
  near(N(m.remaining), N(m.credit) - 1e9, 1e-6);
  ok(doc.getElementById('strip-box').textContent.indexOf('مصطفی') >= 0, 'نوار مانده');
});

t('صفحه‌ی تقسیم: تغییر ضریب یک دسته در جدول ⇒ همه‌ی عددها فوراً دوباره حساب می‌شود', () => {
  const x = setup();
  const inp = doc.querySelector('#cat-table input.w[data-est="' + x.E2.id + '"][data-pid="' + x.A.id + '"]');
  ok(inp, 'ورودی ضریب نیست'); change(inp, '2');
  const d = C.divisionLive(w.App.S);
  near(N(d.people[2].parts[1].share), 2 / 8, 1e-12, 'سهم امیر از پدری باید ۲/۸ شود');
  has(doc.getElementById('people-root').textContent, '۱/۴', 'سهم جدید در صفحه نیامد');
});

t('صفحه‌ی تقسیم: جابه‌جایی زمین بین دو دسته در لیست ⇒ حق‌ها بلافاصله عوض می‌شود', () => {
  const x = setup();
  const before = N(C.divisionLive(x.S).people[0].entitlement);
  const row = doc.querySelector('#pick-list .prow[data-pid="' + x.a + '"]');
  change(row.querySelector('.est-sel'), x.E2.id);
  const after = N(C.divisionLive(x.S).people[0].entitlement);
  ok(Math.abs(after - before) > 1000, 'حق عوض نشد');
  near(after, 10100000000 / 7, 1e-6);
  // ارزش دسته‌ها در صفحه عوض شد
  has(doc.getElementById('cat-table').textContent, '۱۰٬۱۰۰٬۰۰۰٬۰۰۰');
});

t('صفحه‌ی تقسیم: برداشتن زمین فقط از مهدی/آزاد؛ زمین مصطفی برای دیگران بسته است تا آزاد شود', () => {
  const x = setup();
  const rowB = doc.querySelector('#pick-list .prow[data-pid="' + x.b + '"]'), rowC = doc.querySelector('#pick-list .prow[data-pid="' + x.c2 + '"]');
  // «پدری ب» دست مهدی است ⇒ امیر می‌تواند بردارد
  change(rowB.querySelector('.hold-sel'), x.A.id);
  eq(w.App.S.parcels.find(p => p.id === x.b).holderId, x.A.id);
  const rem = N(C.divisionLive(w.App.S).people[2].remaining);
  const A = C.divisionLive(w.App.S).people[2];
  near(rem, N(A.credit) - 7e9, 1e-6);
  ok(/کسری/.test(doc.querySelector('#strip-box .chip[data-pid="' + x.A.id + '"]').textContent) === (rem < 0), 'نوار کسری/مانده');
  // «پدری ج» دست مصطفی است ⇒ اسفندیار نمی‌تواند (گزینه غیرفعال و تغییر زور هم رد می‌شود)
  const opt = Array.from(rowC.querySelectorAll('.hold-sel option')).find(o => o.value === x.E.id);
  ok(opt && opt.disabled, 'گزینه‌ی غیرمجاز غیرفعال نیست');
  change(rowC.querySelector('.hold-sel'), x.E.id);
  eq(w.App.S.parcels.find(p => p.id === x.c2).holderId, x.M.id);
  // مصطفی آزادش می‌کند ⇒ اسفندیار می‌تواند بردارد
  change(rowC.querySelector('.hold-sel'), '');
  eq(w.App.S.parcels.find(p => p.id === x.c2).holderId, null);
  change(rowC.querySelector('.hold-sel'), x.E.id);
  eq(w.App.S.parcels.find(p => p.id === x.c2).holderId, x.E.id);
  // لیست نهایی زمین‌های هر نفر
  has(doc.getElementById('res-box').textContent, 'پدری ب'); has(doc.getElementById('res-box').textContent, 'پدری ج');
});

t('صفحه‌ی تقسیم: اصلاح متراژ در فهرست نهایی روی زمین اصلی و جمع زنده اعمال می‌شود', () => {
  const x = setup();
  const p = w.App.S.parcels.find(q => q.id === x.b);
  p.areaComputed = 3000; p.attrs = { residential: 'residential', agri: 'none', farmType: 'irrigated', urbanUse: 'residential' }; C.applyValuation(p, w.App.S.settings, 'آزمون متراژ نهایی'); w.App.save(); w.App.emit('state'); w.App.tab('people');
  const row = Array.from(doc.querySelectorAll('#res-box tr')).find(tr => tr.querySelector('.l') && tr.querySelector('.l').textContent === p.name);
  const inp = row && row.querySelector('.final-area'); ok(inp, 'ورودی متراژ فهرست نهایی نیست');
  const old = C.currentValuation(p, w.App.S.settings).total; change(inp, '3001');
  const now = C.currentValuation(p, w.App.S.settings).total; eq(p.areaOverride, 3001); ok(now !== old, 'تغییر متراژ در جمع اعمال نشد');
});

t('صفحه‌ی تقسیم: «سایر (+/−)» و دسته‌ی تازه با سهم‌بندی مثل پدری', () => {
  const x = setup();
  const adj = doc.querySelector('#sum-table input.adj[data-pid="' + x.A.id + '"]');
  change(adj, '+2 میلیارد');
  near(N(C.divisionLive(x.S).people[2].adjust), 2e9, 1e-6);
  has(doc.getElementById('house-box').textContent, 'صفر نیست');
  doc.getElementById('cat-new').value = 'محدوده سد'; click(doc.getElementById('cat-add'));
  const e3 = w.App.S.estates.find(e => e.name === 'محدوده سد');
  ok(e3, 'دسته ساخته نشد');
  eq(JSON.stringify(e3.weights), JSON.stringify(x.S.estates.find(e => e.name === 'پدری').weights));
  // یک زمین به دسته‌ی تازه می‌رود و در حق‌ها اثر می‌کند
  const row = doc.querySelector('#pick-list .prow[data-pid="' + x.a + '"]');
  change(row.querySelector('.est-sel'), e3.id);
  near(N(C.divisionLive(x.S).cats.find(c => c.name === 'محدوده سد').value), 2100000000, 1e-6);
});

t('صفحه‌ی تقسیم: کد انتخاب شریک ⇒ نسخه‌ی اصلی زمین‌هایش را ثبت می‌کند', () => {
  const x = setup();
  change(doc.querySelector('#pick-list .prow[data-pid="' + x.b + '"] .hold-sel'), x.A.id);
  doc.getElementById('code-who').value = x.A.id;
  click(doc.getElementById('code-make'));
  const code = doc.getElementById('code-out').value;
  ok(/^ZY2:/.test(code), 'کد ساخته نشد');
  w.App.S.parcels.find(p => p.id === x.b).holderId = x.H.id;       // نسخه‌ی مادر هنوز نمی‌داند
  doc.getElementById('code-in').value = ' ' + code + ' ';
  click(doc.getElementById('code-apply'));
  eq(w.App.S.parcels.find(p => p.id === x.b).holderId, x.A.id);
  ok(w.App.S.received && w.App.S.received[x.A.id] && w.App.S.received[x.A.id].n === 1, 'ثبت دریافت');
});

t('نسخه‌ی وب: ذخیره‌ی خودکار در مرورگر ثبت دسته و «دست کی» را نگه می‌دارد', () => {
  setup(); w.eval('App.save()');
  const raw = JSON.parse(w.localStorage.getItem('zamin-yar-state-v1'));
  ok(raw.parcels.some(p => p.holderId) && raw.house && raw.house.payer, 'دست کی/خانه ذخیره نشد');
});

t('فرم ثبت زمین: گزینه‌ی «دست کی است؟» کنار دسته هست', () => {
  setup(); w.eval('App.tab("map")');
  ok(doc.getElementById('f-holder'), 'گزینه‌ی دست کی در فرم نیست');
  ok(doc.getElementById('f-estate'), 'دسته در فرم نیست');
});


t('تقسیم به چند قسمت: نسبت ۱:۱:۱ ⇒ سه قسمت برابر در رابط و ثبت سه زمین', () => {
  w.eval('App.tab("map")');
  const before = w.App.S.parcels.length;
  w.App.split.openRing(sqLL, { name: 'آزمون' });
  const inp = doc.getElementById('split-ratio'); ok(inp, 'کادر نسبت نیست');
  inp.value = '1:1:1'; inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  const out = doc.getElementById('split-out').textContent;
  has(out, 'جمع قسمت‌ها = مساحت کل');
  const r = w.App.split.mres; ok(r && r.parts.length === 3, 'سه قسمت نشد');
  const total = C.areaM2(sqLL); r.parts.forEach(p => near(p.area, total / 3, 0.01));
  click(doc.getElementById('split-save'));
  const yes = Array.from(doc.querySelectorAll('#modal-root .mf .btn')).find(b => /ثبت شود/.test(b.textContent)); ok(yes, 'تأیید نیست');
  click(yes);
  eq(w.App.S.parcels.length - before, 3, 'سه زمین ثبت نشد');
});
console.log(out.join('\n'));
console.log(`\nموفق: ${pass}  ناموفق: ${fail}`);
process.exit(fail ? 1 : 0);

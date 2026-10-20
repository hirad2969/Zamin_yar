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

/* ---------- تب اشخاص و تقسیم با کسر دقیق ---------- */
t('تقسیم: سه نفر با سهم ۱/۳ در رابط ⇒ جمع ۱۰۰٪ و کنترل‌های سبز', () => {
  w.eval('App.tab("people")');
  const S = w.App.S;
  ok(S.parcels.length >= 2, 'زمینی برای ساخت سناریو نیست');
  ['عمو ۱', 'عمو ۲', 'عمو ۳'].forEach(n => C.addPerson(S, n, 1));
  const sc = C.createScenario(S, 'تقسیم عموها');
  w.eval('App.save()'); w.App.emit('state');
  has(doc.getElementById('people-root').textContent, '۳۳٫۳۳۳۳٪', 'حق هر شخص از کل با کسر دقیق نمایش داده نشد');
  // پیدا کردن سناریوی جاری و بازکردن آن
  const openBtn = Array.from(doc.querySelectorAll('#people-root table.t tbody tr .btn')).find(b => /باز کردن/.test(b.textContent));
  ok(openBtn, 'دکمه‌ی «باز کردن» سناریو پیدا نشد');
  openBtn.dispatchEvent(new w.Event('click'));
  const ids = S.persons.map(p => p.id);
  Object.keys(sc.parcels).forEach(pid => C.setEqualAllocation(sc, pid, ids));   // همه‌ی زمین‌ها کامل واگذار شوند
  w.eval('App.save()');
  w.App.emit('state');
  const html = doc.getElementById('people-root').innerHTML;
  has(html, 'کنترل‌های محاسباتی', 'پنل کنترل‌ها نمایش داده نشد');
  has(html, 'جمع سهم‌های همه‌ی زمین‌ها دقیقاً ۱۰۰٪ است');
  ok(!/✘/.test(doc.getElementById('people-root').textContent), 'کنترلی رد شده است: ' + (doc.getElementById('people-root').textContent.match(/✘[^✔]{0,80}/g) || []).join(' | '));
});
t('تقسیم: ورود درصد در جدول (۱۲٫۵) ⇒ کسر دقیق ۱/۸ ذخیره می‌شود', () => {
  const S = w.App.S, sc = S.scenarios[S.scenarios.length - 1], pid = Object.keys(sc.parcels)[0];
  sc.allocations[pid] = [];
  const inputs = Array.from(doc.querySelectorAll('#alloc-table tbody tr td input[dir=ltr]'));
  ok(inputs.length >= 3, 'ورودی‌های سهم پیدا نشد');
  inputs[0].value = '۱۲٫۵'; inputs[0].dispatchEvent(new w.Event('change'));
  const a = (w.App.S.scenarios.slice(-1)[0].allocations[pid] || [])[0];
  ok(a, 'سهمی ثبت نشد');
  ok(a.num === '1' && a.den === '8', 'کسر دقیق ذخیره نشد: ' + JSON.stringify(a));
  has(doc.getElementById('people-root').textContent, '۱۲٫۵٪', 'درصد دقیق در ستون جمع دیده نشد');
});
t('تقسیم: واگذاری بیش از ۱۰۰٪ ⇒ ستون جمع قرمز و کنترل رد می‌شود', () => {
  const inputs = Array.from(doc.querySelectorAll('#alloc-table tbody tr td input[dir=ltr]'));
  inputs[1].value = '1/2'; inputs[1].dispatchEvent(new w.Event('change'));
  inputs[2].value = '75'; inputs[2].dispatchEvent(new w.Event('change'));
  const body = doc.getElementById('people-root').textContent;
  has(body, '۱۳۷٫۵٪', 'جمع دقیق ۱۳۷٫۵٪ نمایش داده نشد');
  has(body, '✘', 'کنترل‌ها باید خطا بدهند');
  has(body, 'بیش از ۱۰۰٪');
  const ev = C.evaluateScenario(w.App.S, w.App.S.scenarios[w.App.S.scenarios.length - 1]);
  ok(ev.errors.length > 0 && !ev.checks.find(c => c.id === 'no_over').ok);
});
t('تقسیم: دکمه‌ی «تقسیم برابر» سهم دقیق ۱/n می‌سازد و جمع همه‌ی ردیف‌ها ۱۰۰٪ می‌شود', () => {
  const sc = w.App.S.scenarios[w.App.S.scenarios.length - 1];
  const rows = Object.keys(sc.parcels).length;
  ok(rows >= 2, 'سناریو باید حداقل دو زمین داشته باشد');
  for (let i = 0; i < rows; i++) {
    // جدول پس از هر کلیک دوباره ساخته می‌شود، پس هر بار ردیف i را تازه پیدا می‌کنیم
    const tr = doc.querySelectorAll('#alloc-table tbody tr')[i];
    ok(tr, 'ردیف ' + i + ' پیدا نشد');
    const btn = Array.from(tr.querySelectorAll('.btn')).find(b => /تقسیم برابر/.test(b.textContent));
    ok(btn, 'دکمه‌ی تقسیم برابر در ردیف ' + i + ' پیدا نشد');
    btn.dispatchEvent(new w.Event('click'));
  }
  Object.keys(sc.parcels).forEach(pid => ok(C.fText(C.allocSum(sc, pid)) === '1', 'جمع سهم‌های ' + pid + ' یک نشد: ' + C.fText(C.allocSum(sc, pid))));
  const ev = C.evaluateScenario(w.App.S, sc);
  ev.results.forEach(r => ok(r.diff === 0, 'اختلاف ' + r.person.name + ' صفر نیست: ' + r.diff));
  const body = doc.getElementById('people-root').textContent;
  ok(body.indexOf('جمع سهم‌های همه‌ی زمین‌ها دقیقاً ۱۰۰٪ است') >= 0, 'کنترل جمع سبز نشد');
  ok(!/✘/.test(body), 'کنترلی رد شده است: ' + (body.match(/✘[^\n]{0,90}/g) || []).join(' | '));
});
t('نسخه‌ی وب: ذخیره‌ی خودکار در مرورگر و فایل پروژه کار می‌کند', () => {
  w.eval('App.save()');
  const raw = w.localStorage.getItem('zamin-yar-state-v1');
  ok(raw && JSON.parse(raw).parcels.length === w.App.S.parcels.length, 'ذخیره‌ی خودکار ناموفق');
  const s2 = JSON.parse(JSON.stringify(w.App.S));      // simulate file round-trip
  ok(s2.scenarios[s2.scenarios.length - 1].allocations, 'سهم‌ها در فایل پروژه نیست');
  const a = s2.scenarios[s2.scenarios.length - 1].allocations[Object.keys(s2.scenarios[s2.scenarios.length - 1].allocations)[0]][0];
  ok(a.num && a.den, 'کسر دقیق در فایل پروژه ذخیره نشده است');
});

/* ---------- دسته‌های اموال، مبنای قیمت و برگه‌ی نهایی ---------- */
t('دسته‌ها: ساخت دو دسته در رابط و ثبت سهم متفاوت (۴/۳) برای یک شخص', () => {
  w.eval('App.tab("people")');
  const S = w.App.S;
  const add = () => {
    const card = Array.from(doc.querySelectorAll('#people-root .card')).find(c => /دسته‌های اموال/.test(c.textContent));
    ok(card, 'کارت دسته‌های اموال پیدا نشد');
    return card;
  };
  let card = add();
  const inp = card.querySelector('input[type=text]');
  const btn = Array.from(card.querySelectorAll('.btn')).find(b => /افزودن دسته/.test(b.textContent));
  inp.value = 'اموال پدری'; btn.dispatchEvent(new w.Event('click'));
  card = add();
  const inp2 = card.querySelector('input[type=text]');
  const btn2 = Array.from(card.querySelectorAll('.btn')).find(b => /افزودن دسته/.test(b.textContent));
  inp2.value = 'اموال دره‌گرمی'; btn2.dispatchEvent(new w.Event('click'));
  ok(S.estates.length === 2, 'دو دسته ساخته نشد: ' + S.estates.length);
  has(doc.getElementById('people-root').textContent, 'سهم هر شخص در هر دسته', 'ماتریس سهم‌ها نمایش داده نشد');
  // سهم نفر اول در دسته‌ی دوم: ۴/۳ (یک‌سوم بیشتر)
  const mx = Array.from(doc.querySelectorAll('#people-root table.mx tbody tr'))[0];
  const cells = mx.querySelectorAll('input[dir=ltr]');
  ok(cells.length === 2, 'برای هر دسته یک خانه لازم است: ' + cells.length);
  cells[1].value = '4/3'; cells[1].dispatchEvent(new w.Event('change'));
  const e2 = w.App.S.estates[1];
  ok(C.fText(C.estateWeightFrac(e2, w.App.S.persons[0].id)) === '4/3', 'سهم ۴/۳ ثبت نشد');
  // بقیه ۱ ⇒ جمع = ۴/۳ + ۱ + ۱ = ۱۰/۳
  ok(C.fText(C.estateWeights(w.App.S, e2.id).sum) === '10/3', 'جمع سهم‌های دسته درست نیست');
});
t('دسته‌ها: دکمه‌ی «سهم مضاعف» ⇒ یک‌سوم بیشتر برای نفرهای انتخاب‌شده', () => {
  const S = w.App.S;
  const btn = Array.from(doc.querySelectorAll('#people-root .btn')).filter(b => /سهم مضاعف/.test(b.textContent))[1];
  ok(btn, 'دکمه‌ی سهم مضاعف پیدا نشد');
  btn.dispatchEvent(new w.Event('click'));
  const cbs = Array.from(doc.querySelectorAll('#modal-root input[type=checkbox]'));
  ok(cbs.length === S.persons.length, 'فهرست اشخاص در پنجره نیست');
  cbs[0].checked = true; cbs[0].dispatchEvent(new w.Event('change'));
  const apply = Array.from(doc.querySelectorAll('#modal-root .mf .btn')).find(b => /اعمال/.test(b.textContent));
  apply.dispatchEvent(new w.Event('click'));
  const e2 = w.App.S.estates[1];
  const ws = w.App.S.persons.map(p => C.fText(C.estateWeightFrac(e2, p.id)));
  ok(ws[0] === '5/3' || ws[0] === '4/3', 'سهم نفر اول بیشتر نشد: ' + ws.join(','));
  ok(ws.slice(1).every(x => x === '1'), 'سهم بقیه نباید تغییر کند: ' + ws.join(','));
});
t('دسته‌ها: دو منبع با هم ⇒ حق هرکس جمع سهمش در دو دسته و بستانکاری/بدهکاری ترازند', () => {
  const S = w.App.S;
  const ids = Object.keys(S.parcels.reduce((o, p) => (o[p.id] = 1, o), {}));
  ok(S.parcels.length >= 2 && S.estates.length === 2, 'پیش‌نیاز آماده نیست');
  C.setParcelEstate(S, S.parcels[0].id, S.estates[0].id, true);
  S.parcels.slice(1).forEach(p => C.setParcelEstate(S, p.id, S.estates[1].id, true));
  const sc = C.createScenario(S, 'دو منبع با هم');
  Object.keys(sc.parcels).forEach(pid => C.setEqualAllocation(sc, pid, S.persons.map(p => p.id)));
  w.eval('App.save()'); w.App.emit('state');
  const openBtn = Array.from(doc.querySelectorAll('#people-root table.t tbody tr')).filter(tr => /دو منبع با هم/.test(tr.textContent)).map(tr => Array.from(tr.querySelectorAll('.btn')).find(b => /باز کردن/.test(b.textContent)))[0];
  ok(openBtn, 'دکمه‌ی بازکردن سناریوی تازه پیدا نشد');
  openBtn.dispatchEvent(new w.Event('click'));
  const body = doc.getElementById('people-root').textContent;
  has(body, 'سطح قیمت‌های مرجع', 'نوار مبنای قیمت دیده نشد');
  has(body, 'دسته‌های اموال در این محاسبه', 'انتخاب دسته‌ها دیده نشد');
  has(body, 'بستانکار');
  const ev = C.evaluateScenario(S, sc);
  ok(ev.estates.length === 2, 'دو دسته در محاسبه نیست: ' + ev.estates.length);
  const sumC = ev.results.reduce((s, r) => s + r.credit, 0), sumD = ev.results.reduce((s, r) => s + r.debit, 0);
  ok(sumC === sumD, 'جمع بستانکاری و بدهکاری برابر نیست: ' + sumC + ' / ' + sumD);
  ok(ev.results.reduce((s, r) => s + r.entitled, 0) === ev.pool, 'جمع حق‌ها با ارزش کل برابر نیست');
  ok(ids.length >= 2);
});
t('مبنای قیمت: تغییر منبع و ضریب در رابط ⇒ ارزش کل و حق اشخاص بلافاصله دوباره حساب می‌شود', () => {
  const S = w.App.S, sc = S.scenarios[S.scenarios.length - 1];
  const before = C.evaluateScenario(S, sc).pool;
  const sels = Array.from(doc.querySelectorAll('#people-root .basis select'));
  ok(sels.length >= 3, 'انتخابگرهای مبنای قیمت پیدا نشد: ' + sels.length);
  sels[0].value = 'live'; sels[0].dispatchEvent(new w.Event('change'));
  ok(C.normBasis(w.App.S.scenarios[w.App.S.scenarios.length - 1].priceBasis).mode === 'live', 'منبع قیمت عوض نشد');
  const fac = doc.querySelector('#people-root .basis input[dir=ltr]');
  ok(fac, 'کادر ضریب پیدا نشد');
  fac.value = '2'; fac.dispatchEvent(new w.Event('change'));
  const sc2 = w.App.S.scenarios[w.App.S.scenarios.length - 1];
  const ev = C.evaluateScenario(w.App.S, sc2);
  near(ev.pool, before * 2, Math.max(2, before * 0.0001), 'ارزش کل با ضریب ۲ دو برابر نشد');
  ok(ev.results.every(r => r.entitled > 0), 'حق اشخاص محاسبه نشد');
  has(doc.getElementById('people-root').textContent, 'ارزش کل با این مبنا', 'خلاصه‌ی مبنای قیمت دیده نشد');
  // برگشت به عکس سناریو
  const sels2 = Array.from(doc.querySelectorAll('#people-root .basis select'));
  sels2[0].value = 'snapshot'; sels2[0].dispatchEvent(new w.Event('change'));
  near(C.evaluateScenario(w.App.S, w.App.S.scenarios[w.App.S.scenarios.length - 1]).pool, before, 2, 'برگشت به قیمت‌های سناریو انجام نشد');
});
t('برگه‌ی نهایی: برای هر شخص فهرست زمین‌ها، جمع کل و بستانکاری/بدهکاری دارد', () => {
  const btn = Array.from(doc.querySelectorAll('#people-root .btn')).find(b => /برگه‌ی نهایی تقسیم/.test(b.textContent));
  ok(btn, 'دکمه‌ی برگه‌ی نهایی پیدا نشد');
  btn.dispatchEvent(new w.Event('click'));
  const sheet = doc.querySelector('#modal-root .sheet');
  ok(sheet, 'برگه ساخته نشد');
  const txt = sheet.textContent;
  has(txt, 'برگه‌ی نهایی تقسیم');
  has(txt, 'هر زمین به چه کسی رسید');
  has(txt, 'خلاصه‌ی تسویه');
  ok(sheet.querySelectorAll('.person').length === w.App.S.persons.length, 'برای هر شخص یک برگه لازم است');
  ok(doc.getElementById('print-root'), 'جای چاپ در صفحه نیست');
  const html = w.App.sheetDoc('آزمون', sheet.innerHTML);
  ok(/^<!doctype html>/i.test(html) && /dir="rtl"/.test(html), 'سند چاپی کامل نیست');
});

console.log(out.join('\n'));
console.log(`\nموفق: ${pass}  ناموفق: ${fail}`);
process.exit(fail ? 1 : 0);

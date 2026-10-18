const proj4 = require('proj4');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const C = require('./core.js');
C.setProj4(proj4);

let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { const r = fn(); if (r && typeof r.then === 'function') throw new Error('async'); pass++; results.push('✔ ' + name); }
  catch (e) { fail++; results.push('✘ ' + name + ' — ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ` انتظار ${b} ولی ${a}`); }
function near(a, b, tol, m) { if (!isFinite(a) || Math.abs(a - b) > tol) throw new Error((m || '') + ` انتظار ${b}±${tol} ولی ${a}`); }
function ok(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

// نکته: مساحت، مساحت واقعی روی بیضوی (زمین) است؛ در UTM مختصات شبکه‌ای در نصف‌النهار مرکزی با ضریب ۰٫۹۹۹۶ مقیاس شده‌اند
// پس مربع ۱۰۰×۱۰۰ شبکه‌ای ≈ ۱۰۰۰۰/۰٫۹۹۹۶² = ۱۰۰۰۸٫۰ مترمربع زمینی است.
const UTM_SQ = 10000 / (0.9996 * 0.9996);
// مربع ۱۰۰×۱۰۰ متر در UTM39 نزدیک اصفهان (E 500000, N 3600000)
const sqUTM = [[500000, 3600000], [500100, 3600000], [500100, 3600100], [500000, 3600100]];
const sqLL = sqUTM.map(p => proj4('EPSG:32639', 'EPSG:4326', p));

function mkParcel(over) {
  return C.newParcel(Object.assign({ name: 'آزمون', scope: 'rural_outside', areaComputed: 10000, attrs: { farmType: 'irrigated', residential: 'unknown', agri: 'none', urbanUse: 'residential' }, grade: 'grade1' }, over));
}

/* -------- هندسه -------- */
t('مساحت مربع ۱۰۰×۱۰۰ متر ≈ ۱۰۰۰۰', () => near(C.areaM2(sqLL), UTM_SQ, 0.5));
// مستقل: مستطیل مختصات جغرافیایی؛ مساحت کروی تقریبی R²·Δλ·(sinφ2−sinφ1) با خطای < ۰٫۵٪
t('مساحت مستطیل جغرافیایی با فرمول مستقل کروی', () => { const R=6371000, rad=Math.PI/180, a=C.areaM2([[52,35],[52.01,35],[52.01,35.01],[52,35.01]]); near(a, R*R*(0.01*rad)*(Math.sin(35.01*rad)-Math.sin(35*rad)), 0.005*a); });
t('مساحت مستطیل ۱ کیلومتر × ۵۰۰ متر ≈ ۵۰۰٬۰۰۰', () => {
  const r = [[500000, 3600000], [501000, 3600000], [501000, 3600500], [500000, 3600500]].map(p => proj4('EPSG:32639', 'EPSG:4326', p));
  near(C.areaM2(r), 500000 / (0.9996 * 0.9996), 5);
});

/* -------- آزمون اول -------- */
t('آزمون ۱: ۱۰۰۰۰ مترمربع × ۱۵۰۰۰۰ تومان = ۱٬۵۰۰٬۰۰۰٬۰۰۰', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1' });
  p.special = true; // درجه یک ویژه = ۱۵۰۰۰۰
  C.addParcel(st, p);
  eq(p.valuation.pricePerM2, 150000); eq(p.valuation.total, 1500000000);
  // قیمت دستی ۱۵۰۰۰۰ روی هر درجه هم همین را می‌دهد
  const q = mkParcel({ grade: 'grade3' }); q.pricing.override = 150000; C.addParcel(st, q);
  eq(q.valuation.total, 1500000000); eq(q.valuation.priceKind, 'دستی');
});

/* -------- آزمون دوم -------- */
t('آزمون ۲: درجه ۱ معمولی (۱۲۰٬۰۰۰) → درجه ۲ ویژه (۱۲۰٬۰۰۰): ارزش تغییر نکند', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1' }); C.addParcel(st, p);
  eq(p.valuation.pricePerM2, 120000);
  const before = p.valuation.total;
  p.grade = 'grade2'; p.special = true; p.specialReason = 'آزمون';
  C.saveParcel(st, p, 'تغییر درجه');
  eq(p.valuation.pricePerM2, 120000); eq(p.valuation.total, before);
  eq(p.valuation.cellKey, 'grade2_special');
});

/* -------- آزمون سوم -------- */
t('آزمون ۳: آبی و دیم با مساحت برابر و قیمت جداگانه', () => {
  const st = C.newState();
  const s = C.clone(st.settings);
  s.groups.rural_outside.byType.irrigated.grade1_normal = { fixed: 130000 };
  s.groups.rural_outside.byType.dry.grade1_normal = { fixed: 90000 };
  C.updateSettings(st, s, 'keep');
  const a = mkParcel({ attrs: { farmType: 'irrigated' } }), d = mkParcel({ attrs: { farmType: 'dry' } }), o = mkParcel({ attrs: { farmType: 'other' } });
  [a, d, o].forEach(p => C.addParcel(st, p));
  eq(a.valuation.pricePerM2, 130000); eq(a.valuation.total, 1300000000);
  eq(d.valuation.pricePerM2, 90000); eq(d.valuation.total, 900000000);
  eq(o.valuation.pricePerM2, 120000, 'بدون قیمت جداگانه باید قیمت پایه‌ی درجه باشد');
  // اگر فقط آبی تعریف شود، دیم از قیمت پایه استفاده می‌کند
  const st2 = C.newState(); const s2 = C.clone(st2.settings);
  s2.groups.rural_outside.byType.irrigated.grade1_normal = { fixed: 130000 };
  C.updateSettings(st2, s2, 'keep');
  const d2 = mkParcel({ attrs: { farmType: 'dry' } }); C.addParcel(st2, d2);
  eq(d2.valuation.pricePerM2, 120000);
});

/* -------- آزمون چهارم: ورودی معتبر در همه‌ی قالب‌ها -------- */
function checkPreview(pv, areaTol) {
  ok(pv.ok, 'پیش‌نمایش باید معتبر باشد: ' + JSON.stringify(pv.errors || pv));
  near(pv.area, UTM_SQ, areaTol || 0.5); eq(pv.count, 4);
  near(pv.ring[0][0], sqLL[0][0], 1e-6); near(pv.ring[0][1], sqLL[0][1], 1e-6);
}
const csvLL = 'lon,lat\n' + sqLL.map(p => p[0].toFixed(8) + ',' + p[1].toFixed(8)).join('\n');
t('آزمون ۴a: CSV با سرستون lon/lat', () => {
  const r = C.importText(csvLL); ok(r.ok); checkPreview(C.buildPreview(r.candidates[0], r));
});
t('آزمون ۴b: متن چسبانده‌شده با ارقام فارسی و جداکننده‌ی تب', () => {
  const fa = (s) => s.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const txt = sqLL.map(p => fa(p[0].toFixed(8)) + '\t' + fa(p[1].toFixed(8))).join('\n');
  const r = C.importText(txt); ok(r.ok, JSON.stringify(r)); checkPreview(C.buildPreview(r.candidates[0], r));
});
t('آزمون ۴c: ترتیب عرض،طول (جابه‌جا) خودکار تشخیص داده شود', () => {
  const txt = sqLL.map(p => p[1].toFixed(8) + ',' + p[0].toFixed(8)).join('\n');
  const r = C.importText(txt); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); checkPreview(pv); ok(pv.swap);
});
t('آزمون ۴d: GeoJSON', () => {
  const gj = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'الف' }, geometry: { type: 'Polygon', coordinates: [sqLL.concat([sqLL[0]])] } }] };
  const r = C.importGeoJSON(JSON.stringify(gj)); ok(r.ok); checkPreview(C.buildPreview(r.candidates[0], r));
});
t('آزمون ۴e: KML', () => {
  const kml = `<?xml version="1.0"?><kml><Document><Placemark><name>زمین</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    ${sqLL.concat([sqLL[0]]).map(p => p[0] + ',' + p[1] + ',0').join('\n')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  const r = C.importKML(kml); ok(r.ok); eq(r.candidates[0].name, 'زمین'); checkPreview(C.buildPreview(r.candidates[0], r));
});
t('آزمون ۴f: Excel (xlsx)', () => {
  const ws = XLSX.utils.aoa_to_sheet([['طول', 'عرض']].concat(sqLL.map(p => [p[0], p[1]])));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const wb2 = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const r = C.importTable(rows); ok(r.ok, JSON.stringify(r)); checkPreview(C.buildPreview(r.candidates[0], r));
});
t('آزمون ۴g: UTM — منطقه نامشخص باید پرسیده شود، سپس با منطقه‌ی ۳۹ درست شود', () => {
  const txt = 'x,y\n' + sqUTM.map(p => p.join(',')).join('\n');
  const r = C.importText(txt); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r);
  ok(!pv.ok && pv.needsCRS, 'باید سؤال کند'); ok(pv.candidates.indexOf('EPSG:32639') >= 0);
  const pv2 = C.buildPreview(r.candidates[0], Object.assign({}, r, { crs: 'EPSG:32639' }));
  checkPreview(pv2, 1);
  // منطقه‌ی اشتباه (۴۰) ⇒ موقعیت متفاوت ولی هشدار خارج از بازه نباید دروغ بگوید
  const pv3 = C.buildPreview(r.candidates[0], Object.assign({}, r, { crs: 'EPSG:32640' }));
  ok(Math.abs(pv3.ring[0][0] - sqLL[0][0]) > 1, 'منطقه‌ی دیگر باید جای دیگری بیفتد (یعنی تبدیل واقعی انجام می‌شود)');
});
t('آزمون ۴h: Web Mercator خودکار تشخیص داده شود', () => {
  const m = sqLL.map(p => proj4('EPSG:4326', 'EPSG:3857', p));
  const r = C.importText(m.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join('\n')); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); eq(pv.crs, 'EPSG:3857'); checkPreview(pv, 3);
});
t('آزمون ۴i: ستون‌های نامعلوم ⇒ پرسش، سپس انتخاب ستون', () => {
  const rows = [['شماره', 'نام', 'a', 'b']].concat(sqLL.map((p, i) => [String(i + 1), 'P' + i, String(p[0]), String(p[1])]));
  const r = C.importTable(rows); ok(r.needsColumns);
  const r2 = C.importTable(rows, { colX: 2, colY: 3 }); ok(r2.ok); checkPreview(C.buildPreview(r2.candidates[0], r2));
});

/* -------- آزمون پنجم: ورودی نامعتبر -------- */
t('آزمون ۵a: کمتر از ۳ نقطه رد شود', () => {
  const r = C.importText('51.0,35.0\n51.1,35.1'); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); ok(!pv.ok); ok(pv.errors.join().includes('۳ نقطه'));
});
t('آزمون ۵b: مقدار غیرعددی خطای دقیق با شماره‌ی ردیف بدهد', () => {
  const r = C.importText('lon,lat\n51.0,35.0\nabc,35.1\n51.2,35.2'); ok(!r.ok); ok(r.errors[0].includes('ردیف 3'), r.errors[0]);
});
t('آزمون ۵c: چندضلعی خودمتقاطع (پاپیونی) رد شود', () => {
  const r = C.importText('lon,lat\n52,35\n52.001,35.001\n52.001,35\n52,35.001'); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); ok(!pv.ok); ok(pv.errors.join().includes('قطع'));
});
t('آزمون ۵d: نقاط روی یک خط (مساحت صفر) رد شود', () => {
  const r = C.importText('lon,lat\n52,35\n52.001,35\n52.002,35'); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); ok(!pv.ok);
});
t('آزمون ۵e: عرض خارج از بازه رد شود و مختصات ساخته نشود', () => {
  const v = C.validateRing([[52, 95], [52.1, 35], [52.2, 35.1]]); ok(!v.valid); ok(v.errors[0].includes('خارج'));
});
t('آزمون ۵f: GeoJSON خراب و KML بدون چندضلعی خطا دهند', () => {
  ok(!C.importGeoJSON('{bad').ok); ok(!C.importKML('<kml></kml>').ok);
  ok(!C.importGeoJSON({ type: 'Point', coordinates: [1, 2] }).ok);
});
t('آزمون ۵g: مختصات ناسازگار با هر CRS ⇒ پرسش، نه حدس', () => {
  const r = C.importText('1,2\n3,4\n5,1'); ok(r.ok);
  const pv = C.buildPreview(r.candidates[0], r); ok(!pv.ok && pv.needsCRS);
});

/* -------- آزمون ششم -------- */
t('آزمون ۶: مسکونی نامشخص ⇒ مسکونی فرض نشود، رده‌ی دستی، نتیجه موقت', () => {
  const st = C.newState();
  const sug = C.suggestRuralGrade(st.settings, { residential: 'unknown', agri: 'irrigated' });
  ok(sug.manual && sug.grade === null && sug.reason.includes('نیازمند تعیین دستی'));
  const p = C.newParcel({ name: 'نامشخص', scope: 'rural_inside', areaComputed: 1000, attrs: { residential: 'unknown', agri: 'irrigated' }, grade: 'manual' });
  C.addParcel(st, p);
  ok(p.valuation.provisional); eq(p.valuation.total, null); ok(p.valuation.needs.join().includes('درجه'));
  // و مسکونی تأییدشده + آبی ⇒ درجه ۱
  eq(C.suggestRuralGrade(st.settings, { residential: 'confirmed', agri: 'irrigated' }).grade, 'grade1');
  // فاقد مسکونی و بدون کشاورزی با هیچ رده‌ای سازگار نیست
  ok(C.suggestRuralGrade(st.settings, { residential: 'denied', agri: 'none' }).manual);
  // ضریب ۸ در برابر ۱
  const a = C.newParcel({ scope: 'rural_inside', areaComputed: 100, attrs: { residential: 'confirmed', agri: 'irrigated' }, grade: 'grade1' });
  const b = C.newParcel({ scope: 'rural_inside', areaComputed: 100, attrs: { residential: 'denied', agri: 'dry' }, grade: 'grade3' });
  C.addParcel(st, a); C.addParcel(st, b);
  eq(a.valuation.pricePerM2 / b.valuation.pricePerM2, 8);
});

/* -------- آزمون هفتم -------- */
t('آزمون ۷: تغییر قیمت درجه ⇒ زمین قدیمی بدون اجازه تغییر نکند؛ با اجازه تغییر کند', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1' }); C.addParcel(st, p);
  eq(p.valuation.pricePerM2, 120000);
  const s = C.clone(st.settings); s.groups.rural_outside.cells.grade1_normal.fixed = 200000;
  const r = C.updateSettings(st, s, 'keep');
  eq(r.version, 2); eq(p.valuation.pricePerM2, 120000, 'حفظ قیمت'); eq(p.valuation.settingsVersion, 1);
  const q = mkParcel({ grade: 'grade1' }); C.addParcel(st, q);
  eq(q.valuation.pricePerM2, 200000, 'زمین جدید با قیمت جدید');
  ok(st.settingsHistory.length === 2);
  const s2 = C.clone(st.settings);
  const r2 = C.updateSettings(st, s2, 'recalc');
  eq(p.valuation.pricePerM2, 200000); eq(p.valuation.settingsVersion, 3);
  ok(p.history.some(h => h.reason.includes('محاسبه‌ی مجدد')), 'تاریخچه ثبت شود');
});
t('آزمون ۷b: سناریوی قدیمی نسخه‌ی قدیمی قیمت را حفظ کند', () => {
  const st = C.newState();
  const p = mkParcel({ name: 'الف' }); C.addParcel(st, p);
  C.addPerson(st, 'علی', 1); C.addPerson(st, 'رضا', 1);
  const sc1 = C.createScenario(st, 'قدیم');
  const s = C.clone(st.settings); s.groups.rural_outside.cells.grade1_normal.fixed = 240000;
  C.updateSettings(st, s, 'recalc');
  const sc2 = C.createScenario(st, 'جدید');
  eq(sc1.parcels[p.id].total, 1200000000); eq(sc2.parcels[p.id].total, 2400000000);
  eq(sc1.settingsVersion, 1); eq(sc2.settingsVersion, 2);
});

/* -------- روش‌های ارزش‌گذاری -------- */
t('روش دوم: بازه‌ی حداقل/حداکثر و انتخاب کاربر (خارج از بازه هشدار)', () => {
  const st = C.newState(); const s = C.clone(st.settings);
  Object.assign(s.groups.rural_outside, { method: 'range' });
  Object.assign(s.groups.rural_outside.cells.grade1_normal, { min: 100000, max: 140000 });
  C.updateSettings(st, s, 'keep');
  const p = mkParcel(); p.pricing.userPrice = 130000; C.addParcel(st, p);
  eq(p.valuation.pricePerM2, 130000);
  const q = mkParcel(); q.pricing.userPrice = 150000; C.addParcel(st, q);
  ok(q.valuation.warnings.join().includes('خارج از بازه'));
  const w = mkParcel(); C.addParcel(st, w); eq(w.valuation.total, null); ok(w.valuation.needs.join().includes('قیمت'));
});
t('روش سوم: قیمت پیشنهادی بر اساس امتیاز در بازه؛ ویژگی ویژه دوباره شمرده نشود', () => {
  const st = C.newState(); const s = C.clone(st.settings);
  s.groups.rural_outside.method = 'score';
  Object.assign(s.groups.rural_outside.cells.grade1_normal, { min: 100000, max: 140000 });
  Object.assign(s.groups.rural_outside.cells.grade1_special, { min: 120000, max: 160000 });
  C.updateSettings(st, s, 'keep');
  const total = st.settings.scoring.features.reduce((a, f) => a + f.points, 0);
  const p = mkParcel(); p.featuresReviewed = true;
  p.features = { asphalt: { on: true }, electricity: { on: true } }; // 15 از 70
  C.addParcel(st, p);
  eq(p.valuation.score, 15);
  eq(p.valuation.pricePerM2, Math.round(100000 + 40000 * 15 / total));
  // ویژه: asphalt در «ویژه» لحاظ شده ⇒ امتیاز فقط ۵ (برق)
  const q = mkParcel({ special: true }); q.featuresReviewed = true;
  q.features = { asphalt: { on: true }, electricity: { on: true } };
  C.addParcel(st, q);
  eq(q.valuation.score, 5, 'نباید دوبار شمرده شود');
  ok(q.valuation.scoreLines.some(l => l.note));
  // بدون بازبینی ویژگی‌ها ⇒ امتیاز موقت
  const r = mkParcel(); C.addParcel(st, r); ok(r.valuation.provisional && r.valuation.status === 'موقت');
});
t('روش اول: امتیازها پنهانی روی قیمت ثابت اثر نگذارند', () => {
  const st = C.newState();
  const a = mkParcel(); a.featuresReviewed = true; a.features = { asphalt: { on: true }, water: { on: true }, gas: { on: true } };
  const b = mkParcel(); b.featuresReviewed = true;
  C.addParcel(st, a); C.addParcel(st, b);
  ok(a.valuation.score > 0); eq(a.valuation.pricePerM2, b.valuation.pricePerM2);
});
t('غیرفعال‌کردن وضعیت ویژه برای گروه', () => {
  const st = C.newState(); const s = C.clone(st.settings); s.groups.rural_outside.specialEnabled = false; C.updateSettings(st, s, 'keep');
  const p = mkParcel({ special: true }); C.addParcel(st, p); eq(p.valuation.pricePerM2, 120000);
});
t('شهری: بدون قیمت تعریف‌شده ⇒ ناقص؛ با قیمت دستی کامل', () => {
  const st = C.newState();
  const p = C.newParcel({ scope: 'urban', areaComputed: 200, attrs: { urbanUse: 'commercial' }, grade: 'manual' }); C.addParcel(st, p);
  eq(p.valuation.total, null);
  p.pricing.override = 5000000; C.saveParcel(st, p); eq(p.valuation.total, 1000000000);
  const s = C.clone(st.settings); s.groups.urban.cells.residential_normal = { fixed: 3000000 }; C.updateSettings(st, s, 'keep');
  const q = C.newParcel({ scope: 'urban', areaComputed: 100, attrs: { urbanUse: 'residential' } }); C.addParcel(st, q);
  eq(q.valuation.total, 300000000);
});
t('مساحت مبنا: ویرایش دستی مساحت بر مساحت محاسبه‌شده اولویت دارد', () => {
  const st = C.newState(); const p = mkParcel({ areaOverride: 9000 }); C.addParcel(st, p);
  eq(p.valuation.total, 9000 * 120000);
});

/* -------- تقسیم -------- */
t('تقسیم: اختلاف ارزش سهم و ترکیب چند زمین با ارزش‌های مختلف', () => {
  const st = C.newState();
  const s = C.clone(st.settings); s.groups.rural_outside.byType.dry.grade2_normal = { fixed: 40000 }; C.updateSettings(st, s, 'keep');
  const A = mkParcel({ name: 'آبی', attrs: { farmType: 'irrigated' }, grade: 'grade1' });                 // 1.2e9
  const B = mkParcel({ name: 'دیم', attrs: { farmType: 'dry' }, grade: 'grade2', areaComputed: 20000 });   // 20000×40000 = 8e8
  const Cc = mkParcel({ name: 'ویژه', grade: 'grade1', special: true, areaComputed: 4000 });              // 4000×150000 = 6e8
  [A, B, Cc].forEach(p => C.addParcel(st, p));
  const ali = C.addPerson(st, 'علی', 1), reza = C.addPerson(st, 'رضا', 1);
  const sc = C.createScenario(st, 'الف');
  C.setAllocation(sc, A.id, ali.id, 1); C.setAllocation(sc, B.id, reza.id, 1); C.setAllocation(sc, Cc.id, reza.id, 0.5); C.setAllocation(sc, Cc.id, ali.id, 0.5);
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 1200000000 + 800000000 + 600000000);
  const ra = ev.results.find(x => x.person.id === ali.id), rr = ev.results.find(x => x.person.id === reza.id);
  eq(ra.received, 1200000000 + 300000000); eq(rr.received, 800000000 + 300000000);
  eq(ra.entitled, 1300000000); eq(ra.diff, 200000000); eq(rr.diff, -200000000);
  near(ra.area, 10000 + 2000, 1e-6); eq(ev.unallocated.length, 0);
  ok(ra.byScope.rural_outside && ra.specialValue === 300000000);
  // تخصیص بیش از ۱۰۰٪ خطا بدهد
  C.setAllocation(sc, A.id, reza.id, 0.5); ok(C.evaluateScenario(st, sc).errors.length > 0);
});
t('تقسیم: وزن سهم نابرابر', () => {
  const st = C.newState(); const A = mkParcel({ areaComputed: 1000 }); C.addParcel(st, A);
  const p1 = C.addPerson(st, 'الف', 3), p2 = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 's'); C.setAllocation(sc, A.id, p1.id, 0.75); C.setAllocation(sc, A.id, p2.id, 0.25);
  const ev = C.evaluateScenario(st, sc); ev.results.forEach(r => eq(r.diff, 0));
});

/* -------- آزمون هشتم: ذخیره و بازیابی -------- */
t('آزمون ۸: ذخیره‌ی JSON و بازیابی دقیق هندسه و اطلاعات', () => {
  const st = C.newState();
  const p = C.newParcel({ name: 'ترسیمی', scope: 'rural_inside', attrs: { residential: 'confirmed', agri: 'irrigated' }, grade: 'grade1', gradeReason: 'آزمون', special: true, specialReason: 'جاده', features: { asphalt: { on: true, note: 'آسفالت کمربندی' } }, featuresReviewed: true });
  const v = C.validateRing(sqLL); p.geometry = { ring: v.ring, source: 'draw' }; p.areaComputed = v.area;
  C.addParcel(st, p);
  const json = JSON.stringify(st);               // «بستن» پروژه
  const st2 = JSON.parse(json);                  // «بازکردن» پروژه
  const p2 = st2.parcels[0];
  eq(JSON.stringify(p2.geometry.ring), JSON.stringify(p.geometry.ring), 'هندسه دقیقاً برابر');
  eq(p2.areaComputed, p.areaComputed); eq(p2.valuation.total, p.valuation.total); eq(p2.grade, 'grade1');
  eq(p2.features.asphalt.note, 'آسفالت کمربندی'); eq(p2.specialReason, 'جاده'); eq(p2.gradeReason, 'آزمون');
  ok(p2.createdAt && p2.updatedAt && st2.settingsHistory.length === 1);
  near(C.areaM2(p2.geometry.ring), p.areaComputed, 1e-6);
});

/* -------- کسر دقیق (بدون خطای گردکردن) -------- */
t('کسر دقیق: ۱/۸ + ۳/۸ = ۱/۲، سه‌تا ۱/۳ = ۱، هفت‌تا ۱/۷ = ۱', () => {
  eq(C.fText(C.fAdd(C.toFrac('1/8'), C.toFrac('۳/۸'))), '1/2');
  const third = C.toFrac('1/3');
  eq(C.fText(C.fAdd(C.fAdd(third, third), third)), '1');
  let s = C.frac(0); for (let i = 0; i < 7; i++) s = C.fAdd(s, C.toFrac('1/7'));
  eq(C.fText(s), '1');
  // گردکردن اعشاری این‌ها را خراب می‌کند ولی کسر دقیق نه
  ok(Math.abs(0.1 + 0.2 - 0.3) > 0, 'اعشاری خطا دارد');
  eq(C.fText(C.fAdd(C.toFrac('0.1'), C.toFrac('0.2'))), '3/10');
});
t('کسر دقیق: ورودی فارسی، درصد، عدد مخلوط و تجزیه‌ی سهم', () => {
  eq(C.fText(C.toFrac('12.5%')), '1/8');
  eq(C.fText(C.toFrac('۱۲٫۵٪')), '1/8');
  eq(C.fText(C.toFrac('3 1/4')), '13/4');
  eq(C.fText(C.toFrac('۱٫۵')), '3/2');
  eq(C.fText(C.toFrac(0.375)), '3/8');
  eq(C.toFrac('abc'), null);
  const p = C.parseShare('12.5'); eq(p.kind, 'percent'); eq(C.fText(p.frac), '1/8');
  const q = C.parseShare('1/8'); eq(q.kind, 'ratio'); eq(C.fText(q.frac), '1/8');
  const w = C.parseShare('۲۵٪'); eq(C.fText(w.frac), '1/4');
  ok(C.parseShare('-5').error, 'سهم منفی رد می‌شود');
  // کسر دقیق باید بعد از ذخیره و بازیابی JSON هم دست‌نخورده بماند
  const packed = C.fPack(C.toFrac('1/8'));
  eq(packed.num, '1'); eq(packed.den, '8');
  eq(JSON.parse(JSON.stringify({ a: packed })).a.den, '8');
});

/* -------- تقسیم با کسر دقیق و کنترل جمع سهم‌ها -------- */
t('تقسیم: سه نفر هرکس ۱/۳ ⇒ جمع دقیقاً ۱۰۰٪، اختلاف صفر، همه‌ی کنترل‌ها سبز', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1', special: true });          // 10000 × 150000 = 1.5e9
  C.addParcel(st, p);
  const a = C.addPerson(st, 'عمو ۱', 1), b = C.addPerson(st, 'عمو ۲', 1), c = C.addPerson(st, 'عمو ۳', 1);
  const sc = C.createScenario(st, 'تقسیم عموها');
  [a, b, c].forEach(x => C.setAllocation(sc, p.id, x.id, '1/3'));
  eq(C.fText(C.allocSum(sc, p.id)), '1');
  eq(JSON.stringify(sc.allocations[p.id][0].num), '"1"');           // کسر دقیق ذخیره شده است
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 1500000000);
  ev.results.forEach(r => { eq(r.received, 500000000); eq(r.entitled, 500000000); eq(r.diff, 0); eq(r.entitledFracText, '1/3'); });
  eq(ev.unallocated.length, 0); eq(ev.errors.length, 0);
  ok(ev.checks.length >= 5 && ev.checks.every(k => k.ok), 'کنترل‌ها: ' + ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});
t('تقسیم: هفت نفر با سهم برابر ⇒ هرکس دقیقاً ۱/۷ و بدون سهم واگذارنشده', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1', special: true, areaComputed: 7000 });   // 7000 × 150000 = 1.05e9
  C.addParcel(st, p);
  const ids = []; for (let i = 0; i < 7; i++) ids.push(C.addPerson(st, 'نفر ' + i, 1).id);
  const sc = C.createScenario(st, 'هفت‌نفر');
  eq(C.fText(C.setEqualAllocation(sc, p.id, ids)), '1/7');
  eq(C.fText(C.allocSum(sc, p.id)), '1');
  const ev = C.evaluateScenario(st, sc);
  eq(ev.unallocated.length, 0);
  ev.results.forEach(r => { eq(r.entitled, 150000000); eq(r.received, 150000000); eq(r.diff, 0); });
  ok(ev.checks.find(k => k.id === 'full').ok);
});
t('تقسیم: سهم‌های کسری نامساوی (۱/۸، ۳/۸، ۱/۴، ۱/۴) ⇒ جمع دقیق ۱۰۰٪ و ارزش دقیق هرکس', () => {
  const st = C.newState();
  const p = mkParcel({ grade: 'grade1', special: true });           // 1.5e9
  C.addParcel(st, p);
  const who = ['الف', 'ب', 'پ', 'ت'].map(n => C.addPerson(st, n, 1));
  const sc = C.createScenario(st, 'کسری');
  ['1/8', '3/8', '25%', '1/4'].forEach((v, i) => C.setAllocation(sc, p.id, who[i].id, v));
  eq(C.fText(C.allocSum(sc, p.id)), '1');
  const ev = C.evaluateScenario(st, sc);
  const got = who.map(x => ev.results.find(r => r.person.id === x.id).received);
  eq(got[0], 187500000); eq(got[1], 562500000); eq(got[2], 375000000); eq(got[3], 375000000);
  eq(got.reduce((s, x) => s + x, 0), 1500000000);
  ok(ev.checks.find(k => k.id === 'value_balance').ok);
});
t('تقسیم: واگذاری بیش از ۱۰۰٪ ⇒ خطا، فهرست «بیش از حد» و رد شدن کنترل‌ها', () => {
  const st = C.newState();
  const p = mkParcel(); C.addParcel(st, p);
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'اضافه');
  C.setAllocation(sc, p.id, a.id, '1/2'); C.setAllocation(sc, p.id, b.id, '75');   // ۱/۲ + ۳/۴ = ۵/۴
  eq(C.fText(C.allocSum(sc, p.id)), '5/4');
  const ev = C.evaluateScenario(st, sc);
  eq(ev.over.length, 1); ok(ev.errors.length > 0);
  ok(!ev.checks.find(k => k.id === 'no_over').ok);
  ok(!ev.checks.find(k => k.id === 'value_balance').ok);
});
t('تقسیم: سهم واگذارنشده با کسر دقیق گزارش می‌شود (۱/۸ مانده)', () => {
  const st = C.newState();
  const p = mkParcel(); C.addParcel(st, p);                          // 1.2e9
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'مانده');
  C.setAllocation(sc, p.id, a.id, '5/8'); C.setAllocation(sc, p.id, b.id, '25%');   // ۵/۸ + ۱/۴ = ۷/۸
  const ev = C.evaluateScenario(st, sc);
  eq(ev.unallocated.length, 1);
  eq(ev.unallocated[0].remainingFrac, '1/8');
  eq(ev.unallocated[0].remainingPct, '12.5');
  eq(ev.unallocated[0].value, 150000000);                            // 1.2e9 / 8
  ok(!ev.checks.find(k => k.id === 'full').ok);
});
t('تقسیم: وزن کسری (۳/۲ در برابر ۱) ⇒ حق هرکس ۳/۵ و ۲/۵، جمع حق‌ها = ارزش کل', () => {
  const st = C.newState();
  const p = mkParcel({ areaComputed: 1000 }); C.addParcel(st, p);     // 1000 × 120000 = 1.2e8
  const a = C.addPerson(st, 'الف', '3/2'), b = C.addPerson(st, 'ب', 1);
  eq(C.fText(C.personWeightFrac(a)), '3/2');
  const sc = C.createScenario(st, 'وزن کسری');
  C.setEqualAllocation(sc, p.id, [a.id, b.id]);                       // هرکس ۱/۲ زمین
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 120000000);
  const ra = ev.results.find(x => x.person.id === a.id), rb = ev.results.find(x => x.person.id === b.id);
  eq(ra.entitledFracText, '3/5'); eq(rb.entitledFracText, '2/5');
  eq(ra.entitled, 72000000); eq(rb.entitled, 48000000);
  eq(ra.received, 60000000); eq(ra.diff, -12000000); eq(rb.diff, 12000000);
  eq(ra.diff + rb.diff, 0);                                           // تسویه‌ی دقیق
  ok(ev.checks.find(k => k.id === 'entitled_balance').ok);
  ok(C.setPersonWeight(st, b.id, '2/1') && C.fText(C.personWeightFrac(b)) === '2');
  eq(C.setPersonWeight(st, b.id, 'صفر'), null);
});
t('تقسیم: سهم شخص حذف‌شده ⇒ پول گم نمی‌شود و کنترل هشدار می‌دهد', () => {
  const st = C.newState();
  const p = mkParcel(); C.addParcel(st, p);
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'یتیم');
  C.setAllocation(sc, p.id, a.id, '1/2'); C.setAllocation(sc, p.id, b.id, '1/2');
  st.persons = st.persons.filter(x => x.id !== b.id);                 // شخص حذف می‌شود ولی سهمش می‌ماند
  const ev = C.evaluateScenario(st, sc);
  eq(ev.orphan.length, 1);
  ok(!ev.checks.find(k => k.id === 'known_persons').ok);
  ok(ev.errors.some(e => /حذف‌شده/.test(e)));
});
t('تقسیم: سازگاری با فایل پروژه‌ی قدیمی (سهم اعشاری و وزن بدون کسر)', () => {
  const st = C.newState();
  const p = mkParcel(); C.addParcel(st, p);
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1);
  delete a.wnum; delete a.wden; delete b.wnum; delete b.wden;         // شکل فایل‌های نسخه‌ی قبل
  const sc = C.createScenario(st, 'قدیمی');
  sc.allocations[p.id] = [{ personId: a.id, fraction: 0.625 }, { personId: b.id, fraction: 0.375 }];
  const ev = C.evaluateScenario(st, sc);
  eq(ev.unallocated.length, 0);
  ok(ev.checks.find(k => k.id === 'full').ok);
  eq(ev.results.find(x => x.person.id === a.id).received, 750000000);
});
t('تقسیم: کنترل جمع همیشه اجرا می‌شود (حتی با سناریوی خالی)', () => {
  const st = C.newState();
  const p = mkParcel(); C.addParcel(st, p);
  C.addPerson(st, 'الف', 1);
  const sc = C.createScenario(st, 'خالی');
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 1200000000);
  ok(!ev.checks.find(k => k.id === 'full').ok);                       // هیچ سهمی واگذار نشده
  eq(ev.unallocated.length, 1); eq(ev.unallocated[0].remainingFrac, '1');
  ok(ev.checks.find(k => k.id === 'no_over').ok);
});

/* -------- برش زمین: تقسیم به دو قسمت با متراژ مشخص -------- */
const rectLL = (w, h) => [[500000, 3600000], [500000 + w, 3600000], [500000 + w, 3600000 + h], [500000, 3600000 + h]].map(p => proj4('EPSG:32639', 'EPSG:4326', p));
const Lshape = [[0, 0], [300, 0], [300, 100], [100, 100], [100, 300], [0, 300]].map(p => proj4('EPSG:32639', 'EPSG:4326', [500000 + p[0], 3600000 + p[1]]));
t('برش: مربع ۱۰۰×۱۰۰ با متراژ ۵۰۰۰ ⇒ قسمت ۱ دقیقاً ۵۰۰۰ و جمع دو قسمت = مساحت کل', () => {
  const total = C.areaM2(sqLL);
  const r = C.splitRingByArea(sqLL, 5000, { azimuth: 0 });
  ok(r.ok, 'برش ناموفق: ' + JSON.stringify(r.errors || r.warnings));
  near(r.areaA, 5000, 0.01); near(r.areaB, total - 5000, 0.02);
  near(r.areaA + r.areaB, total, 0.05);
  near(r.errorM2, 0, 0.01);
  eq(r.line.length, 2); near(r.cutLengthM, 100.04, 0.05);
  ok(C.validateRing(r.partA).valid && C.validateRing(r.partB).valid);
  eq(r.partA.length, 4); eq(r.partB.length, 4);
});
t('برش: چرخش جهت خط (۰ تا ۳۵۹ درجه) ⇒ مساحت قسمت خواسته‌شده همیشه دقیق می‌ماند', () => {
  const ring = rectLL(300, 200), total = C.areaM2(ring), want = total * 0.37;
  [0, 17, 45, 90, 133.3, 180, 271, 359].forEach(az => {
    const r = C.splitRingByArea(ring, want, { azimuth: az });
    ok(r.ok, 'az=' + az + ' ناموفق بود');
    near(r.areaA, want, 0.02, 'az=' + az);
    near(r.areaA + r.areaB, total, 0.05, 'az=' + az);
    ok(r.cutLengthM > 0, 'طول خط برش صفر است (az=' + az + ')');
  });
});
t('برش: زمین غیرمحدب (L شکل) در دو جهت ⇒ مساحت دقیق و هندسه‌ی معتبر', () => {
  const total = C.areaM2(Lshape);
  near(total, 50040, 5);
  const r = C.splitRingByArea(Lshape, 15000, { azimuth: 0 });
  ok(r.ok); near(r.areaA, 15000, 0.05); near(r.areaA + r.areaB, total, 0.1);
  ok(C.validateRing(r.partA).valid && C.validateRing(r.partB).valid);
  const r2 = C.splitRingByArea(Lshape, 5000, { azimuth: 90 });
  ok(r2.ok); near(r2.areaA, 5000, 0.05); near(r2.cutLengthM, 100.04, 0.05);
});
t('برش: چندضلعی ۶۴ ضلعی (شبه‌دایره) ⇒ نصف دقیق در چهار جهت', () => {
  const R = 60, ring = [];
  for (let i = 0; i < 64; i++) { const a = i * 2 * Math.PI / 64; ring.push(proj4('EPSG:32639', 'EPSG:4326', [500000 + R * Math.cos(a), 3600000 + R * Math.sin(a)])); }
  const total = C.areaM2(ring);
  near(total, Math.PI * R * R, 60);
  [0, 45, 90, 135].forEach(az => {
    const r = C.splitRingByArea(ring, total / 2, { azimuth: az });
    ok(r.ok); near(r.areaA, total / 2, 0.05); near(r.areaB, total / 2, 0.05);
  });
});
t('برش: سمت دیگر (side=b) ⇒ همان خط، دو قسمت جابه‌جا', () => {
  const ring = rectLL(300, 200), total = C.areaM2(ring);
  const a = C.splitRingByArea(ring, 20000, { azimuth: 0, side: 'a' });
  const b = C.splitRingByArea(ring, total - 20000, { azimuth: 0, side: 'b' });
  ok(a.ok && b.ok);
  near(a.areaA, 20000, 0.02); near(b.areaA, total - 20000, 0.05);
  near(a.areaB, b.areaA, 0.05); near(b.areaB, a.areaA, 0.05);
  // خط جداکننده یکی است
  near(a.line[0][0], b.line[0][0], 1e-9); near(a.line[0][1], b.line[0][1], 1e-9);
  near(a.line[1][0], b.line[1][0], 1e-9); near(a.line[1][1], b.line[1][1], 1e-9);
});
t('برش: آماده‌سازی یک‌بار، برش با جابه‌جایی خط (برای کشیدن با ماوس)', () => {
  const ring = rectLL(300, 200);
  const pre = C.splitPrepare(ring);
  ok(pre.ok); near(pre.totalArea, C.areaM2(ring), 1e-6); ok(pre.pts.length === 4);
  const rg = C.splitOffsetRange(pre, { azimuth: 0 });
  ok(rg.min < -100 && rg.max > 100);
  const half = C.splitByOffset(pre, 0, { azimuth: 0 });        // خط از مرکز سطحی ⇒ نصف
  ok(half.ok); near(half.areaA, pre.totalArea / 2, 0.05);
  const byArea = C.splitByArea(pre, pre.totalArea / 2, { azimuth: 0 });
  near(byArea.offset, 0, 0.01); near(byArea.areaA, half.areaA, 0.05);
  // بازه‌ی جابه‌جایی: ابتدا و انتها ⇒ قسمت تقریباً خالی/پر
  const lo = C.splitByOffset(pre, rg.min + 1, { azimuth: 0 });
  const hi = C.splitByOffset(pre, rg.max - 1, { azimuth: 0 });
  ok(lo.ok && lo.areaA < 400); ok(hi.ok && hi.areaA > pre.totalArea - 400);
});
t('برش: متراژ نامعتبر ⇒ خطای روشن و بدون نتیجه', () => {
  const total = C.areaM2(sqLL);
  eq(C.splitRingByArea(sqLL, total + 1).reason, 'too_big');
  eq(C.splitRingByArea(sqLL, 0).reason, 'too_small');
  eq(C.splitRingByArea(sqLL, 'abc').reason, 'target');
  eq(C.splitRingByArea([[0, 0], [1, 1]], 5).reason, 'invalid');
  ok(!C.splitRingByArea(null, 5).ok);
  ok(C.splitRingByArea(sqLL, '1/2 of total'.length && total / 2).ok, 'متراژ عددی معتبر');
});
t('برش: جهت پیشنهادی عمود بر کشیدگی زمین است', () => {
  const n180 = (a) => { const x = a % 180; return Math.min(x, 180 - x); };
  near(n180(C.principalAzimuth(rectLL(400, 100))), 0, 0.5);      // زمین دراز شرقی–غربی ⇒ خط شمالی–جنوبی
  near(n180(C.principalAzimuth(rectLL(100, 400))), 90, 0.5);     // زمین دراز شمالی–جنوبی ⇒ خط شرقی–غربی
  ok(C.principalAzimuth(sqLL) != null && isFinite(C.principalAzimuth(sqLL)));
  // برش با جهت پیشنهادی، زمین دراز را به دو قسمت هم‌عرض تقسیم می‌کند
  const ring = rectLL(400, 100), az = C.principalAzimuth(ring);
  const r = C.splitRingByArea(ring, C.areaM2(ring) / 2, { azimuth: az });
  ok(r.ok); near(r.cutLengthM, 100.04, 0.5);
});
t('برش: قسمت‌ها صفت‌های زمین مبدأ را نگه می‌دارند و مساحت هر قسمت از هندسه‌ی خودش می‌آید', () => {
  const st = C.newState();
  const src = mkParcel({ name: 'زمین مادر', areaComputed: null });
  const v = C.validateRing(rectLL(300, 200));
  src.geometry = { ring: v.ring, source: 'draw' }; src.areaComputed = v.area;
  C.addParcel(st, src);
  const r = C.splitRingByArea(src.geometry.ring, v.area * 0.4, { azimuth: 0 });
  ok(r.ok);
  const a1 = C.areaM2(r.partA), a2 = C.areaM2(r.partB);
  near(a1, v.area * 0.4, 0.05); near(a1 + a2, v.area, 0.1);
  // دو زمین جدید از همان صفت‌ها، با مساحت محاسبه‌شده‌ی خودشان
  const mk = (ring, area, name) => {
    const p = C.newParcel({ grade: 'manual' });
    ['scope', 'attrs', 'grade', 'special', 'features', 'pricing'].forEach(k => { p[k] = C.clone(src[k]); });
    p.name = name; p.geometry = { ring, source: 'split', meta: { method: 'برش با متراژ مشخص', azimuth: r.azimuth } };
    p.areaComputed = area; return p;
  };
  const p1 = mk(r.partA, a1, 'قسمت ۱'), p2 = mk(r.partB, a2, 'قسمت ۲');
  C.addParcel(st, p1); C.addParcel(st, p2);
  // جمع ارزش دو قسمت = ارزش زمین مبدأ، در حد خطای گردکردن مساحت‌های جداگانه (کمتر از یک میلی‌مترمربع)
  near(p1.valuation.total + p2.valuation.total, src.valuation.total, 0.001 * src.valuation.pricePerM2 + 2);
  eq(p1.geometry.source, 'split');
  // تقسیم زمین‌های برش‌خورده بین دو نفر با کسر دقیق
  const x = C.addPerson(st, 'الف', 1), y = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'پس از برش', [p1.id, p2.id]);
  C.setAllocation(sc, p1.id, x.id, '1/2'); C.setAllocation(sc, p1.id, y.id, '1/2');
  C.setAllocation(sc, p2.id, x.id, '1/2'); C.setAllocation(sc, p2.id, y.id, '1/2');
  const ev = C.evaluateScenario(st, sc);
  eq(ev.results[0].diff, 0); eq(ev.results[1].diff, 0);
  ok(ev.checks.every(k => k.ok), ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});

(async () => {
  // KMZ (async)
  try {
    const zip = new JSZip();
    zip.file('doc.kml', `<kml><Placemark><name>k</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${sqLL.concat([sqLL[0]]).map(p => p.join(',') + ',0').join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const z2 = await JSZip.loadAsync(buf);
    const name = Object.keys(z2.files).find(n => /\.kml$/i.test(n));
    const r = C.importKML(await z2.files[name].async('string')); ok(r.ok); checkPreview(C.buildPreview(r.candidates[0], r));
    pass++; results.push('✔ آزمون ۴j: KMZ');
  } catch (e) { fail++; results.push('✘ KMZ — ' + e.message); }
  console.log(results.join('\n'));
  console.log(`\nموفق: ${pass}  ناموفق: ${fail}`);
  process.exit(fail ? 1 : 0);
})();

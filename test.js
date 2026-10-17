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

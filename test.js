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

/* -------- پرونده‌ی زنده: بخش‌ها، معامله‌ها، تسویه -------- */
function mkLand(st, name, total, area) {
  const id = 'L' + (st.parcels.length + 1);
  st.parcels.push({ id, name, scope: 'rural_inside', attrs: {}, grade: 'grade1', special: false, valuation: { area, pricePerM2: Math.round(total / area), total, status: 'ok' } });
  return id;
}
function mkCase() {
  const st = C.newState();
  const d1 = mkLand(st, 'دره‌گرمی ۱', 1000000000, 1000), d2 = mkLand(st, 'دره‌گرمی ۲', 880000000, 800);
  const r1 = mkLand(st, 'پدری ۱', 3000000000, 3000), r2 = mkLand(st, 'پدری ۲', 7000000000, 7000);
  const M = C.addPerson(st, 'مصطفی', 1), E = C.addPerson(st, 'اسفندیار', 1), A = C.addPerson(st, 'امیر', 1), H = C.addPerson(st, 'مهدی', 1);
  const sc = C.createCase(st, 'ارث', null, null);
  const dg = C.addSection(sc, 'دره‌گرمی', { parcelIds: [d1, d2] });
  const rest = sc.sections[0]; rest.name = 'پدری';
  [[M, '8'], [E, '8'], [A, '1'], [H, '4']].forEach(([p, w]) => C.setSectionWeight(sc, dg.id, p.id, w));
  [[M, '1'], [E, '1'], [A, '1'], [H, '4']].forEach(([p, w]) => C.setSectionWeight(sc, rest.id, p.id, w));
  return { st, sc, d1, d2, r1, r2, M, E, A, H, dg, rest };
}
t('پرونده‌ی زنده: حق هر نفر = جمع وزنیِ بخش‌ها، و جمع حق‌ها دقیقاً برابر ارزش کل', () => {
  const { st, sc, M, E, A, H } = mkCase();
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 11880000000);
  const want = { [M.id]: 10e9 / 7 + 1.88e9 * 8 / 21, [E.id]: 10e9 / 7 + 1.88e9 * 8 / 21, [A.id]: 10e9 / 7 + 1.88e9 / 21, [H.id]: 10e9 * 4 / 7 + 1.88e9 * 4 / 21 };
  ev.results.forEach(r => near(r.entitledExact, want[r.person.id], 0.01, r.person.name + ' '));
  ok(ev.checks.find(k => k.id === 'entitled_balance').ok, 'حق‌ها با ارزش کل نمی‌خواند');
  ok(ev.checks.find(k => k.id === 'sections_ok').ok);
  eq(ev.sections.length, 2); eq(ev.sections.find(x => x.name === 'دره‌گرمی').count, 2);
});
t('پرونده‌ی زنده: بخش‌ها درصد هر نفر را جدا و درصد نهایی از کل را وزنی می‌دهند', () => {
  const { st, sc, M, A } = mkCase();
  const ev = C.evaluateScenario(st, sc);
  const dg = ev.sections.find(s => s.name === 'دره‌گرمی'), pd = ev.sections.find(s => s.name === 'پدری');
  eq(dg.pool, 1880000000); eq(pd.pool, 10000000000);
  near(parseFloat(dg.poolPct), 1.88 / 11.88 * 100, 0.001);
  const m = ev.results.find(r => r.person.id === M.id), a = ev.results.find(r => r.person.id === A.id);
  eq(m.sections.find(x => x.sectionName === 'دره‌گرمی').fracText, '8/21'); eq(m.sections.find(x => x.sectionName === 'پدری').fracText, '1/7');
  near(parseFloat(m.entitledPct), (10e9 / 7 + 1.88e9 * 8 / 21) / 11.88e9 * 100, 0.001);
  eq(a.sections.find(x => x.sectionName === 'دره‌گرمی').fracText, '1/21');
  // مجموع درصدها دقیقاً ۱۰۰
  near(ev.results.reduce((s, r) => s + parseFloat(r.entitledPct), 0), 100, 0.001);
});
t('پرونده‌ی زنده: با عوض‌شدن قیمت یک زمین همه‌چیز خودکار دوباره حساب می‌شود (عکس ثابت نیست)', () => {
  const { st, sc, d1, M } = mkCase();
  const before = C.evaluateScenario(st, sc).results.find(r => r.person.id === M.id).entitled;
  st.parcels.find(p => p.id === d1).valuation.total = 2000000000;          // ارزش دره‌گرمی ۱ دو برابر شد
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 12880000000);
  const after = ev.results.find(r => r.person.id === M.id).entitled;
  ok(after > before, 'حق باید بیشتر شود');
  near(after, 10e9 / 7 + 2.88e9 * 8 / 21, 1);
  // سناریوی قدیمی همان عکس را نگه می‌دارد
  const old = C.createScenario(st, 'قدیم'); st.parcels.find(p => p.id === d1).valuation.total = 1000000000;
  eq(C.evaluateScenario(st, old).pool, 12880000000);
});
t('وزن بخش: جمع کسرها «1/3+1/21» دقیقاً ۸/۲۱ است و ورودی نامعتبر رد می‌شود', () => {
  const { sc, M, dg } = mkCase();
  eq(C.fText(C.setSectionWeight(sc, dg.id, M.id, '1/3+1/21')), '8/21');
  eq(C.fText(C.toFrac('10%+5%')), '3/20'); eq(C.fText(C.toFrac('+5')), '5'); eq(C.toFrac('1/3+x'), null);
  eq(C.setSectionWeight(sc, dg.id, M.id, 'abc'), null); eq(C.setSectionWeight(sc, dg.id, M.id, '-1'), null);
  eq(C.fText(C.setSectionWeight(sc, dg.id, M.id, '')), '0');
  eq(C.sectionWeightFrac(dg, M.id).n, 0n);
});
t('بخش‌ها: زمین تکراری یا بی‌بخش و بخش بدون سهم خطا می‌دهند', () => {
  const { st, sc, d1, d2, dg, rest } = mkCase();
  rest.rest = false; rest.parcelIds = [d1];                                  // d1 در دو بخش، پدری‌ها بی‌بخش
  const ev = C.evaluateScenario(st, sc);
  ok(!ev.checks.find(k => k.id === 'sections_ok').ok);
  ok(ev.errors.some(e => /بیش از یک بخش/.test(e)) && ev.errors.some(e => /بدون بخش/.test(e)));
  rest.rest = true; rest.parcelIds = []; Object.keys(dg.weights).forEach(k => delete dg.weights[k]);
  ok(C.evaluateScenario(st, sc).errors.some(e => /سهمی برای هیچ‌کس/.test(e)));
});
t('واگذاری و فهرست نهایی: زمین‌های هر نفر زیر نام خودش، مانده‌ها و تسویه‌ی دقیق', () => {
  const { st, sc, d1, d2, r1, r2, M, E, A, H } = mkCase();
  C.setAllocation(sc, d1, H.id, 1); C.setAllocation(sc, d2, A.id, 1);
  C.setAllocation(sc, r1, M.id, 1); C.setAllocation(sc, r2, E.id, '1/2'); C.setAllocation(sc, r2, H.id, '1/2');
  const ev = C.evaluateScenario(st, sc);
  const by = (p) => ev.results.find(r => r.person.id === p.id);
  eq(by(H).finalLines.map(l => l.name).join('|'), 'دره‌گرمی ۱|پدری ۲'); eq(by(H).finalLines[1].fractionText, '1/2');
  eq(by(H).finalValue, 1000000000 + 3500000000); eq(by(M).finalValue, 3000000000);
  eq(by(M).finalLines.length, 1); eq(by(A).finalValue, 880000000);
  ok(ev.checks.find(k => k.id === 'full').ok && ev.settlementBalanced);
  eq(ev.results.reduce((s, r) => s + r.finalDiff, 0), 0, 'جمع مانده‌ها');
  ok(by(M).finalDiff > 0 && by(E).finalDiff > 0 && by(A).finalDiff < 0 && by(H).finalDiff < 0, 'علامت مانده‌ها');
  eq(by(H).short, -by(H).finalDiff);
  // تسویه: جمع پرداخت‌ها = جمع بدهی‌ها = جمع طلب‌ها
  const paid = ev.settlement.reduce((s, x) => s + x.amountExact, 0), owed = ev.results.filter(r => r.finalDiff > 0).reduce((s, r) => s + r.finalDiffExact, 0);
  ok(ev.settlement.every(x => ['مصطفی', 'اسفندیار'].includes(x.fromName) && ['امیر', 'مهدی'].includes(x.toName)), 'جهت تسویه');
  near(paid, owed, 0.01);
  ev.settlement.forEach(x => ok(x.from !== x.to && x.amount > 0));
});
t('معامله‌ی زمین: بخشی از سهم یک نفر به دیگری می‌رود و در فهرست نهایی با یادداشت می‌آید', () => {
  const { st, sc, d1, r2, E, H } = mkCase();
  C.setAllocation(sc, r2, H.id, 1);
  C.addDeal(sc, { kind: 'parcel', from: H.id, to: E.id, parcelId: r2, frac: '1/4', note: 'تهاتر قدیمی' });
  const ev = C.evaluateScenario(st, sc);
  const h = ev.results.find(r => r.person.id === H.id), e = ev.results.find(r => r.person.id === E.id);
  eq(h.finalLines[0].fractionText, '3/4'); eq(e.finalLines[0].fractionText, '1/4');
  ok(/از مهدی/.test(e.finalLines[0].note) && /به اسفندیار/.test(h.finalLines[0].note));
  eq(e.finalValue, 1750000000); eq(h.finalValue, 5250000000);
  eq(e.finalDiff - (e.finalValue - e.entitled), 0);
  ok(e.dealLines.length === 1 && /تهاتر قدیمی/.test(e.dealLines[0]));
  // همه‌ی سهم: all
  C.addDeal(sc, { kind: 'parcel', from: H.id, to: E.id, parcelId: r2, all: true });
  const ev2 = C.evaluateScenario(st, sc);
  eq(ev2.results.find(r => r.person.id === H.id).finalLines.length, 0);
  eq(ev2.results.find(r => r.person.id === E.id).finalValue, 7000000000);
  ok(ev2.checks.find(k => k.id === 'deals_ok').ok);
});
t('معامله‌ی پول: مانده‌ی پرداخت‌کننده کم و دریافت‌کننده زیاد می‌شود و جمع مانده‌ها ثابت می‌ماند', () => {
  const { st, sc, d1, d2, r1, r2, M, E, A, H } = mkCase();
  [[d1, H], [d2, A], [r1, M], [r2, E]].forEach(([id, p]) => C.setAllocation(sc, id, p.id, 1));
  const base = C.evaluateScenario(st, sc);
  const bd = (r, p) => r.results.find(x => x.person.id === p.id).finalDiff;
  C.addDeal(sc, { kind: 'cash', from: E.id, to: M.id, amount: 500000000 });   // اسفندیار به مصطفی ۵۰۰ میلیون
  const ev = C.evaluateScenario(st, sc);
  eq(bd(ev, E), bd(base, E) - 500000000); eq(bd(ev, M), bd(base, M) + 500000000);
  eq(ev.results.reduce((s, r) => s + r.finalDiff, 0), 0);
  eq(ev.results.find(r => r.person.id === E.id).cashNet, -500000000);
});
t('معامله‌ی نامعتبر: بیش از سهم، طرفین یکسان، مبلغ منفی ⇒ خطا و بی‌اثر', () => {
  const { st, sc, r1, M, E } = mkCase();
  C.setAllocation(sc, r1, M.id, '1/4');
  const base = C.evaluateScenario(st, sc).results.find(r => r.person.id === M.id).finalValue;
  C.addDeal(sc, { kind: 'parcel', from: M.id, to: E.id, parcelId: r1, frac: '1/2' });
  C.addDeal(sc, { kind: 'parcel', from: M.id, to: M.id, parcelId: r1, frac: '1/8' });
  C.addDeal(sc, { kind: 'cash', from: M.id, to: E.id, amount: -5 });
  const ev = C.evaluateScenario(st, sc);
  ok(!ev.checks.find(k => k.id === 'deals_ok').ok); eq(ev.errors.filter(e => /معامله/.test(e)).length, 3);
  eq(ev.results.find(r => r.person.id === M.id).finalValue, base);
});
t('تبدیل سناریوی قدیمی به پرونده‌ی زنده: همان واگذاری‌ها و همان حق‌ها', () => {
  const st = C.newState();
  const a = mkLand(st, 'الف', 600000000, 60), b = mkLand(st, 'ب', 400000000, 40);
  const p1 = C.addPerson(st, 'یک', 3), p2 = C.addPerson(st, 'دو', 1);
  const old = C.createScenario(st, 'قدیمی'); C.setAllocation(old, a, p1.id, 1); C.setAllocation(old, b, p2.id, 1);
  const evOld = C.evaluateScenario(st, old);
  const nc = C.convertScenarioToCase(st, old.id, 'زنده');
  ok(nc.live && nc.sourceScenario === old.id && nc.name === 'زنده');
  const ev = C.evaluateScenario(st, nc);
  evOld.results.forEach((r, i) => { eq(ev.results[i].entitled, r.entitled); eq(ev.results[i].received, r.received); eq(ev.results[i].diff, r.diff); });
  eq(C.convertScenarioToCase(st, nc.id), null);                              // پرونده‌ی زنده دوباره تبدیل نمی‌شود
  st.parcels.find(p => p.id === a).valuation.total = 1000000000;
  eq(C.evaluateScenario(st, nc).pool, 1400000000);                           // زنده
  eq(C.evaluateScenario(st, old).pool, 1000000000);                          // عکس ثابت
});
t('پرونده‌های مستقل: هر پرونده فقط زمین‌ها و اشخاص خودش را می‌شمارد', () => {
  const st = C.newState();
  const a = mkLand(st, 'الف', 100, 1), b = mkLand(st, 'ب', 900, 9), c = mkLand(st, 'ج', 5000, 5);
  const x = C.addPerson(st, 'ایکس', 1), y = C.addPerson(st, 'ایگرگ', 1), z = C.addPerson(st, 'زد', 1);
  const c1 = C.createCase(st, 'یک', [a, b], [x.id, y.id]), c2 = C.createCase(st, 'دو', [c], [z.id]);
  const e1 = C.evaluateScenario(st, c1), e2 = C.evaluateScenario(st, c2);
  eq(e1.pool, 1000); eq(e1.results.length, 2); eq(e1.results[0].entitled, 500);
  eq(e2.pool, 5000); eq(e2.results.length, 1); eq(e2.results[0].entitled, 5000);
  C.setAllocation(c1, c, x.id, 1);                                         // سهم زمینی که در پرونده نیست
  ok(C.evaluateScenario(st, c1).results[0].received === 0);
  // حذف شخص از همه‌جا
  C.setAllocation(c1, a, x.id, 1); C.addDeal(c1, { kind: 'cash', from: x.id, to: y.id, amount: 5 });
  C.removePerson(st, x.id);
  ok(!c1.personIds.includes(x.id) && !c1.deals.length && !(c1.sections[0].weights[x.id]) && !c1.allocations[a]);
});
t('زمین حذف‌شده از برنامه: پرونده خطا می‌دهد ولی نمی‌شکند', () => {
  const { st, sc, d1 } = mkCase();
  st.parcels = st.parcels.filter(p => p.id !== d1);
  const ev = C.evaluateScenario(st, sc);
  ok(ev.errors.some(e => /حذف شده/.test(e)) && ev.pool === 10880000000);
});

/* -------- دسته‌های اموال (چند منبع با سهم متفاوت) و مبنای قیمت -------- */
/** وضعیت نمونه: ۷ پسر، «اموال پدری» (سهم برابر) و «اموال دره‌گرمی» (دو پسر یک‌سوم بیشتر) */
function estateFixture() {
  const st = C.newState();
  const pedari = C.addEstate(st, 'اموال پدری');
  const dare = C.addEstate(st, 'اموال دره‌گرمی');
  const sons = []; for (let i = 0; i < 7; i++) sons.push(C.addPerson(st, 'پسر ' + (i + 1), 1));
  C.setEstateEqualWeights(st, pedari.id, sons.map(x => x.id));
  sons.forEach((x, i) => C.setEstateWeight(st, dare.id, x.id, i < 2 ? '4/3' : '1'));   // دو پسر شریک: ۴/۳
  const A = mkParcel({ name: 'پدری', estateId: pedari.id, areaComputed: 70000 });      // 70000×120000 = 8.4e9
  const B = mkParcel({ name: 'دره‌گرمی', estateId: dare.id, areaComputed: 23000 });     // 23000×120000 = 2.76e9
  [A, B].forEach(x => C.addParcel(st, x));
  return { st, pedari, dare, sons, A, B };
}

t('دسته‌ها: دو منبع با سهم متفاوت ⇒ حق هرکس جمع سهمش در هر دو دسته است', () => {
  const { st, sons, A, B } = estateFixture();
  const sc = C.createScenario(st, 'هر دو منبع');
  C.setEqualAllocation(sc, A.id, sons.map(x => x.id));
  C.setAllocation(sc, B.id, sons[0].id, 1);
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 8400000000 + 2760000000);
  eq(ev.estates.length, 2);
  // اموال پدری: هرکس ۱/۷ از ۸٫۴ میلیارد = ۱٫۲ میلیارد
  // دره‌گرمی: دو پسر ۴/۲۳ و بقیه ۳/۲۳ از ۲٫۷۶ میلیارد = ۴۸۰ و ۳۶۰ میلیون
  const r0 = ev.results[0], r2 = ev.results[2];
  eq(r0.entitled, 1200000000 + 480000000);
  eq(r2.entitled, 1200000000 + 360000000);
  eq(r0.byEstate.length, 2);
  eq(r0.byEstate[1].shareText, '4/23'); eq(r2.byEstate[1].shareText, '3/23');
  eq(ev.results.reduce((s, r) => s + r.entitled, 0), ev.pool);
  ok(ev.checks.every(k => k.ok), ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});
t('دسته‌ها: بستانکاری و بدهکاری ⇒ جمع دو طرف برابر است', () => {
  const { st, sons, A, B } = estateFixture();
  const sc = C.createScenario(st, 'تسویه');
  C.setEqualAllocation(sc, A.id, sons.map(x => x.id));
  C.setAllocation(sc, B.id, sons[0].id, 1);                   // کل دره‌گرمی به پسر ۱
  const ev = C.evaluateScenario(st, sc);
  const r0 = ev.results[0];
  eq(r0.settle, 'بدهکار'); eq(r0.debit, 2760000000 - 480000000); eq(r0.credit, 0);
  eq(ev.results[1].settle, 'بستانکار'); eq(ev.results[1].credit, 480000000);
  eq(ev.results.reduce((s, r) => s + r.credit, 0), ev.results.reduce((s, r) => s + r.debit, 0));
});
t('دسته‌ها: محاسبه‌ی فقط یک دسته (بقیه کنار گذاشته می‌شوند)', () => {
  const { st, pedari, sons, A } = estateFixture();
  const sc = C.createScenario(st, 'فقط پدری');
  C.setEqualAllocation(sc, A.id, sons.map(x => x.id));
  sc.estates = [pedari.id];
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 8400000000);
  eq(ev.skipped.length, 1);
  ev.results.forEach(r => { eq(r.entitled, 1200000000); eq(r.diff, 0); });
  ok(ev.checks.every(k => k.ok), ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});
t('دسته‌ها: دسته‌ی بدون سهم ⇒ خطا و کنترل قرمز، و حذف دسته زمین‌ها را پاک نمی‌کند', () => {
  const st = C.newState();
  const e = C.addEstate(st, 'سهم‌نخورده');
  C.addPerson(st, 'الف', 1);
  const p = mkParcel({ estateId: e.id }); C.addParcel(st, p);
  e.weights = { nobody: { num: '0', den: '1' } };              // وزن صفر ⇒ عملاً بدون سهم
  const sc = C.createScenario(st, 'بدون سهم');
  const ev = C.evaluateScenario(st, sc);
  ok(ev.estates[0].usedDefaultWeights, 'باید به سهم پیش‌فرض برگردد');
  // حالا شخص را برداریم تا هیچ وزنی نماند
  st.persons = [];
  const ev2 = C.evaluateScenario(st, sc);
  ok(!ev2.checks.find(k => k.id === 'estate_weights').ok, 'کنترل دسته باید رد شود');
  C.removeEstate(st, e.id);
  eq(st.parcels.length, 1); eq(st.parcels[0].estateId, null);
});
t('مبنای قیمت: قیمت‌های فعلی، سطح حداقل/حداکثر و ضریب ⇒ همه‌ی محاسبه‌ها دوباره انجام می‌شود', () => {
  const st = C.newState();
  const s2 = C.clone(st.settings);
  s2.groups.rural_outside.cells.grade1_normal = { fixed: 120000, min: 100000, max: 200000 };
  C.updateSettings(st, s2, 'keep', null, 'بازه‌ی قیمت');
  const p = mkParcel({ areaComputed: 1000 }); C.addParcel(st, p);           // 1000 × 120000 = 1.2e8
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'مبنا');
  C.setEqualAllocation(sc, p.id, [a.id, b.id]);
  eq(C.evaluateScenario(st, sc).pool, 120000000);                           // عکس سناریو
  C.setScenarioBasis(sc, { mode: 'live', level: 'min' });
  eq(C.evaluateScenario(st, sc).pool, 100000000);                           // حداقل بازه
  eq(C.evaluateScenario(st, sc).results[0].entitled, 50000000);
  C.setScenarioBasis(sc, { level: 'max' });
  eq(C.evaluateScenario(st, sc).pool, 200000000);                           // حداکثر بازه
  C.setScenarioBasis(sc, { level: 'base', factor: 1.5 });
  eq(C.evaluateScenario(st, sc).pool, 180000000);                           // ۱٫۵ برابر
  C.setScenarioBasis(sc, { mode: 'snapshot' });
  eq(C.evaluateScenario(st, sc).pool, 120000000);                           // برگشت به عکس سناریو
});
t('مبنای قیمت: قیمت دستی زمین با گزینه‌ی «نادیده‌گرفتن» کنار می‌رود', () => {
  const st = C.newState();
  const p = mkParcel({ areaComputed: 1000 });
  p.pricing.override = 500000;                                              // قیمت دستی
  C.addParcel(st, p);
  C.addPerson(st, 'الف', 1);
  const sc = C.createScenario(st, 'دستی');
  eq(C.evaluateScenario(st, sc).pool, 500000000);
  C.setScenarioBasis(sc, { mode: 'live' });
  eq(C.evaluateScenario(st, sc).pool, 500000000);                           // قیمت دستی برنده است
  C.setScenarioBasis(sc, { ignoreOverride: true });
  eq(C.evaluateScenario(st, sc).pool, 120000000);                           // قیمت جدول
});
t('مبنای قیمت: انتخاب نسخه‌ی قدیمی تنظیمات ⇒ نرخ همان نسخه', () => {
  const st = C.newState();
  const p = mkParcel({ areaComputed: 1000 }); C.addParcel(st, p);           // نسخه‌ی ۱: 120000
  const s2 = C.clone(st.settings); s2.groups.rural_outside.cells.grade1_normal.fixed = 300000;
  C.updateSettings(st, s2, 'keep', null, 'گران‌تر');                        // نسخه‌ی ۲
  C.addPerson(st, 'الف', 1);
  const sc = C.createScenario(st, 'نسخه‌ها');
  C.setScenarioBasis(sc, { mode: 'live' });
  eq(C.evaluateScenario(st, sc).pool, 300000000);
  C.setScenarioBasis(sc, { mode: 'version', version: 1 });
  eq(C.evaluateScenario(st, sc).pool, 120000000);
  ok(/نسخه/.test(C.basisText(st, sc.priceBasis)));
});
t('برگه‌ی نهایی: فهرست زمین‌های هر نفر، جمع کل و بستانکاری/بدهکاری', () => {
  const { st, sons, A, B } = estateFixture();
  const sc = C.createScenario(st, 'برگه');
  C.setEqualAllocation(sc, A.id, sons.map(x => x.id));
  C.setAllocation(sc, B.id, sons[0].id, 1);
  const sh = C.buildDivisionSheets(st, sc);
  eq(sh.persons.length, 7); eq(sh.lands.length, 2);
  const p0 = sh.persons[0];
  eq(p0.lands.length, 2);                                                   // از هر دو دسته سهم دارد
  eq(p0.lands[0].estateName, 'اموال پدری'); eq(p0.lands[1].estateName, 'اموال دره‌گرمی');
  eq(p0.totals.value, 1200000000 + 2760000000);
  eq(p0.settle, 'بدهکار'); eq(p0.debit, p0.received - p0.entitled);
  eq(sh.totals.credit, sh.totals.debit);
  eq(sh.totals.value, sh.pool);
  // فهرست نهایی: هر زمین به چه کسی رسید
  const landB = sh.lands.find(l => l.name === 'دره‌گرمی');
  eq(landB.parts.length, 1); eq(landB.parts[0].person, 'پسر 1'); eq(landB.parts[0].sharePct, '100');
  eq(sh.lands.find(l => l.name === 'پدری').parts.length, 7);
  ok(sh.basisText.length > 0);
});
t('گردکردن نمایشی: جمع حق‌ها = ارزش کل و جمع بستانکاری = جمع بدهکاری (بدون اختلاف یک‌تومانی)', () => {
  const st = C.newState();
  const p = mkParcel({ areaComputed: 1000 }); C.addParcel(st, p);           // 1.2e8 ÷ ۷ عدد رُند نمی‌شود
  const ids = []; for (let i = 0; i < 7; i++) ids.push(C.addPerson(st, 'ن' + i, 1).id);
  const sc = C.createScenario(st, 'گردکردن');
  C.setAllocation(sc, p.id, ids[0], 1);                                      // همه‌ی زمین به نفر اول
  const ev = C.evaluateScenario(st, sc);
  eq(ev.results.reduce((s, r) => s + r.entitled, 0), ev.pool);
  eq(ev.results.reduce((s, r) => s + r.received, 0), ev.pool);
  eq(ev.results.reduce((s, r) => s + r.credit, 0), ev.results.reduce((s, r) => s + r.debit, 0));
  eq(ev.results.reduce((s, r) => s + r.diff, 0), 0);
  ok(ev.checks.every(k => k.ok), ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});
t('سازگاری: پروژه‌ی بدون دسته‌ی اموال دقیقاً مثل قبل محاسبه می‌شود', () => {
  const st = C.newState();
  const p = mkParcel({ areaComputed: 1000 }); C.addParcel(st, p);
  const a = C.addPerson(st, 'الف', '3/2'), b = C.addPerson(st, 'ب', 1);
  const sc = C.createScenario(st, 'بدون دسته');
  delete sc.priceBasis; delete sc.estates;                                   // شکل فایل نسخه‌ی قبل
  C.setEqualAllocation(sc, p.id, [a.id, b.id]);
  const ev = C.evaluateScenario(st, sc);
  eq(ev.pool, 120000000);
  eq(ev.results[0].entitledFracText, '3/5'); eq(ev.results[1].entitledFracText, '2/5');
  eq(ev.estates.length, 1); eq(ev.estates[0].name, C.NO_ESTATE_NAME);
  ok(ev.checks.every(k => k.ok), ev.checks.filter(k => !k.ok).map(k => k.msg).join(' | '));
});

t('تعدیل جمع و تفریقی: +/− روی حق هر نفر؛ مانده‌ی اعتبار = حق + تعدیل − ارزش زمین‌ها', () => {
  const { st, sc, M, E, A, H, d1, r1 } = mkCase();
  sc.adjust = { [H.id]: '-9000000000', [M.id]: '+3000000000', [E.id]: '3 میلیارد', [A.id]: '+1,000,000,000+2000000000' };
  C.setAllocation(sc, r1, H.id, 1);                       // مهدی کل «پدری ۱» (۳ میلیارد)
  const ev = C.evaluateScenario(st, sc);
  const rH = ev.results.find(r => r.person.id === H.id), rM = ev.results.find(r => r.person.id === M.id), rA = ev.results.find(r => r.person.id === A.id);
  eq(rH.adjust, -9000000000); eq(rM.adjust, 3000000000); eq(rA.adjust, 3000000000);
  near(rH.creditExact, rH.entitledExact - 9e9, 0.01);
  near(rH.remaining, rH.credit - 3e9, 1);                // مانده‌ی اعتبار پس از ۳ میلیارد زمین
  near(rM.remaining, rM.credit, 1);                      // مصطفی هنوز زمینی نگرفته
  ok(!ev.checks.some(k => k.id === 'adjust_balance'), 'جمع تعدیل‌ها باید صفر باشد');
  sc.adjust[H.id] = '-8000000000';                       // جمع صفر نیست ⇒ هشدار
  ok(C.evaluateScenario(st, sc).checks.some(k => k.id === 'adjust_balance' && !k.ok));
  sc.adjust[H.id] = 'abc';
  ok(C.evaluateScenario(st, sc).errors.some(e => /نامعتبر/.test(e)));
  eq(C.fText(C.parseAdjust('')), '0'); ok(C.parseAdjust('+-5') === null);
});

t('تقسیم به چند قسمت با نسبت دلخواه: مساحت‌ها دقیق و جمعشان = کل', () => {
  const ring = sqLL;
  const total = C.areaM2(ring);
  for (const ratio of [['1', '1'], ['1', '1', '1'], ['8', '8', '1', '4']]) {
    const r = C.splitMulti(ring, ratio, { azimuth: 30 });
    ok(r.ok, JSON.stringify(r.errors));
    const S = ratio.reduce((a, x) => a + Number(x), 0);
    r.parts.forEach((p, i) => near(p.area, total * Number(ratio[i]) / S, 0.01, 'قسمت ' + (i + 1)));
    near(r.parts.reduce((a, p) => a + p.area, 0), total, 0.01);
    eq(r.parts.length, ratio.length);
  }
  ok(!C.splitMulti(ring, ['1']).ok); ok(!C.splitMulti(ring, ['1', '0']).ok);
});

t('فهرست پیش‌فرض (js/seed.js): ۴۹ زمین، سه دسته، حق هر نفر و خانه‌ی شهر — همه زنده', () => {
  const w = {}; new Function('window', require('fs').readFileSync(__dirname + '/js/seed.js', 'utf8'))(w);
  const st = w.ZY_SEED;
  eq(st.parcels.length, 49); eq(st.persons.length, 4); eq(st.estates.length, 3);
  eq(st.parcels.reduce((a, p) => a + p.valuation.total, 0), 39965478179);
  ok(st.parcels.every(p => p.valuation.status === 'قطعی'), 'وضعیت همه‌ی زمین‌ها قطعی نیست');
  eq(st.estates[2].name, 'محدوده سد');
  const d = C.divisionLive(st);
  ok(d.errors.length === 0, d.errors.join('|'));
  const V = (n) => { const c = d.cats.find(x => x.name === n); return Number(c.value.n) / Number(c.value.d); };
  const dg = V('دره گرمی'), pd = V('پدری'), N = (f) => Number(f.n) / Number(f.d);
  const M = d.people.find(r => r.person.name === 'مصطفی'), A = d.people.find(r => r.person.name === 'امیر'), H = d.people.find(r => /مهدی/.test(r.person.name));
  near(N(M.entitlement), dg * 8 / 21 + pd / 7, 0.01); near(N(A.entitlement), dg / 21 + pd / 7, 0.01); near(N(H.entitlement), dg * 4 / 21 + pd * 4 / 7, 0.01);
  near(d.people.reduce((a, r) => a + N(r.entitlement), 0), dg + pd, 0.01);
  eq(N(M.house), 3000000000); eq(N(H.house), -9000000000);
  near(N(M.credit), N(M.entitlement) + 3e9, 0.01); near(N(H.credit), N(H.entitlement) - 9e9, 0.01);
  near(d.people.reduce((a, r) => a + N(r.credit), 0), dg + pd, 0.01);
  eq(d.people.every(r => r.held.length === 0), true);       // هنوز کسی چیزی برنداشته
  eq(d.free.length, 49);
});

t('تقسیم زنده: جابه‌جایی زمین بین دسته‌ها فوراً حق‌ها را عوض می‌کند (بدون هیچ فهرست حفظ‌شده)', () => {
  const st = C.newState();
  const E1 = C.addEstate(st, 'دره گرمی'), E2 = C.addEstate(st, 'پدری');
  const mk = (n, total, est) => { const p = C.newParcel({ name: n, estateId: est.id }); p.valuation = { total, area: 100, status: 'قطعی' }; st.parcels.push(p); return p; };
  const a = mk('الف', 2100000000, E1), b = mk('ب', 7000000000, E2);
  const P = ['م', 'ا', 'ام', 'مه'].map(n => C.addPerson(st, n, 1));
  [[8, 8, 1, 4], [1, 1, 1, 4]].forEach((ws, i) => P.forEach((p, j) => C.setEstateWeight(st, [E1, E2][i].id, p.id, String(ws[j]))));
  const N = (f) => Number(f.n) / Number(f.d);
  let d = C.divisionLive(st);
  near(N(d.people[0].entitlement), 2100000000 * 8 / 21 + 7000000000 / 7, 1e-6);
  a.estateId = E2.id;                                         // «الف» از دره گرمی به پدری می‌رود
  d = C.divisionLive(st);
  near(N(d.people[0].entitlement), 9100000000 / 7, 1e-6, 'حق مصطفی باید فقط از پدری باشد');
  near(N(d.people[3].entitlement), 9100000000 * 4 / 7, 1e-6);
  a.estateId = null;                                          // بدون دسته ⇒ در هیچ سهمی نیست و هشدار می‌دهد
  d = C.divisionLive(st);
  ok(d.warns.some(x => /دسته‌بندی‌نشده/.test(x)));
  near(N(d.people.reduce((s2, r) => C.fAdd(s2, r.entitlement), C.frac(0))), 7000000000, 1e-6);
});

t('تقسیم زنده: قاعده‌ی خرید — فقط زمین مهدی (خریدار خانه) یا زمین آزاد؛ جمع و تفریق دقیق', () => {
  const st = C.newState();
  const E1 = C.addEstate(st, 'پدری');
  const mk = (n, total) => { const p = C.newParcel({ name: n, estateId: E1.id }); p.valuation = { total, area: 10, status: 'قطعی' }; st.parcels.push(p); return p; };
  const p1 = mk('p1', 3000000000), p2 = mk('p2', 2000000000), p3 = mk('p3', 5000000000);
  const [M, E, A, H] = ['م', 'ا', 'ام', 'مه'].map(n => C.addPerson(st, n, 1));
  [1, 1, 1, 4].forEach((w, j) => C.setEstateWeight(st, E1.id, [M, E, A, H][j].id, String(w)));
  st.house = { amount: '3 میلیارد', receivers: [M.id, E.id, A.id], payer: H.id };
  C.setHolder(st, p1.id, M.id, true); C.setHolder(st, p2.id, H.id, true);   // ثبت اولیه: p1 دست مصطفی، p2 دست مهدی، p3 آزاد
  ok(!C.canTake(st, p1.id, E.id).ok, 'زمین مصطفی نباید برای اسفندیار قابل خرید باشد');
  ok(C.canTake(st, p2.id, E.id).ok, 'زمین مهدی باید قابل خرید باشد');
  ok(C.canTake(st, p3.id, A.id).ok, 'زمین آزاد باید قابل خرید باشد');
  ok(!C.setHolder(st, p1.id, E.id).ok); eq(p1.holderId, M.id);
  ok(C.setHolder(st, p2.id, E.id).ok); eq(p2.holderId, E.id);
  ok(C.setHolder(st, p1.id, null).ok);                                      // مصطفی آزادش می‌کند
  ok(C.setHolder(st, p1.id, A.id).ok, 'بعد از آزاد شدن قابل خرید است');
  const d = C.divisionLive(st), N = (f) => Number(f.n) / Number(f.d);
  // ارزش کل ۱۰ میلیارد؛ حق هر پسر ۱/۷ = ۱٬۴۲۸٬۵۷۱٬۴۲۸٫۵۷…، مهدی ۴/۷
  const byName = (n) => d.people.find(r => r.person.name === n);
  near(N(byName('م').credit), 10e9 / 7 + 3e9, 1e-4); near(N(byName('مه').credit), 40e9 / 7 - 9e9, 1e-4);
  near(N(byName('ا').held.length ? byName('ا').heldValue : C.frac(0)), 2e9, 1e-6);
  near(N(byName('ام').remaining), 10e9 / 7 + 3e9 - 3e9, 1e-4);
  // جمع اعتبارها = ارزش کل؛ جمع مانده‌ها = ارزش زمین‌های آزاد (p3) بدون هیچ خطای گردکردن
  near(N(d.sumCredit), 10e9, 1e-6); near(N(d.sumRemaining), 5e9, 1e-6);
  eq(d.errors.length, 0);
  // اگر «سایر» عوض شود جمع تعدیل‌ها صفر نیست ⇒ هشدار
  st.adjust = { [A.id]: '+2 میلیارد' };
  ok(C.divisionLive(st).warns.some(x => /صفر نیست/.test(x)));
  // حذف شخص: زمین‌هایش آزاد می‌شود
  C.removePerson(st, A.id); eq(p1.holderId, null);
});


t('تقسیم زنده‌ی تازه: تغییر یک متر از فهرست مبنای محاسبه‌ی همه‌ی صفحات است', () => {
  const st = C.newState(); const e = C.addEstate(st, 'پدری');
  const p = mkParcel({ name: 'زمین جاری', scope: 'rural_outside', areaComputed: 100, estateId: e.id }); C.addParcel(st, p);
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1); C.setEstateEqualWeights(st, e.id, [a.id, b.id]);
  const before = C.fToNumber(C.divisionLive(st, { parcelIds: [p.id], includeUnclassified: true }).total);
  p.areaComputed = 101; p.valuation.area = 100; p.valuation.total = 12000000;
  const d = C.divisionLive(st, { parcelIds: [p.id], includeUnclassified: true });
  eq(C.fToNumber(d.total), 12120000); eq(C.fToNumber(d.cats[0].value), 12120000); ok(C.fToNumber(d.total) !== before);
});
t('انتخاب همه/فیلتر/تک‌زمین و حذف زمین', () => {
  const st = C.newState(); const e = C.addEstate(st, 'منبع');
  const a = C.newParcel({ name: 'اطراف یک', scope: 'rural_outside', grade: 'grade1', areaComputed: 100, estateId: e.id });
  const b = C.newParcel({ name: 'داخل دو', scope: 'rural_inside', grade: 'grade2', areaComputed: 100, estateId: e.id });
  C.addParcel(st, a); C.addParcel(st, b);
  eq(C.divisionParcelIds(st).length, 2);
  C.setDivisionSelection(st, { mode: 'filters', scopes: ['rural_outside'], grades: [], types: [], estates: [], includeUnclassified: true }); eq(C.divisionParcelIds(st).length, 1); eq(C.divisionParcelIds(st)[0], a.id);
  C.setDivisionSelection(st, { mode: 'filters', scopes: [], grades: [], types: [C.divisionTypeKey(b)], estates: [], includeUnclassified: true }); eq(C.divisionParcelIds(st).length, 1); eq(C.divisionParcelIds(st)[0], b.id);
  C.setDivisionSelection(st, { mode: 'custom', ids: [b.id], includeUnclassified: true }); eq(C.divisionParcelIds(st).length, 1); eq(C.divisionParcelIds(st)[0], b.id);
  ok(C.removeParcel(st, b.id)); eq(st.parcels.length, 1); eq(C.divisionParcelIds(st).length, 0);
});
t('انتخاب صریح بدون دسته: زمین از جمع حذف ولی در گزارش قابل مشاهده می‌ماند', () => {
  const st = C.newState(); const e = C.addEstate(st, 'منبع');
  const classified = mkParcel({ name: 'دسته‌دار', areaComputed: 100, estateId: e.id });
  const unc = mkParcel({ name: 'بدون دسته', areaComputed: 50, estateId: null });
  C.addParcel(st, classified); C.addParcel(st, unc); C.addPerson(st, 'الف', 1);
  C.setDivisionSelection(st, { mode: 'all', includeUnclassified: false });
  const d = C.divisionLive(st, { parcelIds: C.divisionParcelIds(st), includeUnclassified: false });
  eq(d.selectedIds.length, 1); eq(d.selectedIds[0], classified.id); eq(d.unclassified.length, 1); ok(d.warns.some(x => /دسته‌بندی‌نشده/.test(x)));
  eq(C.fToNumber(d.total), 12000000);
});
t('تقسیم سهم یک شخص بین خانواده با کسر دقیق', () => {
  const st = C.newState(); const e = C.addEstate(st, 'منبع'); const p = mkParcel({ scope: 'rural_outside', areaComputed: 100, estateId: e.id }); C.addParcel(st, p);
  const a = C.addPerson(st, 'مصطفی', 1), b = C.addPerson(st, 'امیر', 1); C.setEstateEqualWeights(st, e.id, [a.id, b.id]);
  C.setFamilySplitCount(st, a.id, 3); C.setFamilyMember(st, a.id, st.familySplits[a.id].members[0].id, { weight: '2' });
  const f = C.divisionLive(st, { parcelIds: [p.id], includeUnclassified: true }).people.find(x => x.person.id === a.id).family;
  eq(f[0].shareText, '1/2'); eq(f[1].shareText, '1/4'); eq(f[2].shareText, '1/4');
});
t('تقسیم رندوم فقط انتخاب فعلی را جابه‌جا می‌کند و تسویه‌ی نقدی می‌سازد', () => {
  const st = C.newState(); const e = C.addEstate(st, 'منبع'); const ps = [1, 2, 3, 4].map((n) => { const p = mkParcel({ name: 'رندوم ' + n, scope: 'rural_outside', areaComputed: n * 100, estateId: e.id }); C.addParcel(st, p); return p; });
  const a = C.addPerson(st, 'الف', 1), b = C.addPerson(st, 'ب', 1); C.setEstateEqualWeights(st, e.id, [a.id, b.id]);
  const outside = C.newParcel({ name: 'خارج انتخاب', scope: 'rural_outside', areaComputed: 100, estateId: e.id }); C.addParcel(st, outside); C.setHolder(st, outside.id, a.id, true);
  ok(!C.randomAllocate(st, [], { seed: 42 }).ok, 'انتخاب خالی نباید همه‌ی زمین‌ها را تصادفی کند');
  const r = C.randomAllocate(st, ps.slice(0, 3).map(p => p.id), { seed: 42, attempts: 20 }); ok(r.ok); eq(outside.holderId, a.id); eq(r.assignments.length, 3); ok(r.settlement.every(x => x.amount >= 0));
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
